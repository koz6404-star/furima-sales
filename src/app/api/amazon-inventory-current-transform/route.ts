/**
 * amazon_fba_inventory_raw → amazon_inventory_current 変換 API（Phase 6）
 * POST: raw から current テーブルへ整形
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transformRawToInventoryCurrent } from '@/lib/amazon/transform-inventory-current';

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await transformRawToInventoryCurrent(supabase, user.id);

    return NextResponse.json({
      ok: true,
      phase: 6,
      ...result,
      message: `inventory_current: ${result.saved}件更新`,
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error('[Amazon] inventory-current transform error:', msg);
    return NextResponse.json(
      { ok: false, phase: 6, error: msg },
      { status: 500 }
    );
  }
}
