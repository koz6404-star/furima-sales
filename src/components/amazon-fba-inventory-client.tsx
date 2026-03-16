'use client';

import { useEffect, useState, useCallback } from 'react';

type InventoryRow = {
  seller_sku: string;
  snapshot_at: string;
  asin?: string;
  productName?: string;
  totalQuantity?: number;
  inventoryDetails?: {
    fulfillableQuantity?: number;
    inboundWorkingQuantity?: number;
    inboundShippedQuantity?: number;
    inboundReceivingQuantity?: number;
    reservedQuantity?: { totalReservedQuantity?: number };
    researchingQuantity?: { totalResearchingQuantity?: number };
    unfulfillableQuantity?: { totalUnfulfillableQuantity?: number };
  };
  lastUpdatedTime?: string;
  [key: string]: unknown;
};

type CurrentRow = {
  seller_sku: string;
  channel_type: string;
  fulfillable_qty: number;
  inbound_qty: number;
  reserved_qty: number;
  unfulfillable_qty: number;
  total_available_qty: number;
  snapshot_at: string;
};

export function AmazonFbaInventoryClient() {
  const [viewMode, setViewMode] = useState<'raw' | 'current'>('current');
  const [rows, setRows] = useState<(InventoryRow | CurrentRow)[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [skuFilter, setSkuFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '100', offset: '0' });
      if (skuFilter.trim()) params.set('sku', skuFilter.trim());
      const url =
        viewMode === 'current'
          ? `/api/amazon-inventory-current?${params}`
          : `/api/amazon-fba-inventory-raw?${params}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '取得に失敗しました');
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [skuFilter, viewMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSync() {
    setSyncLoading(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/amazon-fba-inventory-sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '同期に失敗しました');
      const msg = data.message ?? (data.sync ? `取得: ${data.sync.fetched}件 → current: ${data.transform?.saved ?? 0}件` : '完了');
      setSyncMessage(msg);
      const errs = data.sync?.errors ?? data.errors ?? [];
      if (errs.length > 0) setSyncMessage((m) => `${m} （エラー: ${errs.length}件）`);
      fetchData();
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setSyncLoading(false);
    }
  }

  const inv = (r: InventoryRow) => r.inventoryDetails;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSync}
          disabled={syncLoading}
          className="rounded bg-orange-500 px-4 py-2 text-white font-medium hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {syncLoading ? '同期中…' : 'FBA在庫 同期'}
        </button>
        {syncMessage && <span className="text-sm text-slate-600">{syncMessage}</span>}
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">表示</label>
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as 'raw' | 'current')}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="current">Current（整形済み）</option>
            <option value="raw">Raw</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">SKU検索</label>
          <input
            type="text"
            value={skuFilter}
            onChange={(e) => setSkuFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchData()}
            placeholder="部分一致"
            className="rounded border border-slate-300 px-2 py-1.5 text-sm w-32"
          />
          <button
            type="button"
            onClick={fetchData}
            className="rounded bg-slate-700 px-3 py-1.5 text-white text-sm hover:bg-slate-800"
          >
            検索
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="font-bold text-lg">
            {viewMode === 'current' ? 'Current 在庫' : 'Raw 在庫'}（{total}件）
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
            データがありません。「FBA在庫 同期」を実行して取得してください。
          </div>
        ) : viewMode === 'current' ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">seller_sku</th>
                  <th className="py-2 px-3 text-center text-sm font-medium text-slate-600">channel</th>
                  <th className="py-2 px-3 text-right text-sm font-medium text-slate-600">fulfillable</th>
                  <th className="py-2 px-3 text-right text-sm font-medium text-slate-600">inbound</th>
                  <th className="py-2 px-3 text-right text-sm font-medium text-slate-600">reserved</th>
                  <th className="py-2 px-3 text-right text-sm font-medium text-slate-600">unfulfillable</th>
                  <th className="py-2 px-3 text-right text-sm font-medium text-slate-600">total_available</th>
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">snapshot_at</th>
                </tr>
              </thead>
              <tbody>
                {(rows as CurrentRow[]).map((r) => (
                  <tr key={r.seller_sku} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 text-sm font-mono">{r.seller_sku}</td>
                    <td className="py-2 px-3 text-center text-sm">{r.channel_type ?? 'FBA'}</td>
                    <td className="py-2 px-3 text-right text-sm">{r.fulfillable_qty ?? 0}</td>
                    <td className="py-2 px-3 text-right text-sm">{r.inbound_qty ?? 0}</td>
                    <td className="py-2 px-3 text-right text-sm">{r.reserved_qty ?? 0}</td>
                    <td className="py-2 px-3 text-right text-sm">{r.unfulfillable_qty ?? 0}</td>
                    <td className="py-2 px-3 text-right text-sm font-medium">{r.total_available_qty ?? 0}</td>
                    <td className="py-2 px-3 text-sm text-slate-600">{r.snapshot_at ?? '-'}</td>
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
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">seller_sku</th>
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">ASIN</th>
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">商品名</th>
                  <th className="py-2 px-3 text-right text-sm font-medium text-slate-600">fulfillable</th>
                  <th className="py-2 px-3 text-right text-sm font-medium text-slate-600">inbound</th>
                  <th className="py-2 px-3 text-right text-sm font-medium text-slate-600">reserved</th>
                  <th className="py-2 px-3 text-right text-sm font-medium text-slate-600">unfulfillable</th>
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">snapshot_at</th>
                </tr>
              </thead>
              <tbody>
                {(rows as InventoryRow[]).map((r) => {
                  const d = inv(r);
                  const inbound =
                    (d?.inboundWorkingQuantity ?? 0) +
                    (d?.inboundShippedQuantity ?? 0) +
                    (d?.inboundReceivingQuantity ?? 0);
                  return (
                    <tr key={r.seller_sku} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-3 text-sm font-mono">{r.seller_sku}</td>
                      <td className="py-2 px-3 text-sm font-mono">{r.asin ?? '-'}</td>
                      <td className="py-2 px-3 text-sm max-w-[180px] truncate" title={String(r.productName ?? '')}>
                        {r.productName ?? '-'}
                      </td>
                      <td className="py-2 px-3 text-right text-sm font-medium">
                        {d?.fulfillableQuantity ?? 0}
                      </td>
                      <td className="py-2 px-3 text-right text-sm">{inbound}</td>
                      <td className="py-2 px-3 text-right text-sm">
                        {d?.reservedQuantity?.totalReservedQuantity ?? 0}
                      </td>
                      <td className="py-2 px-3 text-right text-sm">
                        {d?.unfulfillableQuantity?.totalUnfulfillableQuantity ?? 0}
                      </td>
                      <td className="py-2 px-3 text-sm text-slate-600">{r.snapshot_at ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
