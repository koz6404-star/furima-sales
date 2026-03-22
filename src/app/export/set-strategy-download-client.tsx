'use client';

export function SetStrategyDownloadClient() {
  return (
    <button
      type="button"
      onClick={() => window.open('/api/export-set-strategy', '_blank')}
      className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
    >
      セット化戦略データをダウンロード
    </button>
  );
}
