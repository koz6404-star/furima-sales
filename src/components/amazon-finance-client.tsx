'use client';

import { useEffect, useState, useCallback } from 'react';

type FinanceRow = {
  id: string;
  source_key: string;
  source_api: string;
  posted_date: string | null;
  order_id: string | null;
  transaction_id: string | null;
  transaction_type: string;
  fetched_at: string;
};

type FeeEventRow = {
  id: string;
  order_id: string;
  transaction_type: string;
  fee_type: string | null;
  fee_amount_yen: number;
  posted_date: string | null;
};

export function AmazonFinanceClient() {
  const [viewMode, setViewMode] = useState<'raw' | 'fee_events'>('raw');
  const [rows, setRows] = useState<(FinanceRow | FeeEventRow)[]>([]);
  const [total, setTotal] = useState(0);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [transformLoading, setTransformLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [orderIdFilter, setOrderIdFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (orderIdFilter.trim()) params.set('orderId', orderIdFilter.trim());
      if (typeFilter.trim()) params.set('transactionType', typeFilter.trim());

      const url = viewMode === 'fee_events' ? `/api/amazon-fee-events?${params}` : `/api/amazon-finance-raw?${params}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '取得に失敗しました');

      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setTypeCounts(data.transactionTypeCounts ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
      setRows([]);
      setTotal(0);
      setTypeCounts({});
    } finally {
      setLoading(false);
    }
  }, [orderIdFilter, typeFilter, viewMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSync() {
    setSyncLoading(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/amazon-finance-sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '同期に失敗しました');
      setSyncMessage(data.message ?? '完了');
      fetchData();
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setSyncLoading(false);
    }
  }

  async function handleTransform() {
    setTransformLoading(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/amazon-fee-events-transform', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '整形に失敗しました');
      setSyncMessage(data.message ?? 'fee_events 整形完了');
      if (viewMode === 'fee_events') fetchData();
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setTransformLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSync}
          disabled={syncLoading}
          className="rounded bg-orange-500 px-4 py-2 text-white font-medium hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {syncLoading ? '同期中…' : 'Finances 同期'}
        </button>
        <button
          type="button"
          onClick={handleTransform}
          disabled={transformLoading}
          className="rounded bg-emerald-600 px-4 py-2 text-white font-medium hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {transformLoading ? '整形中…' : 'fee_events 整形'}
        </button>
        {syncMessage && <span className="text-sm text-slate-600">{syncMessage}</span>}
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">表示</label>
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as 'raw' | 'fee_events')}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="raw">Raw</option>
            <option value="fee_events">fee_events</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">orderId</label>
          <input
            type="text"
            value={orderIdFilter}
            onChange={(e) => setOrderIdFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchData()}
            placeholder="部分一致"
            className="rounded border border-slate-300 px-2 py-1.5 text-sm w-32"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">transactionType</label>
          <input
            type="text"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchData()}
            placeholder="ShipmentEvent 等"
            className="rounded border border-slate-300 px-2 py-1.5 text-sm w-40"
          />
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="rounded bg-slate-700 px-3 py-1.5 text-white text-sm hover:bg-slate-800"
        >
          検索
        </button>
      </div>

      {Object.keys(typeCounts).length > 0 && viewMode === 'raw' && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          transactionType 別件数: {Object.entries(typeCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="font-bold text-lg">
            {viewMode === 'raw' ? 'Finances raw' : 'fee_events'}（{total}件）
          </h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-500">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
            <p className="mt-2">読み込み中...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">{error}</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            {viewMode === 'raw'
              ? 'データがありません。「Finances 同期」を実行して取得してください。'
              : 'データがありません。「fee_events 整形」を実行してください。'}
          </div>
        ) : viewMode === 'fee_events' ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">posted_date</th>
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">order_id</th>
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">transaction_type</th>
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">fee_type</th>
                  <th className="py-2 px-3 text-right text-sm font-medium text-slate-600">fee_amount_yen</th>
                </tr>
              </thead>
              <tbody>
                {(rows as FeeEventRow[]).map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 text-sm">{r.posted_date ?? '-'}</td>
                    <td className="py-2 px-3 text-sm font-mono">{r.order_id}</td>
                    <td className="py-2 px-3 text-sm">
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800 text-xs">
                        {r.transaction_type}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-600">{r.fee_type ?? '-'}</td>
                    <td className="py-2 px-3 text-right text-sm font-medium">¥{r.fee_amount_yen.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">posted_date</th>
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">order_id</th>
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">transaction_type</th>
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">transaction_id</th>
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">source_key</th>
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">fetched_at</th>
                </tr>
              </thead>
              <tbody>
                {(rows as FinanceRow[]).map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 text-sm">{r.posted_date ?? '-'}</td>
                    <td className="py-2 px-3 text-sm font-mono">{r.order_id ?? '-'}</td>
                    <td className="py-2 px-3 text-sm">
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800 text-xs">
                        {r.transaction_type}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-sm font-mono text-slate-600">{r.transaction_id ?? '-'}</td>
                    <td className="py-2 px-3 text-sm font-mono text-slate-400 truncate max-w-[120px]" title={r.source_key}>
                      {r.source_key.slice(0, 12)}…
                    </td>
                    <td className="py-2 px-3 text-sm text-slate-500">{r.fetched_at ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
