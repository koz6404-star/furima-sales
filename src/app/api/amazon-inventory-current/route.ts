/**
 * amazon_inventory_current 一覧取得（Phase 6）
 * GET: SKU 単位の最新在庫
 *
 * Query:
 * - sku: seller_sku 部分一致
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
    const sku = searchParams.get('sku');
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10));

    let query = supabase
      .from('amazon_inventory_current')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('seller_sku', { ascending: true })
      .range(offset, offset + limit - 1);

    if (sku?.trim()) {
      query = query.ilike('seller_sku', `%${sku.trim()}%`);
    }

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
