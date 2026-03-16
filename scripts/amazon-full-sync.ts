#!/usr/bin/env npx tsx
/**
 * Amazon 全パイプライン 連鎖実行スクリプト（再設計 Phase5）
 *
 * 以下を順番に実行する:
 *   1. Orders raw 取得     → amazon_orders_raw / amazon_order_items_raw
 *   2. sales_lines 整形    → amazon_sales_lines
 *   3. Finance raw 取得    → amazon_finance_raw
 *   4. fee_events 整形     → amazon_fee_events
 *   5. FBA Inventory 取得  → amazon_fba_inventory_raw
 *   6. inventory_current 整形 → amazon_inventory_current
 *
 * 実行例:
 *   npm run amazon-full-sync -- --user-id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *   npm run amazon-full-sync -- --user-id=xxx --from=2026-01-01 --to=2026-03-31
 *   AMAZON_USER_ID=xxx npm run amazon-full-sync
 *
 * オプション:
 *   --user-id=<UUID>   対象ユーザーID（必須）
 *   --from=YYYY-MM-DD  Orders 取得開始日（省略時: 30日前）
 *   --to=YYYY-MM-DD    Orders 取得終了日（省略時: 現在）
 *   --skip-orders      Orders 取得をスキップ（整形のみ再実行したい場合）
 *   --skip-finance     Finance 取得をスキップ
 *   --skip-inventory   FBA Inventory 取得をスキップ
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
import { runSalesLinesTransform } from '../src/lib/amazon/run-sales-lines-transform';
import { runFinanceRawSync } from '../src/lib/amazon/run-finance-raw-sync';
import { runFeeEventsTransform } from '../src/lib/amazon/run-fee-events-transform';
import { runFbaInventoryRawSync } from '../src/lib/amazon/run-fba-inventory-raw-sync';
import { runInventoryCurrentTransform } from '../src/lib/amazon/run-inventory-current-transform';
import { runFbmInventorySync } from '../src/lib/amazon/run-fbm-inventory-sync';
import { runBuildSalesMart } from '../src/lib/amazon/run-build-sales-mart';

interface ParsedArgs {
  userId: string | null;
  from: Date | null;
  to: Date | null;
  skipOrders: boolean;
  skipFinance: boolean;
  skipInventory: boolean;
  skipFbm: boolean;
}

function parseArgs(): ParsedArgs {
  let userId: string | null = null;
  let from: Date | null = null;
  let to: Date | null = null;
  let skipOrders = false;
  let skipFinance = false;
  let skipInventory = false;
  let skipFbm = false;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--user-id=')) {
      userId = arg.slice('--user-id='.length).trim();
    } else if (arg.startsWith('--from=')) {
      from = new Date(arg.slice('--from='.length).trim());
    } else if (arg.startsWith('--to=')) {
      to = new Date(arg.slice('--to='.length).trim());
    } else if (arg === '--skip-orders') {
      skipOrders = true;
    } else if (arg === '--skip-finance') {
      skipFinance = true;
    } else if (arg === '--skip-inventory') {
      skipInventory = true;
    } else if (arg === '--skip-fbm') {
      skipFbm = true;
    } else if (!arg.startsWith('-')) {
      userId ??= arg.trim();
    }
  }

  if (!userId) {
    userId = process.env.AMAZON_USER_ID?.trim() ?? null;
  }

  return { userId, from, to, skipOrders, skipFinance, skipInventory, skipFbm };
}

function step(label: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`▶ ${label}`);
  console.log('─'.repeat(60));
}

function ok(label: string, summary: string) {
  console.log(`✓ ${label}: ${summary}`);
}

function skip(label: string) {
  console.log(`— ${label}: スキップ`);
}

async function main() {
  const { userId, from, to, skipOrders, skipFinance, skipInventory, skipFbm } = parseArgs();

  if (!userId) {
    console.error(`
[エラー] user_id を指定してください。

使い方:
  npm run amazon-full-sync -- --user-id=<UUID>
  npm run amazon-full-sync -- --user-id=<UUID> --from=2026-01-01 --to=2026-03-31
  AMAZON_USER_ID=<UUID> npm run amazon-full-sync

オプション:
  --from=YYYY-MM-DD   Orders 取得開始日（省略時: 30日前）
  --to=YYYY-MM-DD     Orders 取得終了日（省略時: 現在）
  --skip-orders       Orders 取得をスキップ
  --skip-finance      Finance 取得をスキップ
  --skip-inventory    FBA Inventory 取得をスキップ
  --skip-fbm          FBM 在庫取得をスキップ
`);
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  const now = new Date();
  const createdAfter = from ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const createdBefore = to ?? now;

  console.log(`[full-sync] started at ${startedAt}`);
  console.log(`[full-sync] user_id: ${userId}`);
  if (!skipOrders) {
    console.log(`[full-sync] orders from: ${createdAfter.toISOString().slice(0, 10)}`);
    console.log(`[full-sync] orders to:   ${createdBefore.toISOString().slice(0, 10)}`);
  }

  const allErrors: string[] = [];

  // ── 1. Orders 取得 ───────────────────────────────────
  if (skipOrders) {
    skip('1/6 Orders raw 取得');
  } else {
    step('1/6 Orders raw 取得');
    try {
      const r = await runOrdersRawSync(userId, { createdAfter, createdBefore });
      if (r.errors.length > 0) allErrors.push(...r.errors.map(e => `[orders-sync] ${e}`));
      ok('orders', `注文 ${r.ordersSaved}件、注文明細 ${r.orderItemsSaved}件`);
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      allErrors.push(`[orders-sync] ${msg}`);
      console.error(`✗ Orders raw 取得 error: ${msg}`);
    }
  }

  // ── 2. sales_lines 整形 ──────────────────────────────
  step('2/6 sales_lines 整形');
  try {
    const r = await runSalesLinesTransform(userId);
    if (r.errors.length > 0) allErrors.push(...r.errors.map(e => `[sales-lines] ${e}`));
    ok('sales_lines', `${r.saved}件保存、スキップ ${r.skipped}件`);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    allErrors.push(`[sales-lines] ${msg}`);
    console.error(`✗ sales_lines 整形 error: ${msg}`);
  }

  // ── 3. Finance 取得 ──────────────────────────────────
  if (skipFinance) {
    skip('3/6 Finance raw 取得');
  } else {
    step('3/6 Finance raw 取得');
    try {
      const r = await runFinanceRawSync(userId);
      if (r.errors.length > 0) allErrors.push(...r.errors.map(e => `[finance-sync] ${e}`));
      ok('finance', `${r.saved}件保存、スキップ ${r.skipped}件`);
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      allErrors.push(`[finance-sync] ${msg}`);
      console.error(`✗ Finance raw 取得 error: ${msg}`);
    }
  }

  // ── 4. fee_events 整形 ───────────────────────────────
  step('4/6 fee_events 整形');
  try {
    const r = await runFeeEventsTransform(userId);
    if (r.errors.length > 0) allErrors.push(...r.errors.map(e => `[fee-events] ${e}`));
    ok('fee_events', `${r.saved}件保存、スキップ ${r.skipped}件`);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    allErrors.push(`[fee-events] ${msg}`);
    console.error(`✗ fee_events 整形 error: ${msg}`);
  }

  // ── 5. FBA Inventory 取得 ────────────────────────────
  if (skipInventory) {
    skip('5/6 FBA Inventory raw 取得');
  } else {
    step('5/6 FBA Inventory raw 取得');
    try {
      const r = await runFbaInventoryRawSync(userId);
      if (r.errors.length > 0) allErrors.push(...r.errors.map(e => `[fba-sync] ${e}`));
      ok('fba_inventory', `${r.saved}件保存`);
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      allErrors.push(`[fba-sync] ${msg}`);
      console.error(`✗ FBA Inventory raw 取得 error: ${msg}`);
    }
  }

  // ── 6. inventory_current 整形 ────────────────────────
  step('6/8 inventory_current 整形（FBA）');
  try {
    const r = await runInventoryCurrentTransform(userId);
    if (r.errors.length > 0) allErrors.push(...r.errors.map(e => `[inventory-current] ${e}`));
    ok('inventory_current', `${r.saved}件保存、スキップ ${r.skipped}件`);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    allErrors.push(`[inventory-current] ${msg}`);
    console.error(`✗ inventory_current 整形 error: ${msg}`);
  }

  // ── 7. FBM 在庫取得 ──────────────────────────────────
  if (skipFbm || !process.env.AMAZON_SELLER_ID) {
    if (!process.env.AMAZON_SELLER_ID) {
      skip('7/8 FBM 在庫取得（AMAZON_SELLER_ID 未設定のためスキップ）');
    } else {
      skip('7/8 FBM 在庫取得');
    }
  } else {
    step('7/8 FBM 在庫取得（Listings Items API）');
    try {
      const r = await runFbmInventorySync(userId);
      if (r.errors.length > 0) allErrors.push(...r.errors.map(e => `[fbm-sync] ${e}`));
      ok('fbm_inventory', `対象SKU ${r.skuCount}件、取得 ${r.fetched}件、保存 ${r.saved}件`);
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      allErrors.push(`[fbm-sync] ${msg}`);
      console.error(`✗ FBM 在庫取得 error: ${msg}`);
    }
  }

  // ── 8. mart テーブル構築 ─────────────────────────────
  step('8/8 売上集計 mart 構築');
  try {
    const r = await runBuildSalesMart(userId);
    if (r.errors.length > 0) allErrors.push(...r.errors.map(e => `[build-mart] ${e}`));
    ok('sales_mart', `日次 ${r.daily_upserted}日、月次 ${r.monthly_upserted}ヶ月、SKU ${r.sku_upserted}件、ASIN ${r.asin_upserted}件`);

  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    allErrors.push(`[build-mart] ${msg}`);
    console.error(`✗ mart 構築 error: ${msg}`);
  }

  // ── 最終結果 ─────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[full-sync] finished at ${new Date().toISOString()}`);

  if (allErrors.length > 0) {
    console.error(`\n[エラー ${allErrors.length}件]`);
    allErrors.forEach(e => console.error(`  ${e}`));
    process.exit(1);
  } else {
    console.log('✓ 全ステップ正常完了');
  }
}

main();
