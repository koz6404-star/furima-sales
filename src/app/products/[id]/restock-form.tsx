'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { LocationType } from '@/lib/location-stock';

type SetComponent = { component_product_id: string; quantity_per_set: number };

export function RestockForm({
  productId,
  setComponents = [],
}: {
  productId: string;
  setComponents?: SetComponent[];
}) {
  const [stock, setStock] = useState('');
  const [location, setLocation] = useState<LocationType>('home');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const isSet = setComponents.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const num = parseInt(stock, 10);
    if (isNaN(num) || num < 1) {
      setError('在庫数は1以上で入力してください');
      return;
    }
    setLoading(true);

    if (isSet) {
      for (const c of setComponents) {
        const { data: comp } = await supabase
          .from('products')
          .select('stock')
          .eq('id', c.component_product_id)
          .single();
        const { data: locRows } = await supabase.from('product_location_stock').select('location, quantity').eq('product_id', c.component_product_id);
        const homeQ = locRows?.find((r) => r.location === 'home')?.quantity ?? 0;
        const whQ = locRows?.find((r) => r.location === 'warehouse')?.quantity ?? 0;
        const available = (locRows?.length ?? 0) > 0 ? homeQ + whQ : (comp?.stock ?? 0);
        const needed = num * c.quantity_per_set;
        if (!comp || available < needed) {
          setError(`構成商品の在庫不足です。${num}セット追加には各${c.quantity_per_set}個×${num}個が必要です。`);
          setLoading(false);
          return;
        }
      }
      const { deductLocationStock } = await import('@/lib/location-stock');
      for (const c of setComponents) {
        const { data: comp } = await supabase.from('products').select('stock').eq('id', c.component_product_id).single();
        const { data: locRows } = await supabase.from('product_location_stock').select('location, quantity').eq('product_id', c.component_product_id);
        const homeQ = locRows?.find((r) => r.location === 'home')?.quantity ?? 0;
        const whQ = locRows?.find((r) => r.location === 'warehouse')?.quantity ?? 0;
        if (!comp) continue;
        const deduct = num * c.quantity_per_set;
        const { newHome, newWarehouse, actualDeducted } = deductLocationStock(homeQ, whQ, deduct);
        if (actualDeducted < deduct) {
          setError(`構成商品の在庫が実際の保管場所と一致しません。しばらくしてから再度お試しください。`);
          setLoading(false);
          return;
        }
        const nnow = new Date().toISOString();
        const upsertLoc = async (loc: 'home' | 'warehouse', qty: number) => {
          const { data: ex } = await supabase.from('product_location_stock').select('quantity').eq('product_id', c.component_product_id).eq('location', loc).single();
          if (ex) await supabase.from('product_location_stock').update({ quantity: qty, updated_at: nnow }).eq('product_id', c.component_product_id).eq('location', loc);
          else if (qty > 0) await supabase.from('product_location_stock').insert({ product_id: c.component_product_id, location: loc, quantity: qty });
        };
        await upsertLoc('home', newHome);
        await upsertLoc('warehouse', newWarehouse);
        const newStock = comp.stock - actualDeducted;
        await supabase
          .from('products')
          .update({ stock: Math.max(0, newStock), ...(newStock === 0 && { oldest_received_at: null }), updated_at: nnow })
          .eq('id', c.component_product_id);
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const locToUse = isSet ? 'home' : location;
    const { data: currentProduct } = await supabase
      .from('products')
      .select('stock')
      .eq('id', productId)
      .single();
    const currentStock = currentProduct?.stock ?? 0;
    const newStock = currentStock + num;
    const { data: existingLoc } = await supabase
      .from('product_location_stock')
      .select('quantity')
      .eq('product_id', productId)
      .eq('location', locToUse)
      .single();
    const newLocQty = num + (existingLoc?.quantity ?? 0);
    if (existingLoc) {
      await supabase.from('product_location_stock').update({ quantity: newLocQty, updated_at: now }).eq('product_id', productId).eq('location', locToUse);
    } else {
      await supabase.from('product_location_stock').insert({ product_id: productId, location: locToUse, quantity: num });
    }
    const { error: updateErr } = await supabase
      .from('products')
      .update({ stock: newStock, oldest_received_at: today, updated_at: now })
      .eq('id', productId);
    setLoading(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isSet && (
        <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded">
          セット品のため、追加数に応じて構成商品の在庫が自動で減ります。
        </p>
      )}
      <div className="flex flex-wrap gap-4 items-end">
        {!isSet && (
          <div>
            <label className="block text-sm font-medium mb-1">入荷先</label>
            <select value={location} onChange={(e) => setLocation(e.target.value as LocationType)} className="rounded border border-slate-300 px-3 py-2">
              <option value="home">家</option>
              <option value="warehouse">倉庫</option>
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">{isSet ? 'セット追加数' : '再入荷数'}</label>
          <input
            type="number"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            min={1}
            className="w-32 rounded border px-3 py-2"
            placeholder="例: 5"
          />
        </div>
        <button
        type="submit"
        disabled={loading}
        className="rounded bg-emerald-600 px-4 py-2 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        {loading ? '反映中...' : '再入荷'}
        </button>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </form>
  );
}
