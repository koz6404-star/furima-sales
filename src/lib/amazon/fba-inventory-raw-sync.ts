/**
 * FBA Inventory API → raw テーブル保存（Phase 5）
 * seller_sku 単位で在庫を保存。再実行時は upsert で上書き
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getInventorySummaries } from './fba-inventory';
import { sleep } from './client';
import { logAmazonInfo } from './errors';
import type { InventorySummaryPayload } from './fba-inventory';

const SOURCE_API = 'fbaInventory.getInventorySummaries';

export interface SyncFbaInventoryRawResult {
  fetched: number;
  saved: number;
  errors: string[];
}

/**
 * FBA Inventory API から取得し、amazon_fba_inventory_raw に保存
 * 再実行時は upsert（user_id + source_key で上書き）
 */
export async function syncFbaInventoryToRaw(
  supabase: SupabaseClient,
  userId: string
): Promise<SyncFbaInventoryRawResult> {
  const result: SyncFbaInventoryRawResult = {
    fetched: 0,
    saved: 0,
    errors: [],
  };

  const fetchedAt = new Date().toISOString();
  let nextToken: string | undefined;

  do {
    const res = await getInventorySummaries({
      details: true,
      nextToken,
    });

    const items = res.inventorySummaries ?? [];
    result.fetched += items.length;

    for (const item of items as InventorySummaryPayload[]) {
      const sellerSku = item.sellerSku ?? item.seller_sku ?? '';
      if (!sellerSku) {
        result.errors.push('InventorySummary with empty sellerSku skipped');
        continue;
      }

      const payload = item as unknown as Record<string, unknown>;

      const { error } = await supabase.from('amazon_fba_inventory_raw').upsert(
        {
          user_id: userId,
          fetched_at: fetchedAt,
          snapshot_at: fetchedAt,
          source_api: SOURCE_API,
          source_key: String(sellerSku),
          payload_json: payload,
          updated_at: fetchedAt,
        },
        { onConflict: 'user_id,source_key', ignoreDuplicates: false }
      );

      if (error) {
        result.errors.push(`SKU ${sellerSku}: ${error.message}`);
      } else {
        result.saved++;
      }
    }

    nextToken = res.nextToken;
    if (nextToken) await sleep(550);

    logAmazonInfo('syncFbaInventoryToRaw', {
      pageItems: items.length,
      nextToken: !!nextToken,
    });
  } while (nextToken);

  if (result.errors.length > 0) {
    logAmazonInfo('syncFbaInventoryToRaw errors', { count: result.errors.length, samples: result.errors.slice(0, 5) });
  }

  return result;
}
