/**
 * FBM 在庫取得・保存（Phase14）
 *
 * 1. amazon_sales_lines から fulfillment_type='FBM' の SKU 一覧を取得
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
    errors: [],
  };

  // ─── 1. sales_lines から FBM SKU 一覧を取得 ────────────────────
  const { data: skuRows, error: skuErr } = await supabase
    .from('amazon_sales_lines')
    .select('sku')
    .eq('user_id', userId)
    .eq('fulfillment_type', 'FBM')
    .not('sku', 'is', null);

  if (skuErr) {
    result.errors.push(`SKU fetch: ${skuErr.message}`);
    return result;
  }

  const uniqueSkus = [
    ...new Set((skuRows ?? []).map((r) => r.sku as string).filter(Boolean)),
  ];

  result.skuCount = uniqueSkus.length;

  if (uniqueSkus.length === 0) {
    logAmazonInfo('syncFbmInventory', { message: 'FBM SKU なし。FBM 注文データがあれば再実行してください。' });
    return result;
  }

  logAmazonInfo('syncFbmInventory', { skuCount: uniqueSkus.length });

  const snapshotAt = new Date().toISOString();

  // ─── 2. 各 SKU に対して Listings Items API 呼び出し ────────────
  for (const sku of uniqueSkus) {
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
    errors: result.errors.length,
  });

  return result;
}
