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

  // ── フリマ商品データ取得 ──
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

  const productIds = (products ?? []).map((p) => p.id);

  // ── フリマ売上集計 ──
  const { data: sales } = await supabase
    .from('sales')
    .select('product_id, quantity, unit_price_yen, gross_profit_yen, sold_at')
    .eq('user_id', user.id)
    .in('product_id', productIds.length > 0 ? productIds : ['__none__']);

  const salesByProduct: Record<
    string,
    { qty: number; profit: number; revenue: number; lastSoldAt: string | null; qty30d: number; qty90d: number }
  > = {};
  const d30 = new Date(); d30.setDate(d30.getDate() - 30);
  const d90 = new Date(); d90.setDate(d90.getDate() - 90);
  const d30Str = d30.toISOString().slice(0, 10);
  const d90Str = d90.toISOString().slice(0, 10);

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
    if (s.sold_at >= d30Str) salesByProduct[key].qty30d += s.quantity;
    if (s.sold_at >= d90Str) salesByProduct[key].qty90d += s.quantity;
  }

  // ── フリマ保管場所別在庫 ──
  const { data: locationStock } = await supabase
    .from('product_location_stock')
    .select('product_id, location, quantity')
    .in('product_id', productIds.length > 0 ? productIds : ['__none__']);
  const locMap: Record<string, { home: number; warehouse: number; fba: number }> = {};
  for (const row of locationStock || []) {
    const key = row.product_id;
    if (!locMap[key]) locMap[key] = { home: 0, warehouse: 0, fba: 0 };
    if (row.location === 'home') locMap[key].home = row.quantity;
    if (row.location === 'warehouse') locMap[key].warehouse = row.quantity;
    if (row.location === 'fba') locMap[key].fba = row.quantity;
  }

  // ── Amazon SKU 別集計 ──
  const { data: amazonSkus } = await supabase
    .from('amazon_sales_summary_sku')
    .select('sku, product_name, units_sold, sales_amount_yen, fee_amount_yen, sales_after_fee_yen, current_inventory, fulfillment_type')
    .eq('user_id', user.id);

  // ── Amazon SKU 別原価 ──
  const { data: amazonCosts } = await supabase
    .from('amazon_sku_cost')
    .select('sku, cost_yen')
    .eq('user_id', user.id);
  const amazonCostMap = new Map((amazonCosts ?? []).map((c) => [c.sku, c.cost_yen]));

  // ── Amazon 売上明細（直近30日・90日の販売数計算用） ──
  const { data: amazonSalesLines } = await supabase
    .from('amazon_sales_lines')
    .select('seller_sku, quantity, purchase_date')
    .eq('user_id', user.id)
    .gte('purchase_date', d90Str);

  const amazonRecent: Record<string, { qty30d: number; qty90d: number; lastSoldAt: string | null }> = {};
  for (const sl of amazonSalesLines || []) {
    const key = sl.seller_sku;
    if (!amazonRecent[key]) amazonRecent[key] = { qty30d: 0, qty90d: 0, lastSoldAt: null };
    const date = (sl.purchase_date ?? '').slice(0, 10);
    if (date >= d30Str) amazonRecent[key].qty30d += sl.quantity;
    amazonRecent[key].qty90d += sl.quantity;
    if (!amazonRecent[key].lastSoldAt || date > amazonRecent[key].lastSoldAt!) {
      amazonRecent[key].lastSoldAt = date;
    }
  }

  // ── CSV 構築 ──
  const headerRow = [
    'チャネル',
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

  // ── フリマ商品行 ──
  for (const p of products ?? []) {
    const sale = salesByProduct[p.id] ?? { qty: 0, profit: 0, revenue: 0, lastSoldAt: null, qty30d: 0, qty90d: 0 };
    const loc = locMap[p.id] ?? { home: 0, warehouse: 0, fba: 0 };
    const avgPrice = sale.qty > 0 ? Math.round(sale.revenue / sale.qty) : 0;
    const profitRate = sale.revenue > 0 ? Math.round((sale.profit / sale.revenue) * 100) : 0;
    const daysInStock = getDaysSinceReceived(p.oldest_received_at) ?? 0;

    rows.push([
      'フリマ',
      p.name ?? '',
      p.sku ?? '',
      p.campaign ?? '',
      p.size ?? '',
      p.color ?? '',
      String(p.cost_yen ?? 0),
      String(p.stock ?? 0),
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

  // ── Amazon 商品行 ──
  for (const a of amazonSkus ?? []) {
    const costYen = amazonCostMap.get(a.sku) ?? 0;
    const inventory = a.current_inventory ?? 0;
    const recent = amazonRecent[a.sku] ?? { qty30d: 0, qty90d: 0, lastSoldAt: null };
    const avgPrice = a.units_sold > 0 ? Math.round(a.sales_amount_yen / a.units_sold) : 0;
    // 粗利 = 売上 - 手数料 - (原価 × 個数)
    const totalCost = costYen * a.units_sold;
    const profit = a.sales_after_fee_yen - totalCost;
    const profitRate = a.sales_amount_yen > 0 ? Math.round((profit / a.sales_amount_yen) * 100) : 0;
    const channel = a.fulfillment_type === 'FBM' ? 'Amazon(FBM)' : 'Amazon(FBA)';

    rows.push([
      channel,
      a.product_name ?? '',
      a.sku ?? '',
      '', // 企画
      '', // サイズ
      '', // 色
      String(costYen),
      String(inventory),
      '', // 家
      '', // 倉庫
      a.fulfillment_type !== 'FBM' ? String(inventory) : '', // FBA在庫
      '', // 最古入荷日
      String(a.units_sold),
      String(profit),
      recent.lastSoldAt ?? '',
      String(avgPrice),
      String(profitRate),
      '', // 在庫日数
      String(recent.qty30d),
      String(recent.qty90d),
    ]);
  }

  if (rows.length <= 1) {
    const emptyCsv = [
      '# 詳細分析用データ（出力エクスポート）',
      '#',
      '# 以下のデータをChatGPT等のAIに入れて、売上分析・在庫アドバイスをもらえます。',
      '#',
      headerRow.join(','),
      '（データなし）',
    ].join('\n');
    const bom = '\uFEFF';
    return new NextResponse(bom + emptyCsv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="analysis_export.csv"`,
      },
    });
  }

  const commentLines = [
    '# 【出力エクスポート】詳細分析用データ（フリマ + Amazon 統合）',
    '#',
    '# このデータをChatGPT等のAIに入れて、',
    '# 売上分析・在庫アドバイス・仕入れ判断の材料として活用できます。',
    '#',
    '# 【使い方】中身をコピーしてAIの入力欄に貼り付け、分析やアドバイスを依頼してください。',
    `# フリマ商品: ${(products ?? []).length}件 / Amazon商品: ${(amazonSkus ?? []).length}件`,
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
