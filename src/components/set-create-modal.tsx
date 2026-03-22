'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Product = {
  id: string;
  name: string;
  cost_yen: number;
  stock: number;
  campaign?: string | null;
  size?: string | null;
  color?: string | null;
};

function formatProductLabel(p: Product): string {
  const parts = [p.name, p.campaign, p.size, p.color].filter(Boolean) as string[];
  return parts.join('、');
}

export function SetCreateModal({
  selectedProducts,
  onClose,
  onSuccess,
}: {
  selectedProducts: Product[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isSingleProduct = selectedProducts.length === 1;

  // 各商品のセット内数量（商品ID → 入力文字列）
  const [qtyInputMap, setQtyInputMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const p of selectedProducts) {
      map[p.id] = isSingleProduct ? '2' : '1';
    }
    return map;
  });

  // 数値に変換（空文字や不正値は1として扱う）
  const qtyMap: Record<string, number> = {};
  for (const p of selectedProducts) {
    const v = parseInt(qtyInputMap[p.id] ?? '1', 10);
    qtyMap[p.id] = isNaN(v) || v < 1 ? 1 : Math.min(v, 99);
  }

  const buildName = (map: Record<string, number>) => {
    return selectedProducts
      .map((p) => {
        const qty = map[p.id] ?? 1;
        return qty > 1 ? `${formatProductLabel(p)} ×${qty}` : formatProductLabel(p);
      })
      .join(' + ') + ' セット';
  };

  const [name, setName] = useState(buildName(qtyMap));
  const [initialStock, setInitialStock] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const updateQty = (productId: string, rawValue: string) => {
    const newInputMap = { ...qtyInputMap, [productId]: rawValue };
    setQtyInputMap(newInputMap);
    // セット名は数値化した値で更新
    const newQtyMap: Record<string, number> = {};
    for (const p of selectedProducts) {
      const v = parseInt(newInputMap[p.id] ?? '1', 10);
      newQtyMap[p.id] = isNaN(v) || v < 1 ? 1 : Math.min(v, 99);
    }
    setName(buildName(newQtyMap));
  };

  const totalCost = selectedProducts.reduce((s, p) => s + p.cost_yen * (qtyMap[p.id] ?? 1), 0);

  // 各商品で作れるセット数 = 在庫 ÷ そのセット内数量
  const maxSetsPerProduct = selectedProducts.map((p) => Math.floor(p.stock / (qtyMap[p.id] ?? 1)));
  const minStock = Math.min(...maxSetsPerProduct);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (initialStock < 1) {
      setError('在庫数は1以上で入力してください');
      return;
    }
    if (minStock < 1) {
      setError('構成商品の在庫が不足しています。');
      return;
    }
    if (initialStock > minStock) {
      setError(`各商品の在庫不足です。最大${minStock}セット作成できます。`);
      return;
    }
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('ログインしてください');
      setLoading(false);
      return;
    }

    // 構成商品の実際の利用可能在庫を取得
    const availablePerProduct: Record<string, number> = {};
    for (const p of selectedProducts) {
      const { data: locRows } = await supabase.from('product_location_stock').select('location, quantity').eq('product_id', p.id);
      const homeQ = locRows?.find((r: { location: string }) => r.location === 'home')?.quantity ?? 0;
      const whQ = locRows?.find((r: { location: string }) => r.location === 'warehouse')?.quantity ?? 0;
      const locTotal = (locRows?.length ?? 0) > 0 ? homeQ + whQ : p.stock;
      availablePerProduct[p.id] = locTotal;
    }
    const actualMinStock = Math.min(
      ...selectedProducts.map((p) => Math.floor((availablePerProduct[p.id] ?? 0) / (qtyMap[p.id] ?? 1)))
    );
    if (initialStock > actualMinStock) {
      setError(`在庫が不足しています。最大${actualMinStock}セットまで作成できます。`);
      setLoading(false);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: newProduct, error: insertErr } = await supabase
      .from('products')
      .insert({
        user_id: user.id,
        name: name.trim(),
        cost_yen: totalCost,
        stock: initialStock,
        oldest_received_at: today,
      })
      .select('id')
      .single();

    if (insertErr || !newProduct) {
      setError(insertErr?.message || 'セットの作成に失敗しました');
      setLoading(false);
      return;
    }
    await supabase.from('product_location_stock').insert({ product_id: newProduct.id, location: 'home', quantity: initialStock });

    const setItems = selectedProducts.map((p) => ({
      set_product_id: newProduct.id,
      component_product_id: p.id,
      quantity_per_set: qtyMap[p.id] ?? 1,
    }));
    const { error: itemsErr } = await supabase.from('product_set_items').insert(setItems);
    if (itemsErr) {
      await supabase.from('products').delete().eq('id', newProduct.id);
      setError('構成登録に失敗しました: ' + itemsErr.message);
      setLoading(false);
      return;
    }

    const { deductLocationStock } = await import('@/lib/location-stock');
    for (const p of selectedProducts) {
      const qtyPerSet = qtyMap[p.id] ?? 1;
      const deduct = initialStock * qtyPerSet;
      const { data: locRows } = await supabase.from('product_location_stock').select('location, quantity').eq('product_id', p.id);
      const homeQ = locRows?.find((r: { location: string }) => r.location === 'home')?.quantity ?? 0;
      const whQ = locRows?.find((r: { location: string }) => r.location === 'warehouse')?.quantity ?? 0;
      const { newHome, newWarehouse, actualDeducted } = deductLocationStock(homeQ, whQ, deduct);
      if (actualDeducted < deduct) {
        await supabase.from('products').delete().eq('id', newProduct.id);
        setError('在庫の整合性エラーです。しばらくしてから再度お試しください。');
        setLoading(false);
        return;
      }
      const now = new Date().toISOString();
      const upsertLoc = async (loc: string, qty: number) => {
        const { data: ex } = await supabase.from('product_location_stock').select('quantity').eq('product_id', p.id).eq('location', loc).single();
        if (ex) await supabase.from('product_location_stock').update({ quantity: qty, updated_at: now }).eq('product_id', p.id).eq('location', loc);
        else if (qty > 0) await supabase.from('product_location_stock').insert({ product_id: p.id, location: loc, quantity: qty });
      };
      await upsertLoc('home', newHome);
      await upsertLoc('warehouse', newWarehouse);
      const newStock = p.stock - actualDeducted;
      const { error: updateErr } = await supabase
        .from('products')
        .update({ stock: newStock, ...(newStock === 0 && { oldest_received_at: null }), updated_at: now })
        .eq('id', p.id)
        .eq('user_id', user.id);
      if (updateErr) {
        setError('在庫の減算に失敗しました');
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">セット出品</h2>
        <p className="text-sm text-slate-600 mb-4">
          選択した{selectedProducts.length}商品でセットを作成します。各商品のセット内個数を指定できます。
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 各商品のセット内数量 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">構成商品と個数</label>
            <div className="space-y-2">
              {selectedProducts.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded border border-slate-200 p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" title={formatProductLabel(p)}>{formatProductLabel(p)}</p>
                    <p className="text-xs text-slate-400">在庫 {p.stock}個 / 原価 ¥{p.cost_yen.toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-slate-500">×</span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={qtyInputMap[p.id] ?? '1'}
                      onChange={(e) => updateQty(p.id, e.target.value)}
                      className="w-14 rounded border border-slate-300 px-2 py-1 text-sm text-center"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">セット名 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">初期在庫数 *</label>
            <input
              type="number"
              value={initialStock}
              onChange={(e) => setInitialStock(parseInt(e.target.value, 10) || 0)}
              min={1}
              max={Math.max(1, minStock)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
            <p className="text-xs text-slate-500 mt-1">
              最大{minStock}セット（構成商品の在庫÷セット内個数の最小値）
            </p>
          </div>
          <div className="rounded bg-slate-50 p-3 text-sm">
            <p className="text-slate-600">
              構成: {selectedProducts.map((p) => {
                const qty = qtyMap[p.id] ?? 1;
                return qty > 1 ? `${formatProductLabel(p)} ×${qty}` : formatProductLabel(p);
              }).join(' + ')}
            </p>
            <p className="font-medium mt-1">セット原価: ¥{totalCost.toLocaleString()}</p>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || minStock < 1}
              className="rounded bg-emerald-600 px-4 py-2 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? '作成中...' : 'セット作成'}
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
