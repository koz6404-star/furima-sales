/**
 * inventory_current 整形の実行エントリポイント（アプリ外実行用）
 * スクリプト・バッチから呼び出すためのサービス層
 *
 * lib/amazon/transform-inventory-current の薄いラッパー。
 * Service Role クライアントを使用し、user_id を指定して実行する。
 */
import type { TransformInventoryCurrentResult } from './transform-inventory-current';
import { transformRawToInventoryCurrent } from './transform-inventory-current';
import { createServiceRoleClient } from '@/lib/supabase/service';

/**
 * 指定 user の amazon_fba_inventory_raw → amazon_inventory_current 整形を実行
 *
 * @param userId - 対象ユーザー ID
 * @returns 処理結果（processed, saved, skipped, errors）
 */
export async function runInventoryCurrentTransform(
  userId: string
): Promise<TransformInventoryCurrentResult> {
  const supabase = createServiceRoleClient();
  return transformRawToInventoryCurrent(supabase, userId);
}
