/**
 * sales_lines 整形の実行エントリポイント（アプリ外実行用）
 * スクリプト・バッチから呼び出すためのサービス層
 *
 * lib/amazon/transform-sales-lines の薄いラッパー。
 * Service Role クライアントを使用し、user_id を指定して実行する。
 */
import type { TransformSalesLinesResult } from './transform-sales-lines';
import { transformRawToSalesLines } from './transform-sales-lines';
import { createServiceRoleClient } from '@/lib/supabase/service';

/**
 * 指定 user の amazon_orders_raw → amazon_sales_lines 整形を実行
 *
 * @param userId - 対象ユーザー ID
 * @returns 処理結果（processed, saved, skipped, errors）
 */
export async function runSalesLinesTransform(userId: string): Promise<TransformSalesLinesResult> {
  const supabase = createServiceRoleClient();
  return transformRawToSalesLines(supabase, userId);
}
