/**
 * Amazon SP-API 同期（再構築中）
 *
 * Phase 0 にて旧実装をリセットしました。
 * 旧コードは legacy/amazon_import_old/amazon-sync-route.backup.ts に退避済み。
 *
 * 今後の実装順序:
 * - Phase 1: 接続基盤の最小再構築
 * - Phase 2: Orders API raw 取得
 * - Phase 3: 売上明細整形
 * - Phase 4: 売上一覧画面
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 300;

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
      ok: false,
      rebuild: true,
      message: 'Amazon連携は再構築中です。Phase 1 より順次実装します。',
      phase: 0,
      legacyBackup: 'legacy/amazon_import_old/amazon-sync-route.backup.ts',
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
