'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type SetComponent = { component_product_id: string; quantity_per_set: number };

export function RestockForm({
  productId,
  setComponents = [],
}: {
  productId: string;
  setComponents?: SetComponent[];
}) {
  const [stock, setStock] = useState('');
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
        const needed = num * c.quantity_per_set;
        if (!comp || comp.stock < needed) {
          setError(`構成商品の在庫不足です。${num}セット追加には各${c.quantity_per_set}個×${num}個が必要です。`);
          setLoading(false);
          return;
        }
      }
      for (const c of setComponents) {
        const { data: comp } = await supabase
          .from('products')
          .select('stock')
          .eq('id', c.component_product_id)
          .single();
        if (!comp) continue;
        const deduct = num * c.quantity_per_set;
        await supabase
          .from('products')
          .update({
            stock: Math.max(0, comp.stock - deduct),
            updated_at: new Date().toISOString(),
          })
          .eq('id', c.component_product_id);
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const { error: updateErr } = await supabase
      .from('products')
      .update({
        stock: num,
        oldest_received_at: today,
        updated_at: new Date().toISOString(),
      })
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
      <div className="flex gap-4 items-end">
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
