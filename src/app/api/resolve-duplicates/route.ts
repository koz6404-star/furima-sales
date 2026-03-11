/**
 * Amazon販売履歴の重複解消API
 * 同じ注文・日付・商品で複数ある場合、1件を残して他を削除
 * POST: dryRun=true で削除対象を返す、dryRun=false で実際に削除
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false;

    const { data: sales } = await supabase
      .from('sales')
      .select('id, product_id, sold_at, quantity, unit_price_yen, amazon_order_id, fee_yen, created_at')
      .eq('user_id', user.id)
      .eq('platform', 'amazon');

    if (!sales || sales.length === 0) {
      return NextResponse.json({
        ok: true,
        dryRun,
        deletedCount: 0,
        groupsProcessed: 0,
        message: 'Amazon販売履歴がありません',
      });
    }

    const { data: prods } = await supabase
      .from('products')
      .select('id, name')
      .eq('user_id', user.id);
    const prodMap = new Map((prods ?? []).map((p) => [p.id, p.name]));

    // グループ化: orderId あり → (orderId, sold_at, product_id)、なし → (sold_at, product_id, unit_price_yen, quantity)
    const groupsWithOrder = new Map<string, typeof sales>();
    const groupsNoOrder = new Map<string, typeof sales>();

    for (const s of sales) {
      if (s.amazon_order_id) {
        const k = `${s.amazon_order_id}|${s.sold_at}|${s.product_id}`;
        if (!groupsWithOrder.has(k)) groupsWithOrder.set(k, []);
        groupsWithOrder.get(k)!.push(s);
      } else {
        const k = `${s.sold_at}|${s.product_id}|${s.unit_price_yen}|${s.quantity}`;
        if (!groupsNoOrder.has(k)) groupsNoOrder.set(k, []);
        groupsNoOrder.get(k)!.push(s);
      }
    }

    const toDelete: string[] = [];
    const details: Array<{
      productName: string;
      sold_at: string;
      orderId: string | null;
      keep: { id: string; quantity: number };
      remove: Array<{ id: string; quantity: number }>;
    }> = [];

    function processGroup(_key: string, group: typeof sales) {
      if (!group || group.length <= 1) return;
      // 残す1件: 数量が最大のものを優先（2個売れた正しい記録を残す）、同点なら手数料あり、でなければ作成日が古い方
      const sorted = [...group].sort((a, b) => {
        if (b.quantity !== a.quantity) return b.quantity - a.quantity;
        const feeA = (a.fee_yen ?? 0) > 0 ? 1 : 0;
        const feeB = (b.fee_yen ?? 0) > 0 ? 1 : 0;
        if (feeB !== feeA) return feeB - feeA;
        return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
      });
      const keep = sorted[0];
      const remove = sorted.slice(1);
      for (const r of remove) toDelete.push(r.id);
      details.push({
        productName: prodMap.get(group[0].product_id) ?? '(不明)',
        sold_at: group[0].sold_at,
        orderId: group[0].amazon_order_id ?? null,
        keep: { id: keep.id, quantity: keep.quantity },
        remove: remove.map((r) => ({ id: r.id, quantity: r.quantity })),
      });
    }

    for (const [, g] of groupsWithOrder) processGroup('', g);
    for (const [, g] of groupsNoOrder) processGroup('', g);

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        wouldDeleteCount: toDelete.length,
        groupsProcessed: details.length,
        details,
      });
    }

    if (toDelete.length === 0) {
      return NextResponse.json({
        ok: true,
        dryRun: false,
        deletedCount: 0,
        groupsProcessed: 0,
        message: '削除対象の重複はありません',
      });
    }

    const toDeleteRecords = sales.filter((s) => toDelete.includes(s.id));
    const restoreByProduct = new Map<string, number>();
    for (const r of toDeleteRecords) {
      restoreByProduct.set(r.product_id, (restoreByProduct.get(r.product_id) ?? 0) + r.quantity);
    }

    const { error } = await supabase
      .from('sales')
      .delete()
      .in('id', toDelete)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const now = new Date().toISOString();
    for (const [pid, qty] of restoreByProduct) {
      const { data: prod } = await supabase.from('products').select('stock').eq('id', pid).single();
      const curStock = prod?.stock ?? 0;
      await supabase.from('products').update({ stock: curStock + qty, updated_at: now }).eq('id', pid);
      const { data: locRows } = await supabase
        .from('product_location_stock')
        .select('location, quantity')
        .eq('product_id', pid);
      const homeQty = locRows?.find((r) => r.location === 'home')?.quantity ?? 0;
      const newHome = homeQty + qty;
      const exHome = locRows?.find((r) => r.location === 'home');
      if (exHome) {
        await supabase
          .from('product_location_stock')
          .update({ quantity: newHome, updated_at: now })
          .eq('product_id', pid)
          .eq('location', 'home');
      } else if (newHome > 0) {
        await supabase
          .from('product_location_stock')
          .insert({ product_id: pid, location: 'home', quantity: newHome, updated_at: now });
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      deletedCount: toDelete.length,
      groupsProcessed: details.length,
      details,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
