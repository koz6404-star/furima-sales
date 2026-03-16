/**
 * amazon_finance_raw → amazon_fee_events 変換 API（Phase 9）
 * POST: fee 候補イベントを整形
 *
 * 本体処理は lib/amazon/transform-fee-events。
 * アプリ外実行は scripts/amazon-fee-events-transform または runFeeEventsTransform を使用。
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transformRawToFeeEvents } from '@/lib/amazon/transform-fee-events';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await transformRawToFeeEvents(supabase, user.id);

    return NextResponse.json({
      ok: true,
      phase: 9,
      transform: result,
      message: `fee_events: ${result.processed}件処理、${result.saved}件保存`,
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error('[Amazon] fee_events transform error:', msg);
    return NextResponse.json(
      { ok: false, phase: 9, error: msg },
      { status: 500 }
    );
  }
}
