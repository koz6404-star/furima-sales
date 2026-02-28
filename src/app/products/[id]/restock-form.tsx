'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function RestockForm({ productId }: { productId: string }) {
  const [stock, setStock] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const num = parseInt(stock, 10);
    if (isNaN(num) || num < 1) {
      setError('在庫数は1以上で入力してください');
      return;
    }
    setLoading(true);
    const { error } = await supabase
      .from('products')
      .update({ stock: num, updated_at: new Date().toISOString() })
      .eq('id', productId);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-4 items-end">
      <div>
        <label className="block text-sm font-medium mb-1">再入荷数</label>
        <input
          type="number"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          min={1}
          className="w-32 rounded border px-3 py-2"
          placeholder="例: 5"
        />
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-emerald-600 px-4 py-2 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        {loading ? '反映中...' : '再入荷'}
      </button>
    </form>
  );
}
