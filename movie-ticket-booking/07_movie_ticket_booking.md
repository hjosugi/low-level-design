# Movie Ticket Booking — LLD 学習ノート

> 自分の言葉でまとめた要約。原文の全文訳ではない。技術用語は英語のまま。

## 問題の核
BookMyShow 風の映画予約。映画・劇場・上映回を検索し、上映回の座席を予約する。肝は「同じ座席を2人に売らない」こと（concurrency が本丸）。

## Clarifying questions の確定事項
- 階層: Movie → Showtime（上映回）→ 座席。Theater が Showtime を持つ。
- 操作: 映画一覧 / 映画ごとの上映回 / 上映回の予約 / cancel。
- 1予約で複数座席を取れる。
- 同座席の二重予約は不可（最重要 invariant）。
- 予約は all-or-nothing（一部だけ取れて残りが取れない、は無し）。
- payment は out of scope（予約確定までを設計）。
- 動的に上映回を追加・削除できると尚良い。

## Core entities
- **BookingSystem → orchestrator**。movie / showtime / reservation を index で持ち、検索と予約の公開 API。
- **Theater → entity**。劇場。screen と showtime を持つ。
- **Showtime → entity**。ある映画のある時刻の上映。予約状態の所在地。
- **Movie → entity（軽い）**。title 等のメタ。
- **Reservation → entity**。1回の予約。showtime と座席集合、状態を持つ。
- **Seat / Screen → string**。識別子で足りるので class にしない（"A12" など）。

## 「座席状態の single source of truth」
座席ごとに booked flag を別管理せず、**reservations のリストを唯一の真実**にする。ある座席が空いているかは「その showtime の有効な reservation のどれにも含まれていないか」で導く。flag と list の二重管理は不整合の温床なので避ける。

## Class design

```
class Movie: - id; - title

class Showtime:
    - id: string
    - movieId: string
    - theaterId, screen: string
    - startTime: timestamp
    - allSeats: Set<seatId>
    - reservations: List<Reservation>   // この showtime の予約（真実の源）
    + getAvailableSeats() -> allSeats から予約済みを引いた集合

class Reservation:
    - id: string
    - showtimeId: string                // back-reference（cancel routing 用）
    - seats: Set<seatId>
    - status: ACTIVE / CANCELLED

class BookingSystem:                    // orchestrator
    - moviesById: Map<id, Movie>
    - showtimesById: Map<id, Showtime>
    - showtimesByMovieId: Map<movieId, List<Showtime>>   // 検索用 denormalized index
    - reservationsById: Map<id, Reservation>
    + listMovies()
    + getShowtimes(movieId) -> List<Showtime>
    + book(showtimeId, seats) -> Reservation
    + cancel(reservationId)
```

予約状態は Showtime の intrinsic（座席はその上映回に属する）。検索高速化のため複数 index を持つ（controlled denormalization、更新時に整合を保つ責任とのトレードオフ）。

## 主要メソッド

```
book(showtimeId, requestedSeats):
    s = showtimesById[showtimeId]
    synchronized(s):                     // per-showtime lock（check-then-act を守る）
        taken = s に紐づく ACTIVE 予約の座席集合
        for seat in requestedSeats:
            if seat not in s.allSeats: throw InvalidSeat
            if seat in taken: throw SeatUnavailable   // 1つでもダメなら全部やめる
        r = Reservation(genId(), showtimeId, requestedSeats, ACTIVE)
        s.reservations.add(r); reservationsById[r.id] = r
        return r                          // all-or-nothing

cancel(reservationId):
    r = reservationsById[reservationId]
    if r == null or r.status == CANCELLED: throw InvalidReservation
    s = showtimesById[r.showtimeId]       // back-reference で showtime を辿る
    synchronized(s):
        r.status = CANCELLED              // 座席が再び available に
```

book の検証は「全座席を先に確認してから、まとめて確定」。途中で1席でも取れなければ何も確定しない（all-or-nothing）。利用可能座席は flag でなく「予約集合の補集合」で計算。

## Concurrency（この問題の本丸）
2人が同じ座席を同時に book → 両方が「空いている」と読んでから両方 add する check-then-act race。これを許すと二重販売（invariant 違反）。
- 既定は **per-showtime lock**（`synchronized(showtime)`）。同じ上映回の予約だけ直列化され、別の上映回は並行可。Logger の per-destination、Inventory の per-warehouse と同じ per-resource locking。
- 効果: 競合した2人のうち exactly one が成功、もう一方は SeatUnavailable。all-or-nothing も lock 内で全検証 → 全確定するので保証される。
- showtime 全体ロックは粒度として通常十分（1上映回の座席数は数百）。さらに細かくするなら座席単位 lock + 一定順 acquire（deadlock 回避）だが、面接では per-showtime で十分と言い切ってよい。
- 分散・DB 版は System Design の領域（行ロック / 楽観ロック / Redis lock）。

## Extensibility
- **動的な上映回 add/remove**: addShowtime は showtimesById と showtimesByMovieId の両 index を更新（denormalized index の整合維持）。removeShowtime は予約済みなら拒否 or 払い戻しフローへ。index を複数持つ代償がここに出る。
- **seat hold（決済前の一時確保）**: 座席を available / held / booked の3状態に拡張。holdSeats で一定時間確保 → confirmHold で booked 化 / timeout で解放。`cleanupExpiredHolds` を定期実行。Amazon Locker の two-phase commit と同型で、決済中に他人へ取られず、放棄されても永久ロックしない。
- **検索の高度化**: 地域・時間帯・ジャンルでの絞り込みは追加 index で。

## デザインパターン整理
- BookingSystem は **Facade / Controller**。
- Reservation の showtimeId back-reference で cancel を routing（双方向参照を最小限の id で）。
- 複数 index は **controlled denormalization**（読み速度と更新整合の trade）。
- seat hold は **two-phase commit** 的。

## 各レベル期待値
- **Junior**: Movie / Showtime / Reservation をモデル化、座席予約と cancel、二重予約を防ぐ基本ロジック。
- **Mid**: reservations を single source of truth にする判断、all-or-nothing の実装、per-showtime lock で二重販売を防ぐことを説明、検索用 index。
- **Senior**: check-then-act race を自分から指摘し per-showtime lock で exactly-one-wins を保証、lock 粒度の trade（showtime vs seat + ordering）、seat hold の3状態と cleanup、動的 showtime 追加時の index 整合を議論。
