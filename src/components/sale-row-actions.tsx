'use client';

import { useState } from 'react';
import { SaleDeleteButton } from './sale-delete-button';
import { SaleEditModal } from './sale-edit-modal';

type Sale = {
  id: string;
  quantity: number;
  unit_price_yen: number;
  platform: 'mercari' | 'rakuma';
  fee_rate_percent: number;
  fee_yen: number;
  shipping_id: string | null;
  shipping_yen: number;
  material_yen: number | null;
  gross_profit_yen: number;
  sold_at: string;
};

type FeeRate = { id: string; platform: string; rate_percent: number; rakuma_rank: number | null };
type ShippingRate = { id: string; platform: string; display_name: string; base_fee_yen: number; is_custom?: boolean };
type Setting = { platform: string; rounding: string; rakuma_manual_rank: number | null };

export function SaleRowActions({
  sale,
  productId,
  productCostYen,
  currentStock,
  stockAtHome,
  stockAtWarehouse,
  feeRates,
  shippingRates,
  settings,
}: {
  sale: Sale;
  productId: string;
  productCostYen: number;
  currentStock: number;
  stockAtHome: number;
  stockAtWarehouse: number;
  feeRates: FeeRate[];
  shippingRates: ShippingRate[];
  settings: Setting[];
}) {
  const [editingSale, setEditingSale] = useState<Sale | null>(null);

  return (
    <>
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => setEditingSale(sale)}
          className="text-emerald-600 hover:text-emerald-700 text-xs min-h-[24px] min-w-[24px]"
          title="販売記録を編集"
        >
          編集
        </button>
        <SaleDeleteButton
          saleId={sale.id}
          productId={productId}
          quantity={sale.quantity}
          stockAtHome={stockAtHome}
          stockAtWarehouse={stockAtWarehouse}
        />
      </span>
      {editingSale && (
        <SaleEditModal
          sale={editingSale}
          productId={productId}
          costYen={productCostYen}
          currentStock={currentStock}
          stockAtHome={stockAtHome}
          stockAtWarehouse={stockAtWarehouse}
          feeRates={feeRates}
          shippingRates={shippingRates}
          settings={settings}
          onClose={() => setEditingSale(null)}
          onSuccess={() => setEditingSale(null)}
        />
      )}
    </>
  );
}
