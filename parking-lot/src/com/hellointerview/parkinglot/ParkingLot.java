package com.hellointerview.parkinglot;

import java.util.*;
import java.util.concurrent.locks.ReentrantLock;

/**
 * 駐車場システム全体の司令塔（オーケストレーター）となるクラスです。
 * 
 * LLD設計原則:
 * - 本クラスが唯一の公開APIエントリーポイントであり、各種エンティティの関係的状態を管理します。
 * - スレッドセーフ設計: 複数入口からの同時アクセスを考慮し、Java の ReentrantLock を用いて排他制御を行います。
 * - 状態管理の分離: `occupiedSpotIds`（占有されたスポットID集合）および `activeTickets`（アクティブなチケット辞書）を持ち、
 *   駐車スポット自体に「空車/満車」のフラグを持たせない「関係的状態の集約」を実現しています。
 */
public final class ParkingLot {
    private final List<ParkingSpot> spots;
    private final Set<String> occupiedSpotIds;
    private final Map<String, Ticket> activeTickets;
    private final long hourlyRateCents;
    private final PricingStrategy pricingStrategy;
    
    // スレッド排他制御のためのロックオブジェクト
    private final ReentrantLock lock = new ReentrantLock();

    public ParkingLot(List<ParkingSpot> spots, long hourlyRateCents) {
        this(spots, hourlyRateCents, new DefaultPricingStrategy());
    }

    public ParkingLot(List<ParkingSpot> spots, long hourlyRateCents, PricingStrategy pricingStrategy) {
        if (spots == null) {
            throw new IllegalArgumentException("ParkingSpot list must not be null");
        }
        if (hourlyRateCents < 0) {
            throw new IllegalArgumentException("Hourly rate must be non-negative");
        }
        this.spots = new ArrayList<>(spots);
        this.hourlyRateCents = hourlyRateCents;
        this.pricingStrategy = pricingStrategy != null ? pricingStrategy : new DefaultPricingStrategy();
        this.occupiedSpotIds = new HashSet<>();
        this.activeTickets = new HashMap<>();
    }

    /**
     * 車両が入場した際に自動で適合するスポットを割り当て、チケットを発行します。
     * スレッドセーフに実行されます。
     *
     * @param vehicleType 車種 (MOTORCYCLE, CAR, LARGE)
     * @return 発行された駐車セッションチケット
     * @throws IllegalStateException 空きスポットが存在しない場合
     */
    public Ticket enter(VehicleType vehicleType) {
        if (vehicleType == null) {
            throw new IllegalArgumentException("VehicleType must not be null");
        }

        lock.lock();
        try {
            // 1. 車種に適合する空きスポットを検索する
            ParkingSpot availableSpot = findAvailableSpot(vehicleType);
            if (availableSpot == null) {
                throw new IllegalStateException("No compatible parking spot available for " + vehicleType);
            }

            // 2. 状態の更新: スポットを占有状態にする
            occupiedSpotIds.add(availableSpot.getId());

            // 3. チケットの生成
            String ticketId = UUID.randomUUID().toString();
            long entryTimeMs = System.currentTimeMillis();
            Ticket ticket = new Ticket(ticketId, availableSpot.getId(), vehicleType, entryTimeMs);

            // 4. アクティブチケット辞書に保存して返却
            activeTickets.put(ticketId, ticket);
            return ticket;
        } finally {
            lock.unlock();
        }
    }

    /**
     * 車両が退場する際にチケットIDを検証し、料金を算出してスポットを解放します。
     * スレッドセーフに実行されます。
     *
     * @param ticketId チケットID
     * @return 計算された駐車料金（セント）
     * @throws IllegalArgumentException チケットIDが無効または使用済みの場合
     */
    public long exit(String ticketId) {
        if (ticketId == null || ticketId.trim().isEmpty()) {
            throw new IllegalArgumentException("Ticket ID must not be empty");
        }

        lock.lock();
        try {
            // 1. チケットの取得と検証
            Ticket ticket = activeTickets.get(ticketId);
            if (ticket == null) {
                throw new IllegalArgumentException("Ticket is invalid or has already been used");
            }

            // 2. 料金の計算
            long exitTimeMs = System.currentTimeMillis();
            long fee = pricingStrategy.computeFee(
                ticket.getEntryTimeMs(),
                exitTimeMs,
                ticket.getVehicleType(),
                hourlyRateCents
            );

            // 3. 状態の更新: スポットの解放、およびアクティブチケットの削除
            occupiedSpotIds.remove(ticket.getSpotId());
            activeTickets.remove(ticketId);

            return fee;
        } finally {
            lock.unlock();
        }
    }

    /**
     * テストおよび検証用に占有スポットID集合のコピーを返します。
     */
    public Set<String> getOccupiedSpotIds() {
        lock.lock();
        try {
            return new HashSet<>(occupiedSpotIds);
        } finally {
            lock.unlock();
        }
    }

    /**
     * テストおよび検証用にアクティブチケット情報のコピーを返します。
     */
    public Map<String, Ticket> getActiveTickets() {
        lock.lock();
        try {
            return new HashMap<>(activeTickets);
        } finally {
            lock.unlock();
        }
    }

    /**
     * 空車スポットを線形探索 (First-Match) します。
     * 呼び出し元がロックを獲得している前提のプライベートメソッドです。
     */
    private ParkingSpot findAvailableSpot(VehicleType vehicleType) {
        SpotType requiredSpotType = mapVehicleTypeToSpotType(vehicleType);
        for (ParkingSpot spot : spots) {
            if (spot.getSpotType() == requiredSpotType && !occupiedSpotIds.contains(spot.getId())) {
                return spot;
            }
        }
        return null;
    }

    /**
     * 車種と駐車スペース型のマッピングを行います。
     * 将来的に「オートバイが乗用車用スペースを利用可能にする」等の要件変更が生じた場合、
     * このメソッドの戻り値を変更するだけで、メインの割り当てロジックを修正せずに対応できます。
     */
    private SpotType mapVehicleTypeToSpotType(VehicleType vehicleType) {
        switch (vehicleType) {
            case MOTORCYCLE:
                return SpotType.MOTORCYCLE;
            case CAR:
                return SpotType.CAR;
            case LARGE:
                return SpotType.LARGE;
            default:
                throw new IllegalArgumentException("Unknown vehicle type: " + vehicleType);
        }
    }
}
