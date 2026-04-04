import type { CkbShipment, CkbShipmentItem } from '@/types';

/**
 * 国際送料・関税を商品数で按分し、1個あたり総コストを計算する
 */
export function allocateCosts(
  shipment: Pick<CkbShipment, 'intl_shipping_jpy' | 'customs_duty_jpy' | 'exchange_rate'>,
  items: Pick<CkbShipmentItem, 'quantity' | 'unit_cost_cny'>[]
): {
  allocatedItems: {
    unit_cost_jpy: number;
    allocated_intl_shipping_jpy: number;
    allocated_customs_jpy: number;
    total_cost_jpy: number;
    unit_total_cost_jpy: number;
  }[];
  total_items: number;
} {
  const rate = shipment.exchange_rate ?? 20.8;
  const totalQty = items.reduce((sum, it) => sum + it.quantity, 0);

  const allocatedItems = items.map((item) => {
    const unitCostJpy = Math.round((item.unit_cost_cny ?? 0) * rate);
    const ratio = totalQty > 0 ? item.quantity / totalQty : 0;
    const allocatedIntl = Math.round(shipment.intl_shipping_jpy * ratio);
    const allocatedCustoms = Math.round(shipment.customs_duty_jpy * ratio);
    const totalCost = unitCostJpy * item.quantity + allocatedIntl + allocatedCustoms;
    const unitTotalCost = item.quantity > 0 ? Math.round(totalCost / item.quantity) : 0;

    return {
      unit_cost_jpy: unitCostJpy,
      allocated_intl_shipping_jpy: allocatedIntl,
      allocated_customs_jpy: allocatedCustoms,
      total_cost_jpy: totalCost,
      unit_total_cost_jpy: unitTotalCost,
    };
  });

  return { allocatedItems, total_items: totalQty };
}

/**
 * 既存在庫を考慮した加重平均原価を計算する
 */
export function weightedAverageCost(
  existingStock: number,
  existingCostYen: number,
  newStock: number,
  newCostYen: number
): number {
  const totalStock = existingStock + newStock;
  if (totalStock <= 0) return newCostYen;
  return Math.round(
    (existingStock * existingCostYen + newStock * newCostYen) / totalStock
  );
}
