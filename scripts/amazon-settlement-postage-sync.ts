#!/usr/bin/env npx tsx
/**
 * 決済レポートから配送ラベル代を注文別に取得・保存するスクリプト
 *
 * 実行例:
 *   npx tsx scripts/amazon-settlement-postage-sync.ts --user-id=<UUID>
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { createServiceRoleClient } from '../src/lib/supabase/service';
import { syncSettlementPostage } from '../src/lib/amazon/settlement-postage-sync';

function parseUserId(): string | null {
  const arg = process.argv[2];
  if (arg?.startsWith('--user-id=')) return arg.slice('--user-id='.length).trim();
  if (arg && !arg.startsWith('-')) return arg.trim();
  return process.env.AMAZON_USER_ID?.trim() ?? null;
}

async function main() {
  const userId = parseUserId();
  if (!userId) {
    console.error('[エラー] user_id を指定してください。\n  npx tsx scripts/amazon-settlement-postage-sync.ts --user-id=<UUID>');
    process.exit(1);
  }

  console.log(`[settlement-postage] started at ${new Date().toISOString()}`);
  console.log(`[settlement-postage] user_id: ${userId}`);

  const supabase = createServiceRoleClient();
  const result = await syncSettlementPostage(supabase, userId);

  console.log(JSON.stringify({
    user_id: userId,
    finished_at: new Date().toISOString(),
    ...result,
    ok: result.errors.length === 0,
  }, null, 2));

  if (result.errors.length > 0) {
    console.error('\n[エラー]', result.errors.join('\n'));
    process.exit(1);
  }

  console.log(`\n完了: ${result.reports_checked}件レポート確認、${result.postage_rows_found}件配送ラベル検出、${result.saved}件保存（旧データ${result.old_postage_deleted}件削除）`);
}

main().catch((e) => {
  console.error('[settlement-postage] error:', (e as Error)?.message ?? e);
  process.exit(1);
});
