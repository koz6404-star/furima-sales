'use client';

import { useState } from 'react';

function useDownload() {
  const [loading, setLoading] = useState<string | null>(null);

  const download = async (url: string, fallbackFilename: string) => {
    setLoading(url);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`エラー: ${res.status}`);
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition');
      const match = disposition?.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? fallbackFilename;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      alert('ダウンロードに失敗しました。ページを再読み込みしてお試しください。');
    } finally {
      setLoading(null);
    }
  };

  return { loading, download };
}

export function ExportDownloadClient() {
  const { loading, download } = useDownload();

  return (
    <div className="flex gap-2 flex-wrap">
      <button
        type="button"
        disabled={loading !== null}
        onClick={() => download('/api/export-analysis', 'strategy_analysis.csv')}
        className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {loading === '/api/export-analysis' ? 'ダウンロード中...' : 'CSV形式でダウンロード'}
      </button>
      <button
        type="button"
        disabled={loading !== null}
        onClick={() => download('/api/export-analysis?format=md', 'strategy_analysis.md')}
        className="rounded bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {loading === '/api/export-analysis?format=md' ? 'ダウンロード中...' : 'Markdown形式でダウンロード'}
      </button>
    </div>
  );
}
