'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { VoiceInputButton } from './voice-input-button';
import { useCallback, useEffect, useState } from 'react';

type MatchType = 'partial' | 'exact';

type LocationFilter = '' | 'home' | 'warehouse' | 'both';

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
  sort: SortOption
): URLSearchParams {
  const params = new URLSearchParams();
  if (trimmed) {
    params.set('q', trimmed);
    params.set('match', match);
  }
  if (setOnly) params.set('setOnly', '1');
  if (location) params.set('location', location);
  if (sort) params.set('sort', sort);
  return params;
}

export function ProductSearchBar({ basePath }: { basePath: '/products' | '/products/sold-out' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const match = (searchParams.get('match') as MatchType) ?? 'partial';
  const setOnly = searchParams.get('setOnly') === '1';
  const location = (searchParams.get('location') as LocationFilter) ?? '';
  const sort = (searchParams.get('sort') as SortOption) ?? '';

  const [inputValue, setInputValue] = useState(q);
  useEffect(() => setInputValue(q), [q]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const params = buildParams(inputValue.trim(), match, setOnly, location, sort);
      const query = params.toString();
      router.push(query ? `${basePath}?${query}` : basePath);
    },
    [inputValue, match, setOnly, location, sort, basePath, router]
  );

  const handleMatchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMatch = e.target.value as MatchType;
    const params = buildParams(inputValue.trim(), newMatch, setOnly, location, sort);
    router.push(params.toString() ? `${basePath}?${params.toString()}` : basePath);
  };

  const handleSetOnlyToggle = () => {
    const params = buildParams(inputValue.trim(), match, !setOnly, location, sort);
    router.push(params.toString() ? `${basePath}?${params.toString()}` : basePath);
  };

  const handleLocationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLoc = e.target.value as LocationFilter;
    const params = buildParams(inputValue.trim(), match, setOnly, newLoc, sort);
    router.push(params.toString() ? `${basePath}?${params.toString()}` : basePath);
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSort = e.target.value as SortOption;
    const params = buildParams(inputValue.trim(), match, setOnly, location, newSort);
    router.push(params.toString() ? `${basePath}?${params.toString()}` : basePath);
  };

  const handleClear = () => {
    setInputValue('');
    router.push(basePath);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-stretch gap-2 w-full sm:w-auto">
      <div className="flex flex-1 min-w-0 sm:flex-initial sm:w-48 md:w-56 rounded border border-slate-300 overflow-hidden bg-white focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-transparent">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="商品名で検索"
          className="flex-1 min-w-0 px-3 py-2.5 text-base sm:text-sm min-h-[44px] touch-manipulation focus:outline-none border-0"
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
      <select
        value={sort}
        onChange={handleSortChange}
        className="rounded border border-slate-300 px-3 py-2.5 text-base sm:text-sm min-h-[44px] touch-manipulation focus:outline-none focus:ring-2 focus:ring-emerald-500"
        aria-label="並べ替え"
        title="並べ替え"
      >
        <option value="">並べ替え: 更新日順</option>
        <option value="updated_desc">更新日（新しい順）</option>
        <option value="updated_asc">更新日（古い順）</option>
        <option value="received_desc">入荷日（新しい順）</option>
        <option value="received_asc">入荷日（古い順）</option>
        <option value="stock_desc">在庫数（多い順）</option>
        <option value="stock_asc">在庫数（少ない順）</option>
        <option value="cost_desc">原価（高い順）</option>
        <option value="cost_asc">原価（低い順）</option>
        <option value="name_asc">商品名（あいうえお）</option>
        <option value="name_desc">商品名（逆順）</option>
        <option value="oldest_desc">滞留在庫（新しい順）</option>
        <option value="oldest_asc">滞留在庫（古い順）</option>
        <option value="target20_desc">目安価格20%（高い順）</option>
        <option value="target20_asc">目安価格20%（低い順）</option>
      </select>
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
        {(q || inputValue || setOnly || location || sort) && (
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
