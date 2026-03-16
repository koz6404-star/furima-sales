/**
 * Amazon取り込みデータの完全リセット
 * 販売履歴・在庫を削除し、一から再取り込みできる状態にする
 * POST: dryRun=true で対象を返す、dryRun=false で実際に削除
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

    const { data: amazonSales } = await supabase
      .from('sales')
      .select('id')
      .eq('user_id', user.id)
      .eq('platform', 'amazon');
    const { data: amazonProducts } = await supabase
      .from('products')
      .select('id')
      .eq('user_id', user.id)
      .eq('platform', 'amazon');

    const salesCount = amazonSales?.length ?? 0;
    const productsCount = amazonProducts?.length ?? 0;
    const productIds = (amazonProducts ?? []).map((p) => p.id);
    const saleIds = (amazonSales ?? []).map((s) => s.id);

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        wouldDeleteSales: salesCount,
        wouldResetProducts: productsCount,
        message: `Amazon販売 ${salesCount}件を削除、Amazon商品 ${productsCount}件の在庫を0にリセットします。実行後は「初回取込（2月～）」または「Amazon同期」で再取り込みしてください。`,
      });
    }

    if (salesCount === 0 && productsCount === 0) {
      return NextResponse.json({
        ok: true,
        dryRun: false,
        deletedSales: 0,
        resetProducts: 0,
        message: 'リセット対象のAmazonデータがありません',
      });
    }

    // 1. Amazon販売を削除
    if (saleIds.length > 0) {
      const { error: salesErr } = await supabase
        .from('sales')
        .delete()
        .eq('user_id', user.id)
        .eq('platform', 'amazon');
      if (salesErr) {
        return NextResponse.json({ error: salesErr.message }, { status: 500 });
      }
    }

    // 2. Amazon商品の在庫を0にリセット
    const now = new Date().toISOString();
    if (productIds.length > 0) {
      await supabase
        .from('products')
        .update({ stock: 0, updated_at: now })
        .in('id', productIds)
        .eq('user_id', user.id);
    }

    // 3. product_location_stock を0にリセット（該当商品のみ）
    if (productIds.length > 0) {
      const { data: locRows } = await supabase
        .from('product_location_stock')
        .select('product_id, location')
        .in('product_id', productIds);
      for (const row of locRows ?? []) {
        await supabase
          .from('product_location_stock')
          .update({ quantity: 0, updated_at: now })
          .eq('product_id', row.product_id)
          .eq('location', row.location);
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      deletedSales: salesCount,
      resetProducts: productsCount,
      message: `リセット完了。Amazon販売 ${salesCount}件を削除、${productsCount}件の商品在庫を0にしました。「初回取込（2月～）」または「Amazon同期」で再取り込みしてください。`,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
