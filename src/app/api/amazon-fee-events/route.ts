/**
 * amazon_fee_events 一覧取得（Phase 9）
 * GET: order_id 単位の手数料イベント
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
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10));

    let query = supabase
      .from('amazon_fee_events')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('posted_date', { ascending: false })
      .order('order_id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (orderId?.trim()) query = query.ilike('order_id', `%${orderId.trim()}%`);
    if (transactionType?.trim()) query = query.eq('transaction_type', transactionType.trim());

    const { data: rows, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      rows: rows ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
