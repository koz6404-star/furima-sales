'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type LocationType = 'home' | 'warehouse';

export function LocationTransferForm({
  productId,
  stockAtHome,
  stockAtWarehouse,
}: {
  productId: string;
  stockAtHome: number;
  stockAtWarehouse: number;
}) {
  const [fromLocation, setFromLocation] = useState<LocationType>('home');
  const [toLocation, setToLocation] = useState<LocationType>('warehouse');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const fromStock = fromLocation === 'home' ? stockAtHome : stockAtWarehouse;
  const canTransfer = fromStock > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const num = parseInt(quantity, 10);
    if (isNaN(num) || num < 1) {
      setError('移動数は1以上で入力してください');
      return;
    }
    if (num > fromStock) {
      setError(`${fromLocation === 'home' ? '家' : '倉庫'}の在庫は${fromStock}個です`);
      return;
    }
    if (fromLocation === toLocation) {
      setError('移動元と移動先を別々に選んでください');
      return;
    }
    setLoading(true);

    const { error: updFrom } = await supabase
      .from('product_location_stock')
      .update({ quantity: fromStock - num, updated_at: new Date().toISOString() })
      .eq('product_id', productId)
      .eq('location', fromLocation);

    if (updFrom) {
      setError(updFrom.message);
      setLoading(false);
      return;
    }

    const toStock = toLocation === 'home' ? stockAtHome : stockAtWarehouse;
    const { data: existing } = await supabase
      .from('product_location_stock')
      .select('quantity')
      .eq('product_id', productId)
      .eq('location', toLocation)
      .single();

    if (existing) {
      await supabase
        .from('product_location_stock')
        .update({ quantity: toStock + num, updated_at: new Date().toISOString() })
        .eq('product_id', productId)
        .eq('location', toLocation);
    } else {
      await supabase.from('product_location_stock').insert({
        product_id: productId,
        location: toLocation,
        quantity: num,
      });
    }

    setLoading(false);
    setQuantity('');
    router.refresh();
  };

  if (!canTransfer) return null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-4 items-end">
      <div>
        <label className="block text-sm font-medium mb-1">移動元</label>
        <select
          value={fromLocation}
          onChange={(e) => setFromLocation(e.target.value as LocationType)}
          className="rounded border border-slate-300 px-3 py-2"
        >
          <option value="home">家 {stockAtHome > 0 && `(${stockAtHome})`}</option>
          <option value="warehouse">倉庫 {stockAtWarehouse > 0 && `(${stockAtWarehouse})`}</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">移動先</label>
        <select
          value={toLocation}
          onChange={(e) => setToLocation(e.target.value as LocationType)}
          className="rounded border border-slate-300 px-3 py-2"
        >
          <option value="home">家</option>
          <option value="warehouse">倉庫</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">数量</label>
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          min={1}
          max={fromStock}
          className="w-24 rounded border border-slate-300 px-3 py-2"
          placeholder="例: 5"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-emerald-600 px-4 py-2 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        {loading ? '移動中...' : '移動'}
      </button>
      {error && <p className="text-red-600 text-sm w-full">{error}</p>}
    </form>
  );
}
