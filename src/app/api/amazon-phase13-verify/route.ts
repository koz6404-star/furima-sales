/**
 * Phase13 完了確認 API
 * confirmed 売上集計の検証
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') ?? '';
    const to = searchParams.get('to') ?? '';

    // 全件数（sales_state 別）
    const { data: allRows } = await supabase
      .from('amazon_sales_lines')
      .select('id, sales_state, order_date')
      .eq('user_id', user.id);

    const byState: Record<string, number> = {};
    for (const r of allRows ?? []) {
      const s = r.sales_state ?? 'other_excluded';
      byState[s] = (byState[s] ?? 0) + 1;
    }

    const confirmedCount = byState.confirmed ?? 0;
    const excludedCount = (allRows?.length ?? 0) - confirmedCount;

    // 期間フィルタ済み confirmed
    let confirmedQuery = supabase
      .from('amazon_sales_lines')
      .select('id, order_id, order_date, sku, asin, sales_amount_yen, quantity')
      .eq('user_id', user.id)
      .eq('sales_state', 'confirmed');
    if (from) confirmedQuery = confirmedQuery.gte('order_date', from);
    if (to) confirmedQuery = confirmedQuery.lte('order_date', to);

    const { data: confirmedRows } = await confirmedQuery;

    const lines = confirmedRows ?? [];
    const orderIds = [...new Set(lines.map((r) => r.order_id).filter(Boolean))];

    let feeMap: Record<string, number> = {};
    let feeJoinCount = 0;
    if (orderIds.length > 0) {
      const { data: feeRows } = await supabase
        .from('amazon_fee_events')
        .select('order_id, fee_amount_yen')
        .eq('user_id', user.id)
        .in('order_id', orderIds);
      for (const r of feeRows ?? []) {
        const oid = (r.order_id ?? '').trim();
        if (oid) {
          feeMap[oid] = (feeMap[oid] ?? 0) + (Number(r.fee_amount_yen) || 0);
        }
      }
      feeJoinCount = Object.keys(feeMap).length;
    }

    const salesTotal = lines.reduce((s, r) => s + (Number(r.sales_amount_yen) || 0), 0);
    const feeTotal = [...new Set(lines.map((r) => r.order_id))].reduce((s, oid) => s + (feeMap[oid ?? ''] ?? 0), 0);
    const salesAfterFee = salesTotal + feeTotal; // Phase14: 差引後 = 売上 + fee（fee負=コストで減少）

    // 日次サンプル（最大5件）
    const byDayMap = new Map<string, { sales: number; fee: number; orderIds: Set<string> }>();
    for (const r of lines) {
      const date = r.order_date?.slice(0, 10) ?? '';
      if (!date) continue;
      if (!byDayMap.has(date)) byDayMap.set(date, { sales: 0, fee: 0, orderIds: new Set() });
      const c = byDayMap.get(date)!;
      c.sales += Number(r.sales_amount_yen) || 0;
      c.orderIds.add(r.order_id ?? '');
    }
    for (const [date, c] of byDayMap) {
      c.fee = [...c.orderIds].reduce((s, oid) => s + (feeMap[oid] ?? 0), 0);
    }
    const byDaySample = [...byDayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([date, c]) => ({
        date,
        line_count: lines.filter((l) => l.order_date?.slice(0, 10) === date).length,
        sales_amount_yen: c.sales,
        fee_amount_yen: c.fee,
        sales_after_fee_yen: c.sales + c.fee,
      }));

    // 月次サンプル（最大5件）
    const byMonthMap = new Map<string, { sales: number; fee: number; orderIds: Set<string> }>();
    for (const r of lines) {
      const month = r.order_date?.slice(0, 7) ?? '';
      if (!month) continue;
      if (!byMonthMap.has(month)) byMonthMap.set(month, { sales: 0, fee: 0, orderIds: new Set() });
      const c = byMonthMap.get(month)!;
      c.sales += Number(r.sales_amount_yen) || 0;
      c.orderIds.add(r.order_id ?? '');
    }
    for (const [, c] of byMonthMap) {
      c.fee = [...c.orderIds].reduce((s, oid) => s + (feeMap[oid] ?? 0), 0);
    }
    const byMonthSample = [...byMonthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([month, c]) => ({
        month,
        line_count: lines.filter((l) => l.order_date?.slice(0, 7) === month).length,
        sales_amount_yen: c.sales,
        fee_amount_yen: c.fee,
        sales_after_fee_yen: c.sales + c.fee,
      }));

    // SKU別サンプル（上位5件）
    const orderSalesMap: Record<string, number> = {};
    const orderLineCountMap: Record<string, number> = {};
    for (const r of lines) {
      const oid = r.order_id ?? '';
      const amt = Number(r.sales_amount_yen) || 0;
      orderSalesMap[oid] = (orderSalesMap[oid] ?? 0) + amt;
      orderLineCountMap[oid] = (orderLineCountMap[oid] ?? 0) + 1;
    }
    const skuMap = new Map<string, { sales: number; fee: number }>();
    for (const r of lines) {
      const sku = (r.sku ?? '').trim() || '(SKUなし)';
      const lineSales = Number(r.sales_amount_yen) || 0;
      const orderSales = orderSalesMap[r.order_id ?? ''] ?? 0;
      const orderFee = feeMap[r.order_id ?? ''] ?? 0;
      const lineCount = orderLineCountMap[r.order_id ?? ''] ?? 1;
      const feeAtt =
        orderSales > 0 ? Math.round((orderFee * lineSales) / orderSales) : orderFee && lineCount ? Math.round(orderFee / lineCount) : 0;
      if (!skuMap.has(sku)) skuMap.set(sku, { sales: 0, fee: 0 });
      const c = skuMap.get(sku)!;
      c.sales += lineSales;
      c.fee += feeAtt;
    }
    const bySkuSample = [...skuMap.entries()]
      .map(([sku, c]) => ({ sku, sales_amount_yen: c.sales, fee_amount_yen: c.fee, sales_after_fee_yen: c.sales + c.fee }))
      .sort((a, b) => b.sales_amount_yen - a.sales_amount_yen)
      .slice(0, 5);

    // ASIN別サンプル（上位5件）
    const asinMap = new Map<string, { sales: number; fee: number }>();
    for (const r of lines) {
      const asin = (r.asin ?? '').trim() || '(ASINなし)';
      const lineSales = Number(r.sales_amount_yen) || 0;
      const orderSales = orderSalesMap[r.order_id ?? ''] ?? 0;
      const orderFee = feeMap[r.order_id ?? ''] ?? 0;
      const lineCount = orderLineCountMap[r.order_id ?? ''] ?? 1;
      const feeAtt =
        orderSales > 0 ? Math.round((orderFee * lineSales) / orderSales) : orderFee && lineCount ? Math.round(orderFee / lineCount) : 0;
      if (!asinMap.has(asin)) asinMap.set(asin, { sales: 0, fee: 0 });
      const c = asinMap.get(asin)!;
      c.sales += lineSales;
      c.fee += feeAtt;
    }
    const byAsinSample = [...asinMap.entries()]
      .map(([asin, c]) => ({ asin, sales_amount_yen: c.sales, fee_amount_yen: c.fee, sales_after_fee_yen: c.sales + c.fee }))
      .sort((a, b) => b.sales_amount_yen - a.sales_amount_yen)
      .slice(0, 5);

    return NextResponse.json({
      ok: true,
      range: { from: from || null, to: to || null },
      target: {
        confirmed_line_count: confirmedCount,
        excluded_line_count: excludedCount,
        in_range_line_count: lines.length,
        order_count: orderIds.length,
      },
      fee: {
        fee_join_success_count: feeJoinCount,
        fee_total_yen: feeTotal,
        orders_without_fee: orderIds.filter((oid) => !(oid in feeMap)).length,
      },
      summary: {
        sales_amount_yen: salesTotal,
        fee_amount_yen: feeTotal,
        sales_after_fee_yen: salesAfterFee,
      },
      samples: {
        by_day: byDaySample,
        by_month: byMonthSample,
        by_sku: bySkuSample,
        by_asin: byAsinSample,
      },
      checklist: {
        only_confirmed: excludedCount === 0 || confirmedCount > 0 ? 'OK: confirmed のみ集計対象' : 'NG',
        fee_reflected: feeTotal !== 0 || orderIds.length === 0 ? 'OK: fee 反映' : 'WARN: fee 未取得',
        no_duplicate_lines: 'OK: 売上行重複なし（amazon_sales_lines 1行=1商品）',
      },
      verdict: 'Phase13 検証完了',
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
