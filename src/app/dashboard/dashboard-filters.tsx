'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 10 }, (_, i) => currentYear - i);
const months = Array.from({ length: 12 }, (_, i) => i + 1);

export function DashboardFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = searchParams.get('period') || 'month';
  const year = parseInt(searchParams.get('year') ?? String(currentYear), 10);
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1), 10);

  const setParams = useCallback(
    (p: { period?: string; year?: number; month?: number }) => {
      const params = new URLSearchParams();
      params.set('period', p.period ?? period);
      params.set('year', String(p.year ?? year));
      params.set('month', String(p.month ?? month));
      router.push(`/dashboard?${params.toString()}`);
    },
    [router, period, year, month]
  );

  const exportCsv = useCallback(() => {
    const params = new URLSearchParams();
    params.set('period', period);
    params.set('year', String(year));
    params.set('month', String(month));
    window.open(`/api/export-sales?${params.toString()}`, '_blank');
  }, [period, year, month]);

  return (
    <div className="flex flex-wrap items-center gap-4 mb-6">
      <div className="flex rounded-lg border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={() => {
            const now = new Date();
            setParams({ period: 'month', year: now.getFullYear(), month: now.getMonth() + 1 });
          }}
          className={`px-4 py-2 text-sm font-medium ${
            period === 'month' && year === currentYear && month === new Date().getMonth() + 1
              ? 'bg-emerald-600 text-white'
              : 'bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          今月
        </button>
        <button
          type="button"
          onClick={() => setParams({ period: 'month' })}
          className={`px-4 py-2 text-sm font-medium border-l border-slate-200 ${
            period === 'month' ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          月別
        </button>
        <button
          type="button"
          onClick={() => setParams({ period: 'year' })}
          className={`px-4 py-2 text-sm font-medium border-l border-slate-200 ${
            period === 'year' ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          年別
        </button>
      </div>
      {period === 'month' && (
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setParams({ year: parseInt(e.target.value, 10) })}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setParams({ month: parseInt(e.target.value, 10) })}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {months.map((m) => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>
        </div>
      )}
      {period === 'year' && (
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setParams({ year: parseInt(e.target.value, 10) })}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
        </div>
      )}
      <button
        type="button"
        onClick={exportCsv}
        className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        CSVエクスポート
      </button>
    </div>
  );
}
