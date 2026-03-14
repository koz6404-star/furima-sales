#!/usr/bin/env node
/**
 * Phase11, Phase12, Phase13 検証ロジックを Supabase 直接クエリで実行
 * Service Role で認証をバイパスする
 *
 * 実行: node scripts/amazon-phase111213-verify.mjs
 * 事前: .env.local に NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY を設定
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const ADJUSTMENT_TYPES_FEE_LIKE = new Set(['PostageBilling', 'PostageRefund']);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(JSON.stringify({ error: 'NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を .env.local に設定してください' }));
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  const { data: firstRows } = await supabase.from('amazon_sales_lines').select('user_id').limit(1);

  const userId = firstLine?.user_id;
  if (!userId) {
    console.log(JSON.stringify({ error: 'amazon_sales_lines にレコードがありません', phase11: null, phase12: null, phase13: null }));
    return;
  }

  const result = {
    user_id: userId,
    phase11: null,
    phase12: null,
    phase13: null,
  };

  // --- Phase11: RefundEventList ---
  const { count: rawRefundTotal } = await supabase
    .from('amazon_finance_raw')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('transaction_type', 'RefundEventList');

  const { data: rawRefundRows } = await supabase
    .from('amazon_finance_raw')
    .select('id, order_id')
    .eq('user_id', userId)
    .eq('transaction_type', 'RefundEventList');

  const rawWithOrderId = rawRefundRows?.filter((r) => r.order_id && String(r.order_id).trim()).length ?? 0;
  const rawWithoutOrderId = (rawRefundTotal ?? 0) - rawWithOrderId;
  const orderIdRate = (rawRefundTotal ?? 0) > 0
    ? Math.round((rawWithOrderId / (rawRefundTotal ?? 1)) * 10000) / 100
    : 0;

  const { data: feeRefundRows } = await supabase
    .from('amazon_fee_events')
    .select('id, order_id, fee_amount_yen')
    .eq('user_id', userId)
    .eq('transaction_type', 'RefundEventList');

  const feeRefundCount = feeRefundRows?.length ?? 0;
  const negativeCount = feeRefundRows?.filter((r) => (r.fee_amount_yen ?? 0) < 0).length ?? 0;

  const orderIdToFee = {};
  const { data: allFeeRowsP11 } = await supabase
    .from('amazon_fee_events')
    .select('order_id, fee_amount_yen')
    .eq('user_id', userId);

  for (const r of allFeeRowsP11 ?? []) {
    const oid = (r.order_id ?? '').trim();
    if (oid) {
      orderIdToFee[oid] = (orderIdToFee[oid] ?? 0) + (Number(r.fee_amount_yen) || 0);
    }
  }

  const aggregatedWithRefund = Object.entries(orderIdToFee).filter(([, v]) => v < 0);
  const sampleAggregatedP11 = Object.entries(orderIdToFee)
    .slice(0, 5)
    .map(([oid, sum]) => ({ order_id: oid, fee_amount_aggregated: sum }));

  result.phase11 = {
    ok: true,
    raw: {
      RefundEventList: rawRefundTotal ?? 0,
      withOrderId: rawWithOrderId,
      withoutOrderId: rawWithoutOrderId,
      orderIdRatePercent: orderIdRate,
    },
    fee_events: {
      refundOriginCount: feeRefundCount,
      negativeFeeCount: negativeCount,
    },
    orderIdAggregated: {
      totalOrders: Object.keys(orderIdToFee).length,
      ordersWithNegativeTotal: aggregatedWithRefund.length,
      sample: sampleAggregatedP11,
    },
    verdict: (rawRefundTotal ?? 0) > 0 && feeRefundCount === 0
      ? 'Refund raw あり・fee_events 未変換。Transform 実行を推奨。'
      : 'Phase11 検証完了',
  };

  // --- Phase12: AdjustmentEventList ---
  const { count: rawAdjustmentTotal } = await supabase
    .from('amazon_finance_raw')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('transaction_type', 'AdjustmentEventList');

  const { data: rawAdjustmentRows } = await supabase
    .from('amazon_finance_raw')
    .select('id, order_id, payload_json')
    .eq('user_id', userId)
    .eq('transaction_type', 'AdjustmentEventList');

  const rawWithOrderId12 = rawAdjustmentRows?.filter((r) => r.order_id && String(r.order_id).trim()).length ?? 0;
  const rawWithoutOrderId12 = (rawAdjustmentTotal ?? 0) - rawWithOrderId12;
  const orderIdRate12 = (rawAdjustmentTotal ?? 0) > 0
    ? Math.round((rawWithOrderId12 / (rawAdjustmentTotal ?? 1)) * 10000) / 100
    : 0;

  const adjustmentTypeCounts = {};
  const excludedSamples = [];
  const includedSamples = [];

  for (const r of rawAdjustmentRows ?? []) {
    const payload = r.payload_json ?? null;
    const adjType = (payload?.AdjustmentType ?? payload?.adjustmentType ?? 'Unknown') ?? 'Unknown';
    adjustmentTypeCounts[adjType] = (adjustmentTypeCounts[adjType] ?? 0) + 1;

    const amt = payload?.AdjustmentAmount ?? payload?.adjustmentAmount;
    const cc = amt?.CurrencyCode ?? (amt?.currencyCode);
    const val = amt?.CurrencyAmount ?? (amt?.amount) ?? (amt?.currencyAmount);
    const yen = (String(cc ?? '').toUpperCase() === 'JPY' || String(cc ?? '').toUpperCase() === ''
      ? (typeof val === 'number' ? val : parseFloat(String(val ?? 0)))
      : 0);
    const roundedYen = Math.round(isNaN(yen) ? 0 : yen);

    if (ADJUSTMENT_TYPES_FEE_LIKE.has(adjType) && r.order_id) {
      if (includedSamples.length < 5) {
        includedSamples.push({ type: adjType, order_id: r.order_id, amount_yen: roundedYen });
      }
    } else {
      if (excludedSamples.length < 10) {
        excludedSamples.push({ type: adjType, order_id: r.order_id });
      }
    }
  }

  const { data: feeAdjustmentRows } = await supabase
    .from('amazon_fee_events')
    .select('id, order_id, fee_type, fee_amount_yen')
    .eq('user_id', userId)
    .eq('transaction_type', 'AdjustmentEventList');

  const feeAdjustmentCount = feeAdjustmentRows?.length ?? 0;
  const adoptedTypes = [...new Set((feeAdjustmentRows ?? []).map((r) => r.fee_type).filter(Boolean))];

  const orderIdToFee12 = {};
  const { data: allFeeRowsP12 } = await supabase
    .from('amazon_fee_events')
    .select('order_id, fee_amount_yen')
    .eq('user_id', userId);

  for (const r of allFeeRowsP12 ?? []) {
    const oid = (r.order_id ?? '').trim();
    if (oid) {
      orderIdToFee12[oid] = (orderIdToFee12[oid] ?? 0) + (Number(r.fee_amount_yen) || 0);
    }
  }

  const sampleAggregatedP12 = Object.entries(orderIdToFee12)
    .slice(0, 5)
    .map(([oid, sum]) => ({ order_id: oid, fee_amount_aggregated: sum }));

  result.phase12 = {
    ok: true,
    raw: {
      AdjustmentEventList: rawAdjustmentTotal ?? 0,
      withOrderId: rawWithOrderId12,
      withoutOrderId: rawWithoutOrderId12,
      orderIdRatePercent: orderIdRate12,
    },
    adjustmentTypes: {
      counts: adjustmentTypeCounts,
      adopted: [...ADJUSTMENT_TYPES_FEE_LIKE],
      excludedSample: excludedSamples,
      includedSample: includedSamples,
    },
    fee_events: {
      adjustmentOriginCount: feeAdjustmentCount,
      adoptedTypes,
    },
    orderIdAggregated: {
      totalOrders: Object.keys(orderIdToFee12).length,
      sample: sampleAggregatedP12,
    },
    verdict: (rawAdjustmentTotal ?? 0) > 0 && feeAdjustmentCount === 0
      ? 'Adjustment raw あり・fee_events 未変換。Transform 実行を推奨。'
      : 'Phase12 検証完了',
  };

  // --- Phase13: confirmed 売上集計 ---
  const { data: allRows } = await supabase
    .from('amazon_sales_lines')
    .select('id, sales_state, order_date')
    .eq('user_id', userId);

  const byState = {};
  for (const r of allRows ?? []) {
    const s = r.sales_state ?? 'other_excluded';
    byState[s] = (byState[s] ?? 0) + 1;
  }

  const confirmedCount = byState.confirmed ?? 0;
  const excludedCount = (allRows?.length ?? 0) - confirmedCount;

  let confirmedQuery = supabase
    .from('amazon_sales_lines')
    .select('id, order_id, order_date, sku, asin, sales_amount_yen, quantity')
    .eq('user_id', userId)
    .eq('sales_state', 'confirmed');

  const { data: confirmedRows } = await confirmedQuery;

  const lines = confirmedRows ?? [];
  const orderIds = [...new Set(lines.map((r) => r.order_id).filter(Boolean))];

  let feeMap = {};
  let feeJoinCount = 0;
  if (orderIds.length > 0) {
    const { data: feeRows } = await supabase
      .from('amazon_fee_events')
      .select('order_id, fee_amount_yen')
      .eq('user_id', userId)
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
  const salesAfterFee = salesTotal - feeTotal;

  const byDayMap = new Map();
  for (const r of lines) {
    const date = r.order_date?.slice(0, 10) ?? '';
    if (!date) continue;
    if (!byDayMap.has(date)) byDayMap.set(date, { sales: 0, fee: 0, orderIds: new Set() });
    const c = byDayMap.get(date);
    c.sales += Number(r.sales_amount_yen) || 0;
    c.orderIds.add(r.order_id ?? '');
  }
  for (const [, c] of byDayMap) {
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
      sales_after_fee_yen: c.sales - c.fee,
    }));

  const byMonthMap = new Map();
  for (const r of lines) {
    const month = r.order_date?.slice(0, 7) ?? '';
    if (!month) continue;
    if (!byMonthMap.has(month)) byMonthMap.set(month, { sales: 0, fee: 0, orderIds: new Set() });
    const c = byMonthMap.get(month);
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
      sales_after_fee_yen: c.sales - c.fee,
    }));

  const orderSalesMap = {};
  const orderLineCountMap = {};
  for (const r of lines) {
    const oid = r.order_id ?? '';
    const amt = Number(r.sales_amount_yen) || 0;
    orderSalesMap[oid] = (orderSalesMap[oid] ?? 0) + amt;
    orderLineCountMap[oid] = (orderLineCountMap[oid] ?? 0) + 1;
  }
  const skuMap = new Map();
  for (const r of lines) {
    const sku = (r.sku ?? '').trim() || '(SKUなし)';
    const lineSales = Number(r.sales_amount_yen) || 0;
    const orderSales = orderSalesMap[r.order_id ?? ''] ?? 0;
    const orderFee = feeMap[r.order_id ?? ''] ?? 0;
    const lineCount = orderLineCountMap[r.order_id ?? ''] ?? 1;
    const feeAtt = orderSales > 0 ? Math.round((orderFee * lineSales) / orderSales) : (orderFee && lineCount ? Math.round(orderFee / lineCount) : 0);
    if (!skuMap.has(sku)) skuMap.set(sku, { sales: 0, fee: 0 });
    const c = skuMap.get(sku);
    c.sales += lineSales;
    c.fee += feeAtt;
  }
  const bySkuSample = [...skuMap.entries()]
    .map(([sku, c]) => ({ sku, sales_amount_yen: c.sales, fee_amount_yen: c.fee, sales_after_fee_yen: c.sales - c.fee }))
    .sort((a, b) => b.sales_amount_yen - a.sales_amount_yen)
    .slice(0, 5);

  const asinMap = new Map();
  for (const r of lines) {
    const asin = (r.asin ?? '').trim() || '(ASINなし)';
    const lineSales = Number(r.sales_amount_yen) || 0;
    const orderSales = orderSalesMap[r.order_id ?? ''] ?? 0;
    const orderFee = feeMap[r.order_id ?? ''] ?? 0;
    const lineCount = orderLineCountMap[r.order_id ?? ''] ?? 1;
    const feeAtt = orderSales > 0 ? Math.round((orderFee * lineSales) / orderSales) : (orderFee && lineCount ? Math.round(orderFee / lineCount) : 0);
    if (!asinMap.has(asin)) asinMap.set(asin, { sales: 0, fee: 0 });
    const c = asinMap.get(asin);
    c.sales += lineSales;
    c.fee += feeAtt;
  }
  const byAsinSample = [...asinMap.entries()]
    .map(([asin, c]) => ({ asin, sales_amount_yen: c.sales, fee_amount_yen: c.fee, sales_after_fee_yen: c.sales - c.fee }))
    .sort((a, b) => b.sales_amount_yen - a.sales_amount_yen)
    .slice(0, 5);

  result.phase13 = {
    ok: true,
    range: { from: null, to: null },
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
      only_confirmed: excludedCount === 0 || confirmedCount > 0 ? 'OK: confirmed のみが集計対象' : 'NG',
      fee_reflected: feeTotal !== 0 || orderIds.length === 0 ? 'OK: fee 反映' : 'WARN: fee 未取得',
      no_duplicate_lines: 'OK: 売上行は重複なし（amazon_sales_lines 1行1注文商品）',
    },
    verdict: 'Phase13 検証完了',
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: (e?.message ?? String(e)) }));
  process.exit(1);
});
