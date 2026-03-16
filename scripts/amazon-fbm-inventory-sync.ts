#!/usr/bin/env npx tsx
/**
 * FBM 在庫同期のアプリ外実行スクリプト（Phase14）
 * Listings Items API → amazon_fbm_inventory_current 保存を CLI から実行
 *
 * 実行例:
 *   npm run amazon-fbm-inventory-sync -- --user-id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *   AMAZON_USER_ID=xxx npm run amazon-fbm-inventory-sync
 *
 * 事前: .env.local に以下を設定
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SELLING_PARTNER_APP_CLIENT_ID
 *   SELLING_PARTNER_APP_CLIENT_SECRET
 *   AMAZON_REFRESH_TOKEN
 *   AMAZON_SELLER_ID        ← Phase14 から新規追加
 */
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { runFbmInventorySync } from '../src/lib/amazon/run-fbm-inventory-sync';

function parseUserId(): string | null {
  const arg = process.argv[2];
  if (arg?.startsWith('--user-id=')) return arg.slice('--user-id='.length).trim();
  if (arg && !arg.startsWith('-')) return arg.trim();
  return process.env.AMAZON_USER_ID?.trim() ?? null;
}

async function main() {
  const userId = parseUserId();

  if (!userId) {
    console.error(`
[エラー] user_id を指定してください。

使い方:
  npm run amazon-fbm-inventory-sync -- --user-id=<UUID>
  AMAZON_USER_ID=<UUID> npm run amazon-fbm-inventory-sync

事前: .env.local に以下を設定
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  SELLING_PARTNER_APP_CLIENT_ID
  SELLING_PARTNER_APP_CLIENT_SECRET
  AMAZON_REFRESH_TOKEN
  AMAZON_SELLER_ID
`);
    process.exit(1);
  }

  if (!process.env.AMAZON_SELLER_ID) {
    console.error('[エラー] AMAZON_SELLER_ID が .env.local に設定されていません。');
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  console.log(`[fbm-inventory-sync] started at ${startedAt}`);
  console.log(`[fbm-inventory-sync] user_id: ${userId}`);

  try {
    const result = await runFbmInventorySync(userId);

    const log = {
      user_id: userId,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      sku_count: result.skuCount,
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

    console.log(`\n完了: FBM在庫 ${result.saved}件保存（対象SKU: ${result.skuCount}件）`);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error('[fbm-inventory-sync] error:', msg);
    process.exit(1);
  }
}

main();
