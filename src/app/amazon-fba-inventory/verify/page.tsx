'use client';

import { useState } from 'react';

/**
 * Phase5 完了確認ページ
 */
export default function AmazonFbaInventoryVerifyPage() {
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/amazon-phase5-verify');
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-bold">Phase5 完了確認</h1>
      <p className="text-sm text-slate-600">
        seller_sku / snapshot_at / 在庫項目 / 再同期耐性 を検証します。
      </p>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="rounded bg-slate-700 px-4 py-1.5 text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {loading ? '実行中...' : '検証実行'}
      </button>
      {result && (
        <pre className="rounded border border-slate-200 bg-slate-50 p-4 text-sm overflow-auto max-h-[70vh]">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
