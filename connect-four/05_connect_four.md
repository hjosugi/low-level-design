# Connect Four — LLD 学習ノート

> 自分の言葉でまとめた要約。原文の全文訳ではない。技術用語は英語のまま。

## 問題の核
2人用の Connect Four。交互に列へ disc を落とし、重力で最下段に積む。縦横斜めいずれかに4つ並べた方が勝ち、盤が埋まれば引き分け。turn 管理・着手の合法性・勝敗判定が設計の中心。

## Clarifying questions の確定事項
- 標準は 7列 × 6行。ただし盤サイズは可変にできると尚良い。
- 2 player、交互手番。
- disc は列を指定して落とす（行は重力で決まる）。
- 勝利条件は連続4（縦・横・斜め2方向）。
- 満杯で引き分け。
- 不正手（範囲外の列・満杯の列・相手の手番）は reject。
- AI / network / GUI は out of scope（後で足せる設計には触れる）。

## Core entities
- **Game → orchestrator**。board・player 2人・手番・勝敗状態を持ち、makeMove() が唯一の公開操作。
- **Board → entity**。grid を持ち、disc 配置・列の空き判定・勝利判定を担う。
- **Player → class にしない寄りの軽い data**。色（disc の種類）と名前くらい。振る舞いを持たない。
- **GameState / DiscColor → enum**。状態（IN_PROGRESS / WIN / DRAW）と色（RED / YELLOW / EMPTY）。

## Class design

```
enum DiscColor: EMPTY, RED, YELLOW
enum GameState: IN_PROGRESS, RED_WINS, YELLOW_WINS, DRAW

class Player:                            // 軽い data
    - name: string
    - color: DiscColor

class Board:
    - rows, cols: int
    - grid: DiscColor[rows][cols]        // EMPTY 初期化
    + placeDisc(col, color) -> int       // 着地した row を返す、不可なら例外
    + isColumnFull(col) -> boolean
    + isFull() -> boolean
    + checkWin(row, col, color) -> boolean
    + getCell(row, col) -> DiscColor

class Game:                              // orchestrator
    - board: Board
    - players: Player[2]
    - currentPlayerIndex: int
    - state: GameState
    + makeMove(player, col)
    + getState() -> GameState
    + getCurrentPlayer() -> Player
```

grid は Board が private に持ち、外からは placeDisc / getCell 経由。turn と勝敗 state は cross-cutting なので Game（orchestrator）が持つ。

## 主要メソッド

```
makeMove(player, col):
    if state != IN_PROGRESS: throw GameOver
    if player != getCurrentPlayer(): throw NotYourTurn   // turn 検証
    if col 範囲外 or board.isColumnFull(col): throw InvalidMove
    row = board.placeDisc(col, player.color)             // 重力で着地
    if board.checkWin(row, col, player.color):
        state = (player.color == RED) ? RED_WINS : YELLOW_WINS
        return
    if board.isFull():
        state = DRAW
        return
    currentPlayerIndex = (currentPlayerIndex + 1) % 2    // turn 交代

placeDisc(col, color):
    for r from bottom to top:            // 最下の空きを探す
        if grid[r][col] == EMPTY: grid[r][col] = color; return r
    throw ColumnFull
```

検証 → 配置 → 勝利 → 満杯 → turn 交代 の順序が肝。勝った/引き分けたら turn を進めない。

## 勝利判定（最重要ロジック）
全盤走査せず、**今置いた1手の周りだけ**を4方向で見る（O(1) に近い、定数 = 方向数 × 連続長）。

```
checkWin(row, col, color):
    directions = [(0,1), (1,0), (1,1), (-1,1)]   // 横・縦・斜め2
    for (dr, dc) in directions:
        count = 1
        count += countInDirection(row, col, dr, dc, color)      // 正方向
        count += countInDirection(row, col, -dr, -dc, color)    // 逆方向
        if count >= 4: return true
    return false

countInDirection(row, col, dr, dc, color):
    n = 0; r = row + dr; c = col + dc
    while 範囲内 and grid[r][c] == color:
        n++; r += dr; c += dc
    return n
```

4方向だけで8方位を覆える（各方向を正逆両方カウント）。置いた点を中心に左右へ伸ばし、合計（中心の1 + 両側）が4以上なら勝ち。

## Concurrency
通常は単一 game 内で交互手番なので concurrency は中心でない。聞かれたら:
- turn ベースで本質的に直列。同じ game に同時 makeMove が来うる online 対戦なら、game ごとに lock して makeMove を直列化（per-game lock。他 problem の per-resource lock と同じ）。
- server で多数 game を捌くなら game id ごとに分離。

## Extensibility
- **可変盤サイズ**: rows / cols を Board の constructor 引数に（最初からそうしておく）。勝利の「連続4」も winLength として変数化すれば Connect-N に一般化。
- **undo**: `moveHistory: Stack<(row, col)>` を Game に持つ。undo は stack を pop して grid を EMPTY に戻し、turn と state を巻き戻す。
- **bot（AI 対戦）**: Player は data のまま据え置き、`BotEngine.chooseColumn(board) -> col` を別に作る。Game から見れば人間も bot も「列を選ぶ」だけ。minimax / alpha-beta を engine 内に閉じ込める。Strategy 的に差し替え可能。
- **network / GUI**: Game の公開 API（makeMove / getState）が presentation と分離していれば、上に CLI でも GUI でも socket でも載る。

## デザインパターン整理
- Game は **Facade / Controller**。
- DiscColor / GameState は enum（状態を class 化しない）。
- bot 差し替えは **Strategy** 的。Player を data に保つことで人間/bot を同一視。

## 各レベル期待値
- **Junior**: 2次元 grid、列指定で重力配置、turn 交代、勝敗判定が動く。勝利判定は全走査でも可。
- **Mid**: Board と Game の責務分離、enum の使い分け、勝利判定を「最後の手の周りだけ」に最適化、不正手の処理。
- **Senior**: 4方向 × 正逆の勝利判定を自分から、盤サイズ/勝利長の一般化、undo を stack で、bot を engine 分離して Player を data に保つ設計、online 対戦時の per-game lock に言及。
