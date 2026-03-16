'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { AmazonSalesSyncButton } from './amazon-sales-sync-button';

const PER_PAGE = 30;

type SalesLine = {
  id: string;
  order_date: string;
  order_id: string;
  sku: string | null;
  asin: string | null;
  product_name: string | null;
  quantity: number;
  sales_amount_yen: number | null;
  sales_state: string;
  fulfillment_type: 'FBA' | 'FBM' | null;
  fee_status: string;
  fee_amount_yen: number | null;
  /** Phase7: FBA在庫。結合成功時は数値、失敗時はnull（表示「取得なし」） */
  current_available?: number | null;
  /** Phase10: order_id 単位の手数料合計（fee_events から集約）。未取得時は null */
  fee_amount_aggregated?: number | null;
};

const SALES_STATE_LABELS: Record<string, string> = {
  confirmed: '確定',
  pending_price: '価格未確定',
  canceled: 'キャンセル',
  other_excluded: '対象外',
};

export function AmazonSalesListClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<SalesLine[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fromParam = searchParams.get('from') ?? '';
  const toParam = searchParams.get('to') ?? '';
  const skuParam = searchParams.get('sku') ?? '';
  const productNameParam = searchParams.get('productName') ?? '';
  const fulfillmentType = searchParams.get('fulfillmentType') ?? '';
  const salesStateParam = searchParams.get('salesState') ?? 'confirmed';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const [summary, setSummary] = useState<{ confirmed: number; pending_price: number; canceled: number; other_excluded: number } | null>(null);
  const [aggSummary, setAggSummary] = useState<{
    total: { sales_amount_yen: number; fee_amount_yen: number; sales_after_fee_yen: number; line_count: number };
    by_day: Array<{ date: string; sales_amount_yen: number; fee_amount_yen: number; sales_after_fee_yen: number }>;
    by_sku: Array<{ sku: string; product_name: string | null; sales_amount_yen: number; fee_amount_yen: number; sales_after_fee_yen: number }>;
  } | null>(null);
  const [aggLoading, setAggLoading] = useState(false);
  const [skuInput, setSkuInput] = useState(skuParam);
  const [productNameInput, setProductNameInput] = useState(productNameParam);
  useEffect(() => {
    setSkuInput(skuParam);
    setProductNameInput(productNameParam);
  }, [skuParam, productNameParam]);

  const from = fromParam;
  const to = toParam;
  const sku = skuParam;
  const productName = productNameParam;
  const salesState = salesStateParam;

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/amazon-sales-lines/summary');
      const data = await res.json();
      if (data.ok && data.summary) setSummary(data.summary);
    } catch {
      setSummary(null);
    }
  }, []);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PER_PAGE));
      params.set('offset', String((page - 1) * PER_PAGE));
      params.set('salesState', salesState);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (sku) params.set('sku', sku);
      if (productName) params.set('productName', productName);
      if (fulfillmentType) params.set('fulfillmentType', fulfillmentType);

      const res = await fetch(`/api/amazon-sales-lines?${params}`);
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
  }, [page, from, to, sku, productName, fulfillmentType, salesState]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    router.push(`/amazon-sales?${next.toString()}`);
  };

  const applyTextFilters = () => {
    const next = new URLSearchParams(searchParams.toString());
    if (skuInput.trim()) next.set('sku', skuInput.trim());
    else next.delete('sku');
    if (productNameInput.trim()) next.set('productName', productNameInput.trim());
    else next.delete('productName');
    next.delete('page');
    router.push(`/amazon-sales?${next.toString()}`);
  };

  const feeStatusLabel = (s: string) => {
    if (s === 'pending') return '未取得';
    if (s === 'confirmed') return '取得済';
    if (s === 'missing') return '不明';
    return s;
  };

  const totalPages = Math.ceil(total / PER_PAGE);

  const onSyncComplete = useCallback(() => {
    fetchSummary();
    fetchSales();
    setAggSummary(null);
  }, [fetchSummary, fetchSales]);

  async function fetchAggSummary() {
    setAggLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/amazon-sales-summary?${params}`);
      const data = await res.json();
      if (data.ok && data.summary) {
        setAggSummary({
          total: data.summary.total,
          by_day: (data.summary.by_day ?? []).slice(-7),
          by_sku: (data.summary.by_sku ?? []).slice(0, 5),
        });
      } else {
        setAggSummary(null);
      }
    } catch {
      setAggSummary(null);
    } finally {
      setAggLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <AmazonSalesSyncButton onSyncComplete={onSyncComplete} />

      {summary != null && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
          確定: <strong className="text-slate-800">{summary.confirmed}</strong>件
          {' | '}
          価格未確定: <strong>{summary.pending_price}</strong>件
          {' | '}
          キャンセル: <strong>{summary.canceled}</strong>件
          {' | '}
          対象外: <strong>{summary.other_excluded}</strong>件
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchAggSummary}
            disabled={aggLoading}
            className="rounded bg-indigo-600 px-3 py-1.5 text-white text-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            {aggLoading ? '取得中…' : '集計サマリ表示（Phase13）'}
          </button>
        </div>
        {aggSummary && (
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <div className="font-medium">
              期間: {from || '全期間'} 〜 {to || '全期間'} | 売上行: {aggSummary.total.line_count}件
            </div>
            <div className="flex flex-wrap gap-4">
              <span>売上合計: ¥{aggSummary.total.sales_amount_yen.toLocaleString()}</span>
              <span title="DB保存値。負=コスト（UK等）">手数料合計: ¥{aggSummary.total.fee_amount_yen.toLocaleString()}</span>
              <span className="font-medium" title="差引後=売上+手数料（手数料負なら減少）">売上−手数料: ¥{aggSummary.total.sales_after_fee_yen.toLocaleString()}</span>
            </div>
            {aggSummary.by_day.length > 0 && (
              <div>
                <div className="font-medium mb-1">日次サンプル（直近7日）</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="py-1 pr-2 text-left">日付</th>
                        <th className="py-1 pr-2 text-right">売上</th>
                        <th className="py-1 pr-2 text-right">手数料</th>
                        <th className="py-1 pr-2 text-right">差引後</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aggSummary.by_day.map((r) => (
                        <tr key={r.date} className="border-b border-slate-100">
                          <td className="py-1 pr-2">{r.date}</td>
                          <td className="py-1 pr-2 text-right">¥{r.sales_amount_yen.toLocaleString()}</td>
                          <td className="py-1 pr-2 text-right">¥{r.fee_amount_yen.toLocaleString()}</td>
                          <td className="py-1 pr-2 text-right">¥{r.sales_after_fee_yen.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {aggSummary.by_sku.length > 0 && (
              <div>
                <div className="font-medium mb-1">SKU別サンプル（上位5件）</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="py-1 pr-2 text-left">SKU</th>
                        <th className="py-1 pr-2 text-left">商品名</th>
                        <th className="py-1 pr-2 text-right">売上</th>
                        <th className="py-1 pr-2 text-right">手数料</th>
                        <th className="py-1 pr-2 text-right">差引後</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aggSummary.by_sku.map((r) => (
                        <tr key={r.sku} className="border-b border-slate-100">
                          <td className="py-1 pr-2 font-mono">{r.sku}</td>
                          <td className="py-1 pr-2 max-w-[120px] truncate" title={r.product_name ?? ''}>
                            {r.product_name ?? '-'}
                          </td>
                          <td className="py-1 pr-2 text-right">¥{r.sales_amount_yen.toLocaleString()}</td>
                          <td className="py-1 pr-2 text-right">¥{r.fee_amount_yen.toLocaleString()}</td>
                          <td className="py-1 pr-2 text-right">¥{r.sales_after_fee_yen.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-bold text-lg mb-3">検索・フィルター</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">表示</label>
            <select
              value={salesState}
              onChange={(e) => updateFilter('salesState', e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="confirmed">確定</option>
              <option value="pending_price">価格未確定</option>
              <option value="canceled">キャンセル</option>
              <option value="other_excluded">対象外</option>
              <option value="all">すべて</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">注文日 From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => updateFilter('from', e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => updateFilter('to', e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">SKU</label>
            <input
              type="text"
              placeholder="部分一致"
              value={skuInput}
              onChange={(e) => setSkuInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyTextFilters()}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm w-32"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">商品名</label>
            <input
              type="text"
              placeholder="部分一致"
              value={productNameInput}
              onChange={(e) => setProductNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyTextFilters()}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm w-40"
            />
          </div>
          <button
            type="button"
            onClick={applyTextFilters}
            className="rounded bg-slate-700 px-3 py-1.5 text-white text-sm hover:bg-slate-800"
          >
            検索
          </button>
          <div>
            <label className="block text-xs text-slate-500 mb-1">FBA/FBM</label>
            <select
              value={fulfillmentType}
              onChange={(e) => updateFilter('fulfillmentType', e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">すべて</option>
              <option value="FBA">FBA</option>
              <option value="FBM">FBM</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center">
          <h2 className="font-bold text-lg">
            売上明細（{total}件）
            {salesState !== 'all' && `　${SALES_STATE_LABELS[salesState] ?? salesState}`}
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
            データがありません。Amazon同期を実行して取り込みしてください。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">注文日</th>
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">注文ID</th>
                  {salesState === 'all' && (
                    <th className="py-2 px-3 text-center text-sm font-medium text-slate-600">状態</th>
                  )}
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">SKU</th>
                  <th className="py-2 px-3 text-left text-sm font-medium text-slate-600">商品名</th>
                  <th className="py-2 px-3 text-center text-sm font-medium text-slate-600">FBA/FBM</th>
                  <th className="py-2 px-3 text-right text-sm font-medium text-slate-600">数量</th>
                  <th className="py-2 px-3 text-right text-sm font-medium text-slate-600">売上金額</th>
                  <th className="py-2 px-3 text-right text-sm font-medium text-slate-600" title="FBA在庫（確定のみ）">在庫</th>
                  <th className="py-2 px-3 text-right text-sm font-medium text-slate-600" title="Phase10: fee_events 集約">手数料</th>
                  <th className="py-2 px-3 text-center text-sm font-medium text-slate-600">手数料状態</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 text-sm">{r.order_date}</td>
                    <td className="py-2 px-3 text-sm font-mono text-slate-700">{r.order_id}</td>
                    {salesState === 'all' && (
                      <td className="py-2 px-3 text-center text-sm">
                        <span className="rounded px-2 py-0.5 text-xs bg-slate-100 text-slate-700">
                          {SALES_STATE_LABELS[r.sales_state] ?? r.sales_state}
                        </span>
                      </td>
                    )}
                    <td className="py-2 px-3 text-sm font-mono">{r.sku ?? '-'}</td>
                    <td className="py-2 px-3 text-sm max-w-[200px] truncate" title={r.product_name ?? ''}>
                      {r.product_name ?? '-'}
                    </td>
                    <td className="py-2 px-3 text-center text-sm">
                      <span
                        className={
                          r.fulfillment_type === 'FBA'
                            ? 'rounded bg-amber-100 px-2 py-0.5 text-amber-800'
                            : r.fulfillment_type === 'FBM'
                              ? 'rounded bg-sky-100 px-2 py-0.5 text-sky-800'
                              : ''
                        }
                      >
                        {r.fulfillment_type ?? '-'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-sm">{r.quantity}</td>
                    <td className="py-2 px-3 text-right text-sm font-medium">
                      {r.sales_amount_yen != null
                        ? `¥${r.sales_amount_yen.toLocaleString()}`
                        : r.sales_state === 'pending_price'
                          ? '（価格未確定）'
                          : r.sales_state === 'canceled'
                            ? '—'
                            : '—'}
                    </td>
                    <td className="py-2 px-3 text-right text-sm">
                      {r.current_available != null ? (
                        r.current_available === 0 ? (
                          <span className="rounded bg-rose-100 px-2 py-0.5 font-medium text-rose-800" title="在庫切れ">
                            0
                          </span>
                        ) : (
                          r.current_available
                        )
                      ) : (
                        <span className="text-slate-400" title="FBM/未取得">
                          取得なし
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-sm">
                      {r.fee_amount_aggregated != null ? (
                        (r.fee_amount_aggregated as number) < 0 ? (
                          <span className="font-medium text-emerald-700" title="返金調整込み">
                            -¥{Math.abs(r.fee_amount_aggregated as number).toLocaleString()}
                          </span>
                        ) : (r.fee_amount_aggregated as number) === 0 ? (
                          <span className="text-slate-500">¥0</span>
                        ) : (
                          <span className="font-medium">¥{(r.fee_amount_aggregated as number).toLocaleString()}</span>
                        )
                      ) : (
                        <span className="text-slate-400" title="fee_events 未取得">
                          未取得
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center text-sm text-slate-600">
                      {feeStatusLabel(r.fee_status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 py-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => {
                const next = new URLSearchParams(searchParams.toString());
                next.set('page', String(Math.max(1, page - 1)));
                router.push(`/amazon-sales?${next.toString()}`);
              }}
              disabled={page <= 1}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              前へ
            </button>
            <span className="py-1.5 text-sm text-slate-600">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => {
                const next = new URLSearchParams(searchParams.toString());
                next.set('page', String(Math.min(totalPages, page + 1)));
                router.push(`/amazon-sales?${next.toString()}`);
              }}
              disabled={page >= totalPages}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              次へ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
