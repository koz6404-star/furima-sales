/**
 * Amazon raw → amazon_sales_lines 変換 API（Phase 3）
 * POST: raw テーブルから整形済み売上明細を生成
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transformRawToSalesLines } from '@/lib/amazon/transform-sales-lines';

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await transformRawToSalesLines(supabase, user.id);

    return NextResponse.json({
      ok: true,
      phase: 3,
      ...result,
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error('[Amazon] transform error:', msg);
    return NextResponse.json(
      {
        ok: false,
        phase: 3,
        error: msg,
      },
      { status: 500 }
    );
  }
}
