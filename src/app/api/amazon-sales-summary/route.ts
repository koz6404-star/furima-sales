/**
 * Phase13/Phase14/Phase7: confirmed 売上集計API
 * Phase7より: mart テーブルが存在すれば優先読み取り（高速）。
 *   - from/to 指定なし → mart テーブルから読み取り（mart 空の場合は都度計算）
 *   - from/to 指定あり → mart daily/monthly を date フィルタで読み取り; sku/asin は都度計算
 * mart テーブルは `npm run amazon-build-sales-mart` で事前構築すること。
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildSalesMart } from '@/lib/amazon/build-sales-mart';
import { fetchAllPages, fetchAllPagesIn } from '@/lib/supabase/fetch-all';

export const dynamic = 'force-dynamic';

type AggRow = {
  order_count: number;
  line_count: number;
  units_sold: number;
  sales_amount_yen: number;
  fee_amount_yen: number;
  sales_after_fee_yen: number;
};

type SalesLine = {
  id: string;
  order_id: string;
  order_date: string;
  sku: string | null;
  asin: string | null;
  product_name: string | null;
  quantity: number;
  sales_amount_yen: number | null;
};

/** mart テーブルから集計を読み取る（from/to オプション） */
async function readFromMart(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string,
  from: string | null,
  to: string | null
) {
  // 日次
  let dailyQuery = supabase
    .from('amazon_sales_summary_daily')
    .select('date, order_count, line_count, units_sold, sales_amount_yen, fee_amount_yen, sales_after_fee_yen')
    .eq('user_id', userId)
    .order('date', { ascending: true });
  if (from) dailyQuery = dailyQuery.gte('date', from);
  if (to) dailyQuery = dailyQuery.lte('date', to);
  const { data: dailyRows } = await dailyQuery;

  // 月次
  let monthlyQuery = supabase
    .from('amazon_sales_summary_monthly')
    .select('month, order_count, line_count, units_sold, sales_amount_yen, fee_amount_yen, sales_after_fee_yen')
    .eq('user_id', userId)
    .order('month', { ascending: true });
  if (from) monthlyQuery = monthlyQuery.gte('month', from.slice(0, 7));
  if (to) monthlyQuery = monthlyQuery.lte('month', to.slice(0, 7));
  const { data: monthlyRows } = await monthlyQuery;

  // SKU（全期間）
  const { data: skuRows } = await supabase
    .from('amazon_sales_summary_sku')
    .select('sku, product_name, order_count, line_count, units_sold, sales_amount_yen, fee_amount_yen, sales_after_fee_yen')
    .eq('user_id', userId)
    .order('sales_amount_yen', { ascending: false });

  // ASIN（全期間）
  const { data: asinRows } = await supabase
    .from('amazon_sales_summary_asin')
    .select('asin, product_name, order_count, line_count, units_sold, sales_amount_yen, fee_amount_yen, sales_after_fee_yen')
    .eq('user_id', userId)
    .order('sales_amount_yen', { ascending: false });

  return { dailyRows: dailyRows ?? [], monthlyRows: monthlyRows ?? [], skuRows: skuRows ?? [], asinRows: asinRows ?? [] };
}

/** 集計から合計行を算出 */
function calcTotal(rows: AggRow[]): AggRow {
  return rows.reduce(
    (acc, r) => ({
      order_count: acc.order_count + r.order_count,
      line_count: acc.line_count + r.line_count,
      units_sold: acc.units_sold + r.units_sold,
      sales_amount_yen: acc.sales_amount_yen + r.sales_amount_yen,
      fee_amount_yen: acc.fee_amount_yen + r.fee_amount_yen,
      sales_after_fee_yen: acc.sales_after_fee_yen + r.sales_after_fee_yen,
    }),
    { order_count: 0, line_count: 0, units_sold: 0, sales_amount_yen: 0, fee_amount_yen: 0, sales_after_fee_yen: 0 }
  );
}

/** 都度計算（mart が空のとき、または日次/月次以外で date filter が必要なとき） */
async function computeOnDemand(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  userId: string,
  from: string | null,
  to: string | null
) {
  let query = supabase
    .from('amazon_sales_lines')
    .select('id, order_id, order_date, sku, asin, product_name, quantity, sales_amount_yen')
    .eq('user_id', userId)
    .eq('sales_state', 'confirmed');

  if (from) query = query.gte('order_date', from);
  if (to) query = query.lte('order_date', to);

  const { data: lines, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (lines ?? []) as SalesLine[];
  const orderIds = [...new Set(rows.map((r) => r.order_id).filter(Boolean))];

  let feeMap: Record<string, number> = {};
  if (orderIds.length > 0) {
    // 1,000 行の既定上限で静かに切れるため必ずページングする（DEV-053）
    const { data: feeRows } = await fetchAllPagesIn<{
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
    for (const r of feeRows ?? []) {
      const oid = (r.order_id ?? '').trim();
      if (oid) feeMap[oid] = (feeMap[oid] ?? 0) + (Number(r.fee_amount_yen) || 0);
    }
  }

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

  // 日次
  const byDayMap = new Map<string, { orderIds: Set<string>; lines: typeof enriched }>();
  for (const r of enriched) {
    const date = r.order_date?.slice(0, 10) ?? '';
    if (!date) continue;
    if (!byDayMap.has(date)) byDayMap.set(date, { orderIds: new Set(), lines: [] });
    const cell = byDayMap.get(date)!;
    cell.orderIds.add(r.order_id?.trim() ?? '');
    cell.lines.push(r);
  }
  const byDay = [];
  for (const [date, cell] of byDayMap) {
    const feeTotal = [...cell.orderIds].reduce((s, oid) => s + (feeMap[oid] ?? 0), 0);
    const salesTotal = cell.lines.reduce((s, l) => s + l.sales_val, 0);
    byDay.push({ date, order_count: cell.orderIds.size, line_count: cell.lines.length, units_sold: cell.lines.reduce((s, l) => s + (l.quantity || 0), 0), sales_amount_yen: salesTotal, fee_amount_yen: feeTotal, sales_after_fee_yen: salesTotal + feeTotal });
  }
  byDay.sort((a, b) => a.date.localeCompare(b.date));

  // 月次
  const byMonthMap = new Map<string, { orderIds: Set<string>; lines: typeof enriched }>();
  for (const r of enriched) {
    const month = r.order_date?.slice(0, 7) ?? '';
    if (!month) continue;
    if (!byMonthMap.has(month)) byMonthMap.set(month, { orderIds: new Set(), lines: [] });
    const cell = byMonthMap.get(month)!;
    cell.orderIds.add(r.order_id?.trim() ?? '');
    cell.lines.push(r);
  }
  const byMonth = [];
  for (const [month, cell] of byMonthMap) {
    const feeTotal = [...cell.orderIds].reduce((s, oid) => s + (feeMap[oid] ?? 0), 0);
    const salesTotal = cell.lines.reduce((s, l) => s + l.sales_val, 0);
    byMonth.push({ month, order_count: cell.orderIds.size, line_count: cell.lines.length, units_sold: cell.lines.reduce((s, l) => s + (l.quantity || 0), 0), sales_amount_yen: salesTotal, fee_amount_yen: feeTotal, sales_after_fee_yen: salesTotal + feeTotal });
  }
  byMonth.sort((a, b) => a.month.localeCompare(b.month));

  // SKU別
  const bySkuMap = new Map<string, { product_name: string | null; orderIds: Set<string>; lines: typeof enriched }>();
  for (const r of enriched) {
    const sku = (r.sku ?? '').trim() || '(SKUなし)';
    if (!bySkuMap.has(sku)) bySkuMap.set(sku, { product_name: r.product_name, orderIds: new Set(), lines: [] });
    const cell = bySkuMap.get(sku)!;
    cell.orderIds.add(r.order_id?.trim() ?? '');
    cell.lines.push(r);
  }
  const bySku = [];
  for (const [sku, cell] of bySkuMap) {
    const salesTotal = cell.lines.reduce((s, l) => s + l.sales_val, 0);
    const feeTotal = cell.lines.reduce((s, l) => s + l.fee_attributed, 0);
    bySku.push({ sku, product_name: cell.product_name, order_count: cell.orderIds.size, line_count: cell.lines.length, units_sold: cell.lines.reduce((s, l) => s + (l.quantity || 0), 0), sales_amount_yen: salesTotal, fee_amount_yen: feeTotal, sales_after_fee_yen: salesTotal + feeTotal });
  }
  bySku.sort((a, b) => b.sales_amount_yen - a.sales_amount_yen);

  // ASIN別
  const byAsinMap = new Map<string, { product_name: string | null; orderIds: Set<string>; lines: typeof enriched }>();
  for (const r of enriched) {
    const asin = (r.asin ?? '').trim() || '(ASINなし)';
    if (!byAsinMap.has(asin)) byAsinMap.set(asin, { product_name: r.product_name, orderIds: new Set(), lines: [] });
    const cell = byAsinMap.get(asin)!;
    cell.orderIds.add(r.order_id?.trim() ?? '');
    cell.lines.push(r);
  }
  const byAsin = [];
  for (const [asin, cell] of byAsinMap) {
    const salesTotal = cell.lines.reduce((s, l) => s + l.sales_val, 0);
    const feeTotal = cell.lines.reduce((s, l) => s + l.fee_attributed, 0);
    byAsin.push({ asin, product_name: cell.product_name, order_count: cell.orderIds.size, line_count: cell.lines.length, units_sold: cell.lines.reduce((s, l) => s + (l.quantity || 0), 0), sales_amount_yen: salesTotal, fee_amount_yen: feeTotal, sales_after_fee_yen: salesTotal + feeTotal });
  }
  byAsin.sort((a, b) => b.sales_amount_yen - a.sales_amount_yen);

  const totalOrderIds = new Set(rows.map((r) => r.order_id?.trim()).filter(Boolean));
  const actualFeeTotal = [...totalOrderIds].reduce((s, oid) => s + (feeMap[oid] ?? 0), 0);
  const salesTotal = enriched.reduce((s, r) => s + r.sales_val, 0);
  const total = {
    order_count: totalOrderIds.size,
    line_count: rows.length,
    units_sold: rows.reduce((s, r) => s + (r.quantity || 0), 0),
    sales_amount_yen: salesTotal,
    fee_amount_yen: actualFeeTotal,
    sales_after_fee_yen: salesTotal + actualFeeTotal,
  };

  return { byDay, byMonth, bySku, byAsin, total };
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // mart テーブルから読み取り試行
    const mart = await readFromMart(supabase, user.id, from, to);
    const martHasData = mart.dailyRows.length > 0;

    let byDay, byMonth, bySku, byAsin, total, source;

    if (martHasData) {
      byDay = mart.dailyRows;
      byMonth = mart.monthlyRows;
      bySku = mart.skuRows;
      byAsin = mart.asinRows;
      total = calcTotal(mart.dailyRows as AggRow[]);
      source = 'mart';
    } else {
      // mart が空の場合は都度計算（フォールバック）
      const computed = await computeOnDemand(supabase, user.id, from, to);
      byDay = computed.byDay;
      byMonth = computed.byMonth;
      bySku = computed.bySku;
      byAsin = computed.byAsin;
      total = computed.total;
      source = 'on_demand';
    }

    // 配送ラベル代合計を取得（Settlement Report 由来 or 旧 __POSTAGE__）
    const { data: postageRows } = await fetchAllPages<{ fee_amount_yen: number | null }>(
      (from_, to_) =>
        supabase
          .from('amazon_fee_events')
          .select('fee_amount_yen')
          .eq('user_id', user.id)
          .or('fee_type.eq.ShippingLabelPurchase,order_id.eq.__POSTAGE__')
          .range(from_, to_),
    );
    const postage_total_yen = (postageRows ?? []).reduce((s, r) => s + (Number(r.fee_amount_yen) || 0), 0);

    return NextResponse.json({
      ok: true,
      source,
      from: from ?? null,
      to: to ?? null,
      postage_total_yen,
      note: '集計基準: sales_state=confirmed, order_date（売上日）. source=mart は事前集計テーブルから読み取り。npm run amazon-build-sales-mart で更新。',
      summary: { total, by_day: byDay, by_month: byMonth, by_sku: bySku, by_asin: byAsin },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? String(e) }, { status: 500 });
  }
}
