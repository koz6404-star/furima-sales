/**
 * Amazon 売上明細一覧取得（Phase 3〜10）
 * GET: amazon_sales_lines を一覧返却
 * - Phase 7: current_available を FBA 行に LEFT JOIN
 * - Phase 10: fee_amount_aggregated を order_id 単位で amazon_fee_events から集約付与
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
    const salesState = searchParams.get('salesState') ?? 'confirmed';
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const sku = searchParams.get('sku');
    const productName = searchParams.get('productName');
    const fulfillmentType = searchParams.get('fulfillmentType');
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10));

    let query = supabase
      .from('amazon_sales_lines')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('order_date', { ascending: false })
      .order('order_id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (salesState !== 'all') {
      query = query.eq('sales_state', salesState);
    }
    if (from) query = query.gte('order_date', from);
    if (to) query = query.lte('order_date', to);
    if (sku) query = query.ilike('sku', `%${sku}%`);
    if (productName) query = query.ilike('product_name', `%${productName}%`);
    if (fulfillmentType === 'FBA' || fulfillmentType === 'FBM') {
      query = query.eq('fulfillment_type', fulfillmentType);
    }

    const { data: rows, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = (rows ?? []) as Array<Record<string, unknown> & { fulfillment_type?: string | null; sku?: string | null }>;

    let currentMap: Record<string, number> = {};
    const fbaSkus = items
      .filter((r) => r.fulfillment_type === 'FBA' && (r.sku ?? '').trim())
      .map((r) => (r.sku as string).trim());
    const uniqueSkus = [...new Set(fbaSkus)];

    if (uniqueSkus.length > 0) {
      const { data: invRows } = await supabase
        .from('amazon_inventory_current')
        .select('seller_sku, total_available_qty')
        .eq('user_id', user.id)
        .in('seller_sku', uniqueSkus);
      for (const r of invRows ?? []) {
        const s = (r.seller_sku ?? '').trim();
        if (s) {
          const q = r.total_available_qty;
          currentMap[s] = typeof q === 'number' && !Number.isNaN(q) ? q : 0;
        }
      }
    }

    const orderIds = [...new Set(items.map((r) => r.order_id as string).filter(Boolean))];
    let feeMap: Record<string, number> = {};
    if (orderIds.length > 0) {
      const { data: feeRows } = await supabase
        .from('amazon_fee_events')
        .select('order_id, fee_amount_yen')
        .eq('user_id', user.id)
        .in('order_id', orderIds);
      for (const r of feeRows ?? []) {
        const oid = String(r.order_id ?? '').trim();
        if (oid) {
          feeMap[oid] = (feeMap[oid] ?? 0) + (Number(r.fee_amount_yen) || 0);
        }
      }
    }

    const enriched = items.map((r) => {
      const row = { ...r };
      if (r.fulfillment_type !== 'FBA' || !(r.sku ?? '').trim()) {
        row.current_available = null;
      } else {
        const s = (r.sku as string).trim();
        row.current_available = s in currentMap ? currentMap[s]! : null;
      }
      const oid = String(r.order_id ?? '').trim();
      row.fee_amount_aggregated = oid && oid in feeMap ? feeMap[oid]! : null;
      return row;
    });

    return NextResponse.json({
      ok: true,
      rows: enriched,
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
