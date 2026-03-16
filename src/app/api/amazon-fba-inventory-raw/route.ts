/**
 * FBA Inventory raw 一覧・詳細取得（Phase 5）
 * GET: seller_sku 単位で確認
 *
 * Query:
 * - sku: seller_sku 部分一致フィルタ
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
      .from('amazon_fba_inventory_raw')
      .select('source_key, snapshot_at, payload_json', { count: 'exact' })
      .eq('user_id', user.id)
      .order('source_key', { ascending: true })
      .range(offset, offset + limit - 1);

    if (sku?.trim()) {
      query = query.ilike('source_key', `%${sku.trim()}%`);
    }

    const { data: rows, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = (rows ?? []).map((r) => ({
      seller_sku: r.source_key,
      snapshot_at: r.snapshot_at,
      ...(r.payload_json as Record<string, unknown>),
    }));

    return NextResponse.json({
      ok: true,
      rows: items,
      total: count ?? 0,
      limit,
      offset,
      inventoryKeys: items.length > 0 && items[0]
        ? Object.keys(items[0]).filter((k) => !['seller_sku', 'snapshot_at'].includes(k))
        : [],
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
