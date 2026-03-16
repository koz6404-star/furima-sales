/**
 * amazon_fba_inventory_raw → amazon_inventory_current 変換（Phase 6）
 * SKU ごとの最新在庫を整形。channel_type='FBA'、total_available_qty=fulfillable_qty
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type InventoryDetailsPayload = {
  fulfillableQuantity?: number;
  inboundWorkingQuantity?: number;
  inboundShippedQuantity?: number;
  inboundReceivingQuantity?: number;
  reservedQuantity?: { totalReservedQuantity?: number; [key: string]: unknown };
  unfulfillableQuantity?: { totalUnfulfillableQuantity?: number; [key: string]: unknown };
  [key: string]: unknown;
};

type RawPayload = {
  inventoryDetails?: InventoryDetailsPayload;
  [key: string]: unknown;
};

function toInt(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.max(0, Math.floor(val));
  const n = parseInt(String(val), 10);
  return isNaN(n) ? 0 : Math.max(0, n);
}

export interface TransformInventoryCurrentResult {
  processed: number;
  saved: number;
  skipped: number;
  errors: string[];
}

/**
 * raw から amazon_inventory_current を生成
 * SKU ごとに最新1件（raw は user_id+source_key で1件のため、そのまま採用）
 * 再実行時は upsert で上書き
 */
export async function transformRawToInventoryCurrent(
  supabase: SupabaseClient,
  userId: string
): Promise<TransformInventoryCurrentResult> {
  const result: TransformInventoryCurrentResult = {
    processed: 0,
    saved: 0,
    skipped: 0,
    errors: [],
  };

  const { data: rawRows, error: fetchErr } = await supabase
    .from('amazon_fba_inventory_raw')
    .select('id, source_key, snapshot_at, fetched_at, payload_json')
    .eq('user_id', userId)
    .order('snapshot_at', { ascending: false });

  if (fetchErr) {
    result.errors.push(`Raw fetch: ${fetchErr.message}`);
    return result;
  }

  if (!rawRows || rawRows.length === 0) {
    return result;
  }

  for (const row of rawRows) {
    result.processed++;

    const sellerSku = row.source_key ?? (row.payload_json as Record<string, unknown>)?.sellerSku ?? '';
    if (!String(sellerSku).trim()) {
      result.skipped++;
      continue;
    }

    const payload = row.payload_json as RawPayload;
    const details = payload?.inventoryDetails ?? {};

    const fulfillableQty = toInt(details.fulfillableQuantity);
    const inboundQty =
      toInt(details.inboundWorkingQuantity) +
      toInt(details.inboundShippedQuantity) +
      toInt(details.inboundReceivingQuantity);
    const reservedQty = toInt(details.reservedQuantity?.totalReservedQuantity);
    const unfulfillableQty = toInt(details.unfulfillableQuantity?.totalUnfulfillableQuantity);

    const line = {
      user_id: userId,
      seller_sku: String(sellerSku).trim(),
      channel_type: 'FBA',
      fulfillable_qty: fulfillableQty,
      inbound_qty: inboundQty,
      reserved_qty: reservedQty,
      unfulfillable_qty: unfulfillableQty,
      total_available_qty: fulfillableQty,
      snapshot_at: row.snapshot_at,
      raw_source: row.id,
      fetched_at: row.fetched_at,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await supabase
      .from('amazon_inventory_current')
      .upsert(line, { onConflict: 'user_id,seller_sku', ignoreDuplicates: false });

    if (upsertErr) {
      result.errors.push(`SKU ${sellerSku}: ${upsertErr.message}`);
      result.skipped++;
    } else {
      result.saved++;
    }
  }

  return result;
}
