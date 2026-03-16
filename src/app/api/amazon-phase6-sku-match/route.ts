/**
 * Phase6 SKU 結合率分析 API
 * confirmed 売上明細と inventory_current の SKU 一致状況を集計
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: salesRows } = await supabase
      .from('amazon_sales_lines')
      .select('id, sku, order_id, order_item_id, product_name')
      .eq('user_id', user.id)
      .eq('sales_state', 'confirmed');

    const { data: invRows } = await supabase
      .from('amazon_inventory_current')
      .select('seller_sku')
      .eq('user_id', user.id);

    const invSkuSet = new Set<string>();
    for (const r of invRows ?? []) {
      const s = (r.seller_sku ?? '').trim();
      if (s) invSkuSet.add(s);
    }

    const skuToSample: Record<string, { order_id: string; product_name?: string }> = {};
    let joined = 0;
    let skuNullCount = 0;
    const notJoinedSkus: string[] = [];

    for (const r of salesRows ?? []) {
      const sku = (r.sku ?? '').trim();
      if (!sku) {
        skuNullCount++;
        continue;
      }
      if (invSkuSet.has(sku)) {
        joined++;
      } else {
        if (!skuToSample[sku]) {
          skuToSample[sku] = { order_id: r.order_id ?? '', product_name: r.product_name ?? undefined };
          notJoinedSkus.push(sku);
        }
      }
    }

    const total = (salesRows ?? []).length;
    const notJoined = total - joined;
    const joinableTotal = total - skuNullCount;
    const rate = joinableTotal > 0 ? (joined / joinableTotal) * 100 : 0;
    const rateAll = total > 0 ? (joined / total) * 100 : 0;

    const sampleSize = Math.min(20, notJoinedSkus.length);
    const mismatchSamples = notJoinedSkus.slice(0, sampleSize).map((sku) => ({
      sku,
      order_id: skuToSample[sku]?.order_id,
      product_name: skuToSample[sku]?.product_name,
    }));

    return NextResponse.json({
      ok: true,
      summary: {
        totalConfirmed: total,
        joined,
        notJoined,
        skuNullCount,
        joinableTotal,
        ratePercent: Math.round(rate * 100) / 100,
        ratePercentAll: Math.round(rateAll * 100) / 100,
      },
      inventorySkusCount: invSkuSet.size,
      mismatchSamples,
      totalMismatchSkus: notJoinedSkus.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
