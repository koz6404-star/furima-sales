/**
 * FBM 在庫同期の実行エントリポイント（アプリ外実行用）
 * Service Role クライアントを使用し、user_id を指定して実行する。
 */
import { syncFbmInventory } from './fbm-inventory-sync';
import type { SyncFbmInventoryResult } from './fbm-inventory-sync';
import { createServiceRoleClient } from '@/lib/supabase/service';

export async function runFbmInventorySync(userId: string): Promise<SyncFbmInventoryResult> {
  const supabase = createServiceRoleClient();
  return syncFbmInventory(supabase, userId);
}
