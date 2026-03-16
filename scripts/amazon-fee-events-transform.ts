#!/usr/bin/env npx tsx
/**
 * fee_events 整形のアプリ外実行スクリプト
 * amazon_finance_raw → amazon_fee_events 変換を CLI から実行
 *
 * 実行例:
 *   npm run amazon-fee-events-transform -- --user-id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *   AMAZON_USER_ID=xxx npm run amazon-fee-events-transform
 *   npx tsx scripts/amazon-fee-events-transform.ts <UUID>
 *
 * 事前: .env.local に NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY を設定
 */
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { runFeeEventsTransform } from '../src/lib/amazon/run-fee-events-transform';

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
  npm run amazon-fee-events-transform -- --user-id=<UUID>
  AMAZON_USER_ID=<UUID> npm run amazon-fee-events-transform
  npx tsx scripts/amazon-fee-events-transform.ts <UUID>

事前: .env.local に以下を設定
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
`);
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  console.log(`[fee_events transform] started at ${startedAt}`);
  console.log(`[fee_events transform] user_id: ${userId}`);

  try {
    const result = await runFeeEventsTransform(userId);

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

    console.log(`\n完了: finance_raw ${result.processed}件処理、fee_events ${result.saved}件保存、スキップ ${result.skipped}件`);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error('[fee_events transform] error:', msg);
    process.exit(1);
  }
}

main();
