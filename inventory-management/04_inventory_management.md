# Inventory Management — LLD 学習ノート

> 自分の言葉でまとめた要約。原文の全文訳ではない。技術用語は英語のまま。

## 問題の核
複数 warehouse にまたがる商品在庫を追跡する system。入荷・出荷で stock を増減し、warehouse 間で transfer し、在庫が閾値を割ったら alert を出す。EC や WMS の在庫コア部分。

## Clarifying questions の確定事項
- product は SKU 等の id を持つ。stock は per product per warehouse で管理。
- 操作: add stock / remove stock / transfer between warehouses / query。
- 在庫は負にならない（invariant）。足りない remove/transfer は reject。
- alert は per product per warehouse の閾値。閾値を下回る瞬間に通知。
- alert の宛先は plug 可能（email / Slack / log 等を後で足せる）。
- thread-safe。
- pricing / order / supplier 発注は out of scope。

## Core entities
- **InventoryManager → orchestrator**。warehouse 群と alert 設定を持ち、全操作の公開 API。
- **Warehouse → entity**。id と `stock: Map<productId, quantity>` を持つ。1拠点の在庫。
- **Product → class にしない**。id を知れば十分なので map の key（string）。属性が増えるなら後で class 化。
- **AlertConfig → 小さな data**。productId, warehouseId, threshold。
- **AlertListener → interface（Observer）**。`onLowStock(productId, warehouseId, current, threshold)`。EmailListener 等が実装。

## Class design

```
class InventoryManager:                 // orchestrator
    - warehouses: Map<warehouseId, Warehouse>
    - alertConfigs: Map<(productId,warehouseId), threshold>
    - listeners: List<AlertListener>
    + addStock(productId, warehouseId, qty)
    + removeStock(productId, warehouseId, qty)
    + transfer(productId, fromId, toId, qty)
    + getStock(productId, warehouseId) -> int
    + setAlert(productId, warehouseId, threshold)
    + addListener(listener)

class Warehouse:
    - id: string
    - stock: Map<productId, int>
    + getQuantity(productId) -> int
    + addQuantity(productId, qty)
    + removeQuantity(productId, qty)     // 負なら throw

interface AlertListener:
    onLowStock(productId, warehouseId, current, threshold)
```

stock を Warehouse 側の intrinsic state に置く（在庫はその拠点に物理的に属する）。alert config と listener は cross-warehouse の関心なので orchestrator が持つ。

## 主要メソッド

```
removeStock(productId, warehouseId, qty):
    w = warehouses[warehouseId]
    synchronized(w):                      // per-warehouse lock
        current = w.getQuantity(productId)
        if current < qty: throw InsufficientStock   // invariant 保護、state 変更前
        w.removeQuantity(productId, qty)
        newQty = current - qty
        crossed = checkThresholdCrossed(productId, warehouseId, current, newQty)
    if crossed: fireAlert(...)            // lock の外で通知

addStock(productId, warehouseId, qty):
    synchronized(w): w.addQuantity(productId, qty)   // 閾値を上抜けるので alert 不要

transfer(productId, fromId, toId, qty):
    first, second = ロック順を id で固定（例: id 昇順）   // deadlock 回避
    synchronized(first): synchronized(second):
        from = warehouses[fromId]; to = warehouses[toId]
        if from.getQuantity(productId) < qty: throw InsufficientStock
        from.removeQuantity(productId, qty)
        to.addQuantity(productId, qty)
        crossed = checkThresholdCrossed(fromId 側)
    if crossed: fireAlert(...)
```

threshold-crossing 方式: `current >= threshold && newQty < threshold` の瞬間だけ alert。毎回の low-stock で鳴らすと spam になる。下回り続けている間は鳴らさず、跨いだ1回だけ。

## Concurrency
複数 thread が同じ warehouse の同じ product を同時に触ると、read（getQuantity）と write の間で race → 在庫が負や lost update に。
- 既定は **per-warehouse lock**（resource ごとに lock。Logger の per-destination、BookMyShow の per-showtime と同じ発想）。別 warehouse の操作は並行可。
- **transfer は2 warehouse を同時に lock** するので deadlock リスク。warehouse id の一定順で acquire し circular wait を防ぐ（lock ordering、File System の move と同型）。
- **alert は lock の外で fire**。listener が email 送信等で遅い/例外を投げると、lock 内だと他操作を巻き込む。crossing 判定だけ lock 内で行い、通知は外。

## Extensibility
- **reservation system（overselling 防止）**: available と reserved を分離。`reserved: Map<productId, int>` を持ち、available = onHand - reserved。注文確定で reserve、出荷で onHand から引いて reserve 解放、cancel で reserve 戻し。EC の核心。
- **transfer の in-transit 在庫**: 出庫済み・入庫前の宙ぶらりんを表現。Transfer を `InventoryHolder` の一種として扱い、from から引いた瞬間 transfer が「持つ」、到着で to に渡す。途中で数量が消えない。
- **新しい alert channel**: AlertListener を実装するだけ（Observer。Open/Closed）。

## デザインパターン整理
- AlertListener は **Observer**（publisher = InventoryManager、subscriber = listener 群）。
- InventoryManager は **Facade / Controller**。
- per-warehouse lock は GoF でなく concurrency 設計原則。

## 各レベル期待値
- **Junior**: warehouse ごとに stock map、add/remove/query、負在庫を reject。
- **Mid**: stock を Warehouse の intrinsic に置く判断、alert を Observer で外出し、transfer の atomicity、per-warehouse lock を説明。
- **Senior**: threshold-crossing で alert spam を防ぐ、transfer の lock ordering で deadlock 回避、alert を lock 外で fire する理由、reservation / in-transit の拡張を自分から。
