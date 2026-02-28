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
    const excelPath = formData.get('excelPath') as string | null;
    const zipPath = formData.get('zipPath') as string | null;
    const skipFirstRow = formData.get('skipFirstRow') === 'true';

    const file = formData.get('file') as File | null;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    let buf: Buffer;
    let fileName = 'import.xlsx';

    if (excelPath) {
      if (!excelPath.startsWith(user.id + '/')) {
        return NextResponse.json({ error: '不正なパスです' }, { status: 400 });
      }
      const { data, error } = await supabase.storage.from('product-images').download(excelPath);
      if (error || !data) {
        return NextResponse.json({ error: 'Excelの取得に失敗しました: ' + (error?.message ?? 'Unknown') }, { status: 400 });
      }
      buf = Buffer.from(await data.arrayBuffer());
      fileName = excelPath.split('/').pop() ?? 'import.xlsx';
    } else if (file) {
      const ab = await file.arrayBuffer();
      buf = Buffer.from(ab);
      fileName = file.name;
    } else {
      return NextResponse.json({ error: 'Excelファイルが必要です' }, { status: 400 });
    }
    const rows: Record<string, unknown>[] = [];
    const imageUrlsByIndex: Record<number, string> = {};

    if (fileName.toLowerCase().endsWith('.xlsx')) {
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
        const dataRowIdx = excelRow - 1;
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
    if (zipPath) {
      if (!zipPath.startsWith(user.id + '/')) {
        return NextResponse.json({ error: '不正なZIPパスです' }, { status: 400 });
      }
      const { data: zipData, error: zipErr } = await supabase.storage.from('product-images').download(zipPath);
      if (zipErr || !zipData) {
        return NextResponse.json({ error: 'ZIPの取得に失敗しました: ' + (zipErr?.message ?? 'Unknown') }, { status: 400 });
      }
      const zipBuf = Buffer.from(await zipData.arrayBuffer());
      const zip = await JSZip.loadAsync(zipBuf);
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

    type NormRow = ReturnType<typeof normalizeRow>;
    const normalized: { row: NormRow; origIndex: number }[] = [];
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
      normalized.push({ row: r, origIndex: i });
    }

    const bySku = new Map<string, { row: NormRow; origIndex: number }[]>();
    const noSku: { row: NormRow; origIndex: number }[] = [];
    for (const item of normalized) {
      if (item.row.sku?.trim()) {
        const sku = item.row.sku.trim();
        if (!bySku.has(sku)) bySku.set(sku, []);
        bySku.get(sku)!.push(item);
      } else {
        noSku.push(item);
      }
    }

    const mergedProducts: {
      sku: string | null;
      name: string;
      costYen: number;
      stock: number;
      memo?: string;
      campaign?: string;
      size?: string;
      color?: string;
      imageRef?: string;
      origIndex: number;
    }[] = [];

    for (const [, group] of bySku) {
      const first = group[0];
      const totalStock = group.reduce((s, g) => s + g.row.stock, 0);
      const totalCostQty = group.reduce((s, g) => s + g.row.stock * g.row.costYen, 0);
      const costYen =
        totalStock > 0 ? Math.round(totalCostQty / totalStock) : Math.round(first.row.costYen);

      mergedProducts.push({
        sku: first.row.sku ?? null,
        name: first.row.name,
        costYen,
        stock: totalStock,
        memo: first.row.memo ?? undefined,
        campaign: first.row.campaign ?? undefined,
        size: first.row.size ?? undefined,
        color: first.row.color ?? undefined,
        imageRef: first.row.imageRef ?? undefined,
        origIndex: first.origIndex,
      });
    }

    for (const item of noSku) {
      mergedProducts.push({
        sku: null,
        name: item.row.name,
        costYen: item.row.costYen,
        stock: item.row.stock,
        memo: item.row.memo ?? undefined,
        campaign: item.row.campaign ?? undefined,
        size: item.row.size ?? undefined,
        color: item.row.color ?? undefined,
        imageRef: item.row.imageRef ?? undefined,
        origIndex: item.origIndex,
      });
    }

    const uniqueSkus = [...bySku.keys()];
    const { data: existingProducts } =
      uniqueSkus.length > 0
        ? await supabase
            .from('products')
            .select('id, sku, stock, cost_yen')
            .eq('user_id', user.id)
            .in('sku', uniqueSkus)
        : { data: [] };

    const skuToExisting = new Map<
      string,
      { id: string; sku: string; stock: number; cost_yen: number }
    >();
    for (const p of existingProducts ?? []) {
      if (p.sku) skuToExisting.set(p.sku, p);
    }

    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: { id: string; data: Record<string, unknown> }[] = [];

    for (const m of mergedProducts) {
      let imageUrl: string | null = imageUrlsByIndex[m.origIndex] ?? null;
      if (!imageUrl) {
        const imgBuf = findImageInMap({
          imageRef: m.imageRef,
          sku: m.sku ?? undefined,
          name: m.name,
          rowIndex: m.origIndex,
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

      const existing = m.sku ? skuToExisting.get(m.sku) : null;

      let costYen = m.costYen;
      let stock = m.stock;
      if (existing) {
        const exStock = Number(existing.stock) || 0;
        const exCost = Number(existing.cost_yen) || 0;
        const totalStock = exStock + stock;
        const totalCostQty = exStock * exCost + stock * m.costYen;
        costYen = totalStock > 0 ? Math.round(totalCostQty / totalStock) : m.costYen;
        stock = totalStock;
      }

      const rowData = {
        name: m.name,
        cost_yen: costYen,
        stock: stock,
        memo: m.memo || null,
        campaign: m.campaign || null,
        size: m.size || null,
        color: m.color || null,
        ...(imageUrl && { image_url: imageUrl }),
      };

      if (existing) {
        toUpdate.push({ id: existing.id, data: { ...rowData, updated_at: new Date().toISOString() } });
      } else {
        toInsert.push({
          user_id: user.id,
          sku: m.sku || null,
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

    if (excelPath) {
      await supabase.storage.from('product-images').remove([excelPath]);
      if (zipPath) await supabase.storage.from('product-images').remove([zipPath]);
    }

    return NextResponse.json({
      created,
      updated,
      errors,
      imageCount: fileName.toLowerCase().endsWith('.xlsx') ? imageCount : undefined,
    });
  } catch (e) {
    console.error('Import API error:', e);
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 500 }
    );
  }
}
