import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllPages } from '@/lib/supabase/fetch-all';

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const period = searchParams.get('period') || 'month';
  const year = parseInt(searchParams.get('year') ?? '0', 10);
  const month = parseInt(searchParams.get('month') ?? '1', 10);

  let startDate: string;
  let endDate: string;

  if (period === 'year') {
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
  } else {
    const lastDay = new Date(year, month, 0).getDate();
    startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  // ── フリマ売上 ──
  const { data: sales } = await supabase
    .from('sales')
    .select('*')
    .eq('user_id', user.id)
    .gte('sold_at', startDate)
    .lte('sold_at', endDate)
    .order('sold_at', { ascending: true });

  const productIds = [...new Set((sales ?? []).map((s) => s.product_id))];
  const { data: products } = await supabase
    .from('products')
    .select('id, name, sku, cost_yen')
    .in('id', productIds.length > 0 ? productIds : ['__none__']);
  const productMap = new Map((products ?? []).map((p) => [p.id, p]));

  // ── Amazon 売上明細 ──
  const { data: amazonLines } = await supabase
    .from('amazon_sales_lines')
    .select('sku, product_name, quantity, sales_amount_yen, order_date')
    .eq('user_id', user.id)
    .gte('order_date', startDate)
    .lte('order_date', endDate)
    .order('order_date', { ascending: true });

  // Amazon 手数料を fee_events から取得（order_id ベース、SKU なし → 全体按分）
  // 期間が広いと 1,000 行の既定上限で静かに切れるためページングする（DEV-053）
  const { data: amazonFees } = await fetchAllPages<{
    fee_amount_yen: number | null;
    posted_date: string | null;
  }>((from_, to_) =>
    supabase
      .from('amazon_fee_events')
      .select('fee_amount_yen, posted_date')
      .eq('user_id', user.id)
      .gte('posted_date', startDate)
      .lte('posted_date', endDate)
      .range(from_, to_),
  );

  // Amazon SKU 別原価（送料含む）
  const { data: amazonCosts } = await supabase
    .from('amazon_sku_cost')
    .select('sku, cost_yen, shipping_yen')
    .eq('user_id', user.id);
  const amazonCostMap = new Map((amazonCosts ?? []).map((c) => [c.sku, (c.cost_yen ?? 0) + (c.shipping_yen ?? 0)]));

  // 期間内の Amazon 総手数料・総売上
  let totalAmazonFee = 0;
  let totalAmazonRevenue = 0;
  for (const f of amazonFees ?? []) {
    totalAmazonFee += (f.fee_amount_yen ?? 0);
  }
  for (const l of amazonLines ?? []) {
    totalAmazonRevenue += (l.sales_amount_yen ?? 0);
  }

  const rows: string[][] = [
    ['販売日', '商品名', 'SKU', '個数', '単価', '売上', '原価', '手数料', '送料', '資材代', '粗利', '利益率%', 'ROI%', 'プラットフォーム'],
  ];

  // ── フリマ行 ──
  for (const s of sales ?? []) {
    const product = productMap.get(s.product_id);
    const name = product?.name ?? '(不明)';
    const sku = product?.sku ?? '';
    const revenue = s.unit_price_yen * s.quantity;
    const costYen = (product?.cost_yen ?? 0) * s.quantity;
    const profitRate = revenue > 0 ? Math.round((s.gross_profit_yen / revenue) * 100) : 0;
    const roi = costYen > 0 ? Math.round((s.gross_profit_yen / costYen) * 100) : 0;
    const platform = s.platform === 'mercari' ? 'メルカリ' : 'ラクマ';
    rows.push([
      s.sold_at,
      name,
      sku,
      String(s.quantity),
      String(s.unit_price_yen),
      String(revenue),
      String(costYen),
      String(s.fee_yen),
      String(s.shipping_yen),
      String(s.material_yen ?? 0),
      String(s.gross_profit_yen),
      String(profitRate),
      String(roi),
      platform,
    ]);
  }

  // ── Amazon 行 ──
  for (const l of amazonLines ?? []) {
    const amount = l.sales_amount_yen ?? 0;
    const unitPrice = l.quantity > 0 ? Math.round(amount / l.quantity) : 0;
    // 売上比率で手数料を按分
    const ratio = totalAmazonRevenue > 0 ? amount / totalAmazonRevenue : 0;
    const fee = Math.round(Math.abs(totalAmazonFee) * ratio);
    const unitCost = amazonCostMap.get(l.sku ?? '') ?? 0;
    const costTotal = unitCost * l.quantity;
    const profit = amount - fee - costTotal;
    const profitRate = amount > 0 ? Math.round((profit / amount) * 100) : 0;
    const roi = costTotal > 0 ? Math.round((profit / costTotal) * 100) : 0;

    rows.push([
      l.order_date ?? '',
      l.product_name ?? '',
      l.sku ?? '',
      String(l.quantity),
      String(unitPrice),
      String(amount),
      String(costTotal),
      String(fee),
      '0',
      '0',
      String(profit),
      String(profitRate),
      String(roi),
      'Amazon',
    ]);
  }

  if (rows.length <= 1) {
    const headers = new Headers();
    headers.set('Content-Type', 'text/csv; charset=utf-8');
    headers.set('Content-Disposition', `attachment; filename="sales_${year}${period === 'year' ? '' : String(month).padStart(2, '0')}.csv"`);
    return new NextResponse('\uFEFF' + rows[0].join(',') + '\n（データなし）', { headers });
  }

  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
  const bom = '\uFEFF';

  const filename = period === 'year'
    ? `sales_${year}.csv`
    : `sales_${year}${String(month).padStart(2, '0')}.csv`;

  return new NextResponse(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
