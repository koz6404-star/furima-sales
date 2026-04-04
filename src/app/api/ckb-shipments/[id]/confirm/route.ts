import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { allocateCosts, weightedAverageCost } from '@/lib/ckb-cost-allocator';

// POST: コスト確定 → 按分計算 → products.cost_yen 更新
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 });

  // 1. 発送データ取得
  const { data: shipment, error: shipErr } = await supabase
    .from('ckb_shipments')
    .select('*, ckb_shipment_items(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (shipErr || !shipment) return NextResponse.json({ error: '発送が見つかりません' }, { status: 404 });
  if (shipment.status !== 'draft') {
    return NextResponse.json({ error: '既に確定済みです' }, { status: 400 });
  }

  const items = shipment.ckb_shipment_items || [];
  if (items.length === 0) {
    return NextResponse.json({ error: '商品が0件です' }, { status: 400 });
  }

  // 2. 按分計算
  const { allocatedItems, total_items } = allocateCosts(shipment, items);

  // 3. 商品アイテム更新 + products反映
  const results: { sku: string; product_id: string | null; action: string }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const alloc = allocatedItems[i];

    // ckb_shipment_items を更新
    await supabase
      .from('ckb_shipment_items')
      .update({
        unit_cost_jpy: alloc.unit_cost_jpy,
        allocated_intl_shipping_jpy: alloc.allocated_intl_shipping_jpy,
        allocated_customs_jpy: alloc.allocated_customs_jpy,
        total_cost_jpy: alloc.total_cost_jpy,
        unit_total_cost_jpy: alloc.unit_total_cost_jpy,
      })
      .eq('id', item.id);

    // SKUで既存商品を検索
    let productId = item.product_id;
    if (!productId && item.ckb_sku) {
      const { data: existing } = await supabase
        .from('products')
        .select('id, cost_yen, stock')
        .eq('user_id', user.id)
        .eq('sku', item.ckb_sku)
        .maybeSingle();

      if (existing) {
        // 既存商品: 加重平均原価 + 在庫追加
        const newCost = weightedAverageCost(
          existing.stock, existing.cost_yen,
          item.quantity, alloc.unit_total_cost_jpy
        );
        await supabase
          .from('products')
          .update({
            cost_yen: newCost,
            stock: existing.stock + item.quantity,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        // ロケーション更新
        const { data: locData } = await supabase
          .from('product_location_stock')
          .select('quantity')
          .eq('product_id', existing.id)
          .eq('location', 'home')
          .maybeSingle();

        if (locData) {
          await supabase
            .from('product_location_stock')
            .update({ quantity: locData.quantity + item.quantity })
            .eq('product_id', existing.id)
            .eq('location', 'home');
        } else {
          await supabase
            .from('product_location_stock')
            .insert({ product_id: existing.id, location: 'home', quantity: item.quantity });
        }

        productId = existing.id;
        results.push({ sku: item.ckb_sku, product_id: productId, action: 'updated' });
      } else {
        // 新規商品作成
        const spec = { size: item.size, color: item.color };
        const { data: newProduct } = await supabase
          .from('products')
          .insert({
            user_id: user.id,
            sku: item.ckb_sku,
            sku_locked: true,
            name: item.product_name,
            cost_yen: alloc.unit_total_cost_jpy,
            stock: item.quantity,
            image_url: item.image_url || null,
            size: spec?.size || item.size || null,
            color: spec?.color || item.color || null,
            stock_received_at: shipment.arrived_at || new Date().toISOString().slice(0, 10),
            oldest_received_at: shipment.arrived_at || new Date().toISOString().slice(0, 10),
          })
          .select('id')
          .single();

        if (newProduct) {
          productId = newProduct.id;
          await supabase
            .from('product_location_stock')
            .insert({ product_id: newProduct.id, location: 'home', quantity: item.quantity });
        }
        results.push({ sku: item.ckb_sku || '', product_id: productId, action: 'created' });
      }

      // product_id を紐付け
      if (productId) {
        await supabase
          .from('ckb_shipment_items')
          .update({ product_id: productId })
          .eq('id', item.id);
      }
    }
  }

  // 4. shipment ステータスを confirmed に
  await supabase
    .from('ckb_shipments')
    .update({ status: 'confirmed', total_items, updated_at: new Date().toISOString() })
    .eq('id', id);

  return NextResponse.json({
    message: `${items.length}件の商品を確定しました`,
    total_items,
    results,
  });
}
