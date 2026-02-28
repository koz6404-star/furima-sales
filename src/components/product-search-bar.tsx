'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type MatchType = 'partial' | 'exact';

export function ProductSearchBar({ basePath }: { basePath: '/products' | '/products/sold-out' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const match = (searchParams.get('match') as MatchType) ?? 'partial';

  const [inputValue, setInputValue] = useState(q);
  useEffect(() => setInputValue(q), [q]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = inputValue.trim();
      const params = new URLSearchParams();
      if (trimmed) {
        params.set('q', trimmed);
        params.set('match', match);
      }
      const query = params.toString();
      router.push(query ? `${basePath}?${query}` : basePath);
    },
    [inputValue, match, basePath, router]
  );

  const handleMatchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMatch = e.target.value as MatchType;
    const trimmed = inputValue.trim();
    const params = new URLSearchParams();
    if (trimmed) {
      params.set('q', trimmed);
      params.set('match', newMatch);
    }
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  };

  const handleClear = () => {
    setInputValue('');
    router.push(basePath);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="商品名で検索"
        className="rounded border border-slate-300 px-3 py-2 text-sm w-48 sm:w-56 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        aria-label="商品名検索"
      />
      <select
        value={match}
        onChange={handleMatchChange}
        className="rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        aria-label="検索条件"
      >
        <option value="partial">部分一致</option>
        <option value="exact">完全一致</option>
      </select>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded bg-emerald-600 px-4 py-2 text-sm text-white font-medium hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
        >
          検索
        </button>
        {(q || inputValue) && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1"
          >
            クリア
          </button>
        )}
      </div>
    </form>
  );
}
