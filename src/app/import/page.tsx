'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { createClient } from '@/lib/supabase/client';
import { Nav } from '@/components/nav';

interface ExcelRow {
  [key: string]: string | number | undefined;
}

export default function ImportPage() {
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [skipFirstRow, setSkipFirstRow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const normalizeKey = (s: string) => String(s).trim().toLowerCase().replace(/[\s　]/g, '');
  const findColumn = (row: ExcelRow, candidates: string[]) => {
    for (const c of candidates) {
      const v = row[c];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    const keys = Object.keys(row);
    for (const k of keys) {
      const nk = normalizeKey(k);
      for (const c of candidates) {
        const nc = normalizeKey(c);
        if (!nc) continue;
        if (nk.includes(nc) || nc.includes(nk)) {
          const v = row[k];
          if (v !== undefined && v !== null && v !== '') return v;
        }
      }
    }
    return undefined;
  };

  const normalizeRow = (row: ExcelRow) => {
    const costVal = findColumn(row, [
      '原価（税込）', '原価(税込)', '原価', 'げんか', '成本', '仕入価格', 'cost', 'COST',
    ]);
    const stockVal = findColumn(row, [
      '在庫数', '在庫', '仕入れ数', '仕入れの個数', '購入数', '購入した個数', '入荷数',
      'stock', 'STOCK', '数量',
    ]);
    return {
      sku: String(findColumn(row, ['SKU', 'sku', '品番', '商品コード']) ?? '').trim() || undefined,
      name: String(findColumn(row, ['商品名', 'name', '品名']) ?? '').trim(),
      costYen: Math.round(Number(costVal ?? 0)),
      stock: Math.max(0, Math.floor(Number(stockVal ?? 0))),
      memo: String(findColumn(row, ['メモ', 'memo', '備考']) ?? '').trim() || undefined,
      campaign: String(findColumn(row, ['企画', 'キャンペーン', 'campaign']) ?? '').trim() || undefined,
      size: String(findColumn(row, ['サイズ', 'size', '規格', 'SIZE', 'サイズ（cm）', 'サイズ(cm)']) ?? '').trim() || undefined,
      color: String(findColumn(row, ['色', 'カラー', 'color', 'COLOR', 'colour']) ?? '').trim() || undefined,
      imageRef: String(findColumn(row, ['画像', '画像ファイル', 'image', '写真', 'ファイル名']) ?? '').trim() || undefined,
    };
  };

  const findImageInMap = (
    imageMap: Map<string, Blob>,
    opts: { imageRef?: string; sku?: string; name?: string; rowIndex?: number }
  ): Blob | undefined => {
    const { imageRef, sku, name, rowIndex } = opts;
    const candidates: string[] = [];
    if (imageRef) {
      const base = imageRef.replace(/\.[^.]+$/, '').trim();
      candidates.push(imageRef, base, base.replace(/[-_\s]/g, ''), base.replace(/[-_\s]/g, '').toLowerCase());
    }
    if (sku) {
      candidates.push(sku, sku.replace(/[-_\s]/g, ''), sku.replace(/[-_\s]/g, '').toLowerCase());
    }
    if (name) {
      candidates.push(name.slice(0, 30), name.slice(0, 15).replace(/[-_\s]/g, ''), name.replace(/[-_\s]/g, '').slice(0, 20));
    }
    if (rowIndex !== undefined) {
      candidates.push(String(rowIndex + 1), String(rowIndex), String(rowIndex + 2));
    }
    for (const c of candidates) {
      const found = imageMap.get(c);
      if (found) return found;
    }
    const skuNorm = sku?.replace(/[-_\s]/g, '').toLowerCase();
    const nameShort = name?.slice(0, 10);
    for (const [key] of imageMap) {
      const k = key.replace(/[-_\s]/g, '').toLowerCase();
      if (skuNorm && k.includes(skuNorm)) return imageMap.get(key);
      if (nameShort && (key.includes(nameShort) || k.includes(nameShort.replace(/[-_\s]/g, '')))) return imageMap.get(key);
    }
    return undefined;
  };

  const getImageExt = (blob: Blob): string => {
    const m: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
    return m[blob.type] || 'jpg';
  };

  const parseExcelWithXlsx = (file: File): Promise<{ rows: ExcelRow[] }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array', cellStyles: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const opts: { range?: number } = {};
          if (skipFirstRow) opts.range = 1;
          const rows = XLSX.utils.sheet_to_json<ExcelRow>(ws, opts);
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
    const entries = Object.entries(zip.files).filter(([p, e]) => !e.dir && /\.(png|jpg|jpeg|gif|webp)$/i.test(p));
    let idx = 0;
    for (const [path, entry] of entries) {
      const blob = await entry.async('blob');
      const fullName = path.replace(/^.*[/\\]/, '');
      const base = fullName.replace(/\.[^.]+$/, '');
      images.set(fullName, blob);
      images.set(base, blob);
      images.set(base.replace(/[-_\s]/g, ''), blob);
      images.set(base.replace(/[-_\s]/g, '').toLowerCase(), blob);
      images.set(String(++idx), blob);
      images.set(String(idx - 1), blob);
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
      if (rows.length === 0) {
        errors.push('有効なデータ行がありません。1行目がヘッダーか、「1行目をスキップ」を試してください。');
      }
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
        const imgBlob = findImageInMap(imageMap, {
          imageRef: r.imageRef,
          sku: r.sku,
          name: r.name,
          rowIndex: i,
        });
        if (imgBlob) {
          const ext = getImageExt(imgBlob);
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
              campaign: r.campaign || null,
              size: r.size || null,
              color: r.color || null,
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
            campaign: r.campaign || null,
            size: r.size || null,
            color: r.color || null,
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
              推奨列: SKU, 商品名, 原価（税込）, 在庫数, 企画, サイズ, 色, メモ
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
{`SKU | 商品名 | 原価（税込） | 在庫数 | 企画 | サイズ | 色 | 画像 | メモ
A001 | サンプル商品 | 1000 | 5 | 春フェア | M | 赤 | A001.jpg | テスト用

※サイズ・色は「規格」「カラー」などの列名でも可
※画像列でZIP内のファイル名を指定すると確実に紐付きます`}
          </pre>
        </div>
      </main>
    </div>
  );
}
