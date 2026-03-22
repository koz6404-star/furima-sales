'use client';

export function ExportDownloadClient() {
  return (
    <div className="flex gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => window.open('/api/export-analysis', '_blank')}
        className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
      >
        CSV形式でダウンロード
      </button>
      <button
        type="button"
        onClick={() => window.open('/api/export-analysis?format=md', '_blank')}
        className="rounded bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Markdown形式でダウンロード
      </button>
    </div>
  );
}
