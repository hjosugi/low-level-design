# Logging Service — LLD 学習ノート

> 自分の言葉でまとめた要約。原文の全文訳ではない。技術用語は英語のまま。

## 問題の核
アプリ内に組み込む in-process logging library を設計する（Log4j / SLF4J / Python logging 系）。`logger.info("...")` でメッセージを timestamp・level 付きで複数の出力先に書く。network 集約や ingestion pipeline は別の話で out of scope。

## Clarifying questions の確定事項
- in-process library（network shipping は out of scope）。
- level は DEBUG < INFO < WARN < ERROR < FATAL の5段。順序あり → enum。
- 1回の log で複数 destination に fan-out。
- filter level は destination 単位（global ではない）。
- format は destination type と独立に変わる（JSON を console に、plain を file に等）。
- thread-safe。各 record の bytes は interleave しない（per-record atomic）。
- config は startup で静的。ただし将来 remote destination を足せる設計にする。

## 設計を決める最重要要件
**format と destination type が独立に変わる** → composition over inheritance。両方を結合すると (format, target) の組ごとに class が要る（2軸 → 掛け算の class 爆発）。Formatter interface と Sink interface を別に立て、Destination が両方を compose する。

「2軸が独立に変わる」は composition のサイン。

## Core entities
- **Logger → orchestrator**。destination の list を持ち、log() で per-call データ（timestamp, thread name）を取って LogRecord を作り全 destination に配る。唯一アプリが触る class。
- **LogRecord → immutable value object**。timestamp, level, message, threadName の4つ。4引数を引き回す代わりに record にまとめると、後で field 追加が1箇所で済む（Parking Lot の Ticket と同じ理由）。
- **Destination → concrete class**。minLevel・formatter・sink を compose し、filter → format → lock → write を直列化。per-destination lock の置き場。
- **Formatter → interface**。`format(record) -> String`。PlainText / Json の2実装。純粋関数なので thread 間・destination 間で共有しても同期不要。
- **Sink → interface**。`write(formatted)`。ConsoleSink / FileSink。filter も format も lock もしない。将来の RemoteSink がここに綺麗に入る。
- **LogLevel → enum**（5値、順序あり）。per-level の振る舞いは無いので class-per-level にしない。

## Class design

```
enum LogLevel: DEBUG < INFO < WARN < ERROR < FATAL

class LogRecord:                       // immutable
    - timestamp, level, message, threadName
    + getters

interface Formatter: format(record) -> String
class PlainTextFormatter / JsonFormatter implements Formatter

interface Sink: write(formatted: String)
class ConsoleSink implements Sink
class FileSink implements Sink: - filePath

class Destination:                     // concrete
    - formatter: Formatter
    - minLevel: LogLevel
    - sink: Sink
    + write(record)

class Logger:
    - destinations: List<Destination>  // construction 後 immutable
    + log(level, message)
    + debug/info/warn/error/fatal(message)   // log への委譲
```

なぜ Destination は concrete か: 有効な形は filter-format-lock-delegate の1つだけで、変化は Sink と Formatter の裏にある。1実装のために IDestination を足すのは無駄な indirection。高レベルの workflow が ConsoleSink/JsonFormatter でなく抽象に依存する＝Dependency Inversion。inheritance 版も面接では妥当。選択を言語化できることが senior signal。

## 主要メソッド

```
Logger.log(level, message):
    record = LogRecord(now(), level, message, currentThread().name)
    for d in destinations:
        d.write(record)
```
- timestamp と thread name は log() の先頭で1回取る。各 destination が同じ瞬間の record を見る。
- Logger では level filter しない（threshold は destination の関心）。
- iteration に lock 不要（destinations は immutable）。同期は Destination.write 内の sink の隣にある。
- null/empty message はそのまま通す（数万の call site に防御 null check を足すのは noise）。stance を決めて口に出す。
- ある destination が throw しても loop が止まらないよう、Destination.write 内で catch する。

```
Destination.write(record):
    if record.level < minLevel: return        // silent drop
    formatted = formatter.format(record)       // lock の外
    lock.acquire()
    try: sink.write(formatted)
    catch e: stderr に診断（silent failure を避ける）
    finally: lock.release()
```

## Concurrency
要件5（bytes が interleave しない）は correctness 問題。file handle や stdout buffer は2 thread が race すると壊れる共有状態。
- 既定は **per-destination lock**（destination が resource を持つので lock も持つ）。BookMyShow の per-showtime、Inventory の per-warehouse と同じ per-resource locking。
- global lock を Logger.log() に置くのは誤った既定。遅い file write が一瞬の console write まで block する。
- format は immutable record + 純粋 formatter なので critical section の外で良い。

## Extensibility
- **log() を non-blocking に**: 各 destination の前に bounded blocking queue。log() は enqueue して即 return、専用 worker thread が drain。single consumer なので lock も外せる。代償は worker lifecycle（shutdown で drain）、overflow policy（block / drop-newest / drop-oldest / throw、多くは drop-newest + stderr）、debuggability（stack trace が call site を指さなくなる）。lock は correctness、queue は coordination で別物。
- **hierarchical named loggers**: name と parent pointer + LoggerFactory の registry。effective level/destinations は parent chain を辿る。hot path なので effective level を cache。registry は「同名は同一インスタンス」を保証する数少ない正当な global。

## 各レベル期待値
- **Junior**: 1文の prompt を動く object model に。Logger + immutable LogRecord + LogLevel enum、log() の fan-out、threshold で drop。最初は format と destination を結合していてもよい（押されてから 2軸爆発に気づく）。
- **Mid**: 誘導なしで format-vs-destination 分離（Formatter を interface に）、LogRecord を独立 type にする理由、concurrency を会話できる。
- **Senior**: inheritance-vs-composition を自分から、Sink interface に到達、time-of-capture（timestamp を log 先頭で）を自分で catch、per-destination lock と「global lock が誤った既定な理由」、format を critical section の外に置く理由、per-destination 例外を stderr 診断付きで握る。早く終えて async queue と hierarchical loggers を議論。
