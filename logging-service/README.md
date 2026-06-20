# Java製スレッドセーフ・ロギングサービス & リアルタイム可視化ダッシュボード

本プロジェクトは、Java 21+ の並行処理ユーティリティを最大限に活用した、高並行・高拡張なインプロセス・ロギングライブラリと、スレッド排他（Mutex）、非同期バッファキュー、バックプレッシャーポリシーをブラウザ上で動的に体験・シミュレーションできるリアルタイム可視化ダッシュボード（Web SPA）の統合システムです。

---

## 📂 ディレクトリ構成

```
low-level-design/logging-service/
  ├── src/
  │   └── main/
  │       └── java/
  │           ├── logger/          # ロギングコア・パッケージ
  │           │     ├── LogLevel.java              # ログレベル (DEBUG ~ FATAL)
  │           │     ├── LogRecord.java             # 不変データモデル (record)
  │           │     ├── Formatter.java             # 書式インタフェース
  │           │     ├── PlainTextFormatter.java    # パターン置換テキスト書式
  │           │     ├── JsonFormatter.java         # 特殊文字エスケープ付JSON書式
  │           │     ├── Sink.java                  # 出力先インタフェース
  │           │     ├── ConsoleSink.java           # 標準出力へのライト
  │           │     ├── FileSink.java              # ディスク排他 append-only ライト
  │           │     ├── MemorySink.java            # メモリ蓄積バッファ
  │           │     ├── QueueBackpressurePolicy.java # 満杯時の処理ポリシー
  │           │     ├── Destination.java           # 宛先 (排他制御・キュー・ worker・ポリシー)
  │           │     ├── Logger.java                # ロガー (Aggregator, Double-Checked Cache)
  │           │     ├── LoggerManager.java         # ドット区切り階層 namespace 解決
  │           │     └── EventBus.java              # SSE送信用マルチスレッドイベントバス
  │           └── server/          # Webサーバー・シミュレーション・パッケージ
  │                 ├── Server.java                # HttpServer (自作JSONパーサー, REST, SSE)
  │                 └── SimulationRunner.java      # 並行スレッドシミュレータ
  ├── dashboard/                  # ダッシュボード・フロントエンドアセット
  │     ├── index.html                             # Web画面構造
  │     ├── styles.css                             # プレミアムUI（Kanagawa Waveテーマ）
  │     └── app.js                                 # SSE受信・SVGベジェ曲線・アニメーション制御
  ├── lib/                        # 外部ライブラリ
  │     └── lombok.jar                             # Project Lombok
  ├── .vscode/                    # VSCode設定
  │     ├── settings.json                          # Java JDT LS & mise JDK 21 パス設定
  │     └── keybindings.json                       # キーバインド設定のバックアップ
  ├── .gitignore                  # Git追跡除外設定
  ├── logging-service.code-workspace # VSCode ワークスペース定義ファイル
  ├── run.sh                      # コンパイル・テスト・起動自動化スクリプト
  └── app.log                     # アプリケーション書き出しログファイル (自動生成)
```

---

## ⚙️ 環境要件

- **Java**: Java 21 以上 (LTS推奨)
- **Project Lombok**: ボイラープレートコード（ゲッター等）削減のために利用。`lib/lombok.jar` が同梱されており、`run.sh` で自動的にクラスパスに追加されます。
  > [!TIP]
  > 本リポジトリ内には、`mise` でセットアップした Java 21 を自動アクティベートするための設定が `.vscode/settings.json` および `.tool-versions` / `mise.toml` で定義されています。

---

## 🛠️ 自動検証テストの実行

スレッドセーフな排他書き込み、レベルフィルタリング、親ロガーへのログ伝播、および4種類の非同期キュー・バックプレッシャー動作を検証するストレス・ユニットテストを実行します。

```bash
# 自動検証テストスイートの実行
./run.sh --test
```

### テストされるシナリオ：
1. **Level Threshold Filtering**: 宛先ごとの最小ログレベル未満のメッセージが正しく除外されるか。
2. **Dotted Namespace Hierarchy**: ドット区切り階層（`app.service.db` ➔ `app` ➔ `root`）に沿って宛先にログが正しく伝播するか。
3. **Lock Contention**: 5つの並行スレッドから同時に大量ログを書き込んだ際、排他制御（ReentrantLock）が走り、ログファイルが破損せず行ごとにアトミックに書き込まれるか。
4. **Async Queue BLOCK Policy**: キュー満杯時に送信側スレッドが適切に一時ブロッキング（待機）し、ログが抜けた後に復帰するか。
5. **Async Queue DROP_NEWEST Policy**: キュー満杯時に新しいログが即座に破棄され、STDERR警告が出るか。
6. **Async Queue DROP_OLDEST Policy**: キュー満杯時にキューの中の最も古いログを破棄し、新しいログを差し替え挿入するか。
7. **Async Queue THROW Policy**: キュー満杯時に即座に `QueueFullException` 例外がスローされるか。

---

## 🚀 リアルタイム可視化ハンズオンガイド

### ステップ 1: 可視化サーバーの起動
以下のコマンドで、マルチスレッドHTTPサーバーを起動します。

```bash
# Webサーバーのコンパイルと起動 (デフォルトポート: 8080)
./run.sh
```

コンソールに `Logging Service Dashboard running at http://localhost:8080` と表示されれば準備完了です。

### ステップ 2: ダッシュボードを開く
ブラウザで以下のURLを開きます。
👉 **[http://localhost:8080](http://localhost:8080)**

> [!NOTE]
> あなたの VSCode グローバル設定を自動適用し、和風の美しいダークテーマ **「Kanagawa Wave」**（Fuji White文字、Sumi Ink背景、Wave Blueアクセント）、**右サイドバーレイアウト**、**FirgeNerd Console** フォントが Web 画面に完全再現されています！

---

### ステップ 3: バックプレッシャー＆スレッド競合のシミュレーション

#### シナリオA: スレッドが一時停止するバックプレッシャー (`BLOCK` ポリシー)
1. 画面右上の**「ロガー設定パネル」**から「**標準構成**」プリセットを選択します。
   - `root` ロガーに非同期（Async）、**キュー容量 10**、ポリシー `BLOCK` の FileSink が登録されます。
2. 「**設定を適用してロガーを初期化**」ボタンをクリックします。
3. その下の**「スレッド並行シミュレーター」**でパラメータを設定します：
   - 並行スレッド数: `4`
   - 1スレッドあたりのエミット数: `60`
   - エミット間隔: `0.03秒`
   - エミット対象ロガー: `app.service`
4. 「**シミュレーション開始**」をクリックします。

**👀 観察ポイント:**
- **ベジェ曲線の発光**: `app.service` ➔ `app` ➔ `root` とドット区切りの親を遡って伝播し、`ConsoleSink` (Sync) と `FileSink` (Async) へ流れる光のパーティクルが表示されます。
- **キューのブロッキング**: ディスクへの非同期 FileSink 書込に対してキュー（容量10）が満杯になると、上部の「ブロックされたスレッド数」メーターが跳ね上がり、シミュレータスレッドが一時停止します。ログが消化されて枠が空くと、自動的にブロックが解除されます（`STDERR` ターミナルにブロック時間等の統計が出力されます）。

---

#### シナリオB: ログの破棄 (`DROP_NEWEST` ポリシー)
1. 右上のパネルから「**非同期ストレス**」プリセットを選択します。
   - `app` ロガーに非同期（Async）、**キュー容量 5**、ポリシー `DROP_NEWEST` の FileSink がセットされます。
2. 「**設定を適用してロガーを初期化**」をクリックします。
3. シミュレーターでスレッド数 `4`、エミット数 `50`、間隔 `0.02秒` を設定し、エミット対象ロガーを `app` にしてシミュレーションを開始します。

**👀 観察ポイント:**
- スレッドは一切ブロッキングされず、高速に処理が走り抜けます。
- キュー（容量5）が満杯になると、破棄カウンター（DROP）が激しくカウントアップします。
- 右下の `STDERR` ターミナルに、キューが満杯のため新ログが即時破棄された旨の警告メッセージ（`WARNING: Queue full`）が大量にスクロール出力されます。

---

#### シナリオC: ロック競合 (Mutex Lock Contention)
非同期ではない同期（Sync）の `console` 宛先、あるいは非同期キューの背後にある I/O 書き込み部では、同一リソースへの多重アクセスを防ぐための **ReentrantLock** が動作しています。

1. シミュレーション中に、中央レーンの `ConsoleSink` や `FileSink` に付随する **南京錠アイコン** を確認します。
2. ロックが競合すると、南京錠が黄色に点滅し **`WAITING`** 状態になり、順番待ちしているシミュレータスレッド名が表示されます。
3. ロックを獲得すると瞬時に緑色の **`ACQUIRED`** 状態に変化し、現在ロックを占有して書き込みを行っているアクティブスレッド名が表示されます。
