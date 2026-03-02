'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LocationQuickTransfer({
  productId,
  stockAtHome,
  stockAtWarehouse,
}: {
  productId: string;
  stockAtHome: number;
  stockAtWarehouse: number;
}) {
  const [loading, setLoading] = useState<'home' | 'warehouse' | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const move = async (from: 'home' | 'warehouse') => {
    if (loading) return;
    const fromQ = from === 'home' ? stockAtHome : stockAtWarehouse;
    const toQ = from === 'home' ? stockAtWarehouse : stockAtHome;
    if (fromQ < 1) return;
    setLoading(from);
    const now = new Date().toISOString();
    const newFromQ = fromQ - 1;
    const newToQ = toQ + 1;
    if (newFromQ > 0) {
      await supabase
        .from('product_location_stock')
        .update({ quantity: newFromQ, updated_at: now })
        .eq('product_id', productId)
        .eq('location', from);
    } else {
      await supabase
        .from('product_location_stock')
        .delete()
        .eq('product_id', productId)
        .eq('location', from);
    }
    const { data: ex } = await supabase
      .from('product_location_stock')
      .select('quantity')
      .eq('product_id', productId)
      .eq('location', from === 'home' ? 'warehouse' : 'home')
      .single();
    if (ex) {
      await supabase
        .from('product_location_stock')
        .update({ quantity: newToQ, updated_at: now })
        .eq('product_id', productId)
        .eq('location', from === 'home' ? 'warehouse' : 'home');
    } else {
      await supabase
        .from('product_location_stock')
        .insert({ product_id: productId, location: from === 'home' ? 'warehouse' : 'home', quantity: newToQ });
    }
    setLoading(null);
    router.refresh();
  };

  const canMoveToWarehouse = stockAtHome > 0;
  const canMoveToHome = stockAtWarehouse > 0;
  if (!canMoveToWarehouse && !canMoveToHome) return null;

  return (
    <span className="inline-flex items-center gap-0.5">
      {canMoveToWarehouse && (
        <button
          type="button"
          onClick={() => move('home')}
          disabled={!!loading}
          title="家→倉庫に1個移動"
          className="rounded px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50 min-w-[44px] min-h-[28px] touch-manipulation"
        >
          {loading === 'home' ? '…' : '→倉'}
        </button>
      )}
      {canMoveToHome && (
        <button
          type="button"
          onClick={() => move('warehouse')}
          disabled={!!loading}
          title="倉庫→家に1個移動"
          className="rounded px-1.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 min-w-[44px] min-h-[28px] touch-manipulation"
        >
          {loading === 'warehouse' ? '…' : '→家'}
        </button>
      )}
    </span>
  );
}
