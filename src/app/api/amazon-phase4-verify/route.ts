/**
 * Phase4 最終確認 API
 * 1. confirmed & null 件数
 * 2. 再transform 前後の件数比較（安定性）
 * 3. 集計対象条件の確認
 *
 * GET: 現状サマリーのみ
 * POST: 再transform を1回実行し、前後比較付きで返却
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transformRawToSalesLines } from '@/lib/amazon/transform-sales-lines';

export const dynamic = 'force-dynamic';

async function getStateCounts(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { count: totalCount } = await supabase
    .from('amazon_sales_lines')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  const { data: rows } = await supabase
    .from('amazon_sales_lines')
    .select('sales_state, sales_amount_yen')
    .eq('user_id', userId)
    .limit(10000);

  const byState: Record<string, number> = { confirmed: 0, pending_price: 0, canceled: 0, other_excluded: 0 };
  let confirmedNullAmount = 0;
  for (const r of rows ?? []) {
    const state = r.sales_state ?? 'other_excluded';
    byState[state] = (byState[state] ?? 0) + 1;
    if (state === 'confirmed' && (r.sales_amount_yen == null || r.sales_amount_yen === undefined)) {
      confirmedNullAmount++;
    }
  }

  const sumByState = byState.confirmed + byState.pending_price + byState.canceled + byState.other_excluded;
  const consistent = totalCount != null && sumByState === totalCount;

  return {
    byState,
    total_rows: totalCount ?? 0,
    sum_by_state: sumByState,
    consistent,
    confirmedNullAmount,
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const snapshot = await getStateCounts(supabase, user.id);

    return NextResponse.json({
      ok: true,
      snapshot,
      aggregationCheck: {
        listApiDefault: 'salesState=confirmed',
        summaryShowsAllStates: true,
        onlyConfirmedInSales: '一覧取得・初期表示は sales_state=confirmed でフィルタ済み。売上合計APIは現状なし（Phase5で追加予定）',
      },
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

    const before = await getStateCounts(supabase, user.id);

    const result1 = await transformRawToSalesLines(supabase, user.id);
    const after1 = await getStateCounts(supabase, user.id);

    const result2 = await transformRawToSalesLines(supabase, user.id);
    const after2 = await getStateCounts(supabase, user.id);

    const stable =
      after1.total_rows === after2.total_rows &&
      after1.byState.confirmed === after2.byState.confirmed &&
      after1.byState.pending_price === after2.byState.pending_price &&
      after1.byState.canceled === after2.byState.canceled &&
      after1.byState.other_excluded === after2.byState.other_excluded;

    const passed =
      after2.confirmedNullAmount === 0 && stable && after2.consistent;

    return NextResponse.json({
      ok: true,
      passed: !!passed,
      unit: '商品行（amazon_sales_lines の1行 = 1注文1商品）',
      before: {
        sales_state_商品行数: before.byState,
        db総商品行数: before.total_rows,
        byState合計: before.sum_by_state,
        consistent: before.consistent,
        confirmedで金額null: before.confirmedNullAmount,
      },
      after1: {
        sales_state_商品行数: after1.byState,
        db総商品行数: after1.total_rows,
        byState合計: after1.sum_by_state,
        consistent: after1.consistent,
        confirmedで金額null: after1.confirmedNullAmount,
      },
      after2: {
        sales_state_商品行数: after2.byState,
        db総商品行数: after2.total_rows,
        byState合計: after2.sum_by_state,
        consistent: after2.consistent,
        confirmedで金額null: after2.confirmedNullAmount,
      },
      transform_処理件数: result2.processed,
      stable: stable ? '同じrawで2回transform→件数一致（安定）' : '要確認: 2回目で件数変化',
      transformResult: result2,
      verdict: passed
        ? '合格: Phase5 へ進んでよい'
        : after2.confirmedNullAmount > 0
          ? `不合格: confirmed なのに sales_amount_yen が null が ${after2.confirmedNullAmount} 件`
          : !after2.consistent
            ? `要確認: db総商品行数(${after2.total_rows}) と byState合計(${after2.sum_by_state}) が一致しません`
            : !stable
              ? '要確認: 再transform で件数が変化しました'
              : '要確認',
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
