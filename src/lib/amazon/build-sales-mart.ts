/**
 * Amazon 売上集計 mart テーブル構築（再設計 Phase7）
 * amazon_sales_lines (confirmed) + amazon_fee_events を集約し、
 * amazon_sales_summary_* テーブルに upsert する。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPagesIn } from '../supabase/fetch-all';

type SalesLine = {
  id: string;
  order_id: string;
  order_date: string;
  sku: string | null;
  asin: string | null;
  product_name: string | null;
  quantity: number;
  sales_amount_yen: number | null;
  fulfillment_type: string | null;
};

export interface BuildSalesMartResult {
  daily_upserted: number;
  monthly_upserted: number;
  sku_upserted: number;
  asin_upserted: number;
  errors: string[];
}

export async function buildSalesMart(
  supabase: SupabaseClient,
  userId: string
): Promise<BuildSalesMartResult> {
  const result: BuildSalesMartResult = {
    daily_upserted: 0,
    monthly_upserted: 0,
    sku_upserted: 0,
    asin_upserted: 0,
    errors: [],
  };

  const computedAt = new Date().toISOString();

  // 1. confirmed 売上明細を全件取得（fulfillment_type 含む）
  const { data: lines, error: linesError } = await supabase
    .from('amazon_sales_lines')
    .select('id, order_id, order_date, sku, asin, product_name, quantity, sales_amount_yen, fulfillment_type')
    .eq('user_id', userId)
    .eq('sales_state', 'confirmed');

  if (linesError) {
    result.errors.push(`sales_lines fetch: ${linesError.message}`);
    return result;
  }

  const rows = (lines ?? []) as SalesLine[];
  if (rows.length === 0) {
    return result;
  }

  // 2. fee_events を order_id 単位で集約
  const orderIds = [...new Set(rows.map((r) => r.order_id).filter(Boolean))];
  const feeMap: Record<string, number> = {};

  if (orderIds.length > 0) {
    // 1,000 行の既定上限で静かに切れるため必ずページングする（DEV-053）
    const { data: feeRows, error: feeError } = await fetchAllPagesIn<{
      order_id: string | null;
      fee_amount_yen: number | null;
    }>(orderIds, (chunk, from, to) =>
      supabase
        .from('amazon_fee_events')
        .select('order_id, fee_amount_yen')
        .eq('user_id', userId)
        .in('order_id', chunk)
        .range(from, to),
    );

    if (feeError) {
      result.errors.push(`fee_events fetch: ${feeError}`);
    } else {
      for (const r of feeRows ?? []) {
        const oid = (r.order_id ?? '').trim();
        if (oid) feeMap[oid] = (feeMap[oid] ?? 0) + (Number(r.fee_amount_yen) || 0);
      }
    }
  }

  // 3. 各行に fee 按分を付与（order 内の売上比率で配分。売上0の場合は均等配分）
  const orderSalesMap: Record<string, number> = {};
  const orderLineCountMap: Record<string, number> = {};
  for (const r of rows) {
    const oid = r.order_id?.trim() ?? '';
    if (!oid) continue;
    const amt = r.sales_amount_yen != null ? r.sales_amount_yen : 0;
    orderSalesMap[oid] = (orderSalesMap[oid] ?? 0) + amt;
    orderLineCountMap[oid] = (orderLineCountMap[oid] ?? 0) + 1;
  }

  const enriched = rows.map((r) => {
    const oid = r.order_id?.trim() ?? '';
    const lineSales = r.sales_amount_yen != null ? r.sales_amount_yen : 0;
    const orderSales = orderSalesMap[oid] ?? 0;
    const orderFee = feeMap[oid] ?? 0;
    const lineCount = orderLineCountMap[oid] ?? 1;
    let feeAttributed = 0;
    if (orderSales > 0) {
      feeAttributed = Math.round((orderFee * lineSales) / orderSales);
    } else if (orderFee !== 0 && lineCount > 0) {
      feeAttributed = Math.round(orderFee / lineCount);
    }
    return { ...r, fee_attributed: feeAttributed, sales_val: lineSales };
  });

  // 4. 日次集計
  const byDayMap = new Map<string, { orderIds: Set<string>; lines: typeof enriched }>();
  for (const r of enriched) {
    const date = r.order_date?.slice(0, 10) ?? '';
    if (!date) continue;
    if (!byDayMap.has(date)) byDayMap.set(date, { orderIds: new Set(), lines: [] });
    const cell = byDayMap.get(date)!;
    cell.orderIds.add(r.order_id?.trim() ?? '');
    cell.lines.push(r);
  }

  const dailyRows = [];
  for (const [date, cell] of byDayMap) {
    const feeTotal = [...cell.orderIds].reduce((s, oid) => s + (feeMap[oid] ?? 0), 0);
    const salesTotal = cell.lines.reduce((s, l) => s + l.sales_val, 0);
    dailyRows.push({
      user_id: userId,
      date,
      order_count: cell.orderIds.size,
      line_count: cell.lines.length,
      units_sold: cell.lines.reduce((s, l) => s + (l.quantity || 0), 0),
      sales_amount_yen: salesTotal,
      fee_amount_yen: feeTotal,
      sales_after_fee_yen: salesTotal + feeTotal,
      computed_at: computedAt,
    });
  }

  if (dailyRows.length > 0) {
    const { error } = await supabase
      .from('amazon_sales_summary_daily')
      .upsert(dailyRows, { onConflict: 'user_id,date' });
    if (error) {
      result.errors.push(`daily upsert: ${error.message}`);
    } else {
      result.daily_upserted = dailyRows.length;
    }
  }

  // 5. 月次集計
  const byMonthMap = new Map<string, { orderIds: Set<string>; lines: typeof enriched }>();
  for (const r of enriched) {
    const month = r.order_date?.slice(0, 7) ?? '';
    if (!month) continue;
    if (!byMonthMap.has(month)) byMonthMap.set(month, { orderIds: new Set(), lines: [] });
    const cell = byMonthMap.get(month)!;
    cell.orderIds.add(r.order_id?.trim() ?? '');
    cell.lines.push(r);
  }

  const monthlyRows = [];
  for (const [month, cell] of byMonthMap) {
    const feeTotal = [...cell.orderIds].reduce((s, oid) => s + (feeMap[oid] ?? 0), 0);
    const salesTotal = cell.lines.reduce((s, l) => s + l.sales_val, 0);
    monthlyRows.push({
      user_id: userId,
      month,
      order_count: cell.orderIds.size,
      line_count: cell.lines.length,
      units_sold: cell.lines.reduce((s, l) => s + (l.quantity || 0), 0),
      sales_amount_yen: salesTotal,
      fee_amount_yen: feeTotal,
      sales_after_fee_yen: salesTotal + feeTotal,
      computed_at: computedAt,
    });
  }

  if (monthlyRows.length > 0) {
    const { error } = await supabase
      .from('amazon_sales_summary_monthly')
      .upsert(monthlyRows, { onConflict: 'user_id,month' });
    if (error) {
      result.errors.push(`monthly upsert: ${error.message}`);
    } else {
      result.monthly_upserted = monthlyRows.length;
    }
  }

  // 6. SKU別集計（fulfillment_type + 在庫数を付与）

  // 6a. 在庫データを取得（FBA + FBM）
  const inventoryMap = new Map<string, { channel: string; qty: number }>();
  const { data: fbaInv } = await supabase
    .from('amazon_inventory_current')
    .select('seller_sku, total_available_qty')
    .eq('user_id', userId);
  for (const r of fbaInv ?? []) {
    inventoryMap.set(r.seller_sku, { channel: 'FBA', qty: r.total_available_qty ?? 0 });
  }
  const { data: fbmInv } = await supabase
    .from('amazon_fbm_inventory_current')
    .select('seller_sku, quantity')
    .eq('user_id', userId);
  for (const r of fbmInv ?? []) {
    const existing = inventoryMap.get(r.seller_sku);
    if (existing) {
      // 両方にある場合は MIXED として合算
      inventoryMap.set(r.seller_sku, { channel: 'MIXED', qty: existing.qty + (r.quantity ?? 0) });
    } else {
      inventoryMap.set(r.seller_sku, { channel: 'FBM', qty: r.quantity ?? 0 });
    }
  }

  // 6b. SKU 別に集計
  const bySkuMap = new Map<
    string,
    { product_name: string | null; orderIds: Set<string>; lines: typeof enriched; ftypes: Set<string> }
  >();
  for (const r of enriched) {
    const sku = (r.sku ?? '').trim() || '(SKUなし)';
    if (!bySkuMap.has(sku)) bySkuMap.set(sku, { product_name: r.product_name, orderIds: new Set(), lines: [], ftypes: new Set() });
    const cell = bySkuMap.get(sku)!;
    cell.orderIds.add(r.order_id?.trim() ?? '');
    cell.lines.push(r);
    if (r.fulfillment_type) cell.ftypes.add(r.fulfillment_type);
  }

  const skuRows = [];
  for (const [sku, cell] of bySkuMap) {
    const salesTotal = cell.lines.reduce((s, l) => s + l.sales_val, 0);
    const feeTotal = cell.lines.reduce((s, l) => s + l.fee_attributed, 0);
    const ftypeArr = [...cell.ftypes];
    const fulfillmentType = ftypeArr.length === 0 ? null : ftypeArr.length === 1 ? ftypeArr[0] : 'MIXED';
    const inv = inventoryMap.get(sku);
    skuRows.push({
      user_id: userId,
      sku,
      product_name: cell.product_name,
      order_count: cell.orderIds.size,
      line_count: cell.lines.length,
      units_sold: cell.lines.reduce((s, l) => s + (l.quantity || 0), 0),
      sales_amount_yen: salesTotal,
      fee_amount_yen: feeTotal,
      sales_after_fee_yen: salesTotal + feeTotal,
      fulfillment_type: fulfillmentType,
      current_inventory: inv?.qty ?? null,
      computed_at: computedAt,
    });
  }

  if (skuRows.length > 0) {
    const { error } = await supabase
      .from('amazon_sales_summary_sku')
      .upsert(skuRows, { onConflict: 'user_id,sku' });
    if (error) {
      result.errors.push(`sku upsert: ${error.message}`);
    } else {
      result.sku_upserted = skuRows.length;
    }
  }

  // 7. ASIN別集計
  const byAsinMap = new Map<
    string,
    { product_name: string | null; orderIds: Set<string>; lines: typeof enriched }
  >();
  for (const r of enriched) {
    const asin = (r.asin ?? '').trim() || '(ASINなし)';
    if (!byAsinMap.has(asin)) byAsinMap.set(asin, { product_name: r.product_name, orderIds: new Set(), lines: [] });
    const cell = byAsinMap.get(asin)!;
    cell.orderIds.add(r.order_id?.trim() ?? '');
    cell.lines.push(r);
  }

  const asinRows = [];
  for (const [asin, cell] of byAsinMap) {
    const salesTotal = cell.lines.reduce((s, l) => s + l.sales_val, 0);
    const feeTotal = cell.lines.reduce((s, l) => s + l.fee_attributed, 0);
    asinRows.push({
      user_id: userId,
      asin,
      product_name: cell.product_name,
      order_count: cell.orderIds.size,
      line_count: cell.lines.length,
      units_sold: cell.lines.reduce((s, l) => s + (l.quantity || 0), 0),
      sales_amount_yen: salesTotal,
      fee_amount_yen: feeTotal,
      sales_after_fee_yen: salesTotal + feeTotal,
      computed_at: computedAt,
    });
  }

  if (asinRows.length > 0) {
    const { error } = await supabase
      .from('amazon_sales_summary_asin')
      .upsert(asinRows, { onConflict: 'user_id,asin' });
    if (error) {
      result.errors.push(`asin upsert: ${error.message}`);
    } else {
      result.asin_upserted = asinRows.length;
    }
  }

  return result;
}
