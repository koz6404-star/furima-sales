'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { calcFee, calcGrossProfit } from '@/lib/calculations';
import type { RoundingType } from '@/types';

type FeeRate = { id: string; platform: string; rate_percent: number; rakuma_rank: number | null };
type ShippingRate = { id: string; platform: string; display_name: string; base_fee_yen: number; is_custom?: boolean };
type Setting = { platform: string; fee_rate_id: string | null; rounding: string; rakuma_manual_rank: number | null };

export function SaleForm({
  productId,
  currentStock,
  costYen,
  feeRates,
  shippingRates,
  settings,
}: {
  productId: string;
  currentStock: number;
  costYen: number;
  feeRates: FeeRate[];
  shippingRates: ShippingRate[];
  settings: Setting[];
}) {
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState('');
  const [platform, setPlatform] = useState<'mercari' | 'rakuma'>('mercari');
  const [shippingId, setShippingId] = useState('');
  const [shippingYen, setShippingYen] = useState(0);
  const [customShippingYen, setCustomShippingYen] = useState('');
  const [materialYen, setMaterialYen] = useState(0);
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
  const totalRevenue = unitPriceNum * quantity;
  const feeYen = unitPriceNum > 0 ? calcFee(unitPriceNum, ratePercent, rounding) * quantity : 0;
  const grossProfit = unitPriceNum > 0
    ? calcGrossProfit(unitPriceNum, quantity, feeYen / quantity, effectiveShippingYen, materialYen, costYen)
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (quantity < 1 || quantity > currentStock) {
      setError(`在庫は${currentStock}個です`);
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
    const gross = calcGrossProfit(unitPriceNum, quantity, feePerUnit, effectiveShippingYen, materialYen, costYen);
    const { error: saleError } = await supabase.from('sales').insert({
      user_id: user.id,
      product_id: productId,
      quantity,
      unit_price_yen: unitPriceNum,
      platform,
      fee_rate_percent: ratePercent,
      fee_yen: feePerUnit * quantity,
      shipping_id: shippingId || null,
      shipping_yen: effectiveShippingYen,
      material_yen: materialYen,
      gross_profit_yen: gross,
      sold_at: soldAt,
    });
    if (saleError) {
      setError(saleError.message);
      setLoading(false);
      return;
    }
    const { error: updateError } = await supabase
      .from('products')
      .update({ stock: currentStock - quantity, updated_at: new Date().toISOString() })
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
            onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
            min={1}
            max={currentStock}
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
          onChange={(e) => setMaterialYen(parseInt(e.target.value, 10) || 0)}
          min={0}
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
      <div className="rounded bg-slate-50 p-4">
        <p className="text-sm">
          粗利: <strong>¥{grossProfit.toLocaleString()}</strong>
        </p>
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
