/**
 * Settlement Postage 同期の実行エントリポイント（アプリ外実行用）
 */
import type { SettlementPostageResult } from './settlement-postage-sync';
import { syncSettlementPostage } from './settlement-postage-sync';
import { createServiceRoleClient } from '@/lib/supabase/service';

export async function runSettlementPostageSync(userId: string): Promise<SettlementPostageResult> {
  const supabase = createServiceRoleClient();
  return syncSettlementPostage(supabase, userId);
}
