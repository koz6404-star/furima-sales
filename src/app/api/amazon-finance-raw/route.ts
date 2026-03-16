/**
 * Finances raw 一覧取得（Phase 8）
 * GET: orderId / transactionId / postedDate / transactionType 等の主要キーを確認
 *
 * Query:
 * - orderId: 注文ID 部分一致
 * - transactionType: イベント種別（ShipmentEvent 等）
 * - from, to: posted_date 範囲
 * - limit, offset: ページネーション
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId');
    const transactionType = searchParams.get('transactionType');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10));

    let query = supabase
      .from('amazon_finance_raw')
      .select('id, source_key, source_api, posted_date, order_id, transaction_id, transaction_type, fetched_at', {
        count: 'exact',
      })
      .eq('user_id', user.id)
      .order('posted_date', { ascending: false })
      .order('order_id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (orderId?.trim()) {
      query = query.ilike('order_id', `%${orderId.trim()}%`);
    }
    if (transactionType?.trim()) {
      query = query.eq('transaction_type', transactionType.trim());
    }
    if (from) query = query.gte('posted_date', from);
    if (to) query = query.lte('posted_date', to);

    const { data: rows, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const typeCounts = await supabase
      .from('amazon_finance_raw')
      .select('transaction_type')
      .eq('user_id', user.id);

    const typeMap: Record<string, number> = {};
    for (const r of typeCounts.data ?? []) {
      const t = r.transaction_type ?? '_unknown';
      typeMap[t] = (typeMap[t] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      rows: rows ?? [],
      total: count ?? 0,
      limit,
      offset,
      transactionTypeCounts: typeMap,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
