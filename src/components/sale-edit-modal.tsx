'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { calcFee, calcGrossProfit } from '@/lib/calculations';
import type { RoundingType } from '@/types';

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

export function SaleEditModal({
  sale,
  productId,
  costYen,
  currentStock,
  stockAtHome,
  stockAtWarehouse,
  feeRates,
  shippingRates,
  settings,
  onClose,
  onSuccess,
}: {
  sale: Sale;
  productId: string;
  costYen: number;
  currentStock: number;
  stockAtHome: number;
  stockAtWarehouse: number;
  feeRates: FeeRate[];
  shippingRates: ShippingRate[];
  settings: Setting[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const customShipping = shippingRates.find((s) => s.platform === sale.platform && s.is_custom);
  const platformShipping = shippingRates.filter((s) => s.platform === sale.platform && !s.is_custom);
  const isCustomShipping = sale.shipping_id && shippingRates.find((s) => s.id === sale.shipping_id)?.is_custom;

  const [quantity, setQuantity] = useState(String(sale.quantity));
  const [unitPrice, setUnitPrice] = useState(String(sale.unit_price_yen));
  const [platform, setPlatform] = useState<'mercari' | 'rakuma'>(sale.platform);
  const [shippingId, setShippingId] = useState(sale.shipping_id ?? (customShipping?.id ?? ''));
  const [customShippingYen, setCustomShippingYen] = useState(
    isCustomShipping || !sale.shipping_id ? String(sale.shipping_yen) : ''
  );
  const [materialYen, setMaterialYen] = useState(String(sale.material_yen ?? ''));
  const [soldAt, setSoldAt] = useState(sale.sold_at);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  const router = useRouter();
  const supabase = createClient();

  const setting = settings.find((s) => s.platform === platform);
  const rounding = (setting?.rounding as RoundingType) || 'floor';
  const mercariFeeRate = feeRates.find((f) => f.platform === 'mercari' && f.rate_percent === 10);
  const rakumaRank = setting?.rakuma_manual_rank ?? 1;
  const rakumaFeeRate = feeRates.find((f) => f.platform === 'rakuma' && f.rakuma_rank === rakumaRank) || feeRates.find((f) => f.platform === 'rakuma');
  const activeFeeRate = platform === 'mercari' ? mercariFeeRate : rakumaFeeRate;
  const ratePercent = activeFeeRate?.rate_percent ?? 10;

  const platformShippingCur = shippingRates.filter((s) => s.platform === platform && !s.is_custom);
  const customShippingCur = shippingRates.find((s) => s.platform === platform && s.is_custom);
  const selectedShipping = shippingRates.find((s) => s.id === shippingId);
  const effectiveShippingYen = selectedShipping?.is_custom
    ? parseInt(customShippingYen, 10) || 0
    : selectedShipping?.base_fee_yen ?? 0;

  const quantityNum = parseInt(quantity, 10) || 0;
  const unitPriceNum = parseInt(unitPrice, 10) || 0;
  const materialYenNum = parseInt(materialYen, 10) || 0;
  const feePerUnit = unitPriceNum > 0 ? calcFee(unitPriceNum, ratePercent, rounding) : 0;
  const feeYen = feePerUnit * quantityNum;
  const grossProfit = unitPriceNum > 0 && quantityNum > 0
    ? calcGrossProfit(unitPriceNum, quantityNum, feePerUnit, effectiveShippingYen, materialYenNum, costYen)
    : 0;

  const maxQuantity = sale.quantity + currentStock;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError('');
    try {
      const qty = parseInt(quantity, 10);
      if (!Number.isInteger(qty) || qty < 1) {
        setError('販売個数は1以上の整数で入力してください');
        return;
      }
      if (qty > maxQuantity) {
        setError(`販売個数は最大${maxQuantity}までです（現在の在庫${currentStock} + 今回の販売分${sale.quantity}）`);
        return;
      }
      if (unitPriceNum <= 0) {
        setError('販売価格を入力してください');
        return;
      }
      setLoading(true);

      const qtyDiff = qty - sale.quantity;
      const now = new Date().toISOString();

      if (qtyDiff !== 0) {
        const { deductLocationStock, addLocationStock } = await import('@/lib/location-stock');
        if (qtyDiff > 0) {
          const { newHome, newWarehouse } = deductLocationStock(stockAtHome, stockAtWarehouse, qtyDiff);
          const upsertLoc = async (loc: 'home' | 'warehouse', locQty: number) => {
            const { data: ex } = await supabase
              .from('product_location_stock')
              .select('quantity')
              .eq('product_id', productId)
              .eq('location', loc)
              .single();
            if (ex) {
              await supabase
                .from('product_location_stock')
                .update({ quantity: locQty, updated_at: now })
                .eq('product_id', productId)
                .eq('location', loc);
            } else if (locQty > 0) {
              await supabase.from('product_location_stock').insert({ product_id: productId, location: loc, quantity: locQty });
            }
          };
          await upsertLoc('home', newHome);
          await upsertLoc('warehouse', newWarehouse);
        } else {
          const { newHome, newWarehouse } = addLocationStock(stockAtHome, stockAtWarehouse, -qtyDiff);
          const upsertLoc = async (loc: 'home' | 'warehouse', locQty: number) => {
            const { data: ex } = await supabase
              .from('product_location_stock')
              .select('quantity')
              .eq('product_id', productId)
              .eq('location', loc)
              .single();
            if (ex) {
              await supabase
                .from('product_location_stock')
                .update({ quantity: locQty, updated_at: now })
                .eq('product_id', productId)
                .eq('location', loc);
            } else if (locQty > 0) {
              await supabase.from('product_location_stock').insert({ product_id: productId, location: loc, quantity: locQty });
            }
          };
          await upsertLoc('home', newHome);
          await upsertLoc('warehouse', newWarehouse);
        }

        const { data: product } = await supabase.from('products').select('stock').eq('id', productId).single();
        const newStock = (product?.stock ?? 0) - qtyDiff;
        await supabase
          .from('products')
          .update({ stock: newStock, updated_at: now })
          .eq('id', productId);
      }

      const { error: updateErr } = await supabase
        .from('sales')
        .update({
          quantity: qty,
          unit_price_yen: unitPriceNum,
          platform,
          fee_rate_percent: ratePercent,
          fee_yen: feeYen,
          shipping_id: shippingId || null,
          shipping_yen: effectiveShippingYen,
          material_yen: materialYenNum,
          gross_profit_yen: grossProfit,
          sold_at: soldAt,
        })
        .eq('id', sale.id);

      if (updateErr) {
        setError(updateErr.message);
        return;
      }

      router.refresh();
      onSuccess();
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">販売記録を編集</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">販売日</label>
            <input
              type="date"
              value={soldAt}
              onChange={(e) => setSoldAt(e.target.value)}
              className="w-full rounded border px-3 py-2"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">販売個数（最大: {maxQuantity}）</label>
              <input
                type="text"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full rounded border px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">販売価格（税込）</label>
              <input
                type="text"
                inputMode="numeric"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full rounded border px-3 py-2"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">プラットフォーム</label>
            <select
              value={platform}
              onChange={(e) => {
                setPlatform(e.target.value as 'mercari' | 'rakuma');
                setShippingId('');
                setCustomShippingYen('');
              }}
              className="w-full rounded border px-3 py-2"
            >
              <option value="mercari">メルカリ</option>
              <option value="rakuma">ラクマ</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">送料</label>
            <select
              value={shippingId}
              onChange={(e) => {
                const s = shippingRates.find((r) => r.id === e.target.value);
                setShippingId(e.target.value);
                if (!s?.is_custom) setCustomShippingYen('');
              }}
              className="w-full rounded border px-3 py-2"
            >
              <option value="">選択</option>
              {platformShippingCur.map((s) => (
                <option key={s.id} value={s.id}>{s.display_name} ¥{s.base_fee_yen}</option>
              ))}
              {customShippingCur && (
                <option value={customShippingCur.id}>その他（自由入力）</option>
              )}
            </select>
            {selectedShipping?.is_custom && (
              <input
                type="text"
                inputMode="numeric"
                value={customShippingYen}
                onChange={(e) => setCustomShippingYen(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="送料（円）"
                className="mt-2 w-full rounded border px-3 py-2"
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">資材代（任意）</label>
            <input
              type="text"
              inputMode="numeric"
              value={materialYen}
              onChange={(e) => setMaterialYen(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0"
              className="w-full rounded border px-3 py-2"
            />
          </div>
          <div className="rounded bg-slate-50 p-3 text-sm">
            <p>手数料（{ratePercent}%）: ¥{feeYen.toLocaleString()}</p>
            <p className="font-medium mt-1">粗利: ¥{grossProfit.toLocaleString()}</p>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-emerald-600 px-4 py-2 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? '保存中...' : '保存'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
            >
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
