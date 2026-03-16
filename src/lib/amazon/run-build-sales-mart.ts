/**
 * 売上集計 mart 構築の実行エントリポイント（アプリ外実行用）
 * スクリプト・バッチから呼び出すためのサービス層
 */
import type { BuildSalesMartResult } from './build-sales-mart';
import { buildSalesMart } from './build-sales-mart';
import { createServiceRoleClient } from '@/lib/supabase/service';

export async function runBuildSalesMart(userId: string): Promise<BuildSalesMartResult> {
  const supabase = createServiceRoleClient();
  return buildSalesMart(supabase, userId);
}
