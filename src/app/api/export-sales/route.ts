import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
    .select('id, name, sku')
    .in('id', productIds.length > 0 ? productIds : ['__none__']);
  const productMap = new Map((products ?? []).map((p) => [p.id, p]));

  // ── Amazon 売上明細 ──
  const { data: amazonLines } = await supabase
    .from('amazon_sales_lines')
    .select('seller_sku, product_name, quantity, item_price_yen, purchase_date')
    .eq('user_id', user.id)
    .gte('purchase_date', startDate + 'T00:00:00')
    .lte('purchase_date', endDate + 'T23:59:59')
    .order('purchase_date', { ascending: true });

  // Amazon 手数料を SKU+日付で取得（按分用）
  const { data: amazonFees } = await supabase
    .from('amazon_fee_events')
    .select('seller_sku, fee_amount_yen, posted_at')
    .eq('user_id', user.id)
    .gte('posted_at', startDate + 'T00:00:00')
    .lte('posted_at', endDate + 'T23:59:59');

  // SKU別手数料合計
  const feeBySkuMap: Record<string, number> = {};
  const unitsBySkuMap: Record<string, number> = {};
  for (const f of amazonFees ?? []) {
    feeBySkuMap[f.seller_sku] = (feeBySkuMap[f.seller_sku] ?? 0) + (f.fee_amount_yen ?? 0);
  }
  for (const l of amazonLines ?? []) {
    unitsBySkuMap[l.seller_sku] = (unitsBySkuMap[l.seller_sku] ?? 0) + l.quantity;
  }

  const rows: string[][] = [
    ['販売日', '商品名', 'SKU', '個数', '単価', '売上', '手数料', '送料', '資材代', '粗利', 'プラットフォーム'],
  ];

  // ── フリマ行 ──
  for (const s of sales ?? []) {
    const product = productMap.get(s.product_id);
    const name = product?.name ?? '(不明)';
    const sku = product?.sku ?? '';
    const revenue = s.unit_price_yen * s.quantity;
    const platform = s.platform === 'mercari' ? 'メルカリ' : 'ラクマ';
    rows.push([
      s.sold_at,
      name,
      sku,
      String(s.quantity),
      String(s.unit_price_yen),
      String(revenue),
      String(s.fee_yen),
      String(s.shipping_yen),
      String(s.material_yen ?? 0),
      String(s.gross_profit_yen),
      platform,
    ]);
  }

  // ── Amazon 行 ──
  for (const l of amazonLines ?? []) {
    const unitPrice = l.quantity > 0 ? Math.round(l.item_price_yen / l.quantity) : 0;
    // SKU の手数料を販売数で按分
    const totalFee = feeBySkuMap[l.seller_sku] ?? 0;
    const totalUnits = unitsBySkuMap[l.seller_sku] ?? 1;
    const feePerUnit = Math.round(totalFee / totalUnits);
    const fee = feePerUnit * l.quantity;
    const profit = l.item_price_yen - fee;

    rows.push([
      (l.purchase_date ?? '').slice(0, 10),
      l.product_name ?? '',
      l.seller_sku ?? '',
      String(l.quantity),
      String(unitPrice),
      String(l.item_price_yen),
      String(fee),
      '0', // Amazon の送料は手数料に含まれる
      '0',
      String(profit),
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
