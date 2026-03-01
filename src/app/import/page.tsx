'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Nav } from '@/components/nav';

export default function ImportPage() {
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [skipFirstRow, setSkipFirstRow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<'upload' | 'process' | null>(null);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    errors: string[];
    imageCount?: number;
  } | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleImport = async () => {
    if (!excelFile) return;
    setLoading(true);
    setResult(null);
    setLoadingPhase('upload');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setResult({ created: 0, updated: 0, errors: ['ログインしてください'] });
        setLoading(false);
        return;
      }

      const uuid = crypto.randomUUID();
      const excelPath = `${user.id}/import-temp/${uuid}.xlsx`;

      const { error: excelErr } = await supabase.storage
        .from('product-images')
        .upload(excelPath, excelFile, { upsert: true });

      if (excelErr) {
        setResult({
          created: 0,
          updated: 0,
          errors: ['Excelのアップロードに失敗しました: ' + excelErr.message],
        });
        setLoading(false);
        return;
      }

      let zipPath: string | null = null;
      if (zipFile) {
        const zipUuid = crypto.randomUUID();
        zipPath = `${user.id}/import-temp/${zipUuid}.zip`;
        const { error: zipErr } = await supabase.storage
          .from('product-images')
          .upload(zipPath, zipFile, { upsert: true });
        if (zipErr) {
          setResult({
            created: 0,
            updated: 0,
            errors: ['画像ZIPのアップロードに失敗しました: ' + zipErr.message],
          });
          setLoading(false);
          return;
        }
      }

      setLoadingPhase('process');
      const formData = new FormData();
      formData.append('excelPath', excelPath);
      formData.append('skipFirstRow', String(skipFirstRow));
      if (zipPath) formData.append('zipPath', zipPath);

      const formDataToSend = formData;

      const doImport = async (force: boolean) => {
        if (force) formDataToSend.append('forceImport', 'true');
        const res = await fetch('/api/import-excel', { method: 'POST', body: formDataToSend });
        const text = await res.text();
        let data: { error?: string; created?: number; updated?: number; errors?: string[]; imageCount?: number; alreadyImported?: boolean; message?: string };
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          const statusHint =
            res.status === 413
              ? 'ファイルが大きすぎます（上限約5MB）。画像を減らすか、ZIPで画像を分けてください。'
              : res.status >= 500
                ? 'サーバーエラーです。しばらく後に再試行してください。'
                : '';
          setResult({
            created: 0,
            updated: 0,
            errors: [
              `取込に失敗しました (${res.status}): ${text.slice(0, 80)}${text.length > 80 ? '...' : ''}`,
              statusHint,
            ].filter(Boolean),
          });
          return { ok: false };
        }

        if (data.alreadyImported && data.message && !force) {
          const confirmed = window.confirm(data.message);
          if (confirmed) return { retry: true };
          return { ok: false };
        }

        if (!res.ok) {
          setResult({ created: 0, updated: 0, errors: [data.error || res.statusText] });
          return { ok: false };
        }

        setResult({
          created: data.created ?? 0,
          updated: data.updated ?? 0,
          errors: data.errors ?? [],
          imageCount: data.imageCount,
        });
        return { ok: true };
      };

      let result = await doImport(false);
      if (result?.retry) {
        await doImport(true);
      }
    } catch (e) {
      setResult({
        created: 0,
        updated: 0,
        errors: ['取込に失敗しました: ' + (e instanceof Error ? e.message : String(e))],
      });
    } finally {
      setLoading(false);
      setLoadingPhase(null);
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
              推奨列: 商品名, THE CKB SKU, 規格, 商品数, 1個あたりのコスト（円）, 出荷日など。CKB商品管理シート.xlsx は埋め込み画像・規格（サイズ/色）・商品数・出荷日（→入荷日）に自動対応します。同一SKUは在庫合算・原価は加重平均で統一されます。
            </p>
            <p className="text-xs text-slate-500 mb-1">
              ※ExcelはSupabaseに直接アップロードするため、大容量ファイル（埋め込み画像含む）も取り込めます。
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
            {loading
              ? loadingPhase === 'upload'
                ? 'Excelをアップロード中...'
                : '取り込み処理中...（数十秒かかることがあります）'
              : '取り込み実行'}
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
{`商品名 | THE CKB SKU | 規格 | 商品数 | 1個あたりのコスト（円） | 出荷日 | 備考
防鳥ネット | 7d126de6... | 色:緑; 規格:幅5m×長20m | 10 | 415 | 2025-02-15 | テスト用

※商品数→在庫、出荷日→入荷日に自動反映。規格からサイズ/色を自動抽出。
※CKB商品管理シート.xlsx は埋め込み画像を自動取込`}
          </pre>
        </div>
      </main>
    </div>
  );
}
