/**
 * fee_events 整形の実行エントリポイント（アプリ外実行用）
 * スクリプト・バッチから呼び出すためのサービス層
 *
 * lib/amazon/transform-fee-events の薄いラッパー。
 * Service Role クライアントを使用し、user_id を指定して実行する。
 */
import type { TransformFeeEventsResult } from './transform-fee-events';
import { transformRawToFeeEvents } from './transform-fee-events';
import { createServiceRoleClient } from '@/lib/supabase/service';

/**
 * 指定 user の amazon_finance_raw → amazon_fee_events 整形を実行
 *
 * @param userId - 対象ユーザー ID
 * @returns 処理結果（processed, saved, skipped, errors）
 */
export async function runFeeEventsTransform(userId: string): Promise<TransformFeeEventsResult> {
  const supabase = createServiceRoleClient();
  return transformRawToFeeEvents(supabase, userId);
}
