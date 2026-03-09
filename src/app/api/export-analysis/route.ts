import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDaysSinceReceived } from '@/lib/stock-age';

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
  const daysBack = Math.min(365, Math.max(30, parseInt(searchParams.get('days') ?? '90', 10)));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // 全商品（在庫あり＋過去に販売履歴あり）を取得
  const { data: products } = await supabase
    .from('products')
    .select(`
      id,
      name,
      sku,
      campaign,
      size,
      color,
      cost_yen,
      stock,
      oldest_received_at,
      stock_received_at,
      default_shipping_yen
    `)
    .eq('user_id', user.id)
    .order('name');

  if (!products || products.length === 0) {
    const emptyCsv = [
      '# 詳細分析用データ（出力エクスポート）',
      '#',
      '# 以下のデータをChatGPT等のAIに入れて、売上分析・在庫アドバイスをもらえます。',
      '# （このファイルをコピーして、AIの入力欄に貼り付けてください）',
      '#',
      '商品名,SKU,企画,サイズ,色,原価,現在在庫,家,倉庫,最古入荷日,累計販売数,累計粗利,直近販売日,平均売価,利益率%,在庫日数,直近30日販売数,直近90日販売数',
      '（データなし）',
    ].join('\n');
    const bom = '\uFEFF';
    const headers = new Headers();
    headers.set('Content-Type', 'text/csv; charset=utf-8');
    headers.set('Content-Disposition', `attachment; filename="analysis_export_${cutoffStr.replace(/-/g, '')}_to_today.csv"`);
    return new NextResponse(bom + emptyCsv, { headers });
  }

  const productIds = products.map((p) => p.id);

  // 全期間の販売集計（商品単位）
  const { data: sales } = await supabase
    .from('sales')
    .select('product_id, quantity, unit_price_yen, gross_profit_yen, sold_at')
    .eq('user_id', user.id)
    .in('product_id', productIds);

  const salesByProduct: Record<
    string,
    {
      qty: number;
      profit: number;
      revenue: number;
      lastSoldAt: string | null;
      qty30d: number;
      qty90d: number;
    }
  > = {};
  for (const s of sales || []) {
    const key = s.product_id;
    if (!salesByProduct[key]) {
      salesByProduct[key] = { qty: 0, profit: 0, revenue: 0, lastSoldAt: null, qty30d: 0, qty90d: 0 };
    }
    salesByProduct[key].qty += s.quantity;
    salesByProduct[key].profit += s.gross_profit_yen;
    salesByProduct[key].revenue += s.unit_price_yen * s.quantity;
    if (!salesByProduct[key].lastSoldAt || s.sold_at > salesByProduct[key].lastSoldAt!) {
      salesByProduct[key].lastSoldAt = s.sold_at;
    }
    const soldDate = s.sold_at;
    const d90 = new Date();
    d90.setDate(d90.getDate() - 90);
    const d30 = new Date();
    d30.setDate(d30.getDate() - 30);
    if (soldDate >= d30.toISOString().slice(0, 10)) salesByProduct[key].qty30d += s.quantity;
    if (soldDate >= d90.toISOString().slice(0, 10)) salesByProduct[key].qty90d += s.quantity;
  }

  // 保管場所別在庫
  const { data: locationStock } = await supabase
    .from('product_location_stock')
    .select('product_id, location, quantity')
    .in('product_id', productIds);
  const locMap: Record<string, { home: number; warehouse: number; fba: number }> = {};
  for (const row of locationStock || []) {
    const key = row.product_id;
    if (!locMap[key]) locMap[key] = { home: 0, warehouse: 0, fba: 0 };
    if (row.location === 'home') locMap[key].home = row.quantity;
    if (row.location === 'warehouse') locMap[key].warehouse = row.quantity;
    if (row.location === 'fba') locMap[key].fba = row.quantity;
  }

  const headerRow = [
    '商品名',
    'SKU',
    '企画',
    'サイズ',
    '色',
    '原価',
    '現在在庫',
    '家',
    '倉庫',
    'FBA',
    '最古入荷日',
    '累計販売数',
    '累計粗利',
    '直近販売日',
    '平均売価',
    '利益率%',
    '在庫日数',
    '直近30日販売数',
    '直近90日販売数',
  ];

  const rows: string[][] = [headerRow];

  for (const p of products) {
    const sale = salesByProduct[p.id] ?? { qty: 0, profit: 0, revenue: 0, lastSoldAt: null, qty30d: 0, qty90d: 0 };
    const loc = locMap[p.id] ?? { home: 0, warehouse: 0, fba: 0 };
    const avgPrice = sale.qty > 0 ? Math.round(sale.revenue / sale.qty) : 0;
    const profitRate = sale.revenue > 0 ? Math.round((sale.profit / sale.revenue) * 100) : 0;
    const daysInStock = getDaysSinceReceived(p.oldest_received_at) ?? 0;

    rows.push([
      p.name ?? '',
      p.sku ?? '',
      p.campaign ?? '',
      p.size ?? '',
      p.color ?? '',
      String(p.cost_yen),
      String(p.stock),
      String(loc.home),
      String(loc.warehouse),
      String(loc.fba),
      p.oldest_received_at ? String(p.oldest_received_at).slice(0, 10) : '',
      String(sale.qty),
      String(sale.profit),
      sale.lastSoldAt ?? '',
      String(avgPrice),
      String(profitRate),
      String(daysInStock),
      String(sale.qty30d),
      String(sale.qty90d),
    ]);
  }

  const commentLines = [
    '# 【出力エクスポート】このデータを出力エクスポートに入れます',
    '#',
    '# このデータをChatGPT等のAIに入れて、',
    '# 売上分析・在庫アドバイス・仕入れ判断の材料として活用できます。',
    '#',
    '# 【使い方】中身をコピーしてAIの入力欄に貼り付け、分析やアドバイスを依頼してください。',
    '#',
  ].join('\n');

  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
  const bom = '\uFEFF';
  const body = commentLines + '\n' + csv;
  const filename = `analysis_export_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;

  return new NextResponse(bom + body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
