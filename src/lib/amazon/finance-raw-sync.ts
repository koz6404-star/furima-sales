/**
 * Finances API → amazon_finance_raw 保存（Phase 8）
 * 財務イベントを raw 保存。再実行時は upsert で上書き
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { listFinancialEvents } from './finances';
import { sleep } from './client';
import { logAmazonInfo } from './errors';
import type { FinancialEventsPayload } from './finances';

const SOURCE_API = 'finances.listFinancialEvents';
const FINANCES_DELAY_MS = 2100;

const EVENT_ARRAY_KEYS = [
  'ShipmentEventList',
  'ShipmentSettleEventList',
  'RefundEventList',
  'GuaranteeClaimEventList',
  'ChargebackEventList',
  'PayWithAmazonEventList',
  'ServiceProviderCreditEventList',
  'RetrochargeEventList',
  'RentalTransactionEventList',
  'PerformanceBondRefundEventList',
  'ProductAdsPaymentEventList',
  'ServiceFeeEventList',
  'SellerDealPaymentEventList',
  'DebtRecoveryEventList',
  'LoanServicingEventList',
  'AdjustmentEventList',
  'SAFETReimbursementEventList',
  'SellerReviewEnrollmentPaymentEventList',
  'FBALiquidationEventList',
  'CouponPaymentEventList',
  'ImagingServicesFeeEventList',
  'NetworkComminglingTransactionEventList',
  'AffordabilityExpenseEventList',
  'AffordabilityExpenseReversalEventList',
  'RemovalShipmentEventList',
  'RemovalShipmentAdjustmentEventList',
  'TrialShipmentEventList',
  'TDSReimbursementEventList',
  'AdhocDisbursementEventList',
  'TaxWithholdingEventList',
  'ChargeRefundEventList',
  'FailedAdhocDisbursementEventList',
  'ValueAddedServiceChargeEventList',
  'CapacityReservationBillingEventList',
  'EBTRefundReimbursementOnlyEventList',
] as const;

function toYMD(val: string | undefined): string | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
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
  const p =
    ev.PostedDate ??
    ev.postedDate ??
    ev.TransactionPostedDate ??
    (ev as Record<string, unknown>).transactionPostedDate;
  return toYMD(typeof p === 'string' ? p : undefined);
}

function extractTransactionId(ev: Record<string, unknown>): string | null {
  const t = ev.TransactionId ?? ev.transactionId;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

function makeSourceKey(ev: Record<string, unknown>, eventType: string, index: number): string {
  const seed = JSON.stringify({ ...ev, _t: eventType, _i: index });
  return createHash('sha256').update(seed).digest('hex').slice(0, 40);
}

export interface SyncFinanceRawResult {
  fetched: number;
  saved: number;
  skipped: number;
  errors: string[];
}

/**
 * Finances API から取得し、amazon_finance_raw に保存
 * PostedAfter を 90 日前に設定して日付範囲取得
 */
export async function syncFinanceToRaw(
  supabase: SupabaseClient,
  userId: string
): Promise<SyncFinanceRawResult> {
  const result: SyncFinanceRawResult = {
    fetched: 0,
    saved: 0,
    skipped: 0,
    errors: [],
  };

  const now = new Date();
  const postedBefore = new Date(now.getTime() - 3 * 60 * 1000); // 3分前（API: 2分以内は不可）
  const postedAfter = new Date(postedBefore);
  postedAfter.setDate(postedAfter.getDate() - 90);

  const fetchedAt = now.toISOString();
  let nextToken: string | undefined;

  do {
    try {
      const res = await listFinancialEvents({
        postedAfter,
        postedBefore,
        nextToken,
      });

      const payload = res.payload as FinancialEventsPayload | undefined;
      const raw = res as unknown as { FinancialEvents?: FinancialEventsPayload['FinancialEvents']; NextToken?: string };
      const events = payload?.FinancialEvents ?? raw.FinancialEvents;

      if (!events || typeof events !== 'object') {
        if (!nextToken) {
          logAmazonInfo('syncFinanceToRaw', { message: 'No FinancialEvents in response' });
        }
        break;
      }

      for (const eventType of EVENT_ARRAY_KEYS) {
        const arr = events[eventType];
        if (!Array.isArray(arr)) continue;

        for (let i = 0; i < arr.length; i++) {
          const ev = arr[i] as Record<string, unknown>;
          if (!ev || typeof ev !== 'object') continue;

          result.fetched++;

          const orderId = extractOrderId(ev);
          const postedDate = extractPostedDate(ev);
          const transactionId = extractTransactionId(ev);
          const sourceKey = makeSourceKey(ev, eventType, i);

          const line = {
            user_id: userId,
            fetched_at: fetchedAt,
            source_api: SOURCE_API,
            source_key: sourceKey,
            posted_date: postedDate,
            order_id: orderId,
            transaction_id: transactionId,
            transaction_type: eventType,
            payload_json: ev,
            updated_at: fetchedAt,
          };

          const { error } = await supabase.from('amazon_finance_raw').upsert(line, {
            onConflict: 'user_id,source_key',
            ignoreDuplicates: false,
          });

          if (error) {
            result.errors.push(`${eventType}[${i}]: ${error.message}`);
            result.skipped++;
          } else {
            result.saved++;
          }
        }
      }

      nextToken = payload?.NextToken ?? raw.NextToken;
      if (nextToken) await sleep(FINANCES_DELAY_MS);
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      result.errors.push(`API: ${msg}`);
      logAmazonInfo('syncFinanceToRaw error', { error: msg });
      break;
    }
  } while (nextToken);

  if (result.errors.length > 0) {
    logAmazonInfo('syncFinanceToRaw errors', { count: result.errors.length, samples: result.errors.slice(0, 5) });
  }

  return result;
}
