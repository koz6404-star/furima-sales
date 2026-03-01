'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { calcFee, calcGrossProfit, calcProfitRatePercent } from '@/lib/calculations';
import type { RoundingType } from '@/types';

type FeeRate = { id: string; platform: string; rate_percent: number; rakuma_rank: number | null };
type ShippingRate = { id: string; platform: string; display_name: string; base_fee_yen: number; is_custom?: boolean };
type Setting = { platform: string; fee_rate_id: string | null; rounding: string; rakuma_manual_rank: number | null };

export function SaleForm({
  productId,
  currentStock,
  stockAtHome = 0,
  stockAtWarehouse = 0,
  costYen,
  feeRates,
  shippingRates,
  settings,
}: {
  productId: string;
  currentStock: number;
  stockAtHome?: number;
  stockAtWarehouse?: number;
  costYen: number;
  feeRates: FeeRate[];
  shippingRates: ShippingRate[];
  settings: Setting[];
}) {
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [platform, setPlatform] = useState<'mercari' | 'rakuma'>('mercari');
  const [shippingId, setShippingId] = useState('');
  const [shippingYen, setShippingYen] = useState(0);
  const [customShippingYen, setCustomShippingYen] = useState('');
  const [materialYen, setMaterialYen] = useState('');
  const [soldAt, setSoldAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const setting = settings.find((s) => s.platform === platform);
  const rounding = (setting?.rounding as RoundingType) || 'floor';
  const mercariFeeRate = feeRates.find((f) => f.platform === 'mercari' && f.rate_percent === 10);
  const rakumaRank = setting?.rakuma_manual_rank ?? 1;
  const rakumaFeeRate = feeRates.find((f) => f.platform === 'rakuma' && f.rakuma_rank === rakumaRank) || feeRates.find((f) => f.platform === 'rakuma');
  const activeFeeRate = platform === 'mercari' ? mercariFeeRate : rakumaFeeRate;
  const ratePercent = activeFeeRate?.rate_percent ?? 10;

  const platformShipping = shippingRates.filter((s) => s.platform === platform && !s.is_custom);
  const customShipping = shippingRates.find((s) => s.platform === platform && s.is_custom);
  const selectedShipping = shippingRates.find((s) => s.id === shippingId);
  const effectiveShippingYen = selectedShipping?.is_custom
    ? parseInt(customShippingYen, 10) || 0
    : selectedShipping?.base_fee_yen ?? shippingYen;

  const unitPriceNum = parseInt(unitPrice, 10) || 0;
  const quantityNum = parseInt(quantity, 10) || 0;
  const materialYenNum = parseInt(materialYen, 10) || 0;
  const totalRevenue = unitPriceNum * quantityNum;
  const feeYen = unitPriceNum > 0 ? calcFee(unitPriceNum, ratePercent, rounding) * quantityNum : 0;
  const grossProfit = unitPriceNum > 0 && quantityNum > 0
    ? calcGrossProfit(unitPriceNum, quantityNum, feeYen / quantityNum, effectiveShippingYen, materialYenNum, costYen)
    : 0;
  const profitRatePercent = unitPriceNum > 0 && costYen > 0 && quantityNum > 0
    ? calcProfitRatePercent(grossProfit, costYen * quantityNum)
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const qty = parseInt(quantity, 10);
    if (!Number.isInteger(qty) || qty < 1 || qty > currentStock) {
      setError(`販売個数は1〜${currentStock}の整数で入力してください`);
      return;
    }
    if (unitPriceNum <= 0) {
      setError('販売価格を入力してください');
      return;
    }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('ログインしてください');
      setLoading(false);
      return;
    }
    const feePerUnit = calcFee(unitPriceNum, ratePercent, rounding);
    const gross = calcGrossProfit(unitPriceNum, qty, feePerUnit, effectiveShippingYen, materialYenNum, costYen);
    const { error: saleError } = await supabase.from('sales').insert({
      user_id: user.id,
      product_id: productId,
      quantity: qty,
      unit_price_yen: unitPriceNum,
      platform,
      fee_rate_percent: ratePercent,
      fee_yen: feePerUnit * qty,
      shipping_id: shippingId || null,
      shipping_yen: effectiveShippingYen,
      material_yen: materialYenNum,
      gross_profit_yen: gross,
      sold_at: soldAt,
    });
    if (saleError) {
      setError(saleError.message);
      setLoading(false);
      return;
    }
    const newStock = currentStock - qty;
    const { deductLocationStock } = await import('@/lib/location-stock');
    const { newHome, newWarehouse } = deductLocationStock(stockAtHome, stockAtWarehouse, qty);
    const now = new Date().toISOString();

    const upsertLoc = async (loc: 'home' | 'warehouse', qty: number) => {
      const { data: ex } = await supabase
        .from('product_location_stock')
        .select('quantity')
        .eq('product_id', productId)
        .eq('location', loc)
        .single();
      if (ex) {
        await supabase.from('product_location_stock').update({ quantity: qty, updated_at: now }).eq('product_id', productId).eq('location', loc);
      } else if (qty > 0) {
        await supabase.from('product_location_stock').insert({ product_id: productId, location: loc, quantity: qty });
      }
    };
    await upsertLoc('home', newHome);
    await upsertLoc('warehouse', newWarehouse);

    const { error: updateError } = await supabase
      .from('products')
      .update({
        stock: newStock,
        ...(newStock === 0 && { oldest_received_at: null }),
        updated_at: now,
      })
      .eq('id', productId);
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }
    setLoading(false);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">販売個数（在庫: {currentStock}）</label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            min={1}
            max={currentStock}
            placeholder="1"
            className="w-full rounded border px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">販売価格（税込）</label>
          <input
            type="number"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            min={0}
            className="w-full rounded border px-3 py-2"
            required
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">プラットフォーム</label>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as 'mercari' | 'rakuma')}
          className="w-full rounded border px-3 py-2"
        >
          <option value="mercari">メルカリ</option>
          <option value="rakuma">ラクマ</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">手数料（{ratePercent}%）</label>
        <p className="text-slate-600">¥{feeYen.toLocaleString()}</p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">送料</label>
        <select
          value={shippingId}
          onChange={(e) => {
            const s = shippingRates.find((r) => r.id === e.target.value);
            setShippingId(e.target.value);
            setShippingYen(s?.base_fee_yen ?? 0);
          }}
          className="w-full rounded border px-3 py-2"
        >
          <option value="">選択</option>
          {platformShipping.map((s) => (
            <option key={s.id} value={s.id}>{s.display_name} ¥{s.base_fee_yen}</option>
          ))}
          {customShipping && (
            <option value={customShipping.id}>その他（自由入力）</option>
          )}
        </select>
        {selectedShipping?.is_custom && (
          <input
            type="number"
            value={customShippingYen}
            onChange={(e) => setCustomShippingYen(e.target.value)}
            placeholder="送料（円）"
            className="mt-2 w-full rounded border px-3 py-2"
          />
        )}
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">資材代（任意）</label>
        <input
          type="number"
          value={materialYen}
          onChange={(e) => setMaterialYen(e.target.value)}
          min={0}
          placeholder="0"
          className="w-full rounded border px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">販売日</label>
        <input
          type="date"
          value={soldAt}
          onChange={(e) => setSoldAt(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />
      </div>
      <div className="rounded bg-slate-50 p-4 space-y-1">
        <p className="text-sm">
          粗利: <strong>¥{grossProfit.toLocaleString()}</strong>
        </p>
        {profitRatePercent !== null && (
          <p className="text-sm font-medium text-emerald-700">
            利益率: <strong>{profitRatePercent}%</strong>
          </p>
        )}
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-emerald-600 px-4 py-2 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        {loading ? '登録中...' : '販売登録'}
      </button>
    </form>
  );
}
