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

  const today = new Date().toISOString().slice(0, 10);
  const d30 = new Date(); d30.setDate(d30.getDate() - 30);
  const d90 = new Date(); d90.setDate(d90.getDate() - 90);
  const d30Str = d30.toISOString().slice(0, 10);
  const d90Str = d90.toISOString().slice(0, 10);

  // ── フリマ商品データ取得 ──
  const { data: products } = await supabase
    .from('products')
    .select('id, name, sku, cost_yen, stock, oldest_received_at, default_shipping_yen')
    .eq('user_id', user.id)
    .order('name');

  const productIds = (products ?? []).map((p) => p.id);

  // ── フリマ売上集計 ──
  const { data: sales } = await supabase
    .from('sales')
    .select('product_id, quantity, unit_price_yen, fee_yen, shipping_yen, material_yen, gross_profit_yen, sold_at')
    .eq('user_id', user.id)
    .in('product_id', productIds.length > 0 ? productIds : ['__none__']);

  type SalesAgg = {
    qty: number; revenue: number; fee: number; shipping: number; material: number;
    profit: number; lastSoldAt: string | null; qty30d: number; qty90d: number;
  };
  const salesByProduct: Record<string, SalesAgg> = {};

  for (const s of sales || []) {
    const key = s.product_id;
    if (!salesByProduct[key]) {
      salesByProduct[key] = { qty: 0, revenue: 0, fee: 0, shipping: 0, material: 0, profit: 0, lastSoldAt: null, qty30d: 0, qty90d: 0 };
    }
    const a = salesByProduct[key];
    a.qty += s.quantity;
    a.revenue += s.unit_price_yen * s.quantity;
    a.fee += s.fee_yen;
    a.shipping += s.shipping_yen;
    a.material += (s.material_yen || 0);
    a.profit += s.gross_profit_yen;
    if (!a.lastSoldAt || s.sold_at > a.lastSoldAt!) a.lastSoldAt = s.sold_at;
    if (s.sold_at >= d30Str) a.qty30d += s.quantity;
    if (s.sold_at >= d90Str) a.qty90d += s.quantity;
  }

  // ── フリマ保管場所在庫 ──
  const { data: locationStock } = await supabase
    .from('product_location_stock')
    .select('product_id, location, quantity')
    .in('product_id', productIds.length > 0 ? productIds : ['__none__']);
  const locMap: Record<string, { home: number; warehouse: number; fba: number }> = {};
  for (const row of locationStock || []) {
    if (!locMap[row.product_id]) locMap[row.product_id] = { home: 0, warehouse: 0, fba: 0 };
    if (row.location === 'home') locMap[row.product_id].home = row.quantity;
    if (row.location === 'warehouse') locMap[row.product_id].warehouse = row.quantity;
    if (row.location === 'fba') locMap[row.product_id].fba = row.quantity;
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
  const amazonCostMap = new Map((amazonCosts ?? []).map((c) => [c.sku, c.cost_yen ?? 0]));

  // ── Amazon 直近販売数 ──
  const { data: amazonSalesLines } = await supabase
    .from('amazon_sales_lines')
    .select('sku, quantity, order_date')
    .eq('user_id', user.id)
    .gte('order_date', d90Str);

  const amazonRecent: Record<string, { qty30d: number; qty90d: number; lastSoldAt: string | null }> = {};
  for (const sl of amazonSalesLines || []) {
    const key = sl.sku ?? '';
    if (!key) continue;
    if (!amazonRecent[key]) amazonRecent[key] = { qty30d: 0, qty90d: 0, lastSoldAt: null };
    const date = sl.order_date ?? '';
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
    '原価(税込)',
    '平均売価',
    '1個あたり利益',
    '累計販売数',
    '累計売上',
    '累計手数料',
    '累計粗利',
    '利益率%',
    '直近30日販売数',
    '直近90日販売数',
    '販売速度(個/月)',
    '売上トレンド',
    '直近販売日',
    '現在在庫',
    '在庫金額(税込)',
    '残在庫日数',
    'ROI%',
    '在庫ステータス',
  ];

  // 全行を一旦配列で集めて、利益順でソートする
  type RowData = {
    channel: string; name: string; sku: string;
    costYen: number; avgPrice: number; profitPerUnit: number;
    qtySold: number; revenue: number; fee: number; profit: number;
    profitRate: number;
    qty30d: number; qty90d: number; velocity: number; trend: string;
    lastSoldAt: string;
    stock: number; stockValue: number; daysRemaining: number;
    roi: number; status: string;
  };
  const allRows: RowData[] = [];

  // ── フリマ商品 ──
  for (const p of products ?? []) {
    const s = salesByProduct[p.id] ?? { qty: 0, revenue: 0, fee: 0, shipping: 0, material: 0, profit: 0, lastSoldAt: null, qty30d: 0, qty90d: 0 };
    const loc = locMap[p.id] ?? { home: 0, warehouse: 0, fba: 0 };
    const costYen = p.cost_yen ?? 0;
    const stock = p.stock ?? 0;
    const avgPrice = s.qty > 0 ? Math.round(s.revenue / s.qty) : 0;
    const profitPerUnit = s.qty > 0 ? Math.round(s.profit / s.qty) : 0;
    const profitRate = s.revenue > 0 ? Math.round((s.profit / s.revenue) * 100) : 0;

    // 販売速度: 30日販売数を月換算
    const velocity = s.qty30d; // 30日 ≒ 1ヶ月
    // トレンド: 30日販売数×3 vs 90日販売数
    const trend = calcTrend(s.qty30d, s.qty90d);
    // 残在庫日数
    const dailyRate = s.qty30d / 30;
    const daysRemaining = dailyRate > 0 ? Math.round(stock / dailyRate) : (stock > 0 ? 9999 : 0);
    // 在庫金額
    const stockValue = costYen * stock;
    // ROI: 利益 / 原価投資額
    const invested = costYen * s.qty;
    const roi = invested > 0 ? Math.round((s.profit / invested) * 100) : 0;
    // ステータス判定
    const status = classifyStatus(stock, s.qty30d, daysRemaining, getDaysSinceReceived(p.oldest_received_at) ?? 0);

    allRows.push({
      channel: 'フリマ', name: p.name ?? '', sku: p.sku ?? '',
      costYen, avgPrice, profitPerUnit,
      qtySold: s.qty, revenue: s.revenue, fee: s.fee + s.shipping + s.material, profit: s.profit,
      profitRate,
      qty30d: s.qty30d, qty90d: s.qty90d, velocity, trend,
      lastSoldAt: s.lastSoldAt ?? '',
      stock, stockValue, daysRemaining,
      roi, status,
    });
  }

  // ── Amazon 商品 ──
  for (const a of amazonSkus ?? []) {
    const costYen = amazonCostMap.get(a.sku) ?? 0;
    const inventory = a.current_inventory ?? 0;
    const recent = amazonRecent[a.sku] ?? { qty30d: 0, qty90d: 0, lastSoldAt: null };
    const avgPrice = a.units_sold > 0 ? Math.round(a.sales_amount_yen / a.units_sold) : 0;
    const totalCost = costYen * a.units_sold;
    const profit = a.sales_after_fee_yen - totalCost;
    const profitPerUnit = a.units_sold > 0 ? Math.round(profit / a.units_sold) : 0;
    const profitRate = a.sales_amount_yen > 0 ? Math.round((profit / a.sales_amount_yen) * 100) : 0;
    const channel = a.fulfillment_type === 'FBM' ? 'Amazon(FBM)' : 'Amazon(FBA)';

    const velocity = recent.qty30d;
    const trend = calcTrend(recent.qty30d, recent.qty90d);
    const dailyRate = recent.qty30d / 30;
    const daysRemaining = dailyRate > 0 ? Math.round(inventory / dailyRate) : (inventory > 0 ? 9999 : 0);
    const stockValue = costYen * inventory;
    const invested = costYen * a.units_sold;
    const roi = invested > 0 ? Math.round((profit / invested) * 100) : 0;
    const status = classifyStatus(inventory, recent.qty30d, daysRemaining, 0);

    allRows.push({
      channel, name: a.product_name ?? '', sku: a.sku ?? '',
      costYen, avgPrice, profitPerUnit,
      qtySold: a.units_sold, revenue: a.sales_amount_yen, fee: Math.abs(a.fee_amount_yen), profit,
      profitRate,
      qty30d: recent.qty30d, qty90d: recent.qty90d, velocity, trend,
      lastSoldAt: recent.lastSoldAt ?? '',
      stock: inventory, stockValue, daysRemaining,
      roi, status,
    });
  }

  // 利益額降順でソート
  allRows.sort((a, b) => b.profit - a.profit);

  // CSV行に変換
  const rows: string[][] = [headerRow];
  for (const r of allRows) {
    rows.push([
      r.channel,
      r.name,
      r.sku,
      String(r.costYen),
      String(r.avgPrice),
      String(r.profitPerUnit),
      String(r.qtySold),
      String(r.revenue),
      String(r.fee),
      String(r.profit),
      String(r.profitRate),
      String(r.qty30d),
      String(r.qty90d),
      String(r.velocity),
      r.trend,
      r.lastSoldAt,
      String(r.stock),
      String(r.stockValue),
      r.daysRemaining >= 9999 ? '売れていない' : String(r.daysRemaining),
      String(r.roi),
      r.status,
    ]);
  }

  if (rows.length <= 1) {
    const bom = '\uFEFF';
    return new NextResponse(bom + '# データなし\n' + headerRow.join(','), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="analysis_export.csv"',
      },
    });
  }

  // サマリー統計
  const frimaRows = allRows.filter((r) => r.channel === 'フリマ');
  const amazonRows = allRows.filter((r) => r.channel.startsWith('Amazon'));
  const totalRevenue = allRows.reduce((s, r) => s + r.revenue, 0);
  const totalProfit = allRows.reduce((s, r) => s + r.profit, 0);
  const totalStockValue = allRows.reduce((s, r) => s + r.stockValue, 0);
  const deadStockCount = allRows.filter((r) => r.status === '滞留在庫').length;

  const commentLines = [
    '# 【戦略分析用データ】フリマ + Amazon 統合',
    `# 出力日: ${today}`,
    '#',
    `# フリマ商品: ${frimaRows.length}件 / Amazon商品: ${amazonRows.length}件 / 合計: ${allRows.length}件`,
    `# 累計売上合計: ¥${totalRevenue.toLocaleString()} / 累計利益合計: ¥${totalProfit.toLocaleString()}`,
    `# 在庫金額合計: ¥${totalStockValue.toLocaleString()} / 滞留在庫: ${deadStockCount}件`,
    '#',
    '# --- 列の説明 ---',
    '# 原価(税込): 1個あたりの仕入れ原価（円）',
    '# 1個あたり利益: (売上-手数料-原価) ÷ 販売数',
    '# 累計手数料: 販売手数料+送料+資材代（フリマ）/ Amazon手数料合計',
    '# 販売速度(個/月): 直近30日の販売数（≒月間販売ペース）',
    '# 売上トレンド: 直近30日と90日平均の比較（加速↑/安定→/減速↓/新規★/停止■）',
    '# 残在庫日数: 現在の販売ペースで在庫が何日持つか',
    '# ROI%: 利益÷原価投資額×100（資金効率）',
    '# 在庫ステータス: 好調/安定/要注意/滞留在庫/在庫切れ/新商品',
    '#',
    '# --- 分析のヒント ---',
    '# ・ROI%が高い商品 → 仕入れ拡大候補',
    '# ・残在庫日数が少ない好調商品 → 早急に追加仕入れ',
    '# ・滞留在庫 → 値下げ or 販路変更を検討',
    '# ・売上トレンド「加速↑」→ 旬の商品、在庫確保を優先',
    '# ・売上トレンド「減速↓」→ 追加仕入れは慎重に',
    '#',
  ].join('\n');

  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
  const bom = '\uFEFF';
  const body = commentLines + '\n' + csv;
  const filename = `strategy_analysis_${today.replace(/-/g, '')}.csv`;

  return new NextResponse(bom + body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

/** 売上トレンド判定: 30日販売数×3 vs 90日販売数 */
function calcTrend(qty30d: number, qty90d: number): string {
  if (qty30d === 0 && qty90d === 0) return '停止■';
  if (qty90d === 0 && qty30d > 0) return '新規★';
  const monthly30 = qty30d;
  const monthly90 = qty90d / 3;
  if (monthly90 === 0) return '新規★';
  const ratio = monthly30 / monthly90;
  if (ratio >= 1.3) return '加速↑';
  if (ratio >= 0.7) return '安定→';
  return '減速↓';
}

/** 在庫ステータス分類 */
function classifyStatus(stock: number, qty30d: number, daysRemaining: number, daysInStock: number): string {
  if (stock === 0 && qty30d > 0) return '在庫切れ';
  if (stock === 0) return '在庫切れ';
  if (qty30d === 0 && daysInStock > 60) return '滞留在庫';
  if (qty30d === 0 && daysInStock <= 60) return '新商品';
  if (qty30d === 0) return '要注意';
  if (daysRemaining <= 14) return '好調';
  if (daysRemaining <= 60) return '安定';
  return '要注意';
}
