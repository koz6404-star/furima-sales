'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AmazonSyncButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function handleSync(from?: string) {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/amazon-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: from ? JSON.stringify({ from }) : '{}',
      });
      const text = await res.text();
      let data: Record<string, unknown>;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(text || '同期に失敗しました（応答が不正です）');
      }
      if (!res.ok) throw new Error((data.error as string) || text || '同期に失敗しました');
      const inv = data.inventoryUpdated ?? 0;
      const fbaSkus = data.fbaSkusFound ?? 0;
      const invErr = data.inventoryError;
      let msg = `取得: ${data.transactionsFound ?? 0}件、登録: ${data.synced ?? 0}件`;
      if (inv > 0) msg += `、在庫更新: ${inv}件`;
      if (fbaSkus > 0) msg += `（FBA SKU: ${fbaSkus}件）`;
      if (invErr) msg += ` ※${invErr}`;
      setMessage(msg);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
      <button
        type="button"
        onClick={() => handleSync()}
        disabled={loading}
        className="rounded bg-orange-500 px-4 py-2 text-white font-medium hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
      >
        {loading ? '同期中…' : 'Amazon同期'}
      </button>
      <button
        type="button"
        onClick={() => handleSync('2025-02-01')}
        disabled={loading}
        className="rounded border border-orange-500 px-4 py-2 text-orange-600 font-medium hover:bg-orange-50 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
        title="2025年2月から初回取込（1回のみ実行）"
      >
        初回取込（2月～）
      </button>
      {message && <span className="text-sm text-slate-600">{message}</span>}
    </div>
  );
}
