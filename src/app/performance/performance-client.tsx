'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PerformanceItem } from '@/app/api/performance/route';

type SortKey = 'grossProfit' | 'salesAmount' | 'unitsSold' | 'profitRate';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'grossProfit', label: '利益順' },
  { key: 'salesAmount', label: '売上順' },
  { key: 'unitsSold', label: '個数順' },
  { key: 'profitRate', label: '利益率順' },
];

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

  const goMonth = (dir: -1 | 1) => {
    let m = month + dir;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

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
      const av = (a[sortKey] ?? -Infinity) as number;
      const bv = (b[sortKey] ?? -Infinity) as number;
      return bv - av;
    });

  // サマリー計算
  const totalSales = filtered.reduce((s, i) => s + i.salesAmount, 0);
  const totalProfit = filtered.reduce((s, i) => s + i.grossProfit, 0);
  const totalUnits = filtered.reduce((s, i) => s + i.unitsSold, 0);
  const totalProfitRate = totalSales > 0 ? Math.round((totalProfit / totalSales) * 100) : 0;

  const yen = (v: number) => `¥${v.toLocaleString()}`;

  return (
    <div>
      {/* 期間切り替え */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setPeriodType('month')}
          className={`px-3 py-1.5 text-sm rounded-lg font-medium transition ${periodType === 'month' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
        >
          月別
        </button>
        <button
          onClick={() => setPeriodType('all')}
          className={`px-3 py-1.5 text-sm rounded-lg font-medium transition ${periodType === 'all' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
        >
          全期間
        </button>
      </div>

      {/* 月ナビゲーション */}
      {periodType === 'month' && (
        <div className="flex items-center justify-center gap-4 mb-4">
          <button onClick={() => goMonth(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 text-lg">
            ◀
          </button>
          <span className="text-lg font-bold min-w-[120px] text-center">
            {year}年{month}月
          </span>
          <button onClick={() => goMonth(1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 text-lg">
            ▶
          </button>
        </div>
      )}

      {/* サマリーカード */}
      {!loading && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl bg-white border border-slate-200 p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">売上合計</p>
            <p className="text-lg font-bold">{yen(totalSales)}</p>
          </div>
          <div className={`rounded-xl border p-4 text-center ${totalProfit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
            <p className="text-xs text-slate-400 mb-1">粗利合計</p>
            <p className={`text-lg font-bold ${totalProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {yen(totalProfit)}
            </p>
          </div>
          <div className="rounded-xl bg-white border border-slate-200 p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">販売個数</p>
            <p className="text-lg font-bold">{totalUnits}<span className="text-sm font-normal text-slate-400">個</span></p>
          </div>
          <div className="rounded-xl bg-white border border-slate-200 p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">利益率</p>
            <p className="text-lg font-bold">{totalProfitRate}<span className="text-sm font-normal text-slate-400">%</span></p>
          </div>
        </div>
      )}

      {/* フィルタ＆検索 */}
      <div className="flex flex-wrap gap-2 mb-3">
        {(['all', 'Amazon', 'フリマ'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setSourceFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-lg transition ${sourceFilter === f ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
            {f === 'all' ? '全て' : f}
          </button>
        ))}
        <input
          type="text"
          placeholder="商品名・SKUで検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[140px]"
        />
      </div>

      {/* ソート */}
      <div className="flex gap-1 mb-4">
        {SORT_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            className={`px-2.5 py-1 text-xs rounded-lg transition ${sortKey === key ? 'bg-emerald-100 text-emerald-700 font-medium' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 商品リスト */}
      {loading ? (
        <p className="text-slate-400 text-sm py-12 text-center">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-400 text-sm py-12 text-center">該当する商品がありません</p>
      ) : (
        <>
          <p className="text-xs text-slate-400 mb-2">{filtered.length}件</p>
          <div className="space-y-2">
            {filtered.map((item, idx) => (
              <div key={item.key} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                {/* 商品名 + バッジ */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-slate-300 font-medium w-5 shrink-0">{idx + 1}</span>
                    <p className="font-medium text-sm truncate" title={item.name}>{item.name}</p>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                    item.source === 'Amazon' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {item.source}
                  </span>
                </div>

                {/* 数値 */}
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex-1">
                    <span className="text-xs text-slate-400">売上</span>
                    <p className="font-medium">{yen(item.salesAmount)}</p>
                  </div>
                  <div className="flex-1">
                    <span className="text-xs text-slate-400">粗利</span>
                    <p className={`font-bold ${item.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {yen(item.grossProfit)}
                    </p>
                  </div>
                  <div className="text-center">
                    <span className="text-xs text-slate-400">利益率</span>
                    <p>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                        item.profitRate >= 30 ? 'bg-emerald-100 text-emerald-700' :
                        item.profitRate >= 10 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-rose-100 text-rose-600'
                      }`}>
                        {item.profitRate}%
                      </span>
                    </p>
                  </div>
                  <div className="text-center">
                    <span className="text-xs text-slate-400">個数</span>
                    <p className="font-medium text-sm">{item.unitsSold}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
