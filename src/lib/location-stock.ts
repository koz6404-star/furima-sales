/** 保管場所 */
export type LocationType = 'home' | 'warehouse' | 'fba';

export const LOCATION_LABELS: Record<LocationType, string> = {
  home: '家',
  warehouse: '倉庫',
  fba: 'FBA',
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

/** 在庫 deduction: 家→倉庫→FBA の順で減らす */
export function deductLocationStock(
  homeQty: number,
  warehouseQty: number,
  deduct: number,
  fbaQty = 0
): { newHome: number; newWarehouse: number; newFba: number; actualDeducted: number } {
  const available = homeQty + warehouseQty + fbaQty;
  const actualDeduct = Math.min(deduct, available);
  let fromHome = Math.min(homeQty, actualDeduct);
  let fromWarehouse = Math.min(warehouseQty, actualDeduct - fromHome);
  let fromFba = actualDeduct - fromHome - fromWarehouse;
  const newHome = Math.max(0, homeQty - fromHome);
  const newWarehouse = Math.max(0, warehouseQty - fromWarehouse);
  const newFba = Math.max(0, fbaQty - fromFba);
  return {
    newHome,
    newWarehouse,
    newFba,
    actualDeducted: (homeQty - newHome) + (warehouseQty - newWarehouse) + (fbaQty - newFba),
  };
}
