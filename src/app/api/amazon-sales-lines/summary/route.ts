/**
 * sales_state 別件数サマリー取得
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: rows } = await supabase
      .from('amazon_sales_lines')
      .select('sales_state')
      .eq('user_id', user.id);

    const counts = { confirmed: 0, pending_price: 0, canceled: 0, other_excluded: 0 };
    for (const r of rows ?? []) {
      const s = r.sales_state ?? 'other_excluded';
      if (s in counts) (counts as Record<string, number>)[s]++;
    }

    return NextResponse.json({
      ok: true,
      summary: counts,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
