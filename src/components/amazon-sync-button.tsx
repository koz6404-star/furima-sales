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
      const inv = Number(data.inventoryUpdated ?? 0);
      const fbaSkus = Number(data.fbaSkusFound ?? 0);
      const fbaAsins = Number(data.fbaByAsinCount ?? 0);
      const invErr = data.inventoryError;
      const debug = data.debug as string | undefined;
      let msg = `取得: ${data.transactionsFound ?? 0}件、登録: ${data.synced ?? 0}件`;
      if (inv > 0) msg += `、在庫更新: ${inv}件`;
      if (fbaSkus > 0 || fbaAsins > 0) msg += `（FBA: SKU ${fbaSkus}件、ASIN ${fbaAsins}件）`;
      if (invErr) msg += ` ※${invErr}`;
      if (debug) msg += ` ${debug}`;
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
      <button
        type="button"
        onClick={() => handleSync('2025-09-01')}
        disabled={loading}
        className="rounded border border-slate-400 px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
        title="既存の販売履歴に手数料・送料を反映（9月～の取引を再取得）"
      >
        手数料・送料を再取得
      </button>
      {message && <span className="text-sm text-slate-600">{message}</span>}
    </div>
  );
}
