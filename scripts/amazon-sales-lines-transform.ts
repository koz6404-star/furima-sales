#!/usr/bin/env npx tsx
/**
 * sales_lines 整形のアプリ外実行スクリプト
 * amazon_orders_raw / amazon_order_items_raw → amazon_sales_lines 変換を CLI から実行
 *
 * 実行例:
 *   npm run amazon-sales-lines-transform -- --user-id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *   AMAZON_USER_ID=xxx npm run amazon-sales-lines-transform
 *   npx tsx scripts/amazon-sales-lines-transform.ts <UUID>
 *
 * 事前: .env.local に NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY を設定
 */
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { runSalesLinesTransform } from '../src/lib/amazon/run-sales-lines-transform';

function parseUserId(): string | null {
  const arg = process.argv[2];
  if (arg?.startsWith('--user-id=')) {
    return arg.slice('--user-id='.length).trim();
  }
  if (arg && !arg.startsWith('-')) {
    return arg.trim();
  }
  const envUserId = process.env.AMAZON_USER_ID?.trim();
  if (envUserId) return envUserId;
  return null;
}

async function main() {
  const userId = parseUserId();
  if (!userId) {
    console.error(`
[エラー] user_id を指定してください。

使い方:
  npm run amazon-sales-lines-transform -- --user-id=<UUID>
  AMAZON_USER_ID=<UUID> npm run amazon-sales-lines-transform
  npx tsx scripts/amazon-sales-lines-transform.ts <UUID>

事前: .env.local に以下を設定
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
`);
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  console.log(`[sales_lines transform] started at ${startedAt}`);
  console.log(`[sales_lines transform] user_id: ${userId}`);

  try {
    const result = await runSalesLinesTransform(userId);

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

    console.log(`\n完了: orders_raw ${result.processed}件処理、sales_lines ${result.saved}件保存、スキップ ${result.skipped}件`);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error('[sales_lines transform] error:', msg);
    process.exit(1);
  }
}

main();
