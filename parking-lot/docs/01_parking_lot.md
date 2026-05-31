# Parking Lot — LLD 学習ノート

> 自分の言葉でまとめた要約。原文の全文訳ではない。技術用語は英語のまま。

## 問題の核
車が入庫すると system が空いている互換 spot を割り当て ticket を発行。出庫時に滞在時間から料金を計算し spot を解放する。面接版では system が spot を自動割当する点が特徴（割当ロジックを設計させるため）。

## Clarifying questions の4軸
何をするか / どう失敗を扱うか / scope は何か / 後で何が変わりそうか。"keep it simple" は over-engineer するなのサイン。

主な確定事項: vehicle type は MOTORCYCLE / CAR / LARGE の3種、size は厳密一致、ticket に unique ID、料金は時間制で全車種同額・切り上げ、満車や invalid ticket は error、payment やゲート hardware は out of scope。

## Core entities の絞り込み
- **Vehicle → class にしない**。外部にあり状態も振る舞いも持たない。型を知りたいだけなので `enum VehicleType`。
- **ParkingSpot → entity**。id と type を持つ純粋な data holder。
- **Ticket → entity（value object）**。1回の駐車セッションの記録。生成後 immutable、getter のみ。
- **ParkingLot → orchestrator**。spot 探索・ticket 生成・料金計算・占有管理を束ねる唯一の公開 API。

判断基準: 「system が状態を持って管理するか？」Yes なら class、No なら enum か単なるデータ。

## 状態をどこに置くか（intrinsic vs relational）
占有を ParkingLot 側に `occupiedSpotIds: Set<String>` で持つ。占有は「ticket が spot を参照している」から導かれる relational state で、ticket を管理する orchestrator が持つのが自然。
- intrinsic（entity が持つ）: id, size, BROKEN のような物理状態
- relational（orchestrator が持つ）: 「今 ticket X に割当中」「user Y が予約中」

絶対ルールではない。Amazon Locker では逆に compartment 側に occupied flag を持たせる（物理的に荷物が入る intrinsic だから）。Parking Lot は gate で割当が先に発生する relational。どちらでも良く、理由を言えることが大事。

## Class design

```
class ParkingLot:
    - spots: List<ParkingSpot>
    - occupiedSpotIds: Set<String>
    - activeTickets: Map<String, Ticket>   // exit で ID lookup するため
    - hourlyRateCents: long
    + ParkingLot(spots, hourlyRateCents)
    + enter(vehicleType) -> Ticket
    + exit(ticketId) -> long

class ParkingSpot:
    - id: String
    - spotType: SpotType
    + getSpotType(); getId()

class Ticket:                  // immutable
    - id, spotId, vehicleType, entryTime
    + getters

enum SpotType / VehicleType    // 同じ値だが意味が違うので分ける
```

設計上の注意:
- 料金は `long` の cents で持つ（float は誤差が積もる。$5.47 → 547）。
- activeTickets は List でなく Map。理由は性能でなく「ID で引く」意図が明確になるから（200件で差は 1.8 microsec で無視できる）。
- SpotType と VehicleType を別 enum にするのは「motorcycle が満車なら car spot を使える」等の将来要件で効く。
- `getAvailableSpots()` 等を勝手に足さない（YAGNI、encapsulation 違反）。

## 主要メソッド

```
enter(vehicleType):
    spot = findAvailableSpot(vehicleType)
    if spot == null: throw error        // reject when full, state 変更前
    occupiedSpotIds.add(spot.id)
    ticket = createTicket(genId(), spot.id, vehicleType, now())
    activeTickets[ticket.id] = ticket
    return ticket

exit(ticketId):
    ticket = activeTickets[ticketId]
    if ticket == null: throw error      // invalid OR already used、同じ error で十分
    fee = computeFee(ticket.entryTime, now())
    occupiedSpotIds.remove(ticket.spotId)   // free the spot
    activeTickets.remove(ticketId)          // 二重 exit 防止
    return fee

findAvailableSpot: spots を線形走査、type 一致 & occupiedSpotIds に無いもの。O(n) spots、Set lookup は O(1)。
computeFee: 経過 ms → 時間、端数切り上げ（5分でも1時間課金、最低料金ロジック不要）。
```

error は state を変える前に投げる。exit で ticket を削除するので同じ ticket の二重 exit を防げる。

## Concurrency
複数入口で2台が同時 enter すると、check と add の窓で同じ spot を取る race。
- 既定の模範解: `enter()` 全体を synchronize して entrance request を直列化。3〜5入口の通常 traffic なら十分。
- 高並行が必要なら occupiedSpotIds への atomic check-and-add + retry。
- 非同期（DB/API）は System Design の話。SELECT FOR UPDATE や distributed lock。

「シンプルで正しい解を先に、必要な時だけ複雑に」の順序が評価される。

## Extensibility
- **multi-floor**: ParkingLot と ParkingSpot の間に ParkingFloor を挟む。spot id は "3-A15"。割当は下階優先 / 均等分散 / 目的地近接を Strategy pattern で切替。Ticket は変えなくて済む。
- **車種別料金**: 単純には `hourlyRates: Map<VehicleType, long>`、computeFee で type ごとに引く。複雑なら PricingStrategy interface（3種程度なら map で十分、Strategy は over-engineer）。
- **並行アクセス**: 上記 concurrency。

## デザインパターン整理
- ParkingLot は **Facade**（単一公開 API で内部を隠す）兼 GRASP の **Controller**。
- Ticket は **value object**（GoF ではない）。spotId を String で持ち ParkingSpot 参照を持たないのは **Law of Demeter**。
- base 設計は pattern より原則（SRP / encapsulation / LoD）が土台。Strategy は extensibility で初めて登場。

## 各レベル期待値
- **Junior**: 動く system。enter で spot 確保 & ticket、exit で料金 & 解放、満車/invalid の基本 error。
- **Mid**: きれいな責務分離、Vehicle を enum にする判断、full/invalid/double exit を処理、Map や pricing 配置の理由を説明。
- **Senior**: systems thinking。occupied は controlled denormalization、Map で O(1) lookup、enum 分離の将来性などの tradeoff を自分から。早く終えて concurrency / multi-floor に触れる。
