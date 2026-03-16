#!/usr/bin/env npx tsx
/**
 * inventory_current 整形のアプリ外実行スクリプト
 * amazon_fba_inventory_raw → amazon_inventory_current 変換を CLI から実行
 *
 * 実行例:
 *   npm run amazon-inventory-current-transform -- --user-id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *   AMAZON_USER_ID=xxx npm run amazon-inventory-current-transform
 *
 * 事前: .env.local に NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY を設定
 */
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { runInventoryCurrentTransform } from '../src/lib/amazon/run-inventory-current-transform';

function parseUserId(): string | null {
  const arg = process.argv[2];
  if (arg?.startsWith('--user-id=')) {
    return arg.slice('--user-id='.length).trim();
  }
  if (arg && !arg.startsWith('-')) {
    return arg.trim();
  }
  return process.env.AMAZON_USER_ID?.trim() ?? null;
}

async function main() {
  const userId = parseUserId();

  if (!userId) {
    console.error(`
[エラー] user_id を指定してください。

使い方:
  npm run amazon-inventory-current-transform -- --user-id=<UUID>
  AMAZON_USER_ID=<UUID> npm run amazon-inventory-current-transform

事前: .env.local に以下を設定
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
`);
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  console.log(`[inventory_current transform] started at ${startedAt}`);
  console.log(`[inventory_current transform] user_id: ${userId}`);

  try {
    const result = await runInventoryCurrentTransform(userId);

    const log = {
      user_id: userId,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      processed: result.processed,
      saved: result.saved,
      skipped: result.skipped,
      errors: result.errors,
      ok: result.errors.length === 0,
    };

    console.log(JSON.stringify(log, null, 2));

    if (result.errors.length > 0) {
      console.error('\n[エラー]', result.errors.join('\n'));
      process.exit(1);
    }

    console.log(`\n完了: fba_inventory_raw ${result.processed}件処理、inventory_current ${result.saved}件保存、スキップ ${result.skipped}件`);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error('[inventory_current transform] error:', msg);
    process.exit(1);
  }
}

main();
