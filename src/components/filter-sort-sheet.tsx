'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SortOption, PlatformFilter } from './product-search-bar';

type LocationFilter = '' | 'home' | 'warehouse' | 'fba' | 'both';

const SORT_LABELS: Record<SortOption, string> = {
  '': '更新日（新しい順）',
  updated_desc: '更新日（新しい順）',
  updated_asc: '更新日（古い順）',
  received_desc: '入荷日（新しい順）',
  received_asc: '入荷日（古い順）',
  stock_desc: '在庫数（多い順）',
  stock_asc: '在庫数（少ない順）',
  cost_desc: '原価（高い順）',
  cost_asc: '原価（低い順）',
  name_asc: '商品名（あいうえお）',
  name_desc: '商品名（逆順）',
  oldest_desc: '滞留在庫（新しい順）',
  oldest_asc: '滞留在庫（古い順）',
  target20_desc: '目安価格20%（高い順）',
  target20_asc: '目安価格20%（低い順）',
};

const SORT_OPTIONS: SortOption[] = [
  '',
  'updated_desc',
  'updated_asc',
  'received_desc',
  'received_asc',
  'stock_desc',
  'stock_asc',
  'cost_desc',
  'cost_asc',
  'name_asc',
  'name_desc',
  'oldest_desc',
  'oldest_asc',
  'target20_desc',
  'target20_asc',
];

type Props = {
  open: boolean;
  onClose: () => void;
  onApply: (filters: {
    location: LocationFilter;
    platform: PlatformFilter;
    setOnly: boolean;
    minProfit: number;
    sort: SortOption;
  }) => void;
  initial: {
    location: LocationFilter;
    platform: PlatformFilter;
    setOnly: boolean;
    minProfit: number;
    sort: SortOption;
  };
  showLocation?: boolean;
  showPlatform?: boolean;
};

export function FilterSortSheet({
  open,
  onClose,
  onApply,
  initial,
  showLocation = true,
  showPlatform = false,
}: Props) {
  const [location, setLocation] = useState<LocationFilter>(initial.location);
  const [platform, setPlatform] = useState<PlatformFilter>(initial.platform);
  const [setOnly, setSetOnly] = useState(initial.setOnly);
  const [minProfit, setMinProfit] = useState(String(initial.minProfit || ''));
  const [sort, setSort] = useState<SortOption>(initial.sort);

  useEffect(() => {
    if (open) {
      setLocation(initial.location);
      setPlatform(initial.platform);
      setSetOnly(initial.setOnly);
      setMinProfit(String(initial.minProfit || ''));
      setSort(initial.sort);
    }
  }, [open, initial.location, initial.platform, initial.setOnly, initial.minProfit, initial.sort]);

  const handleApply = useCallback(() => {
    const n = Math.max(0, parseInt(minProfit.replace(/[^0-9]/g, ''), 10) || 0);
    onApply({ location, platform, setOnly, minProfit: n, sort });
    onClose();
  }, [location, platform, setOnly, minProfit, sort, onApply, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white shadow-xl max-h-[85vh] overflow-y-auto"
        role="dialog"
        aria-label="フィルター・ソート"
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">フィルター・ソート</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -m-2 rounded-lg hover:bg-slate-100"
            aria-label="閉じる"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-6">
          {/* フィルター */}
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">フィルター</h3>
            <div className="space-y-4">
              {showPlatform && (
                <div>
                  <label className="block text-sm text-slate-600 mb-1">プラットフォーム</label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as PlatformFilter)}
                    className="w-full rounded border border-slate-300 px-3 py-2.5 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">全て</option>
                    <option value="mercari">メルカリ</option>
                    <option value="rakuma">ラクマ</option>
                    <option value="amazon">Amazon</option>
                  </select>
                </div>
              )}
              {showLocation && (
                <div>
                  <label className="block text-sm text-slate-600 mb-1">保管場所</label>
                  <select
                    value={location}
                    onChange={(e) => setLocation(e.target.value as LocationFilter)}
                    className="w-full rounded border border-slate-300 px-3 py-2.5 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">全て</option>
                    <option value="home">家のみ</option>
                    <option value="warehouse">倉庫のみ</option>
                    <option value="fba">FBAのみ</option>
                    <option value="both">家・倉庫の両方</option>
                  </select>
                </div>
              )}
              <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={setOnly}
                  onChange={(e) => setSetOnly(e.target.checked)}
                  className="rounded border-slate-300 w-5 h-5"
                />
                <span className="text-base">セット品のみ</span>
              </label>
              <div>
                <label htmlFor="minProfit" className="block text-sm text-slate-600 mb-1">
                  利益いくら以上で売れた商品
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="minProfit"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={minProfit}
                    onChange={(e) => setMinProfit(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="例: 1000"
                    className="w-28 rounded border border-slate-300 px-3 py-2.5 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-slate-600">円以上</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  販売履歴で指定した利益以上で売れた商品を表示
                </p>
              </div>
            </div>
          </section>

          {/* ソート */}
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">並べ替え</h3>
            <div className="space-y-1">
              {SORT_OPTIONS.map((opt) => (
                <label
                  key={opt || 'default'}
                  className={`flex items-center gap-3 cursor-pointer py-3 px-3 rounded-lg min-h-[44px] ${sort === opt ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                >
                  <input
                    type="radio"
                    name="sort"
                    value={opt}
                    checked={sort === opt}
                    onChange={() => setSort(opt)}
                    className="w-5 h-5 border-slate-300"
                  />
                  <span className="text-base">{SORT_LABELS[opt]}</span>
                </label>
              ))}
            </div>
          </section>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={handleApply}
            className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-base font-medium text-white hover:bg-emerald-700 min-h-[48px] touch-manipulation"
          >
            反映する
          </button>
        </div>
      </div>
    </>
  );
}
