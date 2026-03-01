/** 保管場所 */
export type LocationType = 'home' | 'warehouse';

export const LOCATION_LABELS: Record<LocationType, string> = {
  home: '家',
  warehouse: '倉庫',
};

/** 在庫復元（販売削除時）: 家に優先して戻す */
export function addLocationStock(
  homeQty: number,
  warehouseQty: number,
  add: number
): { newHome: number; newWarehouse: number } {
  return {
    newHome: homeQty + add,
    newWarehouse: warehouseQty,
  };
}

/** 在庫 deduction: 家から優先して減らす */
export function deductLocationStock(
  homeQty: number,
  warehouseQty: number,
  deduct: number
): { newHome: number; newWarehouse: number } {
  let fromHome = Math.min(homeQty, deduct);
  let fromWarehouse = deduct - fromHome;
  if (fromWarehouse > warehouseQty) {
    fromWarehouse = warehouseQty;
    fromHome = deduct - fromWarehouse;
  }
  return {
    newHome: Math.max(0, homeQty - fromHome),
    newWarehouse: Math.max(0, warehouseQty - fromWarehouse),
  };
}
