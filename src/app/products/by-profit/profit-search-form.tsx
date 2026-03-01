'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export function ProfitSearchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramMinProfit = searchParams.get('minProfit') ?? '';
  const [minProfit, setMinProfit] = useState(paramMinProfit);

  useEffect(() => {
    setMinProfit(paramMinProfit);
  }, [paramMinProfit]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const n = parseInt(minProfit, 10);
      if (Number.isNaN(n) || n < 0) {
        router.push('/products/by-profit');
        return;
      }
      router.push(`/products/by-profit?minProfit=${n}`);
    },
    [minProfit, router]
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-stretch gap-2">
      <div className="flex items-center gap-2">
        <label htmlFor="minProfit" className="text-sm font-medium text-slate-700 whitespace-nowrap">
          利益
        </label>
        <input
          id="minProfit"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={minProfit}
          onChange={(e) => setMinProfit(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="例: 1000"
          className="w-24 rounded border border-slate-300 px-3 py-2.5 text-base sm:text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          aria-label="最低利益額（円）"
        />
        <span className="text-sm text-slate-600">円以上で売れた商品</span>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded bg-emerald-600 px-4 py-2.5 text-sm text-white font-medium min-h-[44px] touch-manipulation hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
        >
          検索
        </button>
        {minProfit && (
          <button
            type="button"
            onClick={() => {
              setMinProfit('');
              router.push('/products/by-profit');
            }}
            className="rounded border border-slate-300 px-4 py-2.5 text-sm text-slate-600 min-h-[44px] touch-manipulation hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1"
          >
            クリア
          </button>
        )}
      </div>
    </form>
  );
}
