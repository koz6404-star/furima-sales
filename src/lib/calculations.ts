import type { RoundingType } from '@/types';

export function calcFee(
  price: number,
  ratePercent: number,
  rounding: RoundingType = 'floor'
): number {
  const fee = (price * ratePercent) / 100;
  switch (rounding) {
    case 'floor':
      return Math.floor(fee);
    case 'ceil':
      return Math.ceil(fee);
    case 'round':
      return Math.round(fee);
    default:
      return Math.floor(fee);
  }
}

export function calcGrossProfit(
  unitPrice: number,
  quantity: number,
  feeYen: number,
  shippingYen: number,
  materialYen: number,
  costYen: number
): number {
  const totalRevenue = unitPrice * quantity;
  const totalFee = feeYen * quantity;
  const totalCost = costYen * quantity;
  return totalRevenue - totalFee - shippingYen - materialYen - totalCost;
}

/** 利益率20%の目安価格: ceil(原価 * 1.20) ※従来・簡易版 */
export function calcPriceWithMargin20(costYen: number): number {
  return Math.ceil(costYen * 1.2);
}

/** 利益率30%の目安価格: ceil(原価 * 1.30) ※従来・簡易版 */
export function calcPriceWithMargin30(costYen: number): number {
  return Math.ceil(costYen * 1.3);
}

/**
 * 利益率X%を実現する販売価格（原価・手数料・送料・資材代込み）
 * 粗利 = 販売価格 - 手数料 - 送料 - 資材代 - 原価 = 原価 × (marginPercent/100)
 * P × (1 - feeRate/100) - shippingYen - materialYen - costYen = costYen × marginPercent/100
 * P = (costYen × (1 + marginPercent/100) + shippingYen + materialYen) / (1 - feeRate/100)
 */
export function calcTargetPriceForMargin(
  costYen: number,
  feeRatePercent: number,
  shippingYen: number,
  materialYen: number,
  marginPercent: number
): number {
  const afterFee = 1 - feeRatePercent / 100;
  if (afterFee <= 0) return Math.ceil(costYen * (1 + marginPercent / 100));
  const target =
    (costYen * (1 + marginPercent / 100) + shippingYen + materialYen) / afterFee;
  return Math.ceil(target);
}

/**
 * 利益率（粗利 ÷ 原価 × 100）を計算
 * 原価0の場合は0を返す
 */
export function calcProfitRatePercent(
  grossProfitYen: number,
  costYen: number
): number {
  if (costYen <= 0) return 0;
  return Math.round((grossProfitYen / costYen) * 100);
}
