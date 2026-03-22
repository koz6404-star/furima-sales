/**
 * フリマ商品セット化戦略用データ出力 API
 * Markdown形式でAIにセット化提案を依頼するためのデータを出力する
 * - フリマ商品のみ（Amazon除外）
 * - 単品利益率が低い商品を「セット化候補」として強調
 * - 既存セット構成も出力（重複提案を防ぐ）
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const d30 = new Date(); d30.setDate(d30.getDate() - 30);
  const d90 = new Date(); d90.setDate(d90.getDate() - 90);
  const d30Str = d30.toISOString().slice(0, 10);
  const d90Str = d90.toISOString().slice(0, 10);

  // ── フリマ商品のみ取得（Amazon除外） ──
  const { data: products } = await supabase
    .from('products')
    .select('id, name, sku, cost_yen, stock, campaign, size, color, memo, oldest_received_at')
    .eq('user_id', user.id)
    .or('platform.is.null,platform.neq.amazon')
    .order('name');

  const productIds = (products ?? []).map((p) => p.id);

  // ── 売上集計 ──
  const { data: sales } = await supabase
    .from('sales')
    .select('product_id, quantity, unit_price_yen, fee_yen, shipping_yen, material_yen, gross_profit_yen, sold_at, platform')
    .eq('user_id', user.id)
    .in('product_id', productIds.length > 0 ? productIds : ['__none__']);

  type SalesAgg = {
    totalQty: number; revenue: number; fee: number; shipping: number; material: number;
    profit: number; avgPrice: number; avgProfit: number; profitRate: number;
    qty30d: number; qty90d: number; platforms: Set<string>;
  };
  const salesMap: Record<string, SalesAgg> = {};

  for (const s of sales ?? []) {
    const key = s.product_id;
    if (!salesMap[key]) {
      salesMap[key] = { totalQty: 0, revenue: 0, fee: 0, shipping: 0, material: 0, profit: 0, avgPrice: 0, avgProfit: 0, profitRate: 0, qty30d: 0, qty90d: 0, platforms: new Set() };
    }
    const a = salesMap[key];
    a.totalQty += s.quantity;
    a.revenue += s.unit_price_yen * s.quantity;
    a.fee += s.fee_yen;
    a.shipping += s.shipping_yen;
    a.material += (s.material_yen || 0);
    a.profit += s.gross_profit_yen;
    if (s.sold_at >= d30Str) a.qty30d += s.quantity;
    if (s.sold_at >= d90Str) a.qty90d += s.quantity;
    a.platforms.add(s.platform === 'mercari' ? 'メルカリ' : 'ラクマ');
  }

  // 平均を計算
  for (const a of Object.values(salesMap)) {
    a.avgPrice = a.totalQty > 0 ? Math.round(a.revenue / a.totalQty) : 0;
    a.avgProfit = a.totalQty > 0 ? Math.round(a.profit / a.totalQty) : 0;
    a.profitRate = a.revenue > 0 ? Math.round((a.profit / a.revenue) * 100) : 0;
  }

  // ── 保管場所別在庫 ──
  const { data: locationStock } = await supabase
    .from('product_location_stock')
    .select('product_id, location, quantity')
    .in('product_id', productIds.length > 0 ? productIds : ['__none__']);
  const locMap: Record<string, { home: number; warehouse: number; fba: number }> = {};
  for (const row of locationStock ?? []) {
    if (!locMap[row.product_id]) locMap[row.product_id] = { home: 0, warehouse: 0, fba: 0 };
    if (row.location === 'home') locMap[row.product_id].home = row.quantity;
    if (row.location === 'warehouse') locMap[row.product_id].warehouse = row.quantity;
    if (row.location === 'fba') locMap[row.product_id].fba = row.quantity;
  }

  // ── 既存セット構成 ──
  const { data: setItems } = await supabase
    .from('product_set_items')
    .select('set_product_id, component_product_id, quantity_per_set');

  const setMap: Record<string, { components: { name: string; qty: number }[] }> = {};
  const componentOfSet = new Set<string>(); // セット構成品のID
  for (const si of setItems ?? []) {
    const setProduct = (products ?? []).find((p) => p.id === si.set_product_id);
    if (!setProduct) continue;
    if (!setMap[si.set_product_id]) setMap[si.set_product_id] = { components: [] };
    const comp = (products ?? []).find((p) => p.id === si.component_product_id);
    setMap[si.set_product_id].components.push({
      name: comp?.name ?? '(不明)',
      qty: si.quantity_per_set,
    });
    componentOfSet.add(si.component_product_id);
  }

  // ── 商品データを整理 ──
  type ProductRow = {
    name: string; sku: string; campaign: string; size: string; color: string;
    costYen: number; stock: number; home: number; warehouse: number;
    avgPrice: number; avgProfit: number; profitRate: number;
    totalSold: number; qty30d: number; velocity: number;
    platforms: string; isSet: boolean; isComponentOfSet: boolean;
    setCandidate: string; memo: string;
  };

  const rows: ProductRow[] = [];

  for (const p of products ?? []) {
    const s = salesMap[p.id];
    const loc = locMap[p.id] ?? { home: 0, warehouse: 0, fba: 0 };
    const stock = p.stock ?? 0;
    const costYen = p.cost_yen ?? 0;
    const isSet = !!setMap[p.id];
    const isComp = componentOfSet.has(p.id);

    // セット化候補の判定
    let candidate = '';
    if (isSet) {
      candidate = '既存セット品';
    } else if (stock === 0) {
      candidate = '在庫なし';
    } else if (s && s.profitRate < 15 && s.totalQty > 0) {
      candidate = '最優先（利益率15%未満で販売実績あり）';
    } else if (s && s.profitRate < 25 && s.totalQty > 0) {
      candidate = '候補（利益率25%未満）';
    } else if (stock >= 3 && (!s || s.qty30d === 0)) {
      candidate = '候補（在庫多め・直近売れていない）';
    } else if (stock >= 5) {
      candidate = '候補（在庫過多）';
    } else {
      candidate = '-';
    }

    rows.push({
      name: p.name ?? '',
      sku: p.sku ?? '',
      campaign: p.campaign ?? '',
      size: p.size ?? '',
      color: p.color ?? '',
      costYen,
      stock,
      home: loc.home,
      warehouse: loc.warehouse,
      avgPrice: s?.avgPrice ?? 0,
      avgProfit: s?.avgProfit ?? 0,
      profitRate: s?.profitRate ?? 0,
      totalSold: s?.totalQty ?? 0,
      qty30d: s?.qty30d ?? 0,
      velocity: s?.qty30d ?? 0,
      platforms: s ? [...s.platforms].join('/') : '',
      isSet,
      isComponentOfSet: isComp,
      setCandidate: candidate,
      memo: p.memo ?? '',
    });
  }

  // セット化候補を優先表示（最優先 → 候補 → その他）
  const candidateOrder = (c: string) => {
    if (c.startsWith('最優先')) return 0;
    if (c.startsWith('候補')) return 1;
    if (c === '既存セット品') return 2;
    if (c === '在庫なし') return 9;
    return 3;
  };
  rows.sort((a, b) => candidateOrder(a.setCandidate) - candidateOrder(b.setCandidate) || b.stock - a.stock);

  // ── 統計 ──
  const inStockRows = rows.filter((r) => r.stock > 0);
  const topCandidates = rows.filter((r) => r.setCandidate.startsWith('最優先'));
  const subCandidates = rows.filter((r) => r.setCandidate.startsWith('候補'));
  const existingSets = Object.entries(setMap);
  const totalStockValue = inStockRows.reduce((s, r) => s + r.costYen * r.stock, 0);

  // ── Markdown 出力 ──
  const lines: string[] = [];
  const yen = (v: number) => `¥${v.toLocaleString()}`;

  lines.push('# フリマ商品セット化戦略データ');
  lines.push('');
  lines.push(`出力日: ${today}`);
  lines.push('');
  lines.push('## 目的');
  lines.push('');
  lines.push('- 単品では利益が薄い商品をセット化して、1取引あたりの利益を向上させる');
  lines.push('- 余剰在庫を組み合わせてセット販売し、在庫回転を加速させる');
  lines.push('- メルカリ・ラクマでのセット出品の最適な組み合わせを見つける');
  lines.push('');
  lines.push('## サマリー');
  lines.push('');
  lines.push(`| 指標 | 値 |`);
  lines.push(`|------|------|`);
  lines.push(`| フリマ商品数（在庫あり） | ${inStockRows.length}件 |`);
  lines.push(`| セット化最優先（利益率15%未満） | ${topCandidates.length}件 |`);
  lines.push(`| セット化候補 | ${subCandidates.length}件 |`);
  lines.push(`| 既存セット品 | ${existingSets.length}件 |`);
  lines.push(`| 在庫金額合計 | ${yen(totalStockValue)} |`);
  lines.push('');

  // 既存セット構成
  if (existingSets.length > 0) {
    lines.push('## 既存セット構成（重複提案を避けてください）');
    lines.push('');
    for (const [setId, info] of existingSets) {
      const setProduct = (products ?? []).find((p) => p.id === setId);
      lines.push(`- **${setProduct?.name ?? '不明'}**: ${info.components.map((c) => `${c.name}×${c.qty}`).join(' + ')}`);
    }
    lines.push('');
  }

  // 商品一覧テーブル
  lines.push('## 商品一覧（セット化候補順）');
  lines.push('');
  lines.push('| # | セット化判定 | 商品名 | 企画 | サイズ | 色 | 原価 | 平均売価 | 1個利益 | 利益率 | 在庫 | 30日販売 | 販路 | メモ |');
  lines.push('|---|------------|--------|------|--------|-----|------|----------|---------|--------|------|----------|------|------|');

  rows.forEach((r, i) => {
    if (r.stock === 0 && r.setCandidate === '在庫なし') return; // 在庫なしは省略
    lines.push(`| ${i + 1} | ${r.setCandidate} | ${r.name} | ${r.campaign || '-'} | ${r.size || '-'} | ${r.color || '-'} | ${yen(r.costYen)} | ${r.avgPrice > 0 ? yen(r.avgPrice) : '-'} | ${r.avgProfit !== 0 ? yen(r.avgProfit) : '-'} | ${r.profitRate > 0 ? `${r.profitRate}%` : '-'} | ${r.stock} | ${r.qty30d} | ${r.platforms || '-'} | ${r.memo || '-'} |`);
  });

  lines.push('');
  lines.push('## セット化の判定基準');
  lines.push('');
  lines.push('- **最優先**: 利益率15%未満で販売実績あり → 単品では利益が薄い。セットに組み込んで1取引の利益を上げるべき');
  lines.push('- **候補（利益率25%未満）**: まだ改善余地あり。セット化で利益率を引き上げたい');
  lines.push('- **候補（在庫多め・直近売れていない）**: 在庫が眠っている。セットに入れて動かしたい');
  lines.push('- **候補（在庫過多）**: 在庫5個以上。セット化で回転を加速');
  lines.push('');
  lines.push('## AIへの依頼事項');
  lines.push('');
  lines.push('上記データを基に、以下を提案してください:');
  lines.push('');
  lines.push('1. **セット化の組み合わせ提案** — どの商品同士をセットにすると効果的か（企画・サイズ・色の親和性を考慮）');
  lines.push('2. **セット販売価格の目安** — 各セットの推奨販売価格（単品合計より少し安くしつつ、利益率20%以上を目指す）');
  lines.push('3. **優先順位** — どのセットから出品すべきか（在庫圧縮効果と利益改善のバランス）');
  lines.push('4. **セット化すべきでない商品** — 単品で十分利益が出ている商品は除外理由を説明');
  lines.push('');

  const mdBody = lines.join('\n');
  const filename = `set_strategy_${today.replace(/-/g, '')}.md`;

  return new NextResponse(mdBody, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
