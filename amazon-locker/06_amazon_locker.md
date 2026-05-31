# Amazon Locker — LLD 学習ノート

> 自分の言葉でまとめた要約。原文の全文訳ではない。技術用語は英語のまま。

## 問題の核
宅配ロッカー。配達員が荷物を空き compartment に入れると pickup code が発行され、受取人がその code で開ける。荷物サイズに合う compartment を割り当て、期限切れの荷物は回収する。

## Clarifying questions の確定事項
- compartment にはサイズがある（SMALL / MEDIUM / LARGE）。荷物サイズ以上の空き compartment を割り当てる。
- 荷物を入れると一意の access code を発行。
- code には有効期限がある。期限切れは pickup 不可。
- 操作: deposit（預け入れ）/ pickup（受け取り）/ 期限切れ回収。
- 空きが無い・code 不正・期限切れは error。
- payment / 通知 / 物理ハード制御は out of scope。

## Core entities
- **Locker → orchestrator**。compartment 群と発行済み token を管理。deposit / pickup の公開 API。
- **Compartment → entity**。size と「埋まっているか」の flag を持つ。物理的な箱なので occupied は intrinsic state。
- **AccessToken → value object**。code・有効期限・どの compartment かの参照。`isExpired()` を持つ。
- **Package → class にしない**。size を知れば十分なので、deposit の入力としての `enum Size`。属性が増えるなら class 化。

## intrinsic vs relational（Parking Lot との対比）
Parking Lot では occupancy を orchestrator 側の relational state に置いた（gate で先に割当が起きる）。Amazon Locker では逆に **Compartment 自身に occupied flag** を持たせる。荷物が物理的にその箱に入る intrinsic な状態だから。どちらが正解ということはなく、「物理的に属するか / 関係から導かれるか」で説明できることが大事。

## Class design

```
enum Size: SMALL, MEDIUM, LARGE        // 順序あり（割当の互換判定に使う）

class Compartment:
    - id: string
    - size: Size
    - occupied: boolean                // intrinsic state
    + getSize(); isOccupied(); markOccupied(); markEmpty()

class AccessToken:                     // immutable value object
    - code: string
    - compartmentId: string
    - expiresAt: timestamp
    + isExpired() -> now() > expiresAt
    + getCompartmentId(); getCode()

class Locker:                          // orchestrator
    - compartments: List<Compartment>
    - tokens: Map<code, AccessToken>   // code で O(1) lookup
    + deposit(packageSize) -> AccessToken
    + pickup(code) -> compartmentId
    + collectExpired() -> List<compartmentId>
```

token は compartment への参照を id（string）で持つ（Compartment オブジェクトを直接抱えない＝Law of Demeter、Parking Lot の Ticket と同型）。

## 主要メソッド

```
deposit(packageSize):
    c = findAvailableCompartment(packageSize)   // size 以上で空き、最小を優先
    if c == null: throw NoCompartmentAvailable  // state 変更前
    c.markOccupied()
    token = AccessToken(genCode(), c.id, now() + TTL)
    tokens[token.code] = token
    return token

pickup(code):
    token = tokens[code]
    if token == null: throw InvalidCode
    if token.isExpired(): throw CodeExpired      // 期限切れは開けない
    c = compartmentById(token.compartmentId)
    c.markEmpty()                                 // 受取で解放
    tokens.remove(code)                           // 二重 pickup 防止
    return c.id

collectExpired():
    freed = []
    for token in tokens (copy):
        if token.isExpired():
            c = compartmentById(token.compartmentId)
            c.markEmpty(); tokens.remove(token.code); freed.add(c.id)
    return freed                                  // 回収係が開ける compartment 群
```

findAvailableCompartment は「荷物サイズ以上で空きのうち最小」を選ぶ（big を小荷物で埋めない best-fit。単純化で first-fit でも可、選択を言語化）。Information Expert: 空き判定は Compartment が知っているので Compartment に聞く。

## Concurrency
2人の配達員が同時に deposit すると、findAvailable（check）と markOccupied（act）の間で同じ compartment を取る race。
- 既定は **deposit を直列化**（Locker 単位 lock、あるいは compartment への atomic check-and-set）。compartment 数は数十程度なので coarse でも実害は小さい。
- pickup と deposit が同 compartment に同時に来るケースも lock で守る。

## Extensibility
- **size fallback**: 希望サイズが満杯なら1つ上のサイズへ繰り上げ。findAvailableCompartment を「size 以上を昇順に探索」にすれば自然に対応（enum に順序を持たせた理由）。
- **out-of-service**: boolean occupied を `enum CompartmentStatus { EMPTY, OCCUPIED, OUT_OF_SERVICE }` に拡張。故障中は割当対象から外す。状態が2値から増えるときの定石。
- **two-phase commit（部分失敗対策）**: deposit を reserve（compartment を予約し code 仮発行）→ confirmDeposit（実際に施錠されたら確定）に分ける。途中で配達員が立ち去っても reserve が timeout で解放され、compartment が永久に塞がらない。BookMyShow の seat hold と同型。

## デザインパターン整理
- Locker は **Facade / Controller**。
- 空き判定を Compartment に持たせるのは GRASP の **Information Expert**。
- token が compartment を id で参照するのは **Law of Demeter**。
- AccessToken は **value object**。

## 各レベル期待値
- **Junior**: compartment にサイズと空き flag、deposit で割当 & code 発行、pickup で code 検証 & 解放、満杯/不正 code を error。
- **Mid**: occupied を Compartment の intrinsic に置く判断（Parking Lot との違いを説明）、token に有効期限、best-fit 割当、二重 pickup 防止。
- **Senior**: intrinsic vs relational の tradeoff を自分から、size fallback を enum 順序で自然に、OUT_OF_SERVICE への状態拡張、deposit の race と two-phase commit（途中放棄で塞がらない設計）を議論。
