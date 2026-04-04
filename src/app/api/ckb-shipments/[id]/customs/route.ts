import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { allocateCosts, weightedAverageCost } from '@/lib/ckb-cost-allocator';

// POST: 関税後付け → 再按分 → cost_yen再計算
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 });

  const body = await req.json();
  const { customs_duty_jpy } = body;

  if (customs_duty_jpy == null || customs_duty_jpy < 0) {
    return NextResponse.json({ error: '関税額を正しく入力してください' }, { status: 400 });
  }

  // 1. 発送データ取得
  const { data: shipment, error: shipErr } = await supabase
    .from('ckb_shipments')
    .select('*, ckb_shipment_items(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (shipErr || !shipment) return NextResponse.json({ error: '発送が見つかりません' }, { status: 404 });
  if (shipment.status === 'draft') {
    return NextResponse.json({ error: 'まず確定してから関税を追加してください' }, { status: 400 });
  }

  const items = shipment.ckb_shipment_items || [];
  const oldCustoms = shipment.customs_duty_jpy || 0;

  // 2. 関税更新 → 再按分
  const updatedShipment = { ...shipment, customs_duty_jpy };
  const { allocatedItems } = allocateCosts(updatedShipment, items);

  // 3. 各商品アイテムと紐付きproductsを更新
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const alloc = allocatedItems[i];
    const oldUnitTotal = item.unit_total_cost_jpy || 0;

    await supabase
      .from('ckb_shipment_items')
      .update({
        allocated_customs_jpy: alloc.allocated_customs_jpy,
        total_cost_jpy: alloc.total_cost_jpy,
        unit_total_cost_jpy: alloc.unit_total_cost_jpy,
      })
      .eq('id', item.id);

    // product_id が紐付いている場合、cost_yenを再計算
    if (item.product_id) {
      const { data: product } = await supabase
        .from('products')
        .select('cost_yen, stock')
        .eq('id', item.product_id)
        .single();

      if (product) {
        // 既存cost_yenからこの便の旧コスト分を引いて、新コスト分を足す
        const otherStock = product.stock - item.quantity;
        const otherCostTotal = otherStock > 0 ? product.cost_yen * otherStock : 0;
        const newTotal = otherCostTotal + alloc.unit_total_cost_jpy * item.quantity;
        const newCostYen = product.stock > 0 ? Math.round(newTotal / product.stock) : alloc.unit_total_cost_jpy;

        await supabase
          .from('products')
          .update({ cost_yen: newCostYen, updated_at: new Date().toISOString() })
          .eq('id', item.product_id);
      }
    }
  }

  // 4. shipmentステータス更新
  await supabase
    .from('ckb_shipments')
    .update({
      customs_duty_jpy,
      status: 'customs_added',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  return NextResponse.json({
    message: `関税 ¥${customs_duty_jpy.toLocaleString()} を追加しました（旧: ¥${oldCustoms.toLocaleString()}）`,
    items_updated: items.length,
  });
}
