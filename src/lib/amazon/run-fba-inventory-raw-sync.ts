/**
 * FBA Inventory raw 取得の実行エントリポイント（アプリ外実行用）
 * スクリプト・バッチから呼び出すためのサービス層
 *
 * lib/amazon/fba-inventory-raw-sync の薄いラッパー。
 * Service Role クライアントを使用し、user_id を指定して実行する。
 */
import type { SyncFbaInventoryRawResult } from './fba-inventory-raw-sync';
import { syncFbaInventoryToRaw } from './fba-inventory-raw-sync';
import { createServiceRoleClient } from '@/lib/supabase/service';

/**
 * 指定 user の FBA Inventory API → amazon_fba_inventory_raw 取得を実行
 *
 * @param userId - 対象ユーザー ID
 * @returns 処理結果（fetched, saved, errors）
 */
export async function runFbaInventoryRawSync(userId: string): Promise<SyncFbaInventoryRawResult> {
  const supabase = createServiceRoleClient();
  return syncFbaInventoryToRaw(supabase, userId);
}
