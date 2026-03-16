/**
 * FBM 在庫取得・保存（Phase14 → Phase16 改修）
 *
 * 1. Reports API (GET_MERCHANT_LISTINGS_ALL_DATA) で全出品 SKU を一括取得
 * 2. fulfillment-channel = 'DEFAULT' の SKU を FBM として抽出
 * 3. 各 FBM SKU に対して Listings Items API で在庫数を取得
 * 4. amazon_fbm_inventory_current に upsert
 *
 * これにより、まだ売れていない出品商品も含めて全 FBM SKU が取得される。
 * 再実行は常に安全（upsert）。取得エラーの SKU はスキップして続行。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getFbmListingItem } from './fbm-listings';
import { fetchMerchantListings, extractFbmSkus } from './merchant-listings';
import { logAmazonInfo } from './errors';

export interface SyncFbmInventoryResult {
  totalListings: number;
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
    totalListings: 0,
    skuCount: 0,
    fetched: 0,
    saved: 0,
    errors: [],
  };

  // ─── 1. Reports API で全出品レポートを取得 ──────────────────
  let fbmSkus: string[] = [];
  try {
    logAmazonInfo('syncFbmInventory', { message: '出品レポートをリクエスト中（数十秒かかります）...' });
    const allListings = await fetchMerchantListings();
    result.totalListings = allListings.length;

    // FBM（DEFAULT チャンネル・Active）の SKU を抽出
    fbmSkus = extractFbmSkus(allListings);
    logAmazonInfo('syncFbmInventory', {
      message: `全出品 ${allListings.length} 件中、FBM Active: ${fbmSkus.length} 件`,
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    result.errors.push(`レポート取得失敗: ${msg}`);

    // フォールバック: 既存テーブルの SKU + sales_lines の FBM SKU
    logAmazonInfo('syncFbmInventory', { message: 'レポート失敗。フォールバックで既存データから SKU を収集します。' });

    const { data: existingRows } = await supabase
      .from('amazon_fbm_inventory_current')
      .select('seller_sku')
      .eq('user_id', userId);

    const { data: salesRows } = await supabase
      .from('amazon_sales_lines')
      .select('sku')
      .eq('user_id', userId)
      .eq('fulfillment_type', 'FBM')
      .not('sku', 'is', null);

    const fallbackSet = new Set<string>();
    for (const r of existingRows ?? []) if (r.seller_sku) fallbackSet.add(r.seller_sku);
    for (const r of salesRows ?? []) if (r.sku) fallbackSet.add(r.sku as string);
    fbmSkus = [...fallbackSet];
  }

  result.skuCount = fbmSkus.length;

  if (fbmSkus.length === 0) {
    logAmazonInfo('syncFbmInventory', { message: 'FBM SKU なし。' });
    return result;
  }

  const snapshotAt = new Date().toISOString();

  // ─── 2. 各 FBM SKU に対して Listings Items API で在庫数を取得 ──
  for (const sku of fbmSkus) {
    let listingItem = null;
    try {
      listingItem = await getFbmListingItem(sku);
      result.fetched++;
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      result.errors.push(`SKU ${sku} fetch: ${msg}`);
    }

    // ─── 3. amazon_fbm_inventory_current に upsert ──────────────
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
    totalListings: result.totalListings,
    skuCount: result.skuCount,
    fetched: result.fetched,
    saved: result.saved,
    errors: result.errors.length,
  });

  return result;
}
