import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

export const maxDuration = 60;
const IMAGE_UPLOAD_CONCURRENCY = 8;

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
) {
  for (let i = 0; i < items.length; i += limit) {
    await Promise.all(items.slice(i, i + limit).map(fn));
  }
}

// 規格文字列からサイズ・色を抽出
function parseSpec(spec: string): { size?: string; color?: string } {
  if (!spec) return {};
  const result: { size?: string; color?: string } = {};
  const colorMatch = spec.match(/色[:：]\s*([^;；\s]+)/);
  if (colorMatch) result.color = colorMatch[1];
  const sizeMatch = spec.match(/(?:サイズ|規格)[:：]\s*([^;；]+)/);
  if (sizeMatch) result.size = sizeMatch[1].trim();
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const shipmentCode = formData.get('shipment_code') as string;
    const exchangeRateStr = formData.get('exchange_rate') as string;
    const intlShippingJpy = parseInt(formData.get('intl_shipping_jpy') as string) || 0;
    const shippedAt = formData.get('shipped_at') as string | null;
    const arrivedAt = formData.get('arrived_at') as string | null;

    if (!file) return NextResponse.json({ error: 'ファイルが必要です' }, { status: 400 });
    if (!shipmentCode) return NextResponse.json({ error: '国際配送依頼番号が必要です' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 });

    const buf = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash('sha256').update(buf).digest('hex');

    // 重複チェック: 同一ファイル
    const { data: existingFile } = await supabase
      .from('ckb_shipments')
      .select('id, shipment_code')
      .eq('user_id', user.id)
      .eq('source_file_hash', fileHash)
      .maybeSingle();

    if (existingFile) {
      return NextResponse.json({
        error: `このファイルは便 ${existingFile.shipment_code} として既に取り込み済みです`,
        existing_id: existingFile.id,
      }, { status: 409 });
    }

    // 重複チェック: 同一便番号
    const { data: existingShipment } = await supabase
      .from('ckb_shipments')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('shipment_code', shipmentCode)
      .maybeSingle();

    if (existingShipment) {
      return NextResponse.json({
        error: `便 ${shipmentCode} は既に登録済みです`,
        existing_id: existingShipment.id,
      }, { status: 409 });
    }

    // Excel読み取り（CKB商品管理シート整形済みフォーマット対応）
    const imageUrlsByIndex: Record<number, string> = {};

    // ExcelJSで画像抽出
    if (file.name.toLowerCase().endsWith('.xlsx')) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      const ws = wb.worksheets[0];

      const imgs = ws.getImages?.() ?? [];
      const media = (wb as unknown as { model?: { media?: Array<{ index: number; buffer: Buffer; extension?: string }> } }).model?.media ?? [];
      const uploadTasks: { dataRowIdx: number; buffer: Buffer; ext: string }[] = [];

      for (const img of imgs) {
        const tl = img.range?.tl;
        if (tl == null) continue;
        const excelRow = typeof tl.nativeRow === 'number' ? tl.nativeRow : (tl as { row?: number }).row ?? 0;
        const dataRowIdx = excelRow - 1; // 0-based data row (ヘッダー=row0なので)
        if (dataRowIdx < 0) continue;
        const mediaItem =
          media.find((m: { index: number }) => Number(m.index) === Number(img.imageId)) ??
          media.find((m: { index: number }) => String(m.index) === String(img.imageId));
        if (mediaItem?.buffer) {
          const ext = mediaItem.extension === 'jpeg' ? 'jpg' : (mediaItem.extension || 'png');
          const imgBuf = Buffer.isBuffer(mediaItem.buffer) ? mediaItem.buffer : Buffer.from(mediaItem.buffer as ArrayBuffer);
          uploadTasks.push({ dataRowIdx, buffer: imgBuf, ext });
        }
      }

      await runWithConcurrency(uploadTasks, IMAGE_UPLOAD_CONCURRENCY, async ({ dataRowIdx, buffer, ext }) => {
        const path = `${user.id}/ckb-${shipmentCode}-${dataRowIdx}.${ext}`;
        const { error } = await supabase.storage
          .from('product-images')
          .upload(path, buffer, { upsert: true, contentType: ext === 'png' ? 'image/png' : 'image/jpeg' });
        if (!error) {
          const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
          imageUrlsByIndex[dataRowIdx] = urlData.publicUrl;
        }
      });
    }

    // XLSXでデータ読み取り
    const xlsxWb = XLSX.read(buf, { type: 'buffer', cellDates: true });
    const xlsxWs = xlsxWb.Sheets[xlsxWb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number | undefined>>(xlsxWs);

    if (rows.length === 0) {
      return NextResponse.json({ error: '商品データが見つかりません' }, { status: 400 });
    }

    // 為替レートを商品管理シートのヘッダーから自動検出（例: "総コスト（円）※20.8円/元"）
    let exchangeRate = parseFloat(exchangeRateStr) || 20.8;
    const headers = Object.keys(rows[0] || {});
    const costHeader = headers.find(h => h.includes('総コスト') && h.includes('円/元'));
    if (costHeader) {
      const rateMatch = costHeader.match(/([\d.]+)円\/元/);
      if (rateMatch) exchangeRate = parseFloat(rateMatch[1]);
    }

    // 便番号でフィルタリ��グ（商品管理シートには複数便のデータが入っている）
    const shipmentRows: { row: Record<string, string | number | undefined>; index: number }[] = [];
    const shipmentCodeCol = headers.find(h => h.includes('国際配送依頼番号'));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (shipmentCodeCol) {
        const rowCode = String(row[shipmentCodeCol] ?? '').trim();
        if (rowCode && rowCode === shipmentCode) {
          shipmentRows.push({ row, index: i });
        }
      } else {
        // 便番号列がない場合は全行取込
        shipmentRows.push({ row, index: i });
      }
    }

    if (shipmentRows.length === 0) {
      // 便番号が見つからない場合は全行取込（便番号列がないフォーマット or 新しい便）
      for (let i = 0; i < rows.length; i++) {
        shipmentRows.push({ row: rows[i], index: i });
      }
    }

    // CKB商品管理シートの列名マッピング
    const findCol = (candidates: string[]) => headers.find(h => candidates.some(c => h.includes(c)));
    const skuCol = findCol(['THE CKB SKU', 'CKBSKU', 'SKU']);
    const nameCol = findCol(['商品名']);
    const specCol = findCol(['規格']);
    const qtyCol = findCol(['商品数', '数量']);
    const unitCostCol = findCol(['1個あたりのコスト']);
    const totalCostCol = costHeader || findCol(['総コスト']);
    const intlCostCol = findCol(['国際配送プラス関税']);
    const shippedAtCol = findCol(['出荷日']);

    // ���品データ構築
    const items: {
      ckb_sku: string | null;
      product_name: string;
      quantity: number;
      unit_cost_cny: number | null;
      unit_cost_jpy: number | null;
      allocated_intl_shipping_jpy: number;
      total_cost_jpy: number | null;
      unit_total_cost_jpy: number | null;
      spec_raw: string | null;
      size: string | null;
      color: string | null;
      image_url: string | null;
      source_file: string;
    }[] = [];

    let totalIntlShipping = 0;

    for (const { row, index } of shipmentRows) {
      const name = nameCol ? String(row[nameCol] ?? '').trim() : '';
      if (!name) continue;

      const qty = qtyCol ? parseInt(String(row[qtyCol] ?? '1')) || 1 : 1;
      const unitCostJpy = unitCostCol ? parseInt(String(row[unitCostCol] ?? '0')) || 0 : null;
      const totalCost = totalCostCol ? parseInt(String(row[totalCostCol] ?? '0')) || null : null;
      const intlCost = intlCostCol ? parseInt(String(row[intlCostCol] ?? '0')) || 0 : 0;
      const specRaw = specCol ? String(row[specCol] ?? '') : '';
      const spec = parseSpec(specRaw);

      totalIntlShipping += intlCost;

      items.push({
        ckb_sku: skuCol ? String(row[skuCol] ?? '').trim() || null : null,
        product_name: name,
        quantity: qty,
        unit_cost_cny: unitCostJpy != null && exchangeRate > 0
          ? Math.round(unitCostJpy / exchangeRate * 100) / 100
          : null,
        unit_cost_jpy: unitCostJpy,
        allocated_intl_shipping_jpy: intlCost,
        total_cost_jpy: totalCost,
        unit_total_cost_jpy: unitCostJpy, // 整形済みなのでそのまま
        spec_raw: specRaw || null,
        size: spec.size || null,
        color: spec.color || null,
        image_url: imageUrlsByIndex[index] || null,
        source_file: file.name,
      });
    }

    if (items.length === 0) {
      return NextResponse.json({ error: '有効な商品行がありません' }, { status: 400 });
    }

    const totalItems = items.reduce((sum, it) => sum + it.quantity, 0);

    // 発送レコード作成
    const { data: shipment, error: shipErr } = await supabase
      .from('ckb_shipments')
      .insert({
        user_id: user.id,
        shipment_code: shipmentCode,
        shipped_at: shippedAt || null,
        arrived_at: arrivedAt || null,
        exchange_rate: exchangeRate,
        intl_shipping_jpy: intlShippingJpy || totalIntlShipping,
        total_items: totalItems,
        source_file_hash: fileHash,
        source_file_name: file.name,
      })
      .select()
      .single();

    if (shipErr) return NextResponse.json({ error: shipErr.message }, { status: 500 });

    // 商品アイテム一括INSERT
    const itemRows = items.map(item => ({
      shipment_id: shipment.id,
      ...item,
    }));

    const { error: itemErr } = await supabase
      .from('ckb_shipment_items')
      .insert(itemRows);

    if (itemErr) {
      await supabase.from('ckb_shipments').delete().eq('id', shipment.id);
      return NextResponse.json({ error: itemErr.message }, { status: 500 });
    }

    return NextResponse.json({
      message: `便 ${shipmentCode}: ${items.length}種類 ${totalItems}個の商品を取り込みました`,
      shipment_id: shipment.id,
      items_count: items.length,
      total_items: totalItems,
      exchange_rate: exchangeRate,
      images_uploaded: Object.keys(imageUrlsByIndex).length,
    }, { status: 201 });

  } catch (err) {
    console.error('[ckb-import]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
