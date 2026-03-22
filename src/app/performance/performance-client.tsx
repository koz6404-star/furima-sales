'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PerformanceItem } from '@/app/api/performance/route';

type SortKey = 'grossProfit' | 'salesAmount' | 'unitsSold' | 'profitRate' | 'roi' | 'currentStock';

export function PerformanceClient() {
  const [items, setItems] = useState<PerformanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('grossProfit');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'Amazon' | 'フリマ'>('all');
  const [search, setSearch] = useState('');

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [periodType, setPeriodType] = useState<'month' | 'all'>('month');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/performance';
      if (periodType === 'month') {
        const from = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        url += `?from=${from}&to=${to}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) setItems(json.items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [year, month, periodType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = items
    .filter((item) => sourceFilter === 'all' || item.source === sourceFilter)
    .filter((item) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (item.name?.toLowerCase().includes(q)) || (item.sku?.toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return (bv as number) - (av as number);
    });

  const yen = (v: number) => `¥${v.toLocaleString()}`;

  return (
    <div>
      {/* フィルタ */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setPeriodType('month')}
          className={`px-3 py-1.5 text-sm rounded ${periodType === 'month' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          月別
        </button>
        <button
          onClick={() => setPeriodType('all')}
          className={`px-3 py-1.5 text-sm rounded ${periodType === 'all' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          全期間
        </button>
        {periodType === 'month' && (
          <div className="flex gap-1 items-center">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border rounded px-2 py-1.5 text-sm">
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <option key={y} value={y}>{y}年</option>
              ))}
            </select>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="border rounded px-2 py-1.5 text-sm">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {(['all', 'Amazon', 'フリマ'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setSourceFilter(f)}
            className={`px-3 py-1.5 text-sm rounded ${sourceFilter === f ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            {f === 'all' ? '全て' : f}
          </button>
        ))}
        <input
          type="text"
          placeholder="商品名・SKUで検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm flex-1 min-w-[140px]"
        />
      </div>

      {/* ソート */}
      <div className="flex gap-1 overflow-x-auto mb-4 pb-1">
        {([
          ['grossProfit', '利益順'],
          ['salesAmount', '売上順'],
          ['unitsSold', '個数順'],
          ['profitRate', '利益率順'],
          ['roi', 'ROI順'],
        ] as [SortKey, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            className={`px-2.5 py-1 text-xs rounded whitespace-nowrap ${sortKey === key ? 'bg-emerald-100 text-emerald-700 font-medium' : 'bg-slate-50 text-slate-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 結果 */}
      {loading ? (
        <p className="text-slate-400 text-sm py-8 text-center">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-400 text-sm py-8 text-center">該当する商品がありません</p>
      ) : (
        <>
          <p className="text-xs text-slate-400 mb-2">{filtered.length}件</p>
          <div className="space-y-3">
            {filtered.map((item) => (
              <div key={item.key} className="rounded-lg border border-slate-200 bg-white p-4">
                {/* ヘッダ行: 商品名 + バッジ */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm leading-tight truncate" title={item.name}>{item.name}</p>
                    {item.sku && <p className="text-xs text-slate-400 truncate">{item.sku}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      item.source === 'Amazon' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {item.source}
                    </span>
                    {item.fulfillment && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                        {item.fulfillment}
                      </span>
                    )}
                  </div>
                </div>

                {/* 指標グリッド */}
                <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-sm">
                  <div>
                    <span className="text-xs text-slate-400">売上</span>
                    <p className="font-medium">{yen(item.salesAmount)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400">原価</span>
                    <p className="font-medium">{item.costAmount > 0 ? yen(item.costAmount) : <span className="text-slate-300">-</span>}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400">手数料等</span>
                    <p className="font-medium">{yen(item.feeAmount)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400">利益</span>
                    <p className={`font-bold ${item.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {yen(item.grossProfit)}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400">利益率</span>
                    <p className="font-medium">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${
                        item.profitRate >= 30 ? 'bg-emerald-100 text-emerald-700' :
                        item.profitRate >= 10 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-rose-100 text-rose-600'
                      }`}>
                        {item.profitRate}%
                      </span>
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400">個数</span>
                    <p className="font-medium">{item.unitsSold}個</p>
                  </div>
                </div>

                {/* 下段: ROI + 在庫 */}
                <div className="flex gap-4 mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
                  <span>ROI: {item.roi != null ? `${item.roi}%` : '-'}</span>
                  <span>在庫: {item.currentStock}個</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
