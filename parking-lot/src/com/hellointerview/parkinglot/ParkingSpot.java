package com.hellointerview.parkinglot;

import lombok.Getter;
import lombok.ToString;

/**
 * 駐車スペースの物理的特性を表すイミュータブル（不変）なクラスです。
 * 
 * LLD設計原則（Hello Interviewより）:
 * - 本クラスは物理的な固有の性質（IDやサイズ）である「Intrinsic State（本質的状態）」のみを保持します。
 * - 「現在占有されているか」といった「Relational State（関係的状態）」は、
 *   オーケストレーターである ParkingLot クラスが集中管理します。これにより責務が明確に分離されます。
 */
@Getter
@ToString
public final class ParkingSpot {
    private final String id;
    private final SpotType spotType;

    public ParkingSpot(String id, SpotType spotType) {
        if (id == null || id.trim().isEmpty()) {
            throw new IllegalArgumentException("ParkingSpot ID must not be empty");
        }
        if (spotType == null) {
            throw new IllegalArgumentException("SpotType must not be null");
        }
        this.id = id;
        this.spotType = spotType;
    }
}
