/**
 * FBM 在庫取得・保存（Phase14 → Phase16 改修）
 *
 * 1. 2つのソースから FBM SKU 一覧を取得:
 *    a. amazon_sales_lines の fulfillment_type='FBM'（売上のある SKU）
 *    b. amazon_inventory_current に**ない** SKU を FBM 候補として追加
 *       → FBA 在庫テーブルにない = FBM の可能性が高い
 * 2. 各 SKU に対して Listings Items API を呼び出し、出品在庫数を取得
 * 3. amazon_fbm_inventory_current に upsert
 *
 * 再実行は常に安全（upsert）。取得エラーの SKU はスキップして続行。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getFbmListingItem } from './fbm-listings';
import { logAmazonInfo } from './errors';

export interface SyncFbmInventoryResult {
  skuCount: number;
  fetched: number;
  saved: number;
  skipped: number;
  errors: string[];
}

/**
 * FBM 在庫を Listings Items API から取得し amazon_fbm_inventory_current へ保存
 */
export async function syncFbmInventory(
  supabase: SupabaseClient,
  userId: string
): Promise<SyncFbmInventoryResult> {
  const result: SyncFbmInventoryResult = {
    skuCount: 0,
    fetched: 0,
    saved: 0,
    skipped: 0,
    errors: [],
  };

  // ─── 1a. sales_lines から FBM SKU を取得 ────────────────────
  const { data: salesSkuRows, error: salesSkuErr } = await supabase
    .from('amazon_sales_lines')
    .select('sku')
    .eq('user_id', userId)
    .eq('fulfillment_type', 'FBM')
    .not('sku', 'is', null);

  if (salesSkuErr) {
    result.errors.push(`sales SKU fetch: ${salesSkuErr.message}`);
  }

  const skuSet = new Set<string>(
    (salesSkuRows ?? []).map((r) => r.sku as string).filter(Boolean)
  );

  // ─── 1b. 既存 FBM 在庫テーブルの SKU も含める ─────────────────
  const { data: existingFbmRows } = await supabase
    .from('amazon_fbm_inventory_current')
    .select('seller_sku')
    .eq('user_id', userId);

  for (const r of existingFbmRows ?? []) {
    if (r.seller_sku) skuSet.add(r.seller_sku);
  }

  // ─── 1c. FBA 在庫にない Orders の全 SKU を FBM 候補として追加 ──
  const { data: fbaSkuRows } = await supabase
    .from('amazon_inventory_current')
    .select('seller_sku')
    .eq('user_id', userId);

  const fbaSkuSet = new Set<string>(
    (fbaSkuRows ?? []).map((r) => r.seller_sku as string).filter(Boolean)
  );

  // Orders raw の全 SKU（FBA にないものを FBM 候補に）
  const { data: allOrderSkuRows } = await supabase
    .from('amazon_order_items_raw')
    .select('seller_sku')
    .eq('user_id', userId)
    .not('seller_sku', 'is', null);

  for (const r of allOrderSkuRows ?? []) {
    const sku = r.seller_sku as string;
    if (sku && !fbaSkuSet.has(sku)) {
      skuSet.add(sku);
    }
  }

  const uniqueSkus = [...skuSet];
  result.skuCount = uniqueSkus.length;

  if (uniqueSkus.length === 0) {
    logAmazonInfo('syncFbmInventory', { message: 'FBM SKU なし。' });
    return result;
  }

  logAmazonInfo('syncFbmInventory', { skuCount: uniqueSkus.length });

  const snapshotAt = new Date().toISOString();

  // ─── 2. 各 SKU に対して Listings Items API 呼び出し ────────────
  for (const sku of uniqueSkus) {
    // FBA 在庫テーブルに既にある SKU はスキップ（FBA は別テーブルで管理）
    if (fbaSkuSet.has(sku)) {
      result.skipped++;
      continue;
    }

    let listingItem = null;
    try {
      listingItem = await getFbmListingItem(sku);
      result.fetched++;
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      result.errors.push(`SKU ${sku} fetch: ${msg}`);
      // 取得失敗でも続行（エラーは記録して次へ）
    }

    // ─── 3. amazon_fbm_inventory_current に upsert ────────────────
    const row = {
      user_id: userId,
      seller_sku: sku,
      asin: listingItem?.asin ?? null,
      item_name: listingItem?.itemName ?? null,
      listing_status: listingItem?.listingStatus ?? null,
      quantity: listingItem?.quantity ?? 0,
      snapshot_at: snapshotAt,
      fetched_at: snapshotAt,
      updated_at: snapshotAt,
    };

    const { error: upsertErr } = await supabase
      .from('amazon_fbm_inventory_current')
      .upsert(row, { onConflict: 'user_id,seller_sku', ignoreDuplicates: false });

    if (upsertErr) {
      result.errors.push(`SKU ${sku} upsert: ${upsertErr.message}`);
    } else {
      result.saved++;
    }
  }

  logAmazonInfo('syncFbmInventory complete', {
    skuCount: result.skuCount,
    fetched: result.fetched,
    saved: result.saved,
    skipped: result.skipped,
    errors: result.errors.length,
  });

  return result;
}
