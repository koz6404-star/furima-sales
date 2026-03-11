/**
 * 指定商品の重複パターン詳細API
 * ?productId=xxx で商品IDを指定。販売履歴を日付・注文ID・個数別に一覧表示
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');
    if (!productId) {
      return NextResponse.json({ error: 'productId required' }, { status: 400 });
    }

    const { data: product } = await supabase
      .from('products')
      .select('id, name')
      .eq('id', productId)
      .eq('user_id', user.id)
      .single();
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const { data: sales } = await supabase
      .from('sales')
      .select('id, product_id, sold_at, quantity, unit_price_yen, amazon_order_id, fee_yen, shipping_yen, created_at')
      .eq('product_id', productId)
      .eq('user_id', user.id)
      .eq('platform', 'amazon')
      .order('sold_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (!sales) {
      return NextResponse.json({ product: product.name, records: [], groups: [], summary: {} });
    }

    // 日付別にグループ化（どの日に何件あるか）
    const byDate = new Map<string, typeof sales>();
    for (const s of sales) {
      const d = String(s.sold_at).slice(0, 10);
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(s);
    }

    // 同一注文・日付・商品での重複グループ
    const dupGroups: Array<{
      key: string;
      sold_at: string;
      orderId: string | null;
      records: Array<{ id: string; quantity: number; unit_price_yen: number; fee_yen: number; created_at: string }>;
      isDuplicate: boolean;
    }> = [];

    for (const [date, recs] of byDate) {
      const byKey = new Map<string, typeof recs>();
      for (const r of recs) {
        const k = r.amazon_order_id
          ? `${r.amazon_order_id}|${r.sold_at}`
          : `${r.sold_at}|${r.unit_price_yen}|${r.quantity}`;
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k)!.push(r);
      }
      for (const [k, list] of byKey) {
        dupGroups.push({
          key: k,
          sold_at: date,
          orderId: list[0].amazon_order_id ?? null,
          records: list.map((r) => ({
            id: r.id,
            quantity: r.quantity,
            unit_price_yen: r.unit_price_yen,
            fee_yen: r.fee_yen ?? 0,
            created_at: r.created_at ?? '',
          })),
          isDuplicate: list.length > 1,
        });
      }
    }

    const summary = {
      totalRecords: sales.length,
      totalQuantity: sales.reduce((s, r) => s + r.quantity, 0),
      dateCount: byDate.size,
      duplicateGroupCount: dupGroups.filter((g) => g.isDuplicate).length,
    };

    return NextResponse.json({
      product: product.name,
      productId: product.id,
      records: sales,
      byDate: Object.fromEntries([...byDate.entries()].map(([d, v]) => [d, v.length])),
      groups: dupGroups,
      summary,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
