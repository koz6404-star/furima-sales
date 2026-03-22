'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { LocationType } from '@/lib/location-stock';

export function StockAdjustForm({
  productId,
  stockAtHome,
  stockAtWarehouse,
  stockAtFba,
  totalStock,
}: {
  productId: string;
  stockAtHome: number;
  stockAtWarehouse: number;
  stockAtFba: number;
  totalStock: number;
}) {
  const [location, setLocation] = useState<LocationType>('home');
  const [newQty, setNewQty] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const currentByLocation: Record<LocationType, number> = {
    home: stockAtHome,
    warehouse: stockAtWarehouse,
    fba: stockAtFba,
  };
  const currentQty = currentByLocation[location];
  const parsed = newQty !== '' ? parseInt(newQty, 10) : null;
  const diff = parsed != null && !isNaN(parsed) ? parsed - currentQty : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (parsed == null || isNaN(parsed) || parsed < 0) {
      setError('0以上の数を入力してください');
      return;
    }
    if (diff === 0) {
      setError('変更がありません');
      return;
    }

    setLoading(true);
    const now = new Date().toISOString();

    // 場所別在庫を更新
    const { data: existingLoc } = await supabase
      .from('product_location_stock')
      .select('quantity')
      .eq('product_id', productId)
      .eq('location', location)
      .single();

    if (existingLoc) {
      await supabase
        .from('product_location_stock')
        .update({ quantity: parsed, updated_at: now })
        .eq('product_id', productId)
        .eq('location', location);
    } else if (parsed > 0) {
      await supabase
        .from('product_location_stock')
        .insert({ product_id: productId, location, quantity: parsed });
    }

    // products.stock を再計算（全場所の合計）
    const newTotal = totalStock + (diff ?? 0);
    const updateData: Record<string, unknown> = {
      stock: Math.max(0, newTotal),
      updated_at: now,
    };
    // 在庫が0になったら oldest_received_at をクリア
    if (newTotal <= 0) {
      updateData.oldest_received_at = null;
    }

    const { error: updateErr } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', productId);

    setLoading(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }

    setNewQty('');
    setReason('');
    setOpen(false);
    router.refresh();
  };

  const locationLabel: Record<LocationType, string> = {
    home: '家',
    warehouse: '倉庫',
    fba: 'FBA',
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-slate-500 hover:text-slate-700 underline"
      >
        在庫を調整する
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">在庫調整</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm">
          閉じる
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">場所</label>
          <select
            value={location}
            onChange={(e) => { setLocation(e.target.value as LocationType); setNewQty(''); }}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="home">家（現在 {stockAtHome}個）</option>
            <option value="warehouse">倉庫（現在 {stockAtWarehouse}個）</option>
            <option value="fba">FBA（現在 {stockAtFba}個）</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">実際の数量</label>
          <input
            type="number"
            min={0}
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            placeholder={String(currentQty)}
            className="w-24 rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          {diff != null && diff !== 0 && (
            <span className={`text-sm font-medium ${diff > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {diff > 0 ? `+${diff}` : diff}
            </span>
          )}
          <button
            type="submit"
            disabled={loading || diff === null || diff === 0}
            className="rounded bg-slate-700 px-4 py-2 text-sm text-white font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? '反映中...' : '確定'}
          </button>
        </div>
      </div>

      {diff != null && diff !== 0 && (
        <p className="text-xs text-slate-500">
          {locationLabel[location]}の在庫を {currentQty}個 → {parsed}個 に変更します（合計: {totalStock} → {totalStock + diff}個）
        </p>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}
    </form>
  );
}
