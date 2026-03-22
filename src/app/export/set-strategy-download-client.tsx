'use client';

import { useState } from 'react';

export function SetStrategyDownloadClient() {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/export-set-strategy');
      if (!res.ok) throw new Error(`エラー: ${res.status}`);
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition');
      const match = disposition?.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? 'set_strategy.md';
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
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      disabled={loading}
      onClick={handleDownload}
      className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
    >
      {loading ? 'ダウンロード中...' : 'セット化戦略データをダウンロード'}
    </button>
  );
}
