package com.hellointerview.parkinglot;

/**
 * デフォルトの料金計算戦略です。
 * 車種にかかわらず均一の1時間単位（端数切り上げ）料金を算出します。
 */
public final class DefaultPricingStrategy implements PricingStrategy {

    @Override
    public long computeFee(long entryTimeMs, long exitTimeMs, VehicleType vehicleType, long hourlyRateCents) {
        long durationMs = exitTimeMs - entryTimeMs;
        if (durationMs <= 0) {
            // 入出庫が即時の場合も最低料金として1時間分を請求します（端数切り上げルール）
            return hourlyRateCents;
        }

        long hourInMs = 1000L * 60 * 60;
        long hours = durationMs / hourInMs;

        // 1秒でも端数があれば切り上げます
        if (durationMs % hourInMs > 0) {
            hours++;
        }

        return hours * hourlyRateCents;
    }
}
