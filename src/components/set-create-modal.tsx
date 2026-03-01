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
  const [name, setName] = useState(
    selectedProducts.map(formatProductLabel).join(' + ') + ' セット'
  );
  const [initialStock, setInitialStock] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const totalCost = selectedProducts.reduce((s, p) => s + p.cost_yen, 0);
  const minStock = Math.min(...selectedProducts.map((p) => p.stock));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (initialStock < 1) {
      setError('在庫数は1以上で入力してください');
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
      quantity_per_set: 1,
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
      const deduct = initialStock;
      const { data: locRows } = await supabase.from('product_location_stock').select('location, quantity').eq('product_id', p.id);
      const homeQ = locRows?.find((r: { location: string }) => r.location === 'home')?.quantity ?? 0;
      const whQ = locRows?.find((r: { location: string }) => r.location === 'warehouse')?.quantity ?? 0;
      const { newHome, newWarehouse } = deductLocationStock(homeQ, whQ, deduct);
      const now = new Date().toISOString();
      const upsertLoc = async (loc: string, qty: number) => {
        const { data: ex } = await supabase.from('product_location_stock').select('quantity').eq('product_id', p.id).eq('location', loc).single();
        if (ex) await supabase.from('product_location_stock').update({ quantity: qty, updated_at: now }).eq('product_id', p.id).eq('location', loc);
        else if (qty > 0) await supabase.from('product_location_stock').insert({ product_id: p.id, location: loc, quantity: qty });
      };
      await upsertLoc('home', newHome);
      await upsertLoc('warehouse', newWarehouse);
      const newStock = p.stock - initialStock;
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
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold mb-4">セット出品</h2>
        <p className="text-sm text-slate-600 mb-4">
          選択した{selectedProducts.length}商品を1セットとして商品一覧に追加します。セット在庫が1増えるごとに、各構成商品の在庫が1ずつ減ります。
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
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
              max={minStock}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
            <p className="text-xs text-slate-500 mt-1">
              最大{minStock}セット（構成商品の最小在庫に合わせます）
            </p>
          </div>
          <div className="rounded bg-slate-50 p-3 text-sm">
            <p className="text-slate-600">構成: {selectedProducts.map(formatProductLabel).join(' + ')}</p>
            <p className="font-medium mt-1">セット原価: ¥{totalCost.toLocaleString()}</p>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
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
