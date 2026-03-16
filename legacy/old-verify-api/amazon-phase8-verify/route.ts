/**
 * Phase8 完了確認 API
 * raw 保存数・主要キー存在確認・再同期安定性
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncFinanceToRaw } from '@/lib/amazon/finance-raw-sync';

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
      .from('amazon_finance_raw')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const { data: sample } = await supabase
      .from('amazon_finance_raw')
      .select('order_id, transaction_id, posted_date, transaction_type')
      .eq('user_id', user.id)
      .limit(5);

    const withOrderId = await supabase
      .from('amazon_finance_raw')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('order_id', 'is', null);

    const orderIdRate =
      (total ?? 0) > 0
        ? Math.round(((withOrderId.count ?? 0) / (total ?? 1)) * 10000) / 100
        : 0;

    return NextResponse.json({
      ok: true,
      total,
      withOrderId: withOrderId.count ?? 0,
      orderIdRatePercent: orderIdRate,
      sample,
      verdict: total != null && total > 0 ? 'raw 保存あり' : 'raw 0件（同期未実行またはデータなし）',
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

    const result1 = await syncFinanceToRaw(supabase, user.id);
    const { count: after1 } = await supabase
      .from('amazon_finance_raw')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const result2 = await syncFinanceToRaw(supabase, user.id);
    const { count: after2 } = await supabase
      .from('amazon_finance_raw')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const stable = after1 === after2;
    return NextResponse.json({
      ok: true,
      passed: stable,
      after1: after1 ?? 0,
      after2: after2 ?? 0,
      stable: stable ? '再同期で件数一致（安定）' : '要確認',
      sync1: result1,
      sync2: result2,
      verdict: stable ? '合格' : '要確認: 再同期で件数変化',
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
