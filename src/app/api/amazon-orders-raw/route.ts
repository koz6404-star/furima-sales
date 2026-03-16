/**
 * Amazon Orders raw 確認用（Phase 2）
 * 開発者が raw テーブルの内容を確認できる
 *
 * GET: 件数サマリーとサンプル1件を返す
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
    const limit = Math.min(10, Math.max(1, parseInt(searchParams.get('sampleLimit') ?? '1', 10)));
    const fullSample = searchParams.get('full') === '1';

    const [ordersRes, itemsRes] = await Promise.all([
      supabase
        .from('amazon_orders_raw')
        .select('id, fetched_at, source_key, payload_json')
        .eq('user_id', user.id)
        .order('fetched_at', { ascending: false })
        .limit(limit),
      supabase
        .from('amazon_order_items_raw')
        .select('id, fetched_at, source_key, payload_json')
        .eq('user_id', user.id)
        .order('fetched_at', { ascending: false })
        .limit(limit),
    ]);

    const orders = ordersRes.data ?? [];
    const items = itemsRes.data ?? [];

    const sampleOrder = orders[0];
    const sampleItem = items[0];

    const { count: ordersCount } = await supabase
      .from('amazon_orders_raw')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const { count: itemsCount } = await supabase
      .from('amazon_order_items_raw')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    return NextResponse.json({
      ok: true,
      phase: 2,
      summary: {
        ordersTotal: ordersCount ?? 0,
        orderItemsTotal: itemsCount ?? 0,
      },
      sampleOrder: sampleOrder
        ? {
            id: sampleOrder.id,
            fetched_at: sampleOrder.fetched_at,
            source_key: sampleOrder.source_key,
            payload_json: fullSample ? sampleOrder.payload_json : '[truncated]',
          }
        : null,
      sampleOrderItem: sampleItem
        ? {
            id: sampleItem.id,
            fetched_at: sampleItem.fetched_at,
            source_key: sampleItem.source_key,
            payload_json: fullSample ? sampleItem.payload_json : '[truncated]',
          }
        : null,
      note: !fullSample ? '?full=1 で payload_json 全文を取得' : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
