package com.hellointerview.parkinglot;

/**
 * 料金計算アルゴリズムをカプセル化するインターフェースです（Strategy パターン）。
 * 
 * LLD設計原則（開閉原則 / Open-Closed Principle）:
 * - 料金計算ルール（基本時間料金、車種別の傾斜、時間帯割引など）が追加・変更される際、
 *   オーケストレーターである ParkingLot クラスを修正することなく拡張可能にします。
 * 
 * お金に関する注意点:
 * - 浮動小数点数（float/double）は誤差が蓄積するため使用しません。最小単位の「セント(cents)」を長整数（long）で保持します。
 */
public interface PricingStrategy {
    /**
     * 入出庫時刻と車種に基づいて料金を算出します。
     *
     * @param entryTimeMs 入庫ミリ秒時刻
     * @param exitTimeMs 出庫ミリ秒時刻
     * @param vehicleType 車種
     * @param hourlyRateCents 1時間あたりの基本料金（セント単位）
     * @return 計算された料金（セント単位）
     */
    long computeFee(long entryTimeMs, long exitTimeMs, VehicleType vehicleType, long hourlyRateCents);
}
