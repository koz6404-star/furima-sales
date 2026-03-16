'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AmazonSalesSyncButton({ onSyncComplete }: { onSyncComplete?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function handleSync() {
    setLoading(true);
    setMessage(null);
    try {
      const now = new Date();
      const from = new Date(now);
      from.setMonth(from.getMonth() - 3);
      const fromStr = from.toISOString().slice(0, 10);
      const toStr = now.toISOString().slice(0, 10);

      const res = await fetch('/api/amazon-orders-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromStr,
          to: toStr,
          transform: true,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? '同期に失敗しました');

      const orders = data.ordersSaved ?? data.ordersFetched ?? 0;
      const items = data.orderItemsSaved ?? data.orderItemsFetched ?? 0;
      const tr = data.transform;
      const linesSaved = tr?.saved ?? 0;

      let msg = `注文: ${orders}件、商品行: ${items}件`;
      if (linesSaved > 0) msg += ` → 売上明細: ${linesSaved}件`;
      if (data.errors?.length > 0) msg += ` （エラー: ${data.errors.length}件）`;
      setMessage(msg);
      onSyncComplete?.();
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        className="rounded bg-orange-500 px-4 py-2 text-white font-medium hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
      >
        {loading ? '同期中…' : 'Amazon同期（過去3ヶ月）'}
      </button>
      {message && <span className="text-sm text-slate-600">{message}</span>}
    </div>
  );
}
