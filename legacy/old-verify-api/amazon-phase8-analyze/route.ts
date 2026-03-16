/**
 * Phase8 Finances raw 分析 API
 * order_id 取得状況、transaction_type 内訳、金額構造、order 単位イベント数を集計
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function hasKey(obj: unknown, key: string): boolean {
  if (obj == null || typeof obj !== 'object') return false;
  return key in (obj as Record<string, unknown>);
}

function extractAmountPaths(payload: Record<string, unknown>, prefix: string): string[] {
  const paths: string[] = [];
  const amountKeys = [
    'FeeList',
    'FeeAmount',
    'ChargeList',
    'ChargeAmount',
    'OrderChargeList',
    'OrderChargeAdjustmentList',
    'OrderFeeList',
    'OrderFeeAdjustmentList',
    'ShipmentFeeList',
    'ShipmentFeeAdjustmentList',
    'PromotionList',
    'PromotionAdjustmentList',
    'ItemFeeList',
    'ItemFeeAdjustmentList',
    'ItemChargeList',
    'ItemChargeAdjustmentList',
    'DirectPaymentList',
    'ShipmentItemList',
    'ShipmentItemAdjustmentList',
  ];
  for (const k of amountKeys) {
    if (hasKey(payload, k)) paths.push(`${prefix}.${k}`);
  }
  if (Array.isArray(payload.FeeList)) {
    const fl = payload.FeeList as Array<Record<string, unknown>>;
    for (let i = 0; i < Math.min(fl.length, 3); i++) {
      const fee = fl[i];
      if (fee?.FeeAmount) paths.push(`${prefix}.FeeList[${i}].FeeAmount`);
      if (fee?.FeeType) paths.push(`${prefix}.FeeList[${i}].FeeType`);
    }
  }
  if (Array.isArray(payload.ShipmentItemList)) {
    const sil = payload.ShipmentItemList as Array<Record<string, unknown>>;
    for (let i = 0; i < Math.min(sil.length, 2); i++) {
      const item = sil[i];
      if (item?.ItemFeeList) paths.push(`${prefix}.ShipmentItemList[${i}].ItemFeeList`);
      if (item?.ItemChargeList) paths.push(`${prefix}.ShipmentItemList[${i}].ItemChargeList`);
    }
  }
  return paths;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: rows } = await supabase
      .from('amazon_finance_raw')
      .select('id, order_id, transaction_type, payload_json, source_key')
      .eq('user_id', user.id);

    const total = rows?.length ?? 0;
    const withOrderId = rows?.filter((r) => r.order_id && String(r.order_id).trim()).length ?? 0;
    const withoutOrderId = total - withOrderId;
    const orderIdRate = total > 0 ? Math.round((withOrderId / total) * 10000) / 100 : 0;

    const typeCounts: Record<string, number> = {};
    const typeWithOrderId: Record<string, number> = {};
    const typeWithoutOrderId: Record<string, number> = {};
    const orderIdEventCounts: Record<string, number> = {};
    const amountPathsByType: Record<string, string[]> = {};
    const samplePayloadsByType: Record<string, Record<string, unknown>> = {};

    for (const r of rows ?? []) {
      const t = r.transaction_type ?? '_unknown';
      typeCounts[t] = (typeCounts[t] ?? 0) + 1;
      if (r.order_id && String(r.order_id).trim()) {
        typeWithOrderId[t] = (typeWithOrderId[t] ?? 0) + 1;
        orderIdEventCounts[r.order_id] = (orderIdEventCounts[r.order_id] ?? 0) + 1;
      } else {
        typeWithoutOrderId[t] = (typeWithoutOrderId[t] ?? 0) + 1;
      }

      const payload = r.payload_json as Record<string, unknown> | null;
      if (payload && typeof payload === 'object') {
        if (!amountPathsByType[t]) {
          amountPathsByType[t] = [];
        }
        const paths = extractAmountPaths(payload, 'payload');
        for (const p of paths) {
          if (!amountPathsByType[t].includes(p)) amountPathsByType[t].push(p);
        }
        if (!samplePayloadsByType[t]) {
          samplePayloadsByType[t] = payload;
        }
      }
    }

    const eventsPerOrder = Object.values(orderIdEventCounts);
    const maxEventsPerOrder = eventsPerOrder.length > 0 ? Math.max(...eventsPerOrder) : 0;
    const avgEventsPerOrder =
      eventsPerOrder.length > 0
        ? Math.round((eventsPerOrder.reduce((a, b) => a + b, 0) / eventsPerOrder.length) * 100) / 100
        : 0;
    const multiEventOrders = eventsPerOrder.filter((n) => n > 1).length;

    const typeBreakdown = Object.keys(typeCounts)
      .sort()
      .map((t) => ({
        transaction_type: t,
        count: typeCounts[t],
        with_order_id: typeWithOrderId[t] ?? 0,
        without_order_id: typeWithoutOrderId[t] ?? 0,
        order_id_rate: typeCounts[t]! > 0
          ? Math.round(((typeWithOrderId[t] ?? 0) / typeCounts[t]!) * 10000) / 100
          : 0,
      }));

    const feeCandidateKeywords = [
      'ShipmentEvent',
      'RefundEvent',
      'ServiceFeeEvent',
      'AdjustmentEvent',
      'GuaranteeClaim',
      'Chargeback',
    ];
    const feeCandidates = typeBreakdown.filter((x) =>
      feeCandidateKeywords.some((k) => x.transaction_type.toLowerCase().includes(k.toLowerCase()))
    );
    if (feeCandidates.length === 0) {
      feeCandidates.push(
        ...typeBreakdown.filter((x) =>
          ['Shipment', 'Refund', 'ServiceFee', 'Adjustment'].some((k) =>
            x.transaction_type.toLowerCase().includes(k.toLowerCase())
          )
        )
      );
    }
    if (feeCandidates.length === 0 && typeBreakdown.length > 0) {
      feeCandidates.push(...typeBreakdown.slice(0, 5));
    }

    const passed = total >= 0;
    const verdict =
      total === 0
        ? 'raw 0件: Finances 同期を実行してから再分析'
        : orderIdRate >= 50
          ? '合格: order_id 取得率あり'
          : orderIdRate > 0
            ? '概ね合格: order_id 一部取得。Phase9 では order_id ありのみ結合'
            : '要確認: order_id 0件。payload 構造確認が必要';

    return NextResponse.json({
      ok: true,
      verdict,
      passed,
      summary: {
        total,
        withOrderId,
        withoutOrderId,
        orderIdRatePercent: orderIdRate,
      },
      orderIdUnit: {
        uniqueOrders: Object.keys(orderIdEventCounts).length,
        maxEventsPerOrder,
        avgEventsPerOrder,
        multiEventOrders,
        needsAggregation: maxEventsPerOrder > 1,
      },
      transactionTypeBreakdown: typeBreakdown,
      feeCandidateTypes: feeCandidates.map((x) => x.transaction_type),
      amountPathsByType,
      samplePayloadKeys: Object.fromEntries(
        Object.entries(samplePayloadsByType).map(([k, v]) => [k, v ? Object.keys(v) : []])
      ),
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
