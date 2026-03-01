'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function SaleDeleteButton({
  saleId,
  productId,
  quantity,
  stockAtHome,
  stockAtWarehouse,
}: {
  saleId: string;
  productId: string;
  quantity: number;
  stockAtHome: number;
  stockAtWarehouse: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);
  const router = useRouter();
  const supabase = createClient();

  const handleDelete = async () => {
    if (!confirm(`この販売記録（${quantity}個）を削除しますか？在庫が復元されます。`)) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const { error: delErr } = await supabase.from('sales').delete().eq('id', saleId);
      if (delErr) {
        setError(delErr.message);
        return;
      }
      const { data: product } = await supabase
        .from('products')
        .select('stock')
        .eq('id', productId)
        .single();
      const currentStock = product?.stock ?? 0;
      const newStock = currentStock + quantity;

      const { addLocationStock } = await import('@/lib/location-stock');
      const { newHome, newWarehouse } = addLocationStock(stockAtHome, stockAtWarehouse, quantity);
      const now = new Date().toISOString();

      const upsertLoc = async (loc: 'home' | 'warehouse', qty: number) => {
        const { data: ex } = await supabase
          .from('product_location_stock')
          .select('quantity')
          .eq('product_id', productId)
          .eq('location', loc)
          .single();
        if (ex) {
          await supabase
            .from('product_location_stock')
            .update({ quantity: qty, updated_at: now })
            .eq('product_id', productId)
            .eq('location', loc);
        } else if (qty > 0) {
          await supabase
            .from('product_location_stock')
            .insert({ product_id: productId, location: loc, quantity: qty });
        }
      };
      await upsertLoc('home', newHome);
      await upsertLoc('warehouse', newWarehouse);

      await supabase
        .from('products')
        .update({ stock: newStock, updated_at: now })
        .eq('id', productId);

      router.refresh();
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={loading}
        className="text-red-600 hover:text-red-700 text-xs disabled:opacity-50 min-h-[24px] min-w-[24px]"
        title="販売記録を削除（在庫復元）"
      >
        {loading ? '...' : '削除'}
      </button>
      {error && <span className="text-red-600 text-xs">{error}</span>}
    </span>
  );
}
