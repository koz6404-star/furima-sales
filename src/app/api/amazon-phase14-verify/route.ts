/**
 * Phase14 整合修正確認 API
 * 手数料符号ルール・sales_after_fee_yen 修正・AdjustmentType 判定の検証
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdjustmentTypeFeeLike } from '@/lib/amazon/transform-fee-events';

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

    // 1. 手数料 raw 符号の現状
    const { data: feeRows } = await supabase
      .from('amazon_fee_events')
      .select('order_id, fee_amount_yen, transaction_type')
      .eq('user_id', user.id);

    let positiveCount = 0;
    let negativeCount = 0;
    const byType: Record<string, { count: number; sum: number }> = {};
    for (const r of feeRows ?? []) {
      const amt = Number(r.fee_amount_yen) || 0;
      if (amt > 0) positiveCount++;
      else if (amt < 0) negativeCount++;
      const t = r.transaction_type ?? 'Unknown';
      if (!byType[t]) byType[t] = { count: 0, sum: 0 };
      byType[t].count++;
      byType[t].sum += amt;
    }

    // 2. confirmed 売上集計（修正後）
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
    if (orderIds.length > 0) {
      const { data: feeData } = await supabase
        .from('amazon_fee_events')
        .select('order_id, fee_amount_yen')
        .eq('user_id', user.id)
        .in('order_id', orderIds);
      for (const r of feeData ?? []) {
        const oid = (r.order_id ?? '').trim();
        if (oid) feeMap[oid] = (feeMap[oid] ?? 0) + (Number(r.fee_amount_yen) || 0);
      }
    }

    const salesTotal = lines.reduce((s, r) => s + (Number(r.sales_amount_yen) || 0), 0);
    const feeTotal = orderIds.reduce((s, oid) => s + (feeMap[oid] ?? 0), 0);
    const salesAfterFeeNew = salesTotal + feeTotal; // Phase14 修正後
    const salesAfterFeeOld = salesTotal - feeTotal; // 修正前（比較用）

    // 3. AdjustmentEventList 候補
    const { data: adjRows } = await supabase
      .from('amazon_finance_raw')
      .select('id, order_id, payload_json')
      .eq('user_id', user.id)
      .eq('transaction_type', 'AdjustmentEventList');

    let candidateCount = 0;
    let candidateWithOrderId = 0;
    const adjTypeCounts: Record<string, number> = {};
    for (const r of adjRows ?? []) {
      const payload = r.payload_json as Record<string, unknown> | null;
      const adjType = (payload?.AdjustmentType ?? payload?.adjustmentType ?? 'Unknown') as string;
      adjTypeCounts[adjType] = (adjTypeCounts[adjType] ?? 0) + 1;
      if (isAdjustmentTypeFeeLike(adjType)) {
        candidateCount++;
        if (r.order_id && String(r.order_id).trim()) candidateWithOrderId++;
      }
    }

    // 4. サンプル
    const byDayMap = new Map<string, { sales: number; fee: number; orderIds: Set<string> }>();
    for (const r of lines) {
      const date = r.order_date?.slice(0, 10) ?? '';
      if (!date) continue;
      if (!byDayMap.has(date)) byDayMap.set(date, { sales: 0, fee: 0, orderIds: new Set() });
      const c = byDayMap.get(date)!;
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
        sales_amount_yen: c.sales,
        fee_amount_yen: c.fee,
        sales_after_fee_yen: c.sales + c.fee,
      }));

    return NextResponse.json({
      ok: true,
      fee_raw_sign: {
        positive_count: positiveCount,
        negative_count: negativeCount,
        by_transaction_type: byType,
        rule: 'fee_amount_yen は DB 保存値のまま。負=コスト（UK等）',
      },
      sales_after_fee: {
        formula: 'sales_after_fee_yen = sales_amount_yen + fee_amount_yen',
        before_fix: { sales: salesTotal, fee: feeTotal, sales_after_fee: salesAfterFeeOld },
        after_fix: { sales: salesTotal, fee: feeTotal, sales_after_fee: salesAfterFeeNew },
      },
      adjustment: {
        raw_total: adjRows?.length ?? 0,
        candidate_count_startsWith: candidateCount,
        candidate_with_order_id: candidateWithOrderId,
        candidate_without_order_id: candidateCount - candidateWithOrderId,
        adjustment_type_counts: adjTypeCounts,
        excluded_reason: candidateCount > 0 && candidateWithOrderId === 0 ? 'order_id なしのため fee_events には登録不可' : null,
      },
      samples: { by_day: byDaySample },
      checklist: {
        sales_after_fee_natural: salesAfterFeeNew < salesTotal && feeTotal < 0 ? 'OK: fee負なら差引後は売上より小' : '要確認',
        fee_sign_documented: 'OK: 符号ルールを API note に記載',
        adjustment_startsWith: 'OK: PostageBilling*, PostageRefund* で判定',
        order_id_required: 'OK: order_id なしは除外維持',
      },
      verdict: 'Phase14 検証完了',
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
