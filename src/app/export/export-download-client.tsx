'use client';

export function ExportDownloadClient() {
  const handleDownload = () => {
    window.open('/api/export-analysis?days=90', '_blank');
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
    >
      戦略分析データをダウンロード
    </button>
  );
}
