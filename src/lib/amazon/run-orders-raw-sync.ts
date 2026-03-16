/**
 * Orders raw 取得の実行エントリポイント（アプリ外実行用）
 * スクリプト・バッチから呼び出すためのサービス層
 *
 * lib/amazon/orders-raw-sync の薄いラッパー。
 * Service Role クライアントを使用し、user_id を指定して実行する。
 */
import type { SyncOrdersRawResult } from './orders-raw-sync';
import { syncOrdersToRaw } from './orders-raw-sync';
import { createServiceRoleClient } from '@/lib/supabase/service';

export interface RunOrdersRawSyncParams {
  /** 取得開始日（デフォルト: 30日前） */
  createdAfter?: Date;
  /** 取得終了日（デフォルト: 現在時刻） */
  createdBefore?: Date;
}

/**
 * 指定 user の Orders API → amazon_orders_raw 取得を実行
 *
 * @param userId - 対象ユーザー ID
 * @param params - 取得期間（省略時は直近30日）
 * @returns 処理結果（ordersFetched, ordersSaved, orderItemsFetched, orderItemsSaved, errors）
 */
export async function runOrdersRawSync(
  userId: string,
  params?: RunOrdersRawSyncParams
): Promise<SyncOrdersRawResult> {
  const supabase = createServiceRoleClient();

  const now = new Date();
  const createdAfter = params?.createdAfter ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const createdBefore = params?.createdBefore ?? now;

  return syncOrdersToRaw(supabase, userId, { createdAfter, createdBefore });
}
