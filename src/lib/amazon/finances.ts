/**
 * Finances API 呼び出し（Phase 8）
 * listFinancialEvents で日付範囲指定の財務イベントを取得
 */
import { callAmazonApi } from './client';

const FINANCES_DELAY_MS = 2100; // restore_rate 2 → 0.5 req/sec

function toISO8601(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export interface ListFinancialEventsParams {
  postedAfter: Date;
  postedBefore?: Date;
  nextToken?: string;
  maxResultsPerPage?: number;
}

export interface FinancialEventsPayload {
  NextToken?: string;
  FinancialEvents?: {
    ShipmentEventList?: Array<Record<string, unknown>>;
    RefundEventList?: Array<Record<string, unknown>>;
    GuaranteeClaimEventList?: Array<Record<string, unknown>>;
    ChargebackEventList?: Array<Record<string, unknown>>;
    ServiceFeeEventList?: Array<Record<string, unknown>>;
    AdjustmentEventList?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  NextToken?: string;
}

export interface ListFinancialEventsResult {
  payload?: FinancialEventsPayload;
  FinancialEvents?: FinancialEventsPayload['FinancialEvents'];
  NextToken?: string;
}

/**
 * 財務イベント一覧を取得（listFinancialEvents）
 * PostedAfter/PostedBefore で日付範囲指定（最大約90日推奨）
 */
export async function listFinancialEvents(
  params: ListFinancialEventsParams
): Promise<ListFinancialEventsResult> {
  const query: Record<string, string | number | undefined> = {
    PostedAfter: toISO8601(params.postedAfter),
    MaxResultsPerPage: params.maxResultsPerPage ?? 100,
    ...(params.postedBefore && { PostedBefore: toISO8601(params.postedBefore) }),
    ...(params.nextToken && { NextToken: params.nextToken }),
  };

  const res = await callAmazonApi<ListFinancialEventsResult>(
    'listFinancialEvents',
    'finances',
    { query },
    {
      delayBeforeMs: FINANCES_DELAY_MS,
      context: 'finances.listFinancialEvents',
    }
  );

  return res;
}
