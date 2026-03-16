#!/usr/bin/env npx tsx
/**
 * FBA Inventory raw 取得のアプリ外実行スクリプト
 * Amazon FBA Inventory API → amazon_fba_inventory_raw 保存を CLI から実行
 *
 * 実行例:
 *   npm run amazon-fba-inventory-raw-sync -- --user-id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *   AMAZON_USER_ID=xxx npm run amazon-fba-inventory-raw-sync
 *
 * 事前: .env.local に以下を設定
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SELLING_PARTNER_APP_CLIENT_ID
 *   SELLING_PARTNER_APP_CLIENT_SECRET
 *   AMAZON_REFRESH_TOKEN
 */
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { runFbaInventoryRawSync } from '../src/lib/amazon/run-fba-inventory-raw-sync';

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
  npm run amazon-fba-inventory-raw-sync -- --user-id=<UUID>
  AMAZON_USER_ID=<UUID> npm run amazon-fba-inventory-raw-sync

事前: .env.local に以下を設定
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  SELLING_PARTNER_APP_CLIENT_ID
  SELLING_PARTNER_APP_CLIENT_SECRET
  AMAZON_REFRESH_TOKEN
`);
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  console.log(`[fba-inventory raw sync] started at ${startedAt}`);
  console.log(`[fba-inventory raw sync] user_id: ${userId}`);

  try {
    const result = await runFbaInventoryRawSync(userId);

    const log = {
      user_id: userId,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      fetched: result.fetched,
      saved: result.saved,
      errors: result.errors,
      ok: result.errors.length === 0,
    };

    console.log(JSON.stringify(log, null, 2));

    if (result.errors.length > 0) {
      console.error('\n[エラー]', result.errors.join('\n'));
      process.exit(1);
    }

    console.log(`\n完了: fba_inventory_raw ${result.saved}件保存`);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error('[fba-inventory raw sync] error:', msg);
    process.exit(1);
  }
}

main();
