/**
 * Phase9 完了確認 API
 * fee_events 件数・再整形安定性
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transformRawToFeeEvents } from '@/lib/amazon/transform-fee-events';

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

    const { count: total } = await supabase
      .from('amazon_fee_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const { data: typeCounts } = await supabase
      .from('amazon_fee_events')
      .select('transaction_type')
      .eq('user_id', user.id);

    const byType: Record<string, number> = {};
    for (const r of typeCounts ?? []) {
      const t = r.transaction_type ?? '_unknown';
      byType[t] = (byType[t] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      total: total ?? 0,
      byTransactionType: byType,
      verdict: (total ?? 0) > 0 ? 'fee_events あり' : 'fee_events 0件（transform 未実行）',
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const r1 = await transformRawToFeeEvents(supabase, user.id);
    const { count: after1 } = await supabase
      .from('amazon_fee_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const r2 = await transformRawToFeeEvents(supabase, user.id);
    const { count: after2 } = await supabase
      .from('amazon_fee_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const stable = after1 === after2;
    return NextResponse.json({
      ok: true,
      passed: stable,
      after1: after1 ?? 0,
      after2: after2 ?? 0,
      stable: stable ? '再整形で件数一致' : '要確認',
      transform1: r1,
      transform2: r2,
      verdict: stable ? '合格' : '要確認',
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
