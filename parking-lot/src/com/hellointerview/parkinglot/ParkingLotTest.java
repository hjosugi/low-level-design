package com.hellointerview.parkinglot;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 駐車場システム(LLD)の動作検証を自律的に行うためのテスト実行クラスです。
 * ビルドツール(Maven/Gradle)等の外部依存を一切持たず、単独でコンパイルおよび実行可能です。
 * 
 * 実行方法:
 *   javac -d bin src/com/hellointerview/parkinglot/*.java
 *   java -cp bin com.hellointerview.parkinglot.ParkingLotTest
 */
public final class ParkingLotTest {

    private static int totalTests = 0;
    private static int passedTests = 0;

    public static void main(String[] args) {
        System.out.println("==================================================");
        System.out.println("   Parking Lot LLD - Java テストスイートの実行");
        System.out.println("==================================================");

        try {
            runTest("正常系の入庫・出庫フロー", ParkingLotTest::testHappyPathEntryExit);
            runTest("満車時の入庫拒否処理", ParkingLotTest::testCapacityRejection);
            runTest("無効または存在しないチケットの検証", ParkingLotTest::testInvalidTicketExits);
            runTest("重複出庫（二重支払い）防止", ParkingLotTest::testDoubleExitPrevention);
            runTest("デフォルト時間料金計算（端数切り上げ）", ParkingLotTest::testFeeCalculationRounding);
            runTest("車種別傾斜料金（Strategyパターン）の検証", ParkingLotTest::testVehicleTypePricingStrategy);
            runTest("マルチスレッド環境における同時入庫（並行性）の検証", ParkingLotTest::testConcurrencyRaceCondition);

            System.out.println("==================================================");
            System.out.printf(" テスト結果サマリー: %d/%d 件成功\n", passedTests, totalTests);
            if (passedTests == totalTests) {
                System.out.println(" STATUS: SUCCESS (全テストケース合格)");
            } else {
                System.out.println(" STATUS: FAILED (一部に失敗があります)");
                System.exit(1);
            }
            System.out.println("==================================================");

        } catch (Exception e) {
            System.err.println("テスト実行中に予期せぬ致命的な例外が発生しました:");
            e.printStackTrace();
            System.exit(1);
        }
    }

    private static void runTest(String testName, RunnableWithException testRunnable) {
        totalTests++;
        System.out.print(" TESTING: " + testName + " ... ");
        try {
            testRunnable.run();
            passedTests++;
            System.out.println("[PASS]");
        } catch (Throwable t) {
            System.out.println("[FAIL]");
            System.err.println("   ⇒ エラー内容: " + t.getMessage());
            if (t.getCause() != null) {
                System.err.println("   ⇒ 起因: " + t.getCause());
            }
            t.printStackTrace();
        }
    }

    @FunctionalInterface
    interface RunnableWithException {
        void run() throws Exception;
    }

    private static void assertEquals(Object expected, Object actual) {
        if (!Objects.equals(expected, actual)) {
            throw new AssertionError("期待値: " + expected + ", 実際の値: " + actual);
        }
    }

    private static void assertTrue(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError("条件不成立: " + message);
        }
    }

    // --- 各テストケースの実装 ---

    private static void testHappyPathEntryExit() {
        List<ParkingSpot> spots = Arrays.asList(
            new ParkingSpot("M1", SpotType.MOTORCYCLE),
            new ParkingSpot("C1", SpotType.CAR),
            new ParkingSpot("C2", SpotType.CAR),
            new ParkingSpot("L1", SpotType.LARGE)
        );
        ParkingLot lot = new ParkingLot(spots, 500); // 1時間 500セント

        // 車両の入場 (CAR)
        Ticket ticket = lot.enter(VehicleType.CAR);
        assertEquals("C1", ticket.getSpotId()); // 最初の空き車用スペースが選ばれるべき
        assertEquals(VehicleType.CAR, ticket.getVehicleType());
        assertTrue(lot.getOccupiedSpotIds().contains("C1"), "スポットC1が占有中であること");
        assertTrue(lot.getActiveTickets().containsKey(ticket.getId()), "アクティブチケットに含まれていること");

        // 即時退場（端数切り上げにより1時間分の500セントが請求されるべき）
        long fee = lot.exit(ticket.getId());
        assertEquals(500L, fee);
        assertTrue(!lot.getOccupiedSpotIds().contains("C1"), "スポットC1が解放されていること");
        assertTrue(!lot.getActiveTickets().containsKey(ticket.getId()), "チケットがアクティブリストから消えていること");
    }

    private static void testCapacityRejection() {
        List<ParkingSpot> spots = Arrays.asList(
            new ParkingSpot("L1", SpotType.LARGE)
        );
        ParkingLot lot = new ParkingLot(spots, 500);

        // 1台目の大型車が入庫
        Ticket t1 = lot.enter(VehicleType.LARGE);
        assertEquals("L1", t1.getSpotId());

        // 2台目の大型車が入庫を試みる (満車により例外が発生するべき)
        boolean hasException = false;
        try {
            lot.enter(VehicleType.LARGE);
        } catch (IllegalStateException e) {
            hasException = true;
            assertTrue(e.getMessage().contains("No compatible parking spot available"), "適切なエラーメッセージであること");
        }
        assertTrue(hasException, "満車の時は IllegalStateException が発生するべき");
    }

    private static void testInvalidTicketExits() {
        List<ParkingSpot> spots = Arrays.asList(new ParkingSpot("C1", SpotType.CAR));
        ParkingLot lot = new ParkingLot(spots, 500);

        // 存在しないチケットIDで出庫を試みる
        boolean hasException1 = false;
        try {
            lot.exit("invalid_id");
        } catch (IllegalArgumentException e) {
            hasException1 = true;
            assertTrue(e.getMessage().contains("Ticket is invalid or has already been used"), "エラーメッセージの検証");
        }
        assertTrue(hasException1, "存在しないチケットIDでの出庫は例外になること");

        // 空のチケットIDで出庫を試みる
        boolean hasException2 = false;
        try {
            lot.exit("");
        } catch (IllegalArgumentException e) {
            hasException2 = true;
            assertTrue(e.getMessage().contains("Ticket ID must not be empty"), "空IDエラーメッセージの検証");
        }
        assertTrue(hasException2, "空のチケットIDでの出庫は例外になること");
    }

    private static void testDoubleExitPrevention() {
        List<ParkingSpot> spots = Arrays.asList(new ParkingSpot("M1", SpotType.MOTORCYCLE));
        ParkingLot lot = new ParkingLot(spots, 500);

        Ticket ticket = lot.enter(VehicleType.MOTORCYCLE);

        // 1回目の出庫 (正常に通過)
        long fee = lot.exit(ticket.getId());
        assertEquals(500L, fee);

        // 同じチケットで2回目の出庫 (使用済みチケットとして拒否されるべき)
        boolean hasException = false;
        try {
            lot.exit(ticket.getId());
        } catch (IllegalArgumentException e) {
            hasException = true;
            assertTrue(e.getMessage().contains("Ticket is invalid or has already been used"), "二重出庫防止エラーメッセージ");
        }
        assertTrue(hasException, "使用済みチケットでの二重出庫は例外になること");
    }

    private static void testFeeCalculationRounding() {
        PricingStrategy strategy = new DefaultPricingStrategy();
        long rate = 500; // 500 cents

        // 1. 滞在時間 0ミリ秒（即時出庫）-> 端数切り上げにより1時間分の500セント
        assertEquals(500L, strategy.computeFee(1000L, 1000L, VehicleType.CAR, rate));

        // 2. 滞在時間 5分（300,000ミリ秒）-> 1時間分の500セント
        long fiveMinsMs = 5 * 60 * 1000L;
        assertEquals(500L, strategy.computeFee(1000L, 1000L + fiveMinsMs, VehicleType.CAR, rate));

        // 3. 滞在時間 1時間と1秒 -> 2時間分の1000セント
        long oneHourOneSecMs = (60 * 60 * 1000L) + 1000L;
        assertEquals(1000L, strategy.computeFee(1000L, 1000L + oneHourOneSecMs, VehicleType.CAR, rate));

        // 4. 滞在時間 ちょうど2時間 -> 2時間分の1000セント
        long twoHoursMs = 2 * 60 * 60 * 1000L;
        assertEquals(1000L, strategy.computeFee(1000L, 1000L + twoHoursMs, VehicleType.CAR, rate));
    }

    private static void testVehicleTypePricingStrategy() {
        PricingStrategy strategy = new VehicleTypePricingStrategy();
        long rate = 500; // 500 cents
        // 倍率: MOTORCYCLE = 0.6, CAR = 1.0, LARGE = 1.5

        // 1. オートバイ 1時間 -> 500 * 0.6 = 300セント
        assertEquals(300L, strategy.computeFee(1000L, 1000L + 100L, VehicleType.MOTORCYCLE, rate));

        // 2. 乗用車 1時間 -> 500 * 1.0 = 500セント
        assertEquals(500L, strategy.computeFee(1000L, 1000L + 100L, VehicleType.CAR, rate));

        // 3. 大型車 2時間 -> (500 * 2) * 1.5 = 1500セント
        long twoHoursMs = 2 * 60 * 60 * 1000L;
        assertEquals(1500L, strategy.computeFee(1000L, 1000L + twoHoursMs, VehicleType.LARGE, rate));
    }

    private static void testConcurrencyRaceCondition() throws Exception {
        // 利用可能な乗用車スポットが2つ（C1, C2）ある状況で、10個のスレッドが同時に駐車登録を試みます。
        // ReentrantLockによる排他制御が正しく機能していれば、
        // ちょうど2つのスレッドだけが入庫に成功して重複割り当てを回避し、
        // 残り8つのスレッドは「空きスペースなし」で安全に拒否（例外送出）される必要があります。
        
        List<ParkingSpot> spots = Arrays.asList(
            new ParkingSpot("C1", SpotType.CAR),
            new ParkingSpot("C2", SpotType.CAR)
        );
        ParkingLot lot = new ParkingLot(spots, 500);

        int numThreads = 10;
        ExecutorService executor = Executors.newFixedThreadPool(numThreads);
        CountDownLatch startSignal = new CountDownLatch(1);
        CountDownLatch doneSignal = new CountDownLatch(numThreads);

        List<Ticket> succeededTickets = Collections.synchronizedList(new ArrayList<>());
        AtomicInteger failedCount = new AtomicInteger(0);

        for (int i = 0; i < numThreads; i++) {
            executor.submit(() -> {
                try {
                    // 全スレッドを一斉にヨーイドンで開始させるための待機
                    startSignal.await();
                    Ticket ticket = lot.enter(VehicleType.CAR);
                    succeededTickets.add(ticket);
                } catch (IllegalStateException e) {
                    failedCount.incrementAndGet();
                } catch (Exception e) {
                    // 予期せぬ例外
                } finally {
                    doneSignal.countDown();
                }
            });
        }

        // 全スレッドの準備完了後、シグナルを送る
        startSignal.countDown();
        
        // 全スレッドの終了を待機 (タイムアウト付き)
        assertTrue(doneSignal.await(5, TimeUnit.SECONDS), "スレッドが時間内に終了すること");
        executor.shutdown();

        // 登録結果の整合性確認
        assertEquals(2, succeededTickets.size()); // 成功したチケット数はちょうど2つ
        assertEquals(8, failedCount.get()); // 失敗して拒否されたスレッド数はちょうど8つ
        assertEquals(2, lot.getOccupiedSpotIds().size()); // 占有中のスポットID数も2つ

        // 割り当てられたスポットIDが重複していないことを確認
        Set<String> assignedSpots = new HashSet<>();
        for (Ticket ticket : succeededTickets) {
            assignedSpots.add(ticket.getSpotId());
        }
        assertEquals(2, assignedSpots.size());
        assertTrue(assignedSpots.contains("C1"), "割り当てにC1が含まれていること");
        assertTrue(assignedSpots.contains("C2"), "割り当てにC2が含まれていること");
    }
}
