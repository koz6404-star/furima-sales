import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
import { createClient } from '@/lib/supabase/server';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { normalizeRow } from '@/lib/import-normalize';

const IMAGE_UPLOAD_CONCURRENCY = 8;
const DB_BATCH_SIZE = 20;

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
) {
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    await Promise.all(chunk.map(fn));
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const zipFile = formData.get('zipFile') as File | null;
    const skipFirstRow = formData.get('skipFirstRow') === 'true';
    if (!file) {
      return NextResponse.json({ error: 'ファイルが必要です' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);
    const rows: Record<string, unknown>[] = [];
    const imageUrlsByIndex: Record<number, string> = {};

    if (file.name.toLowerCase().endsWith('.xlsx')) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      const ws = wb.worksheets[0];
      const xlsxWb = XLSX.read(buf, { type: 'buffer' });
      const xlsxWs = xlsxWb.Sheets[xlsxWb.SheetNames[0]];
      const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(xlsxWs, skipFirstRow ? { range: 1 } : {});
      rows.push(...sheetRows);

      const imgs = ws.getImages?.() ?? [];
      const media = (wb as unknown as { model?: { media?: Array<{ index: number; buffer: Buffer; extension?: string }> } }).model?.media ?? [];
      const uploadTasks: { dataRowIdx: number; buffer: Buffer; ext: string }[] = [];

      for (const img of imgs) {
        const tl = img.range?.tl;
        if (tl == null) continue;
        const excelRow = typeof tl.nativeRow === 'number' ? tl.nativeRow : (tl as { row?: number }).row ?? 0;
        const dataRowIdx = excelRow - 2;
        if (dataRowIdx < 0) continue;
        const mediaItem =
          media.find((m: { index: number }) => Number(m.index) === Number(img.imageId)) ??
          media.find((m: { index: number }) => String(m.index) === String(img.imageId));
        if (mediaItem?.buffer) {
          const ext = mediaItem.extension === 'jpeg' ? 'jpg' : (mediaItem.extension || 'png');
          const buf = Buffer.isBuffer(mediaItem.buffer) ? mediaItem.buffer : Buffer.from(mediaItem.buffer as ArrayBuffer);
          uploadTasks.push({ dataRowIdx, buffer: buf, ext });
        }
      }

      await runWithConcurrency(uploadTasks, IMAGE_UPLOAD_CONCURRENCY, async ({ dataRowIdx, buffer, ext }) => {
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const uploadBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
        const { error } = await supabase.storage
          .from('product-images')
          .upload(path, uploadBuf, { upsert: true, contentType: ext === 'png' ? 'image/png' : 'image/jpeg' });
        if (!error) {
          const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
          imageUrlsByIndex[dataRowIdx] = urlData.publicUrl;
        } else {
          console.error('[import-excel] 画像アップロード失敗:', dataRowIdx, error.message);
        }
      });
    } else {
      const xlsxWb = XLSX.read(buf, { type: 'buffer' });
      const xlsxWs = xlsxWb.Sheets[xlsxWb.SheetNames[0]];
      const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(xlsxWs, skipFirstRow ? { range: 1 } : {});
      rows.push(...sheetRows);
    }

    let imageMap = new Map<string, Buffer>();
    if (zipFile) {
      const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
      const entries = Object.entries(zip.files).filter(([p, e]) => !e.dir && /\.(png|jpg|jpeg|gif|webp)$/i.test(p));
      let idx = 0;
      for (const [path, entry] of entries) {
        const buf = await entry.async('nodebuffer');
        const fullName = path.replace(/^.*[/\\]/, '');
        const base = fullName.replace(/\.[^.]+$/, '');
        imageMap.set(fullName, buf);
        imageMap.set(base, buf);
        imageMap.set(base.replace(/[-_\s]/g, ''), buf);
        imageMap.set(base.replace(/[-_\s]/g, '').toLowerCase(), buf);
        imageMap.set(String(++idx), buf);
        imageMap.set(String(idx - 1), buf);
      }
    }

    const getExt = (buf: Buffer): string => {
      if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
      if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
      return 'jpg';
    };

    const findImageInMap = (
      opts: { imageRef?: string; sku?: string; name?: string; rowIndex?: number }
    ): Buffer | undefined => {
      const { imageRef, sku, name, rowIndex } = opts;
      const candidates: string[] = [];
      if (imageRef) {
        const base = imageRef.replace(/\.[^.]+$/, '').trim();
        candidates.push(imageRef, base, base.replace(/[-_\s]/g, ''), base.replace(/[-_\s]/g, '').toLowerCase());
      }
      if (sku) candidates.push(sku, sku.replace(/[-_\s]/g, ''), sku.replace(/[-_\s]/g, '').toLowerCase());
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

    const errors: string[] = [];
    let created = 0;
    let updated = 0;

    const skus = rows
      .map((r) => normalizeRow(r as Record<string, string | number | undefined>))
      .filter((r) => r.sku)
      .map((r) => r.sku!);
    const uniqueSkus = [...new Set(skus)];

    const { data: existingProducts } =
      uniqueSkus.length > 0
        ? await supabase
            .from('products')
            .select('id, sku')
            .eq('user_id', user.id)
            .in('sku', uniqueSkus)
        : { data: [] as { id: string; sku: string }[] };

    const skuToId = new Map<string, string>();
    for (const p of existingProducts ?? []) {
      if (p.sku) skuToId.set(p.sku, p.id);
    }

    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: { id: string; data: Record<string, unknown> }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = normalizeRow(rows[i] as Record<string, string | number | undefined>);
      if (!r.name) {
        errors.push(`行${i + 2}: 商品名が空です`);
        continue;
      }
      if (r.costYen < 0) {
        errors.push(`行${i + 2}: 原価が不正です`);
        continue;
      }

      let imageUrl: string | null = imageUrlsByIndex[i] ?? null;
      if (!imageUrl) {
        const imgBuf = findImageInMap({
          imageRef: r.imageRef,
          sku: r.sku,
          name: r.name,
          rowIndex: i,
        });
        if (imgBuf) {
          const ext = getExt(imgBuf);
          const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage
            .from('product-images')
            .upload(path, imgBuf, { upsert: true, contentType: ext === 'png' ? 'image/png' : 'image/jpeg' });
          if (!error) {
            const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
            imageUrl = urlData.publicUrl;
          }
        }
      }

      const existingId = r.sku ? skuToId.get(r.sku) : null;

      const rowData = {
        name: r.name,
        cost_yen: r.costYen,
        stock: r.stock,
        memo: r.memo || null,
        campaign: r.campaign || null,
        size: r.size || null,
        color: r.color || null,
        ...(imageUrl && { image_url: imageUrl }),
      };

      if (existingId) {
        toUpdate.push({ id: existingId, data: { ...rowData, updated_at: new Date().toISOString() } });
      } else {
        toInsert.push({
          user_id: user.id,
          sku: r.sku || null,
          ...rowData,
        });
      }
    }

    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += DB_BATCH_SIZE) {
        const batch = toInsert.slice(i, i + DB_BATCH_SIZE);
        const { error } = await supabase.from('products').insert(batch);
        if (error) {
          errors.push(`一括登録エラー: ${error.message}`);
        } else {
          created += batch.length;
        }
      }
    }

    for (let i = 0; i < toUpdate.length; i += DB_BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + DB_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(({ id, data }) =>
          supabase.from('products').update(data).eq('id', id)
        )
      );
      updated += results.filter((r) => !r.error).length;
    }

    const imageCount = Object.keys(imageUrlsByIndex).length;
    return NextResponse.json({
      created,
      updated,
      errors,
      imageCount: file.name.toLowerCase().endsWith('.xlsx') ? imageCount : undefined,
    });
  } catch (e) {
    console.error('Import API error:', e);
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 500 }
    );
  }
}
