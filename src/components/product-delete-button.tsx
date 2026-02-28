'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function ProductDeleteButton({
  productId,
  productName,
  redirectTo,
  variant = 'danger',
}: {
  productId: string;
  productName: string;
  redirectTo: '/products' | '/products/sold-out';
  variant?: 'danger' | 'ghost';
}) {
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleDelete = async () => {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
      .eq('user_id', user.id);
    setLoading(false);
    if (!error) {
      router.push(redirectTo);
      router.refresh();
    }
  };

  const baseClass = variant === 'danger'
    ? 'rounded px-4 py-2 text-red-600 border border-red-300 hover:bg-red-50'
    : 'text-red-600 hover:underline text-sm';

  return (
    <div className="flex items-center gap-2">
      {confirm ? (
        <>
          <span className="text-sm text-slate-600">削除しますか？</span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="rounded px-3 py-1 bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? '削除中...' : '実行'}
          </button>
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="rounded px-3 py-1 border text-slate-600 text-sm hover:bg-slate-50"
          >
            キャンセル
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={handleDelete}
          className={baseClass}
        >
          削除
        </button>
      )}
    </div>
  );
}
