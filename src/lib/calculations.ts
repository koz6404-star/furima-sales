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

/** 利益率20%の目安価格: ceil(原価 * 1.20) */
export function calcPriceWithMargin20(costYen: number): number {
  return Math.ceil(costYen * 1.2);
}

/** 利益率30%の目安価格: ceil(原価 * 1.30) */
export function calcPriceWithMargin30(costYen: number): number {
  return Math.ceil(costYen * 1.3);
}
