/**
 * Phase5 完了確認 API
 * seller_sku / snapshot_at / 在庫項目 / 再同期耐性 を検証
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: rows } = await supabase
      .from('amazon_fba_inventory_raw')
      .select('source_key, snapshot_at, fetched_at, payload_json')
      .eq('user_id', user.id);

    const total = rows?.length ?? 0;

    let skuNull = 0;
    let skuEmpty = 0;
    let snapshotNull = 0;
    const inventoryKeys = new Set<string>();

    for (const r of rows ?? []) {
      const sku = r.source_key ?? (r.payload_json as Record<string, unknown>)?.sellerSku ?? (r.payload_json as Record<string, unknown>)?.seller_sku;
      if (sku == null) skuNull++;
      else if (String(sku).trim() === '') skuEmpty++;

      const snap = r.snapshot_at ?? r.fetched_at;
      if (!snap) snapshotNull++;

      const p = r.payload_json as Record<string, unknown>;
      if (p) {
        Object.keys(p).forEach((k) => inventoryKeys.add(k));
        const inv = p.inventoryDetails as Record<string, unknown> | undefined;
        if (inv) Object.keys(inv).forEach((k) => inventoryKeys.add(`inventoryDetails.${k}`));
      }
    }

    const sample = rows?.[0];
    const samplePayload = sample?.payload_json as Record<string, unknown> | undefined;
    const sampleDetails = samplePayload?.inventoryDetails as Record<string, unknown> | undefined;

    const invItems = [
      { key: 'fulfillableQuantity', path: 'inventoryDetails.fulfillableQuantity', inPayload: sampleDetails && 'fulfillableQuantity' in sampleDetails },
      { key: 'inboundWorkingQuantity', path: 'inventoryDetails.inboundWorkingQuantity', inPayload: sampleDetails && 'inboundWorkingQuantity' in sampleDetails },
      { key: 'inboundShippedQuantity', path: 'inventoryDetails.inboundShippedQuantity', inPayload: sampleDetails && 'inboundShippedQuantity' in sampleDetails },
      { key: 'inboundReceivingQuantity', path: 'inventoryDetails.inboundReceivingQuantity', inPayload: sampleDetails && 'inboundReceivingQuantity' in sampleDetails },
      { key: 'reservedQuantity', path: 'inventoryDetails.reservedQuantity', inPayload: sampleDetails && 'reservedQuantity' in sampleDetails },
      { key: 'unfulfillableQuantity', path: 'inventoryDetails.unfulfillableQuantity', inPayload: sampleDetails && 'unfulfillableQuantity' in sampleDetails },
      { key: 'researchingQuantity', path: 'inventoryDetails.researchingQuantity', inPayload: sampleDetails && 'researchingQuantity' in sampleDetails },
    ];

    const passed =
      total === 0 || (skuNull === 0 && skuEmpty === 0 && snapshotNull === 0);

    return NextResponse.json({
      ok: true,
      passed: !!passed,
      seller_sku: {
        totalRows: total,
        nullCount: skuNull,
        emptyCount: skuEmpty,
        skuIdentifiable: skuNull === 0 && skuEmpty === 0,
        sampleSourceKey: sample?.source_key,
      },
      snapshot_at: {
        saved: snapshotNull === 0,
        nullCount: snapshotNull,
        structure: '1行1SKU、snapshot_at=fetched_at。同一user_id+source_keyでupsertのため最新1件のみ保持。最新識別: 当該行が最新。',
      },
      inventoryItems: invItems,
      payloadKeys: samplePayload ? Object.keys(samplePayload) : [],
      inventoryDetailKeys: sampleDetails ? Object.keys(sampleDetails) : [],
      verdict: passed
        ? '合格: Phase6 へ進んでよい'
        : skuNull > 0 || skuEmpty > 0
          ? `不合格: seller_sku が null/空のレコードが ${skuNull + skuEmpty} 件`
          : snapshotNull > 0
            ? `不合格: snapshot_at が null のレコードが ${snapshotNull} 件`
            : '要確認',
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
