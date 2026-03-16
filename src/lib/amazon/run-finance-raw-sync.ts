/**
 * Finance raw 取得の実行エントリポイント（アプリ外実行用）
 * スクリプト・バッチから呼び出すためのサービス層
 *
 * lib/amazon/finance-raw-sync の薄いラッパー。
 * Service Role クライアントを使用し、user_id を指定して実行する。
 */
import type { SyncFinanceRawResult } from './finance-raw-sync';
import { syncFinanceToRaw } from './finance-raw-sync';
import { createServiceRoleClient } from '@/lib/supabase/service';

/**
 * 指定 user の Finances API → amazon_finance_raw 取得を実行
 * 取得範囲は関数内で直近90日に固定されている。
 *
 * @param userId - 対象ユーザー ID
 * @returns 処理結果（fetched, saved, skipped, errors）
 */
export async function runFinanceRawSync(userId: string): Promise<SyncFinanceRawResult> {
  const supabase = createServiceRoleClient();
  return syncFinanceToRaw(supabase, userId);
}
