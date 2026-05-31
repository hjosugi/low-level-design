# Rate Limiter — LLD 学習ノート

> 自分の言葉でまとめた要約。原文の全文訳ではない。技術用語は英語のまま。

## 問題の核
client（または endpoint）ごとに一定時間あたりのリクエスト数を制限する。許可なら通し、超過なら拒否して「いつ再試行できるか」を返す。アルゴリズムを差し替え可能にし、thread-safe にするのが設計の中心。

## Clarifying questions の確定事項
- 制限は key 単位（client id / IP / API key）。
- endpoint ごとに別の制限を設定でき、未設定なら default を使う。
- アルゴリズムは複数（token bucket / sliding window log 等）を切り替えられる。
- allow / deny を返し、deny 時は retry-after（あと何 ms で再試行可か）も返す。
- thread-safe（多数 thread が同時に叩く）。
- 分散環境（複数サーバで共有 limit）は out of scope だが、拡張余地に触れる。

## Core entities
- **RateLimiter → orchestrator**。endpoint → Limiter の map と default を持ち、`allow(key, endpoint)` の公開 API。
- **Limiter → interface（Strategy）**。`tryAcquire(key) -> RateLimitResult`。アルゴリズムごとに実装。
- **LimiterFactory → Factory**。algorithm 種別から具体 Limiter を生成。
- **RateLimitResult → immutable value object**。allowed・remaining・retryAfterMs。
- 具体 Limiter: **TokenBucketLimiter** / **SlidingWindowLogLimiter**。

## なぜ Strategy + Factory か
「アルゴリズムを差し替え可能」が要件なので、判定ロジックを Limiter interface の裏に閉じ込める（Strategy）。生成を1か所に集約するため Factory を置き、新アルゴリズムは factory に case を1つ足すだけで済む（Open/Closed）。

## Class design

```
interface Limiter:                       // Strategy
    tryAcquire(key) -> RateLimitResult

class RateLimitResult:                   // immutable
    - allowed: boolean
    - remaining: int
    - retryAfterMs: long
    + getters

enum Algorithm: TOKEN_BUCKET, SLIDING_WINDOW_LOG

class LimiterFactory:                     // Factory
    + create(algorithm, config) -> Limiter:
        switch algorithm:
            TOKEN_BUCKET -> new TokenBucketLimiter(config)
            SLIDING_WINDOW_LOG -> new SlidingWindowLogLimiter(config)

class RateLimiter:                        // orchestrator
    - limiters: Map<endpoint, Limiter>
    - defaultLimiter: Limiter
    + allow(key, endpoint) -> RateLimitResult:
        limiter = limiters.getOrDefault(endpoint, defaultLimiter)
        return limiter.tryAcquire(key)
```

## TokenBucket の実装

```
class TokenBucketLimiter implements Limiter:
    - capacity: int                      // バケツ最大
    - refillRatePerMs: double            // 1ms あたり補充トークン
    - buckets: ConcurrentHashMap<key, Bucket>

    class Bucket: - tokens: double; - lastRefillTime: long

    tryAcquire(key):
        b = buckets.computeIfAbsent(key, full bucket)
        synchronized(b):                 // per-key lock
            now = currentTimeMillis()
            elapsed = now - b.lastRefillTime
            b.tokens = min(capacity, b.tokens + elapsed * refillRatePerMs)  // on-demand 補充
            b.lastRefillTime = now
            if b.tokens >= 1:
                b.tokens -= 1
                return RateLimitResult(allowed=true, remaining=floor(b.tokens), retryAfterMs=0)
            else:
                needed = 1 - b.tokens
                retry = ceil(needed / refillRatePerMs)   // 端数切り上げ
                return RateLimitResult(false, 0, retry)
```

ポイント: 背景 thread で定期補充せず、**アクセス時に経過時間から計算して補充**（on-demand refill）。token を double で持ち端数を保持。retryAfterMs は「あと1トークン貯まるまで」の時間を切り上げ。bursty を許す（貯めた分まとめて使える）。

## SlidingWindowLog の実装

```
class SlidingWindowLogLimiter implements Limiter:
    - limit: int                         // window 内 最大件数
    - windowMs: long
    - logs: ConcurrentHashMap<key, Queue<long>>   // timestamp の列

    tryAcquire(key):
        q = logs.computeIfAbsent(key, empty queue)
        synchronized(q):                 // per-key lock
            now = currentTimeMillis()
            cutoff = now - windowMs
            while q not empty and q.peek() <= cutoff: q.poll()   // 古い記録を捨てる
            if q.size() < limit:
                q.add(now)
                return RateLimitResult(true, limit - q.size(), 0)
            else:
                oldest = q.peek()
                retry = oldest + windowMs - now   // 最古が window から出るまで
                return RateLimitResult(false, 0, retry)
```

ポイント: window から外れた古い timestamp を毎回 poll で捨てる。正確（厳密に直近 window の件数）だが、key ごとに最大 limit 個の timestamp を保持するのでメモリを食う。token bucket よりメモリ重・精度高。

## アルゴリズム比較（口頭用）
- **token bucket**: メモリ小（key ごとに数値2つ）、burst 許容、実装単純。精度はやや粗い。
- **sliding window log**: 厳密、burst を平滑化。メモリは key × limit 件で重い。
- 他に fixed window（境界で2倍 burst の弱点）、sliding window counter（log の近似で軽量）。trade を一言ずつ言えると良い。

## Concurrency
多数 thread が同じ key を同時に叩くと、token 読取 → 減算 や queue の size 確認 → add が race し、limit を超えて通してしまう。
- **ConcurrentHashMap** で key→state を管理（map 自体の操作は thread-safe、computeIfAbsent で原子的に生成）。
- 各 key の状態更新は **per-key lock**（`synchronized(bucket)` / `synchronized(queue)`）。global lock にすると無関係な key 同士まで直列化して throughput が落ちる。per-resource locking（他 problem と同じ発想で、ここでは resource = key）。
- read-modify-write（補充して減算、古いの捨てて追加）が atomic になるよう lock 範囲を1 key に閉じる。

## Extensibility
- **新アルゴリズム追加**: Limiter を実装し factory に case を足すだけ（Strategy + Factory の効果、Open/Closed）。
- **動的 config**: endpoint ごとの limit を実行時に変更。limiters map を更新可能にし、設定変更を反映。
- **メモリ増加対策**: idle な key の state が溜まり続ける。TTL や LRU で eviction（一定時間アクセスのない key を破棄）。sliding window log は特に重いので必須級。
- **分散 rate limit**: 複数サーバで共有 limit が要るなら状態を Redis 等の外部 store に出す（INCR + EXPIRE、Lua で atomic）。これは System Design 領域だが、interface はそのまま使い回せる設計にしておく。

## デザインパターン整理
- Limiter は **Strategy**（アルゴリズム差し替え）。
- LimiterFactory は **Factory**（生成集約、Open/Closed）。
- RateLimiter は **Facade / Controller**。
- RateLimitResult は **value object**（immutable）。
- per-key lock は concurrency 設計原則。

## 各レベル期待値
- **Junior**: 1アルゴリズム（token bucket か fixed window）で key ごとに count、超過で deny。
- **Mid**: Limiter を interface 化して差し替え可能に、endpoint→limiter + default の振り分け、on-demand refill、retry-after の算出、ConcurrentHashMap + per-key lock を説明。
- **Senior**: Strategy + Factory で拡張性、複数アルゴリズムの trade（メモリ/精度/burst）を自分から、per-key lock が global より優れる理由、idle key の eviction（TTL/LRU）、分散版を Redis 外部状態に出す拡張を議論。
