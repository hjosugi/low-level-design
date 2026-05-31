package com.hellointerview.parkinglot;

import lombok.Getter;
import lombok.ToString;

/**
 * 駐車セッションの記録を表すイミュータブル（不変）なバリューオブジェクトです。
 * 
 * LLD設計原則（デメテルの法則 / Law of Demeter の遵守）:
 * - ParkingSpot オブジェクトへの参照を直接持たず、ID（spotId）のみを保持します。
 * - これにより、Ticket がドメインモデルの深部にアクセスするのを防ぎ、結合度を低く保っときます。
 * - 生成されたチケットのデータは不変（Immutable）であり、事後的な変更は不可能です。
 */
@Getter
@ToString
public final class Ticket {
    private final String id;
    private final String spotId;
    private final VehicleType vehicleType;
    private final long entryTimeMs;

    public Ticket(String id, String spotId, VehicleType vehicleType, long entryTimeMs) {
        if (id == null || id.trim().isEmpty()) {
            throw new IllegalArgumentException("Ticket ID must not be empty");
        }
        if (spotId == null || spotId.trim().isEmpty()) {
            throw new IllegalArgumentException("Spot ID must not be empty");
        }
        if (vehicleType == null) {
            throw new IllegalArgumentException("VehicleType must not be null");
        }
        this.id = id;
        this.spotId = spotId;
        this.vehicleType = vehicleType;
        this.entryTimeMs = entryTimeMs;
    }
}
