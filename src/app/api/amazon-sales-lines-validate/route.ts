/**
 * 再 transform 後の検証 API
 * sales_state 別件数、整合性チェック、state 変更前後の差分
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
      .select('id, order_id, order_item_id, sales_state, sales_amount_yen')
      .eq('user_id', user.id);

    const byState: Record<string, number> = { confirmed: 0, pending_price: 0, canceled: 0, other_excluded: 0 };
    let confirmedNullAmount = 0;
    for (const r of rows ?? []) {
      const state = r.sales_state ?? 'other_excluded';
      byState[state] = (byState[state] ?? 0) + 1;
      if (state === 'confirmed' && (r.sales_amount_yen == null || r.sales_amount_yen === undefined)) {
        confirmedNullAmount++;
      }
    }

    const total = rows?.length ?? 0;
    const summary = {
      total,
      byState,
      confirmed: byState.confirmed ?? 0,
      pending_price: byState.pending_price ?? 0,
      canceled: byState.canceled ?? 0,
      other_excluded: byState.other_excluded ?? 0,
      confirmedButNullAmount: confirmedNullAmount,
      isValid: confirmedNullAmount === 0,
    };

    return NextResponse.json({
      ok: true,
      summary,
      message: confirmedNullAmount > 0
        ? `不正: confirmed なのに sales_amount_yen が null のレコードが ${confirmedNullAmount} 件あります`
        : '検証OK: confirmed はすべて金額あり',
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
