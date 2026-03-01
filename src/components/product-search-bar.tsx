'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type MatchType = 'partial' | 'exact';

type LocationFilter = '' | 'home' | 'warehouse' | 'both';

function buildParams(trimmed: string, match: MatchType, setOnly: boolean, location: LocationFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (trimmed) {
    params.set('q', trimmed);
    params.set('match', match);
  }
  if (setOnly) params.set('setOnly', '1');
  if (location) params.set('location', location);
  return params;
}

export function ProductSearchBar({ basePath }: { basePath: '/products' | '/products/sold-out' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const match = (searchParams.get('match') as MatchType) ?? 'partial';
  const setOnly = searchParams.get('setOnly') === '1';
  const location = (searchParams.get('location') as LocationFilter) ?? '';

  const [inputValue, setInputValue] = useState(q);
  useEffect(() => setInputValue(q), [q]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = inputValue.trim();
      const params = buildParams(trimmed, match, setOnly, location);
      const query = params.toString();
      router.push(query ? `${basePath}?${query}` : basePath);
    },
    [inputValue, match, setOnly, location, basePath, router]
  );

  const handleMatchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMatch = e.target.value as MatchType;
    const params = buildParams(inputValue.trim(), newMatch, setOnly, location);
    router.push(params.toString() ? `${basePath}?${params.toString()}` : basePath);
  };

  const handleSetOnlyToggle = () => {
    const params = buildParams(inputValue.trim(), match, !setOnly, location);
    router.push(params.toString() ? `${basePath}?${params.toString()}` : basePath);
  };

  const handleLocationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLoc = e.target.value as LocationFilter;
    const params = buildParams(inputValue.trim(), match, setOnly, newLoc);
    router.push(params.toString() ? `${basePath}?${params.toString()}` : basePath);
  };

  const handleClear = () => {
    setInputValue('');
    router.push(basePath);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-stretch gap-2 w-full sm:w-auto">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="商品名で検索"
        className="flex-1 min-w-0 sm:flex-initial sm:w-48 md:w-56 rounded border border-slate-300 px-3 py-2.5 text-base sm:text-sm min-h-[44px] touch-manipulation focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        aria-label="商品名検索"
      />
      <select
        value={match}
        onChange={handleMatchChange}
        className="rounded border border-slate-300 px-3 py-2.5 text-base sm:text-sm min-h-[44px] touch-manipulation focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        aria-label="検索条件"
      >
        <option value="partial">部分一致</option>
        <option value="exact">完全一致</option>
      </select>
      {basePath === '/products' && (
        <select
          value={location}
          onChange={handleLocationChange}
          className="rounded border border-slate-300 px-3 py-2.5 text-base sm:text-sm min-h-[44px] touch-manipulation focus:outline-none focus:ring-2 focus:ring-emerald-500"
          aria-label="保管場所フィルター"
        >
          <option value="">保管場所: 全て</option>
          <option value="home">家のみ</option>
          <option value="warehouse">倉庫のみ</option>
          <option value="both">両方</option>
        </select>
      )}
      <label className="flex items-center gap-2 rounded border border-slate-300 px-3 py-2.5 min-h-[44px] cursor-pointer hover:bg-slate-50">
        <input
          type="checkbox"
          checked={setOnly}
          onChange={handleSetOnlyToggle}
          className="rounded border-slate-300"
        />
        <span className="text-sm whitespace-nowrap">セット品のみ</span>
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded bg-emerald-600 px-4 py-2.5 text-sm text-white font-medium min-h-[44px] touch-manipulation hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
        >
          検索
        </button>
        {(q || inputValue || setOnly || location) && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded border border-slate-300 px-4 py-2.5 text-sm text-slate-600 min-h-[44px] touch-manipulation hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1"
          >
            クリア
          </button>
        )}
      </div>
    </form>
  );
}
