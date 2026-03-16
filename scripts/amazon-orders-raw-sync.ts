#!/usr/bin/env npx tsx
/**
 * Orders raw 取得のアプリ外実行スクリプト
 * Amazon Orders API → amazon_orders_raw 保存を CLI から実行
 *
 * 実行例:
 *   npm run amazon-orders-raw-sync -- --user-id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *   npm run amazon-orders-raw-sync -- --user-id=xxx --from=2026-01-01 --to=2026-03-31
 *   AMAZON_USER_ID=xxx npm run amazon-orders-raw-sync
 *
 * オプション:
 *   --user-id=<UUID>   対象ユーザーID（必須）
 *   --from=YYYY-MM-DD  取得開始日（省略時: 30日前）
 *   --to=YYYY-MM-DD    取得終了日（省略時: 現在）
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

import { runOrdersRawSync } from '../src/lib/amazon/run-orders-raw-sync';

function parseArgs(): { userId: string | null; from: Date | null; to: Date | null } {
  let userId: string | null = null;
  let from: Date | null = null;
  let to: Date | null = null;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--user-id=')) {
      userId = arg.slice('--user-id='.length).trim();
    } else if (arg.startsWith('--from=')) {
      from = new Date(arg.slice('--from='.length).trim());
    } else if (arg.startsWith('--to=')) {
      to = new Date(arg.slice('--to='.length).trim());
    } else if (!arg.startsWith('-')) {
      userId ??= arg.trim();
    }
  }

  if (!userId) {
    userId = process.env.AMAZON_USER_ID?.trim() ?? null;
  }

  return { userId, from, to };
}

async function main() {
  const { userId, from, to } = parseArgs();

  if (!userId) {
    console.error(`
[エラー] user_id を指定してください。

使い方:
  npm run amazon-orders-raw-sync -- --user-id=<UUID>
  npm run amazon-orders-raw-sync -- --user-id=<UUID> --from=2026-01-01 --to=2026-03-31
  AMAZON_USER_ID=<UUID> npm run amazon-orders-raw-sync

事前: .env.local に以下を設定
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  SELLING_PARTNER_APP_CLIENT_ID
  SELLING_PARTNER_APP_CLIENT_SECRET
  AMAZON_REFRESH_TOKEN
`);
    process.exit(1);
  }

  const now = new Date();
  const createdAfter = from ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const createdBefore = to ?? now;

  const startedAt = new Date().toISOString();
  console.log(`[orders raw sync] started at ${startedAt}`);
  console.log(`[orders raw sync] user_id: ${userId}`);
  console.log(`[orders raw sync] from: ${createdAfter.toISOString().slice(0, 10)}`);
  console.log(`[orders raw sync] to:   ${createdBefore.toISOString().slice(0, 10)}`);

  try {
    const result = await runOrdersRawSync(userId, { createdAfter, createdBefore });

    const log = {
      user_id: userId,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      orders_fetched: result.ordersFetched,
      orders_saved: result.ordersSaved,
      order_items_fetched: result.orderItemsFetched,
      order_items_saved: result.orderItemsSaved,
      errors: result.errors,
      ok: result.errors.length === 0,
    };

    console.log(JSON.stringify(log, null, 2));

    if (result.errors.length > 0) {
      console.error('\n[エラー]', result.errors.join('\n'));
      process.exit(1);
    }

    console.log(
      `\n完了: 注文 ${result.ordersSaved}件保存、注文明細 ${result.orderItemsSaved}件保存`
    );
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error('[orders raw sync] error:', msg);
    process.exit(1);
  }
}

main();
