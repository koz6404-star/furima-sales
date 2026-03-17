/**
 * amazon_finance_raw → amazon_fee_events 変換（Phase 9 / Phase 11 / Phase 12）
 * ShipmentEventList, ServiceFeeEventList, RefundEventList, AdjustmentEventList を対象
 * Refund は fee_amount_yen を負数で保存（既存手数料と相殺）
 * Adjustment は payload の符号を尊重（反転しない）
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const FEE_CANDIDATE_TYPES = ['ShipmentEventList', 'ServiceFeeEventList', 'RefundEventList', 'AdjustmentEventList'] as const;

/** Phase12/Phase14: 手数料欄向き AdjustmentType。startsWith でマッチ（実データは PostageBilling_VAT 等） */
export function isAdjustmentTypeFeeLike(adjType: string): boolean {
  const t = (adjType ?? '').trim();
  return t.startsWith('PostageBilling') || t.startsWith('PostageRefund');
}

type FeeComponent = { FeeType?: string; FeeAmount?: { CurrencyCode?: string; CurrencyAmount?: number }; [key: string]: unknown };
type ChargeComponent = { ChargeType?: string; ChargeAmount?: { CurrencyCode?: string; CurrencyAmount?: number }; [key: string]: unknown };
type ShipmentItem = { ItemFeeList?: FeeComponent[]; ItemFeeAdjustmentList?: FeeComponent[]; ItemChargeList?: ChargeComponent[]; ItemChargeAdjustmentList?: ChargeComponent[]; [key: string]: unknown };

/** Principal は sales_amount_yen 側で計上済みなので除外。送料系のみ fee_events に取り込む */
const SHIPPING_CHARGE_TYPES = new Set(['ShippingCharge', 'ShippingTax', 'ShippingDiscount']);

function toYMD(val: string | undefined): string | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseAmountYen(cc: unknown, amount: unknown): number {
  const code = String(cc ?? '').toUpperCase();
  if (code !== 'JPY' && code !== '') return 0;
  if (amount == null) return 0;
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount));
  return isNaN(n) ? 0 : Math.round(n);
}

function extractOrderId(ev: Record<string, unknown>): string | null {
  const o = ev.AmazonOrderId ?? ev.amazonOrderId;
  if (typeof o === 'string' && o.trim()) return o.trim();
  const ri = ev.relatedIdentifiers as Array<{ relatedIdentifierName?: string; relatedIdentifierValue?: string }> | undefined;
  if (Array.isArray(ri)) {
    const orderRi = ri.find((r) => (r.relatedIdentifierName ?? '').toUpperCase() === 'ORDER_ID');
    if (orderRi?.relatedIdentifierValue) return orderRi.relatedIdentifierValue.trim();
  }
  return null;
}

function extractPostedDate(ev: Record<string, unknown>): string | null {
  const p = ev.PostedDate ?? ev.postedDate ?? ev.TransactionPostedDate ?? (ev as Record<string, unknown>).transactionPostedDate;
  return toYMD(typeof p === 'string' ? p : undefined);
}

function collectFees(
  ev: Record<string, unknown>,
  transactionType: string,
  orderId: string,
  postedDate: string | null,
  rawId: string,
  fetchedAt: string | null
): Array<{ order_id: string; transaction_type: string; fee_type: string; fee_amount_yen: number; posted_date: string | null; raw_source: string; fetched_at: string | null }> {
  const lines: Array<{ order_id: string; transaction_type: string; fee_type: string; fee_amount_yen: number; posted_date: string | null; raw_source: string; fetched_at: string | null }> = [];

  const addFee = (fee: FeeComponent, negate = false) => {
    const ft = fee?.FeeType ?? 'Unknown';
    const amt = fee?.FeeAmount;
    const cc = amt?.CurrencyCode ?? (amt as Record<string, unknown>)?.currencyCode;
    const val = amt?.CurrencyAmount ?? (amt as Record<string, unknown>)?.amount ?? (amt as Record<string, unknown>)?.currencyAmount;
    let yen = parseAmountYen(cc, val);
    if (negate && yen > 0) yen = -yen;
    lines.push({
      order_id: orderId,
      transaction_type: transactionType,
      fee_type: ft,
      fee_amount_yen: yen,
      posted_date: postedDate,
      raw_source: rawId,
      fetched_at: fetchedAt,
    });
  };

  if (transactionType === 'ShipmentEventList') {
    const addList = (list: FeeComponent[] | undefined) => {
      if (Array.isArray(list)) for (const f of list) addFee(f, false);
    };
    addList(ev.OrderFeeList as FeeComponent[]);
    addList(ev.ShipmentFeeList as FeeComponent[]);
    const items = ev.ShipmentItemList as ShipmentItem[] | undefined;
    if (Array.isArray(items)) {
      for (const item of items) {
        addList(item?.ItemFeeList);
        // ItemChargeList から送料系のみ抽出（Principal は sales_amount_yen で計上済）
        if (Array.isArray(item?.ItemChargeList)) {
          for (const c of item.ItemChargeList) {
            if (SHIPPING_CHARGE_TYPES.has(c.ChargeType ?? '')) {
              addFee({ FeeType: c.ChargeType, FeeAmount: c.ChargeAmount } as FeeComponent, false);
            }
          }
        }
      }
    }
    // OrderChargeList から送料系のみ抽出
    const orderCharges = ev.OrderChargeList as ChargeComponent[] | undefined;
    if (Array.isArray(orderCharges)) {
      for (const c of orderCharges) {
        if (SHIPPING_CHARGE_TYPES.has(c.ChargeType ?? '')) {
          addFee({ FeeType: c.ChargeType, FeeAmount: c.ChargeAmount } as FeeComponent, false);
        }
      }
    }
  } else if (transactionType === 'ServiceFeeEventList') {
    const fl = ev.FeeList as FeeComponent[] | undefined;
    if (Array.isArray(fl)) for (const f of fl) addFee(f, false);
  } else if (transactionType === 'RefundEventList') {
    const addList = (list: FeeComponent[] | undefined) => {
      if (Array.isArray(list)) for (const f of list) addFee(f, true);
    };
    addList(ev.OrderFeeAdjustmentList as FeeComponent[]);
    addList(ev.ShipmentFeeAdjustmentList as FeeComponent[]);
    const items = ev.ShipmentItemAdjustmentList as ShipmentItem[] | undefined;
    if (Array.isArray(items)) {
      for (const item of items) {
        addList(item?.ItemFeeAdjustmentList);
        // 返金時の送料チャージ調整も取り込む
        if (Array.isArray(item?.ItemChargeAdjustmentList)) {
          for (const c of item.ItemChargeAdjustmentList) {
            if (SHIPPING_CHARGE_TYPES.has(c.ChargeType ?? '')) {
              addFee({ FeeType: c.ChargeType, FeeAmount: c.ChargeAmount } as FeeComponent, true);
            }
          }
        }
      }
    }
    // OrderChargeAdjustmentList から送料系のみ
    const orderChargeAdj = ev.OrderChargeAdjustmentList as ChargeComponent[] | undefined;
    if (Array.isArray(orderChargeAdj)) {
      for (const c of orderChargeAdj) {
        if (SHIPPING_CHARGE_TYPES.has(c.ChargeType ?? '')) {
          addFee({ FeeType: c.ChargeType, FeeAmount: c.ChargeAmount } as FeeComponent, true);
        }
      }
    }
  } else if (transactionType === 'AdjustmentEventList') {
    // Phase12/Phase14: AdjustmentAmount を採用。符号は payload のまま。startsWith で実データに合わせる
    const adjType = (ev.AdjustmentType ?? ev.adjustmentType ?? 'Adjustment') as string;
    if (!isAdjustmentTypeFeeLike(adjType)) return lines;
    const amt = (ev.AdjustmentAmount ?? ev.adjustmentAmount) as Record<string, unknown> | undefined;
    if (!amt) return lines;
    const cc = amt.CurrencyCode ?? amt.currencyCode;
    const val = amt.CurrencyAmount ?? amt.amount ?? amt.currencyAmount;
    const yen = parseAmountYen(cc, val);
    if (yen === 0) return lines;
    lines.push({
      order_id: orderId,
      transaction_type: transactionType,
      fee_type: adjType,
      fee_amount_yen: yen,
      posted_date: postedDate,
      raw_source: rawId,
      fetched_at: fetchedAt,
    });
  }

  return lines;
}

export interface TransformFeeEventsResult {
  processed: number;
  saved: number;
  skipped: number;
  errors: string[];
}

/**
 * raw から fee 候補イベントを抽出し amazon_fee_events に保存
 * 再実行時は当該 user の既存 fee_events を削除してから再挿入
 */
export async function transformRawToFeeEvents(
  supabase: SupabaseClient,
  userId: string
): Promise<TransformFeeEventsResult> {
  const result: TransformFeeEventsResult = {
    processed: 0,
    saved: 0,
    skipped: 0,
    errors: [],
  };

  const { error: delErr } = await supabase
    .from('amazon_fee_events')
    .delete()
    .eq('user_id', userId);

  if (delErr) {
    result.errors.push(`Delete: ${delErr.message}`);
    return result;
  }

  const { data: rawRows, error: fetchErr } = await supabase
    .from('amazon_finance_raw')
    .select('id, order_id, transaction_type, payload_json, posted_date, fetched_at')
    .eq('user_id', userId)
    .in('transaction_type', [...FEE_CANDIDATE_TYPES]);

  if (fetchErr) {
    result.errors.push(`Fetch: ${fetchErr.message}`);
    return result;
  }

  const allLines: Array<{ user_id: string; order_id: string; transaction_type: string; fee_type: string; fee_amount_yen: number; posted_date: string | null; raw_source: string; fetched_at: string | null }> = [];

  for (const r of rawRows ?? []) {
    result.processed++;
    const payload = r.payload_json as Record<string, unknown>;
    let orderId = r.order_id ?? extractOrderId((payload ?? {}) as Record<string, unknown>);

    // PostageBilling はアカウントレベル請求のため order_id がない。
    // プレースホルダーを使って保存し、ダッシュボードで合計表示する。
    if (!orderId || !String(orderId).trim()) {
      const adjType = String((payload ?? {}).AdjustmentType ?? (payload ?? {}).adjustmentType ?? '');
      if (isAdjustmentTypeFeeLike(adjType)) {
        orderId = '__POSTAGE__';
      } else {
        result.skipped++;
        continue;
      }
    }
    const postedDate = toYMD(r.posted_date as string) ?? extractPostedDate(payload);
    const lines = collectFees(
      payload ?? {},
      r.transaction_type as string,
      String(orderId).trim(),
      postedDate,
      r.id,
      r.fetched_at as string | null
    );
    if (lines.length === 0) {
      result.skipped++;
      continue;
    }
    for (const l of lines) {
      allLines.push({
        user_id: userId,
        order_id: l.order_id,
        transaction_type: l.transaction_type,
        fee_type: l.fee_type,
        fee_amount_yen: l.fee_amount_yen,
        posted_date: l.posted_date,
        raw_source: r.id,
        fetched_at: l.fetched_at,
      });
    }
  }

  if (allLines.length === 0) {
    return result;
  }

  const BATCH = 100;
  for (let i = 0; i < allLines.length; i += BATCH) {
    const chunk = allLines.slice(i, i + BATCH);
    const { error: insErr } = await supabase.from('amazon_fee_events').insert(chunk);
    if (insErr) {
      result.errors.push(`Insert batch ${i / BATCH + 1}: ${insErr.message}`);
      result.skipped += chunk.length;
    } else {
      result.saved += chunk.length;
    }
  }

  return result;
}
