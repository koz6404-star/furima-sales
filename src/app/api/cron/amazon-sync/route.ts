/**
 * Vercel Cron: Amazon 全同期の定期実行
 *
 * vercel.json で schedule 設定し、毎日自動実行。
 * CRON_SECRET 環境変数で認証。
 *
 * 手動実行: curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/amazon-sync
 */
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';

// 各ステップの runner を直接 import
import { runOrdersRawSync } from '@/lib/amazon/run-orders-raw-sync';
import { runSalesLinesTransform } from '@/lib/amazon/run-sales-lines-transform';
import { runFinanceRawSync } from '@/lib/amazon/run-finance-raw-sync';
import { runFeeEventsTransform } from '@/lib/amazon/run-fee-events-transform';
import { syncSettlementPostage } from '@/lib/amazon/settlement-postage-sync';
import { runFbaInventoryRawSync } from '@/lib/amazon/run-fba-inventory-raw-sync';
import { runInventoryCurrentTransform } from '@/lib/amazon/run-inventory-current-transform';
import { runFbmInventorySync } from '@/lib/amazon/run-fbm-inventory-sync';
import { runBuildSalesMart } from '@/lib/amazon/run-build-sales-mart';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  // CRON_SECRET による認証
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 対象ユーザー ID（環境変数で設定）
  const userId = process.env.AMAZON_CRON_USER_ID ?? process.env.AMAZON_USER_ID;
  if (!userId) {
    return NextResponse.json({ error: 'AMAZON_CRON_USER_ID not set' }, { status: 500 });
  }

  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const log: Record<string, string> = {};

  const now = new Date();
  const createdAfter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  // Amazon API: createdBefore must be at least 2 minutes before current time
  const createdBefore = new Date(now.getTime() - 5 * 60 * 1000);

  // 1. Orders raw
  try {
    const r = await runOrdersRawSync(userId, { createdAfter, createdBefore });
    log.orders = `${r.ordersSaved}件`;
    if (r.errors.length) errors.push(...r.errors.map(e => `[orders] ${e}`));
  } catch (e) { errors.push(`[orders] ${(e as Error).message}`); }

  // 2. sales_lines
  try {
    const r = await runSalesLinesTransform(userId);
    log.sales_lines = `${r.saved}件`;
    if (r.errors.length) errors.push(...r.errors.map(e => `[sales-lines] ${e}`));
  } catch (e) { errors.push(`[sales-lines] ${(e as Error).message}`); }

  // 3. Finance raw
  try {
    const r = await runFinanceRawSync(userId);
    log.finance = `${r.saved}件`;
    if (r.errors.length) errors.push(...r.errors.map(e => `[finance] ${e}`));
  } catch (e) { errors.push(`[finance] ${(e as Error).message}`); }

  // 4. fee_events
  try {
    const r = await runFeeEventsTransform(userId);
    log.fee_events = `${r.saved}件`;
    if (r.errors.length) errors.push(...r.errors.map(e => `[fee-events] ${e}`));
  } catch (e) { errors.push(`[fee-events] ${(e as Error).message}`); }

  // 5. Settlement Postage（配送ラベル代）
  try {
    const supabase = createServiceRoleClient();
    const r = await syncSettlementPostage(supabase, userId);
    log.settlement_postage = `${r.saved}件`;
    if (r.errors.length) errors.push(...r.errors.map(e => `[settlement-postage] ${e}`));
  } catch (e) { errors.push(`[settlement-postage] ${(e as Error).message}`); }

  // 6. FBA Inventory
  try {
    const r = await runFbaInventoryRawSync(userId);
    log.fba_inventory = `${r.saved}件`;
    if (r.errors.length) errors.push(...r.errors.map(e => `[fba] ${e}`));
  } catch (e) { errors.push(`[fba] ${(e as Error).message}`); }

  // 7. inventory_current
  try {
    const r = await runInventoryCurrentTransform(userId);
    log.inventory_current = `${r.saved}件`;
    if (r.errors.length) errors.push(...r.errors.map(e => `[inventory-current] ${e}`));
  } catch (e) { errors.push(`[inventory-current] ${(e as Error).message}`); }

  // 8. FBM Inventory
  if (process.env.AMAZON_SELLER_ID) {
    try {
      const r = await runFbmInventorySync(userId);
      log.fbm_inventory = `${r.saved}件`;
      if (r.errors.length) errors.push(...r.errors.map(e => `[fbm] ${e}`));
    } catch (e) { errors.push(`[fbm] ${(e as Error).message}`); }
  }

  // 9. mart 構築
  try {
    const r = await runBuildSalesMart(userId);
    log.mart = `SKU ${r.sku_upserted}件`;
    if (r.errors.length) errors.push(...r.errors.map(e => `[mart] ${e}`));
  } catch (e) { errors.push(`[mart] ${(e as Error).message}`); }

  return NextResponse.json({
    ok: errors.length === 0,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    user_id: userId,
    log,
    errors: errors.length > 0 ? errors : undefined,
  });
}
