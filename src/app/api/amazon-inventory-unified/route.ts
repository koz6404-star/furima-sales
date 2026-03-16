/**
 * 統合在庫 API（Phase15）
 * GET /api/amazon-inventory-unified
 *
 * FBA + FBM の在庫を統合して返す。
 * amazon_sales_summary_sku の売上データも結合し、
 * SKU ごとに「在庫・売上・手数料・販売個数」をまとめて返す。
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // FBA 在庫
  const { data: fbaRows } = await supabase
    .from('amazon_inventory_current')
    .select('seller_sku, channel_type, fulfillable_qty, inbound_qty, reserved_qty, unfulfillable_qty, total_available_qty, snapshot_at')
    .eq('user_id', user.id);

  // FBM 在庫
  const { data: fbmRows } = await supabase
    .from('amazon_fbm_inventory_current')
    .select('seller_sku, quantity, item_name, listing_status, snapshot_at')
    .eq('user_id', user.id);

  // SKU 別売上サマリー
  const { data: skuSummary } = await supabase
    .from('amazon_sales_summary_sku')
    .select('sku, product_name, units_sold, sales_amount_yen, fee_amount_yen, sales_after_fee_yen, fulfillment_type, current_inventory')
    .eq('user_id', user.id);

  // 統合マップ構築
  const unified: Record<string, {
    seller_sku: string;
    channel_type: string;
    product_name: string | null;
    available_qty: number;
    inbound_qty: number;
    reserved_qty: number;
    units_sold: number;
    sales_amount_yen: number;
    fee_amount_yen: number;
    sales_after_fee_yen: number;
    snapshot_at: string | null;
  }> = {};

  // FBA
  for (const r of fbaRows ?? []) {
    unified[r.seller_sku] = {
      seller_sku: r.seller_sku,
      channel_type: 'FBA',
      product_name: null,
      available_qty: r.total_available_qty ?? r.fulfillable_qty ?? 0,
      inbound_qty: r.inbound_qty ?? 0,
      reserved_qty: r.reserved_qty ?? 0,
      units_sold: 0,
      sales_amount_yen: 0,
      fee_amount_yen: 0,
      sales_after_fee_yen: 0,
      snapshot_at: r.snapshot_at,
    };
  }

  // FBM
  for (const r of fbmRows ?? []) {
    const existing = unified[r.seller_sku];
    if (existing) {
      existing.channel_type = 'MIXED';
      existing.available_qty += (r.quantity ?? 0);
      existing.product_name = existing.product_name ?? r.item_name;
    } else {
      unified[r.seller_sku] = {
        seller_sku: r.seller_sku,
        channel_type: 'FBM',
        product_name: r.item_name,
        available_qty: r.quantity ?? 0,
        inbound_qty: 0,
        reserved_qty: 0,
        units_sold: 0,
        sales_amount_yen: 0,
        fee_amount_yen: 0,
        sales_after_fee_yen: 0,
        snapshot_at: r.snapshot_at,
      };
    }
  }

  // 売上データを結合
  for (const s of skuSummary ?? []) {
    const sku = s.sku;
    if (unified[sku]) {
      unified[sku].product_name = unified[sku].product_name ?? s.product_name;
      unified[sku].units_sold = s.units_sold ?? 0;
      unified[sku].sales_amount_yen = s.sales_amount_yen ?? 0;
      unified[sku].fee_amount_yen = s.fee_amount_yen ?? 0;
      unified[sku].sales_after_fee_yen = s.sales_after_fee_yen ?? 0;
    } else {
      // 在庫データがないが売上はある SKU
      unified[sku] = {
        seller_sku: sku,
        channel_type: s.fulfillment_type ?? 'UNKNOWN',
        product_name: s.product_name,
        available_qty: 0,
        inbound_qty: 0,
        reserved_qty: 0,
        units_sold: s.units_sold ?? 0,
        sales_amount_yen: s.sales_amount_yen ?? 0,
        fee_amount_yen: s.fee_amount_yen ?? 0,
        sales_after_fee_yen: s.sales_after_fee_yen ?? 0,
        snapshot_at: null,
      };
    }
  }

  const items = Object.values(unified).sort((a, b) => b.sales_amount_yen - a.sales_amount_yen);

  return NextResponse.json({
    ok: true,
    count: items.length,
    items,
  });
}
