'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { VoiceInputButton } from './voice-input-button';
import { FilterSortSheet } from './filter-sort-sheet';
import { useCallback, useEffect, useState } from 'react';

type MatchType = 'partial' | 'exact';

export type LocationFilter = '' | 'home' | 'warehouse' | 'fba' | 'both';

export type PlatformFilter = '' | 'mercari' | 'rakuma' | 'amazon';

export type SortOption =
  | ''
  | 'updated_desc'
  | 'updated_asc'
  | 'received_desc'
  | 'received_asc'
  | 'stock_desc'
  | 'stock_asc'
  | 'cost_desc'
  | 'cost_asc'
  | 'name_asc'
  | 'name_desc'
  | 'oldest_desc'
  | 'oldest_asc'
  | 'target20_desc'
  | 'target20_asc';

function buildParams(
  trimmed: string,
  match: MatchType,
  setOnly: boolean,
  location: LocationFilter,
  platform: PlatformFilter,
  sort: SortOption,
  minProfit: number
): URLSearchParams {
  const params = new URLSearchParams();
  if (trimmed) {
    params.set('q', trimmed);
    params.set('match', match);
  }
  if (setOnly) params.set('setOnly', '1');
  if (location) params.set('location', location);
  if (platform) params.set('platform', platform);
  if (sort) params.set('sort', sort);
  if (minProfit > 0) params.set('minProfit', String(minProfit));
  return params;
}

export function ProductSearchBar({ basePath }: { basePath: '/products' | '/products/sold-out' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const match = (searchParams.get('match') as MatchType) ?? 'partial';
  const setOnly = searchParams.get('setOnly') === '1';
  const location = (searchParams.get('location') as LocationFilter) ?? '';
  const platform = (searchParams.get('platform') as PlatformFilter) ?? '';
  const sort = (searchParams.get('sort') as SortOption) ?? '';
  const minProfit = Math.max(0, parseInt(searchParams.get('minProfit') ?? '0', 10) || 0);

  const [inputValue, setInputValue] = useState(q);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setInputValue(q), [q]);

  const applyFilters = useCallback(
    (f: { location: LocationFilter; platform: PlatformFilter; setOnly: boolean; minProfit: number; sort: SortOption }) => {
      const params = buildParams(inputValue.trim(), match, f.setOnly, f.location, f.platform, f.sort, f.minProfit);
      const query = params.toString();
      router.push(query ? `${basePath}?${query}` : basePath);
    },
    [inputValue, match, basePath, router]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const params = buildParams(inputValue.trim(), match, setOnly, location, platform, sort, minProfit);
      const query = params.toString();
      router.push(query ? `${basePath}?${query}` : basePath);
    },
    [inputValue, match, setOnly, location, platform, sort, minProfit, basePath, router]
  );

  const handleMatchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMatch = e.target.value as MatchType;
    const params = buildParams(inputValue.trim(), newMatch, setOnly, location, platform, sort, minProfit);
    router.push(params.toString() ? `${basePath}?${params.toString()}` : basePath);
  };

  const handleClear = () => {
    setInputValue('');
    router.push(basePath);
  };

  const filterCount = [setOnly, location, platform, minProfit > 0, sort].filter(Boolean).length;

  return (
    <>
      <form onSubmit={handleSubmit} className="flex items-center gap-2 w-full min-w-0">
        <div className="flex flex-1 min-w-0 rounded border border-slate-300 overflow-hidden bg-white focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-transparent">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="商品名で検索"
            className="flex-1 min-w-0 px-3 py-2.5 text-base min-h-[44px] touch-manipulation focus:outline-none border-0"
            aria-label="商品名検索"
          />
          <VoiceInputButton
            onResult={(text) => setInputValue(text)}
            className="rounded-none border-0 border-l border-slate-200 shrink-0"
            size="md"
            title="音声で検索"
          />
        </div>
        <select
          value={match}
          onChange={handleMatchChange}
          className="shrink-0 rounded border border-slate-300 px-2 py-2.5 text-sm min-h-[44px] touch-manipulation focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          aria-label="部分一致/完全一致"
          title="部分一致/完全一致"
        >
          <option value="partial">部分</option>
          <option value="exact">完全</option>
        </select>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="shrink-0 rounded border border-slate-300 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-white hover:bg-slate-50"
          aria-label="フィルター・ソート"
          title="フィルター・ソート"
        >
          {filterCount > 0 ? (
            <span className="relative inline-flex">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="21" x2="4" y2="14" />
                <line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" />
                <line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" />
                <line x1="9" y1="8" x2="15" y2="8" />
                <line x1="17" y1="16" x2="23" y2="16" />
              </svg>
              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                {filterCount}
              </span>
            </span>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          )}
        </button>
        <button
          type="submit"
          className="shrink-0 rounded bg-emerald-600 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-white hover:bg-emerald-700"
          aria-label="検索"
          title="検索"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </button>
        {(q || inputValue || setOnly || location || platform || sort || minProfit > 0) && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 rounded border border-slate-300 px-3 py-2.5 text-sm text-slate-600 min-h-[44px] hover:bg-slate-50"
          >
            クリア
          </button>
        )}
      </form>

      <FilterSortSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onApply={applyFilters}
        initial={{ location, platform, setOnly, minProfit, sort }}
        showLocation={basePath === '/products'}
        showPlatform={true}
      />
    </>
  );
}
