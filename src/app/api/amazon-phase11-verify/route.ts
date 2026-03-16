/**
 * Phase11 完了確認 API
 * RefundEventList の raw 件数、fee_events 件数、order_id 紐付け率、負値保存を確認
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    const { count: rawRefundTotal } = await supabase
      .from('amazon_finance_raw')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('transaction_type', 'RefundEventList');

    const { data: rawRefundRows } = await supabase
      .from('amazon_finance_raw')
      .select('id, order_id')
      .eq('user_id', user.id)
      .eq('transaction_type', 'RefundEventList');

    const rawWithOrderId = rawRefundRows?.filter((r) => r.order_id && String(r.order_id).trim()).length ?? 0;
    const rawWithoutOrderId = (rawRefundTotal ?? 0) - rawWithOrderId;
    const orderIdRate = (rawRefundTotal ?? 0) > 0
      ? Math.round((rawWithOrderId / (rawRefundTotal ?? 1)) * 10000) / 100
      : 0;

    const { data: feeRefundRows } = await supabase
      .from('amazon_fee_events')
      .select('id, order_id, fee_amount_yen')
      .eq('user_id', user.id)
      .eq('transaction_type', 'RefundEventList');

    const feeRefundCount = feeRefundRows?.length ?? 0;
    const negativeCount = feeRefundRows?.filter((r) => (r.fee_amount_yen ?? 0) < 0).length ?? 0;

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

    const aggregatedWithRefund = Object.entries(orderIdToFee).filter(([, v]) => v < 0);
    const sampleAggregated = Object.entries(orderIdToFee)
      .slice(0, 5)
      .map(([oid, sum]) => ({ order_id: oid, fee_amount_aggregated: sum }));

    return NextResponse.json({
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
        sample: sampleAggregated,
      },
      verdict: (rawRefundTotal ?? 0) > 0 && feeRefundCount === 0
        ? 'Refund raw あり・fee_events 未変換（transform 実行を推奨）'
        : 'Phase11 検証完了',
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
