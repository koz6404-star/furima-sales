'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Nav } from '@/components/nav';

export default function ImportPage() {
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [skipFirstRow, setSkipFirstRow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    errors: string[];
    imageCount?: number;
  } | null>(null);
  const router = useRouter();

  const handleImport = async () => {
    if (!excelFile) return;
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', excelFile);
      formData.append('skipFirstRow', String(skipFirstRow));
      if (zipFile) formData.append('zipFile', zipFile);

      const res = await fetch('/api/import-excel', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        setResult({ created: 0, updated: 0, errors: [data.error || res.statusText] });
      } else {
        setResult({
          created: data.created ?? 0,
          updated: data.updated ?? 0,
          errors: data.errors ?? [],
          imageCount: data.imageCount,
        });
      }
    } catch (e) {
      setResult({
        created: 0,
        updated: 0,
        errors: ['取込に失敗しました: ' + (e instanceof Error ? e.message : String(e))],
      });
    } finally {
      setLoading(false);
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Excel取り込み</h1>
        <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-6">
          <div>
            <h2 className="font-semibold mb-2">1. Excelファイル（.xlsx）</h2>
            <p className="text-sm text-slate-600 mb-2">
              推奨列: 商品名, THE CKB SKU, 規格, 商品数, 1個あたりのコスト（円）など。CKB商品管理シート.xlsx は埋め込み画像・規格（サイズ/色）・商品数に自動対応します。
            </p>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
              className="w-full rounded border px-3 py-2"
            />
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={skipFirstRow}
                onChange={(e) => setSkipFirstRow(e.target.checked)}
                className="rounded"
              />
              1行目をスキップ（タイトル行がある場合）
            </label>
          </div>
          <div>
            <h2 className="font-semibold mb-2">2. 画像ZIP（任意）</h2>
            <p className="text-sm text-slate-600 mb-2">
              ZIP内の画像をSKU/商品名/行番号で紐付け。Excelに「画像」列でファイル名（例: A001.jpg）を指定すると確実です。
            </p>
            <input
              type="file"
              accept=".zip"
              onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
              className="w-full rounded border px-3 py-2"
            />
          </div>
          <button
            onClick={handleImport}
            disabled={loading || !excelFile}
            className="rounded bg-emerald-600 px-4 py-2 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? '取込中...（数十秒かかる場合があります）' : '取り込み実行'}
          </button>
        </div>
        {result && (
          <div className="mt-6 rounded-lg border p-4 bg-slate-50">
            <p className="font-medium">
              結果: 新規 {result.created}件, 更新 {result.updated}件
              {result.imageCount !== undefined && (
                <span className="ml-2 text-slate-600">画像 {result.imageCount}件反映</span>
              )}
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 text-sm text-red-600">
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {result.errors.length > 10 && <li>...他{result.errors.length - 10}件</li>}
              </ul>
            )}
          </div>
        )}
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="font-semibold mb-2">Excelテンプレート例</h2>
          <p className="text-sm text-slate-600">
            1行=1商品。SKUが既存と一致すれば更新、なければ新規。列名のゆらぎは推測マッピングで対応します。
          </p>
          <pre className="mt-4 p-4 bg-slate-100 rounded text-sm overflow-x-auto">
{`商品名 | THE CKB SKU | 規格 | 商品数 | 1個あたりのコスト（円） | 備考
防鳥ネット | 7d126de6... | 色:緑; 規格:幅5m×長20m | 10 | 415 | テスト用

※商品数→在庫に自動反映。規格からサイズ/色を自動抽出。
※CKB商品管理シート.xlsx は埋め込み画像を自動取込`}
          </pre>
        </div>
      </main>
    </div>
  );
}
