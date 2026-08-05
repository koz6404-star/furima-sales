/**
 * 商品別パフォーマンス分析 API
 * フリマ(sales+products) + Amazon(mart+cost+inventory) を統合して
 * SKU/商品単位の売上・利益・利益率・在庫を返す
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllPages } from '@/lib/supabase/fetch-all';

export const dynamic = 'force-dynamic';

export type PerformanceItem = {
  key: string;
  name: string;
  sku: string | null;
  source: 'Amazon' | 'フリマ';
  fulfillment: string | null;
  unitsSold: number;
  salesAmount: number;
  costAmount: number;
  feeAmount: number;
  grossProfit: number;
  profitRate: number;
  roi: number | null;
  currentStock: number;
};

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const items: PerformanceItem[] = [];

    // ── Amazon: sales_lines から期間指定で集計 ──
    let amQuery = supabase
      .from('amazon_sales_lines')
      .select('order_id, sku, product_name, quantity, sales_amount_yen, order_date, fulfillment_type')
      .eq('user_id', user.id)
      .eq('sales_state', 'confirmed');
    if (from) amQuery = amQuery.gte('order_date', from);
    if (to) amQuery = amQuery.lte('order_date', to);
    const { data: amLines } = await amQuery;

    // Amazon: fee_events から期間指定で手数料集計
    // 1,000 行の既定上限で静かに切れるためページングする（DEV-053）
    const { data: feeEvents } = await fetchAllPages<{
      order_id: string | null;
      fee_amount_yen: number | null;
      posted_date: string | null;
    }>((pFrom, pTo) => {
      let feeQuery = supabase
        .from('amazon_fee_events')
        .select('order_id, fee_amount_yen, posted_date')
        .eq('user_id', user.id);
      if (from) feeQuery = feeQuery.gte('posted_date', from);
      if (to) feeQuery = feeQuery.lte('posted_date', to);
      return feeQuery.range(pFrom, pTo);
    });

    // order_id → 手数料合計
    const feeByOrder: Record<string, number> = {};
    for (const fe of feeEvents ?? []) {
      const oid = (fe.order_id ?? '').trim();
      if (oid && oid !== '__POSTAGE__') {
        feeByOrder[oid] = (feeByOrder[oid] ?? 0) + (fe.fee_amount_yen ?? 0);
      }
    }

    // Amazon: SKU原価
    const { data: costRows } = await supabase
      .from('amazon_sku_cost')
      .select('sku, cost_yen')
      .eq('user_id', user.id);
    const costMap = new Map((costRows ?? []).map((c) => [c.sku, c.cost_yen ?? 0]));

    // Amazon: 在庫（unified view）
    const { data: invRows } = await supabase
      .from('amazon_inventory_unified')
      .select('seller_sku, available_qty')
      .eq('user_id', user.id);
    const invMap = new Map((invRows ?? []).map((r) => [r.seller_sku, r.available_qty ?? 0]));

    // SKU別に集計
    const amBySku = new Map<string, {
      name: string;
      fulfillment: string | null;
      units: number;
      sales: number;
      orderIds: Set<string>;
    }>();

    for (const line of amLines ?? []) {
      const sku = (line.sku ?? '').trim() || '(SKUなし)';
      let entry = amBySku.get(sku);
      if (!entry) {
        entry = { name: line.product_name ?? sku, fulfillment: line.fulfillment_type, units: 0, sales: 0, orderIds: new Set() };
        amBySku.set(sku, entry);
      }
      entry.units += line.quantity ?? 0;
      entry.sales += line.sales_amount_yen ?? 0;
    }

    // sales_lines から order_id を取得して手数料をSKU按分
    // まず order → SKU売上マッピング
    const orderSkuSales = new Map<string, Map<string, number>>();
    for (const line of amLines ?? []) {
      const sku = (line.sku ?? '').trim() || '(SKUなし)';
      const oid = (line.order_id ?? '').trim();
      if (!oid) continue;
      amBySku.get(sku)!.orderIds.add(oid);
      if (!orderSkuSales.has(oid)) orderSkuSales.set(oid, new Map());
      const skuMap = orderSkuSales.get(oid)!;
      skuMap.set(sku, (skuMap.get(sku) ?? 0) + (line.sales_amount_yen ?? 0));
    }

    // SKU別手数料按分
    const feeBySkuMap = new Map<string, number>();
    for (const [oid, fee] of Object.entries(feeByOrder)) {
      const skuSalesInOrder = orderSkuSales.get(oid);
      if (!skuSalesInOrder) continue;
      const orderTotal = [...skuSalesInOrder.values()].reduce((s, v) => s + v, 0);
      for (const [sku, skuSales] of skuSalesInOrder) {
        const ratio = orderTotal > 0 ? skuSales / orderTotal : 1 / skuSalesInOrder.size;
        feeBySkuMap.set(sku, (feeBySkuMap.get(sku) ?? 0) + Math.round(fee * ratio));
      }
    }

    for (const [sku, entry] of amBySku) {
      const cost = (costMap.get(sku) ?? 0) * entry.units;
      const fee = feeBySkuMap.get(sku) ?? 0; // negative value
      const grossProfit = entry.sales + fee - cost; // fee is negative
      const profitRate = entry.sales > 0 ? Math.round((grossProfit / entry.sales) * 100) : 0;
      const roi = cost > 0 ? Math.round((grossProfit / cost) * 100) : null;

      items.push({
        key: `amazon_${sku}`,
        name: entry.name,
        sku,
        source: 'Amazon',
        fulfillment: entry.fulfillment,
        unitsSold: entry.units,
        salesAmount: entry.sales,
        costAmount: cost,
        feeAmount: Math.abs(fee),
        grossProfit,
        profitRate,
        roi,
        currentStock: invMap.get(sku) ?? 0,
      });
    }

    // ── フリマ: sales + products ──
    let frimaQuery = supabase
      .from('sales')
      .select('product_id, quantity, unit_price_yen, fee_yen, shipping_yen, material_yen, gross_profit_yen, sold_at, platform, products(name, sku, cost_yen, stock)')
      .eq('user_id', user.id);
    if (from) frimaQuery = frimaQuery.gte('sold_at', from);
    if (to) frimaQuery = frimaQuery.lte('sold_at', to);
    const { data: frimaSales } = await frimaQuery;

    const frimaByProduct = new Map<string, {
      name: string;
      sku: string | null;
      units: number;
      sales: number;
      cost: number;
      fee: number;
      profit: number;
      stock: number;
    }>();

    for (const s of frimaSales ?? []) {
      const pid = s.product_id;
      const product = s.products as unknown as { name: string; sku: string | null; cost_yen: number | null; stock: number | null } | null;
      let entry = frimaByProduct.get(pid);
      if (!entry) {
        entry = {
          name: product?.name ?? '不明',
          sku: product?.sku ?? null,
          units: 0,
          sales: 0,
          cost: 0,
          fee: 0,
          profit: 0,
          stock: product?.stock ?? 0,
        };
        frimaByProduct.set(pid, entry);
      }
      const rev = s.unit_price_yen * s.quantity;
      const productCost = (product?.cost_yen ?? 0) * s.quantity;
      entry.units += s.quantity;
      entry.sales += rev;
      entry.cost += productCost;
      entry.fee += s.fee_yen + s.shipping_yen + (s.material_yen ?? 0);
      entry.profit += s.gross_profit_yen;
    }

    for (const [pid, entry] of frimaByProduct) {
      const profitRate = entry.sales > 0 ? Math.round((entry.profit / entry.sales) * 100) : 0;
      const roi = entry.cost > 0 ? Math.round((entry.profit / entry.cost) * 100) : null;

      items.push({
        key: `frima_${pid}`,
        name: entry.name,
        sku: entry.sku,
        source: 'フリマ',
        fulfillment: null,
        unitsSold: entry.units,
        salesAmount: entry.sales,
        costAmount: entry.cost,
        feeAmount: entry.fee,
        grossProfit: entry.profit,
        profitRate,
        roi,
        currentStock: entry.stock,
      });
    }

    // デフォルト: 利益順でソート
    items.sort((a, b) => b.grossProfit - a.grossProfit);

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? String(e) }, { status: 500 });
  }
}
