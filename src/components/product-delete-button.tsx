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
  redirectTo: '/products' | '/products/sold-out' | '/products/by-profit';
  variant?: 'danger' | 'ghost' | 'icon';
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
    const { error } = await supabase.rpc('delete_product_with_stock_restore', {
      p_product_id: productId,
      p_user_id: user.id,
    });
    setLoading(false);
    if (!error) {
      router.push(redirectTo);
      router.refresh();
    } else {
      alert('削除に失敗しました: ' + error.message);
    }
  };

  const baseClass = variant === 'danger'
    ? 'rounded px-4 py-2 text-red-600 border border-red-300 hover:bg-red-50'
    : variant === 'icon'
      ? 'inline-flex items-center justify-center rounded-lg p-2.5 min-h-[44px] min-w-[44px] text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors touch-manipulation'
      : 'text-red-600 hover:underline text-sm';

  const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );

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
          title={`${productName}を削除`}
        >
          {variant === 'icon' ? <TrashIcon /> : '削除'}
        </button>
      )}
    </div>
  );
}
