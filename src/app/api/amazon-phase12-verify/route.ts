/**
 * Phase12 完了確認 API
 * AdjustmentEventList の raw 件数、order_id 紐付け率、
 * 採用 adjustment 種別、fee_events 件数、集約サンプルを確認
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdjustmentTypeFeeLike } from '@/lib/amazon/transform-fee-events';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { count: rawAdjustmentTotal } = await supabase
      .from('amazon_finance_raw')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('transaction_type', 'AdjustmentEventList');

    const { data: rawAdjustmentRows } = await supabase
      .from('amazon_finance_raw')
      .select('id, order_id, payload_json')
      .eq('user_id', user.id)
      .eq('transaction_type', 'AdjustmentEventList');

    const rawWithOrderId = rawAdjustmentRows?.filter((r) => r.order_id && String(r.order_id).trim()).length ?? 0;
    const rawWithoutOrderId = (rawAdjustmentTotal ?? 0) - rawWithOrderId;
    const orderIdRate =
      (rawAdjustmentTotal ?? 0) > 0
        ? Math.round((rawWithOrderId / (rawAdjustmentTotal ?? 1)) * 10000) / 100
        : 0;

    // payload から AdjustmentType を集計
    const adjustmentTypeCounts: Record<string, number> = {};
    const excludedSamples: Array<{ type: string; order_id: string | null }> = [];
    const includedSamples: Array<{ type: string; order_id: string; amount_yen: number }> = [];

    for (const r of rawAdjustmentRows ?? []) {
      const payload = r.payload_json as Record<string, unknown> | null;
      const adjType = (payload?.AdjustmentType ?? payload?.adjustmentType ?? 'Unknown') as string;
      adjustmentTypeCounts[adjType] = (adjustmentTypeCounts[adjType] ?? 0) + 1;

      const amt = payload?.AdjustmentAmount ?? payload?.adjustmentAmount;
      const cc = amt?.CurrencyCode ?? (amt as Record<string, unknown>)?.currencyCode;
      const val =
        amt?.CurrencyAmount ??
        (amt as Record<string, unknown>)?.amount ??
        (amt as Record<string, unknown>)?.currencyAmount;
      const yen =
        (String(cc ?? '').toUpperCase() === 'JPY' || String(cc ?? '').toUpperCase() === ''
          ? typeof val === 'number'
            ? val
            : parseFloat(String(val ?? 0))
          : 0) as number;
      const roundedYen = Math.round(isNaN(yen) ? 0 : yen);

      if (isAdjustmentTypeFeeLike(adjType) && r.order_id) {
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
      .eq('user_id', user.id)
      .eq('transaction_type', 'AdjustmentEventList');

    const feeAdjustmentCount = feeAdjustmentRows?.length ?? 0;
    const adoptedTypes = [...new Set((feeAdjustmentRows ?? []).map((r) => r.fee_type).filter(Boolean))];

    const orderIdToFee: Record<string, number> = {};
    const { data: allFeeRows } = await supabase
      .from('amazon_fee_events')
      .select('order_id, fee_amount_yen')
      .eq('user_id', user.id);

    for (const r of allFeeRows ?? []) {
      const oid = (r.order_id ?? '').trim();
      if (oid) {
        orderIdToFee[oid] = (orderIdToFee[oid] ?? 0) + (Number(r.fee_amount_yen) || 0);
      }
    }

    const sampleAggregated = Object.entries(orderIdToFee)
      .slice(0, 5)
      .map(([oid, sum]) => ({ order_id: oid, fee_amount_aggregated: sum }));

    return NextResponse.json({
      ok: true,
      raw: {
        AdjustmentEventList: rawAdjustmentTotal ?? 0,
        withOrderId: rawWithOrderId,
        withoutOrderId: rawWithoutOrderId,
        orderIdRatePercent: orderIdRate,
      },
      adjustmentTypes: {
        counts: adjustmentTypeCounts,
        adopted: ['PostageBilling*', 'PostageRefund*'],
        excludedSample: excludedSamples,
        includedSample: includedSamples,
      },
      fee_events: {
        adjustmentOriginCount: feeAdjustmentCount,
        adoptedTypes,
      },
      orderIdAggregated: {
        totalOrders: Object.keys(orderIdToFee).length,
        sample: sampleAggregated,
      },
      verdict:
        (rawAdjustmentTotal ?? 0) > 0 && feeAdjustmentCount === 0
          ? 'Adjustment raw あり・fee_events 未変換（transform 実行を推奨）'
          : 'Phase12 検証完了',
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
