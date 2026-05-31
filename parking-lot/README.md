# Parking Lot LLD - インタラクティブ・ハンズオン・シミュレーター (Java版)

Googleの低レベル設計（LLD）面接対策に特化した、**駐車場管理システム（Parking Lot）**のJava実装、自律型マルチスレッド検証スイート、および直感的に理解を深められる**プレミアム・インタラクティブ・ウェブダッシュボード**を内包した学習プロジェクトです。

---

## 🚀 本プロジェクトの構成要素

### 1. JavaによるLLDの完全実装 (`src/com/hellointerview/parkinglot/`)
オブジェクト指向の設計原則を厳格に満たした、クリーンかつ実戦的なJava 21コードです。

* **[VehicleType.java](src/com/hellointerview/parkinglot/VehicleType.java) / [SpotType.java](src/com/hellointerview/parkinglot/SpotType.java)**
  * 車両はシステムにとって「外部存在」であるため、状態を持たない単なる分類用**Enum**として軽量に定義。
* **[ParkingSpot.java](src/com/hellointerview/parkinglot/ParkingSpot.java)**
  * スポットIDやサイズ情報のみを持つイミュータブルな物理スペースクラス（**Intrinsic State / 本質的状態**）。
* **[Ticket.java](src/com/hellointerview/parkinglot/Ticket.java)**
  * 駐車セッションを記録する不変のオブジェクト。デメテルの法則（Law of Demeter）に基づき、ParkingSpot インスタンスを直接握らずID（`spotId`）のみを保持。
* **[PricingStrategy.java](src/com/hellointerview/parkinglot/PricingStrategy.java) / [DefaultPricingStrategy.java](src/com/hellointerview/parkinglot/DefaultPricingStrategy.java) / [VehicleTypePricingStrategy.java](src/com/hellointerview/parkinglot/VehicleTypePricingStrategy.java)**
  * 料金計算処理を ParkingLot から分離する **Strategy パターン**（開閉原則の遵守）。金銭誤差を防ぐため、すべての金額は最小単位の長整数（`long cents`）で保持。
* **[ParkingLot.java](src/com/hellointerview/parkinglot/ParkingLot.java)**
  * 空枠検索、入庫（`enter`）、出庫（`exit`）、および `java.util.concurrent.locks.ReentrantLock` によるスレッド同期を司るオーケストレーター。

### 2. マルチスレッド検証スイート
* **[ParkingLotTest.java](src/com/hellointerview/parkinglot/ParkingLotTest.java)**
  * 外部ビルドツール不要で実行可能なテストメインクラス。正常系、満車拒否、無効チケット、二重出庫防止、料金端数切り上げ、および**10本の並行スレッドから同時に2枠の空きスペースを競い合わせる競合防止テスト**をパスします。

### 3. プレミアム・ウェブダッシュボード (`index.html` / `styles.css` / `app.js`)
ブラウザ上で動作する高精細なシミュレーターです。

* **🚗 シミュレーター (Simulator)**: 3フロアのグリッドマップ、入庫操作パネル、時間経過を加速させるスライダー、および精算料金（リアルタイム端数切り上げ）を表示するチケット管理テーブル。
* **⚡ 並行処理検証 (Concurrency Playground)**: Lockの有無によるレースコンディション発生の違い（C1への重複予約バグの発生 vs 安全なスレッド順序実行）を、コンソールログとスレッド状態で再生。
* **💡 LLD設計論 (LLD Explorer)**: 面接の重要設計論点解説、UML関係図、およびJavaソースコードビューア。
* **📝 模擬面接クイズ (Interview Quiz)**: 駐車場設計のコアな判断について、その場で回答と日本語の設計意図解説を確認できるクイズエンジン。

---

## 🛠 動作・起動手順

### A. Java テストスイートの実行 (`mise`)
環境マネージャー `mise` で設定された Java 21 を使用して、コンパイルおよびテストスイートを実行します。

```bash
# クラスのコンパイル (Lombok依存を含む)
mise exec -- javac -cp lib/lombok.jar -d bin src/com/hellointerview/parkinglot/*.java

# テストプログラムの実行 (Lombok依存を含む)
mise exec -- java -cp bin:lib/lombok.jar com.hellointerview.parkinglot.ParkingLotTest
```

### B. ウェブダッシュボードの起動
本シミュレーターは、特別な依存パッケージなしに起動できます。

1. **Pythonの簡易HTTPサーバーを使用する場合（推奨）**:
   ```bash
   python3 -m http.server 8000
   ```
   実行後、ブラウザで `http://localhost:8000` にアクセスしてください。

2. **直接HTMLファイルを開く場合**:
   お使いのブラウザ（Chrome等）で直接 [index.html](index.html) を開くことで、すぐに起動します。

---

## 💡 Google面接で評価される設計選択（概要）

1. **Vehicleはクラスにしない（Enumに留める）**
   * 車両はシステム内で状態を管理しないため、Enumで十分です。「名詞をすべてクラスにしない」判断力をアピールします。
2. **Intrinsic（本質的）とRelational（関係的）状態の分離**
   * 占有状況は ParkingLot 側で `Set<String>` として集中管理します。これにより、オブジェクト間の循環参照を排除し、排他同期を極めてシンプルにします。
3. **お金は cents（整数）で管理**
   * 小数点誤差の累積を防ぐため、浮動小数点数は使わず長整数（`long`）で保持します。表示の時のみドルに換算します。
4. **デメテルの法則の遵守**
   * チケットは `ParkingSpot` の実体を参照せず、ID文字列のみを保持してモデル間の境界をクリーンに保ちます。

---

## 🎓 ハンズオン学習ロードマップ（ステップ・バイ・ステップ）

本プロジェクトを活用して、GoogleのLLD面接を突破するための「5ステップ学習手順」です。

### ステップ 1: コードリーディング（設計判断の理解）
まず、`/src` 配下のJavaクラスを以下の順番で読み進め、設計意図を把握します。
1. **`VehicleType.java` / `SpotType.java`**: なぜこれらがクラスではなく Enum なのかを考えます。
2. **`ParkingSpot.java`**: メンバ変数に `occupied` などのフラグが無いことを確認します。
3. **`Ticket.java`**: `ParkingSpot` への参照ではなく、`spotId`（文字列）で保持している理由（デメテルの法則）を確認します。
4. **`PricingStrategy.java`**: 料金計算ロジックが別クラスにカプセル化されている構造（開閉原則）を確認します。
5. **`ParkingLot.java`**: `ReentrantLock` がどこに配置され、どの変数を保護しているかを読み解きます。

### ステップ 2: ローカルでのコンパイルとテストの実行
スレッド安全性と料金計算の正確性を確認するために、ターミナルでテストスイートを実行します。
```bash
mise exec -- javac -d bin src/com/hellointerview/parkinglot/*.java
mise exec -- java -cp bin com.hellointerview.parkinglot.ParkingLotTest
```
* **検証ポイント**: テストログの `マルチスレッド環境における同時入庫` が `[PASS]` する様子を確認し、`ParkingLotTest.java` 内の `CountDownLatch` を用いた同時起動の記述方法を学びます。

### ステップ 3: ビジュアルシミュレーターでの動作検証
ブラウザで `index.html` を開き、「シミュレーター」タブを操作します。
1. `Car` や `Large` などの車両を選び、別々のゲートから入庫させてスポットの表示（空車⇒占有）の変化を確認します。
2. 「時間経過速度」スライダーを高速にし、チケットテーブルの「現在料金」が1時間（加速時間）ごとに端数切り上げ（$5.00刻み）で加算されていくことを確認します。
3. 料金計算戦略を `VehicleTypePricingStrategy` に変更し、車種ごとに料金倍率（二輪なら $3.00、大型なら $7.50 等）が正しく傾斜することを確認します。

### ステップ 4: 並行処理の競合（レースコンディション）の視覚体験
「並行処理検証」タブを開きます。
1. **「排他制御 (ReentrantLock) : 無効」** に設定し、「同時入庫シミュレーション実行」をクリックします。
   * **観察**: 3つのゲートスレッドがほぼ同時に空枠をスキャンし、全員が「C1は空車である」と誤認して重複予約を行い、スポットが **`CONFLICT (三重割当)`** という破壊的エラー状態に陥るプロセスを追体験します。
2. **「排他制御 (ReentrantLock) : 有効」** に戻し、再度実行します。
   * **観察**: 最初のスレッドが Lock を取得して C1 を確保する間、他スレッドは `BLOCKED` で待機し、解放後に正しく「満車による拒否」となる安全な同期制御の流れを確認します。

### ステップ 5: 模擬面接クイズで知識を定着
「模擬面接クイズ」タブを開き、全6問の LLD 面接重要クイズに回答します。
各問の解説には、「なぜ float がアンチパターンなのか」「なぜ intrinsic と relational 状態を分けるのか」といった、面接でそのまま声に出して答えるべき**ベストプラクティスの論理武装**が詳細にまとめられています。全問正解を目指しましょう。

