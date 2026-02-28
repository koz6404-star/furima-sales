'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { createClient } from '@/lib/supabase/client';
import { Nav } from '@/components/nav';

interface ExcelRow {
  SKU?: string;
  商品名?: string;
  原価?: number | string;
  在庫数?: number | string;
  メモ?: string;
  [key: string]: string | number | undefined;
}

export default function ImportPage() {
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const normalizeRow = (row: ExcelRow) => {
    const findVal = (keys: string[]) => {
      for (const k of keys) {
        const v = row[k];
        if (v !== undefined && v !== null && v !== '') return v;
      }
      return undefined;
    };
    return {
      sku: String(findVal(['SKU', 'sku', '品番']) ?? '').trim() || undefined,
      name: String(findVal(['商品名', 'name', '商品名']) ?? '').trim(),
      costYen: Math.round(Number(findVal(['原価（税込）', '原価', 'cost', '原価(税込)']) ?? 0)),
      stock: Math.max(0, Math.floor(Number(findVal(['在庫数', 'stock', '在庫']) ?? 0))),
      memo: String(findVal(['メモ', 'memo']) ?? '').trim() || undefined,
    };
  };

  const parseExcelWithXlsx = (file: File): Promise<{ rows: ExcelRow[]; images?: Map<string, Blob> }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array', cellStyles: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<ExcelRow>(ws);
          resolve({ rows });
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const parseZipImages = async (file: File): Promise<Map<string, Blob>> => {
    const zip = await JSZip.loadAsync(file);
    const images = new Map<string, Blob>();
    for (const [path, entry] of Object.entries(zip.files)) {
      if (!entry.dir && /\.(png|jpg|jpeg|gif)$/i.test(path)) {
        const blob = await entry.async('blob');
        const base = path.replace(/^.*\//, '').replace(/\.[^.]+$/, '');
        images.set(base, blob);
      }
    }
    return images;
  };

  const handleImport = async () => {
    if (!excelFile) return;
    setLoading(true);
    setResult(null);
    const errors: string[] = [];
    let created = 0;
    let updated = 0;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setResult({ created: 0, updated: 0, errors: ['ログインしてください'] });
      setLoading(false);
      return;
    }

    let imageMap = new Map<string, Blob>();
    if (zipFile) {
      try {
        imageMap = await parseZipImages(zipFile);
      } catch (e) {
        errors.push('ZIP画像の読み込みに失敗: ' + (e instanceof Error ? e.message : String(e)));
      }
    }

    try {
      const { rows } = await parseExcelWithXlsx(excelFile);
      for (let i = 0; i < rows.length; i++) {
        const r = normalizeRow(rows[i]);
        if (!r.name) {
          errors.push(`行${i + 2}: 商品名が空です`);
          continue;
        }
        if (r.costYen < 0) {
          errors.push(`行${i + 2}: 原価が不正です`);
          continue;
        }
        let imageUrl: string | null = null;
        const skuForImage = r.sku || r.name;
        const imgBlob = imageMap.get(skuForImage) || imageMap.get(String(i + 1));
        if (imgBlob) {
          const ext = (zipFile?.name || '').includes('.') ? 'jpg' : 'jpg';
          const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from('product-images')
            .upload(path, imgBlob, { upsert: true });
          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
            imageUrl = urlData.publicUrl;
          }
        }
        const existing = r.sku
          ? (await supabase.from('products').select('id').eq('user_id', user.id).eq('sku', r.sku).single()).data
          : null;
        if (existing) {
          const { error } = await supabase
            .from('products')
            .update({
              name: r.name,
              cost_yen: r.costYen,
              stock: r.stock,
              memo: r.memo,
              ...(imageUrl && { image_url: imageUrl }),
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          if (error) errors.push(`行${i + 2}: ${error.message}`);
          else updated++;
        } else {
          const { error } = await supabase.from('products').insert({
            user_id: user.id,
            sku: r.sku || null,
            name: r.name,
            cost_yen: r.costYen,
            stock: r.stock,
            memo: r.memo || null,
            image_url: imageUrl,
          });
          if (error) errors.push(`行${i + 2}: ${error.message}`);
          else created++;
        }
      }
    } catch (e) {
      errors.push('Excelの解析に失敗: ' + (e instanceof Error ? e.message : String(e)));
    }

    setResult({ created, updated, errors });
    setLoading(false);
    router.refresh();
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
              推奨列: SKU, 商品名, 原価（税込）, 在庫数, メモ
            </p>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
              className="w-full rounded border px-3 py-2"
            />
          </div>
          <div>
            <h2 className="font-semibold mb-2">2. 画像ZIP（任意・フォールバック）</h2>
            <p className="text-sm text-slate-600 mb-2">
              Excelに画像が埋め込まれていない場合、ZIP内の画像をSKUまたはファイル名で紐付け。ファイル名=SKU（拡張子除く）
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
            {loading ? '取込中...' : '取り込み実行'}
          </button>
        </div>
        {result && (
          <div className="mt-6 rounded-lg border p-4 bg-slate-50">
            <p className="font-medium">結果: 新規 {result.created}件, 更新 {result.updated}件</p>
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
{`SKU | 商品名 | 原価（税込） | 在庫数 | メモ
A001 | サンプル商品 | 1000 | 5 | テスト用`}
          </pre>
        </div>
      </main>
    </div>
  );
}
