#!/usr/bin/env npx tsx
/**
 * Amazon 売上集計 mart 構築スクリプト（再設計 Phase7）
 * confirmed 売上明細 + fee_events を集約し、mart テーブルに upsert する。
 *
 * 実行例:
 *   npm run amazon-build-sales-mart -- --user-id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *   AMAZON_USER_ID=xxx npm run amazon-build-sales-mart
 *
 * 事前: .env.local に NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY を設定
 *       Supabase に 028_amazon_sales_mart.sql migration を適用済みであること
 */
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { runBuildSalesMart } from '../src/lib/amazon/run-build-sales-mart';

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
  npm run amazon-build-sales-mart -- --user-id=<UUID>
  AMAZON_USER_ID=<UUID> npm run amazon-build-sales-mart

事前: .env.local に以下を設定
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
`);
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  console.log(`[build-sales-mart] started at ${startedAt}`);
  console.log(`[build-sales-mart] user_id: ${userId}`);

  try {
    const result = await runBuildSalesMart(userId);

    const log = {
      user_id: userId,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      daily_upserted: result.daily_upserted,
      monthly_upserted: result.monthly_upserted,
      sku_upserted: result.sku_upserted,
      asin_upserted: result.asin_upserted,
      errors: result.errors,
      ok: result.errors.length === 0,
    };

    console.log(JSON.stringify(log, null, 2));

    if (result.errors.length > 0) {
      console.error('\n[エラー]', result.errors.join('\n'));
      process.exit(1);
    }

    console.log(
      `\n完了: 日次 ${result.daily_upserted}日分、月次 ${result.monthly_upserted}ヶ月分、` +
      `SKU ${result.sku_upserted}件、ASIN ${result.asin_upserted}件`
    );
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error('[build-sales-mart] error:', msg);
    process.exit(1);
  }
}

main();
