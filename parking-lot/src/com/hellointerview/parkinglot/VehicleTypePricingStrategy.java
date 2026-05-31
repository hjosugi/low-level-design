package com.hellointerview.parkinglot;

import java.util.EnumMap;
import java.util.Map;

/**
 * 車種に応じて異なる料金倍率を適用する料金計算戦略です。
 * 
 * 倍率設定:
 * - MOTORCYCLE: 0.6倍
 * - CAR: 1.0倍
 * - LARGE: 1.5倍
 * 
 * 料金計算フロー:
 * - 滞在時間を時間単位（端数切り上げ）に変換します。
 * - 基本料金を算出した後、車種の倍率を掛け合わせ、整数（long）へ四捨五入（またはキャスト）してセント単位の誤差を防ぎます。
 */
public final class VehicleTypePricingStrategy implements PricingStrategy {
    private final Map<VehicleType, Double> multipliers;

    public VehicleTypePricingStrategy() {
        this.multipliers = new EnumMap<>(VehicleType.class);
        this.multipliers.put(VehicleType.MOTORCYCLE, 0.6);
        this.multipliers.put(VehicleType.CAR, 1.0);
        this.multipliers.put(VehicleType.LARGE, 1.5);
    }

    public VehicleTypePricingStrategy(Map<VehicleType, Double> customMultipliers) {
        this.multipliers = new EnumMap<>(VehicleType.class);
        this.multipliers.putAll(customMultipliers);
    }

    @Override
    public long computeFee(long entryTimeMs, long exitTimeMs, VehicleType vehicleType, long hourlyRateCents) {
        long durationMs = exitTimeMs - entryTimeMs;
        long hours;

        if (durationMs <= 0) {
            hours = 1;
        } else {
            long hourInMs = 1000L * 60 * 60;
            hours = durationMs / hourInMs;
            if (durationMs % hourInMs > 0) {
                hours++;
            }
        }

        long baseFee = hours * hourlyRateCents;
        double multiplier = multipliers.getOrDefault(vehicleType, 1.0);

        // 浮動小数点数演算による誤差を防ぐため、計算の最後に丸めを行います
        return Math.round(baseFee * multiplier);
    }
}
