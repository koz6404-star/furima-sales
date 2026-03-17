import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Nav } from '@/components/nav';
import { DashboardFilters } from './dashboard-filters';
import { DashboardCharts } from './dashboard-charts';
import { Suspense } from 'react';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; year?: string; month?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (params.period == null && params.year == null && params.month == null) {
    redirect(`/dashboard?period=month&year=${currentYear}&month=${currentMonth}`);
  }

  const period = params.period === 'year' ? 'year' : 'month';
  const year = parseInt(params.year ?? String(currentYear), 10) || currentYear;
  const month = parseInt(params.month ?? String(currentMonth), 10) || currentMonth;

  let startDate: string;
  let endDate: string;

  if (period === 'year') {
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
  } else {
    startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  // ── フリマ売上データ ──
  const { data: sales } = await supabase
    .from('sales')
    .select('*, products(name, sku)')
    .eq('user_id', user.id)
    .gte('sold_at', startDate)
    .lte('sold_at', endDate);

  let frimaRevenue = 0;
  let frimaFee = 0;
  let frimaShipping = 0;
  let frimaMaterial = 0;
  let frimaProfit = 0;
  const byPlatform: Record<string, { revenue: number; fee: number; shipping: number; profit: number }> = {};
  const chartByKey: Record<string, { revenue: number; profit: number }> = {};
  const byProduct: Record<string, { name: string; sku: string | null; quantity: number; revenue: number; profit: number; source: string }> = {};

  for (const s of sales || []) {
    const rev = s.unit_price_yen * s.quantity;
    frimaRevenue += rev;
    frimaFee += s.fee_yen;
    frimaShipping += s.shipping_yen;
    frimaMaterial += (s.material_yen || 0);
    frimaProfit += s.gross_profit_yen;
    const platform =
      s.platform === 'mercari' ? 'メルカリ' : s.platform === 'amazon' ? 'Amazon(手動)' : 'ラクマ';
    if (!byPlatform[platform]) {
      byPlatform[platform] = { revenue: 0, fee: 0, shipping: 0, profit: 0 };
    }
    byPlatform[platform].revenue += rev;
    byPlatform[platform].fee += s.fee_yen;
    byPlatform[platform].shipping += s.shipping_yen;
    byPlatform[platform].profit += s.gross_profit_yen;

    const key = period === 'year'
      ? String(s.sold_at).slice(0, 7)
      : s.sold_at;
    if (!chartByKey[key]) chartByKey[key] = { revenue: 0, profit: 0 };
    chartByKey[key].revenue += rev;
    chartByKey[key].profit += s.gross_profit_yen;

    const pid = s.product_id;
    if (!byProduct[pid]) {
      byProduct[pid] = {
        name: (s.products as { name: string; sku: string | null } | null)?.name ?? '不明',
        sku: (s.products as { name: string; sku: string | null } | null)?.sku ?? null,
        quantity: 0,
        revenue: 0,
        profit: 0,
        source: 'フリマ',
      };
    }
    byProduct[pid].quantity += s.quantity;
    byProduct[pid].revenue += rev;
    byProduct[pid].profit += s.gross_profit_yen;
  }

  // ── Amazon mart データ ──
  let amazonRevenue = 0;
  let amazonFee = 0;
  let amazonAfterFee = 0;

  if (period === 'year') {
    const startMonth = `${year}-01`;
    const endMonth = `${year}-12`;
    const { data: amMonthly } = await supabase
      .from('amazon_sales_summary_monthly')
      .select('month, order_count, units_sold, sales_amount_yen, fee_amount_yen, sales_after_fee_yen')
      .eq('user_id', user.id)
      .gte('month', startMonth)
      .lte('month', endMonth);

    for (const r of amMonthly ?? []) {
      amazonRevenue += r.sales_amount_yen;
      amazonFee += r.fee_amount_yen;
      amazonAfterFee += r.sales_after_fee_yen;
      const key = r.month;
      if (!chartByKey[key]) chartByKey[key] = { revenue: 0, profit: 0 };
      chartByKey[key].revenue += r.sales_amount_yen;
      chartByKey[key].profit += r.sales_after_fee_yen;
    }
  } else {
    const { data: amDaily } = await supabase
      .from('amazon_sales_summary_daily')
      .select('date, order_count, units_sold, sales_amount_yen, fee_amount_yen, sales_after_fee_yen')
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate);

    for (const r of amDaily ?? []) {
      amazonRevenue += r.sales_amount_yen;
      amazonFee += r.fee_amount_yen;
      amazonAfterFee += r.sales_after_fee_yen;
      const key = r.date;
      if (!chartByKey[key]) chartByKey[key] = { revenue: 0, profit: 0 };
      chartByKey[key].revenue += r.sales_amount_yen;
      chartByKey[key].profit += r.sales_after_fee_yen;
    }
  }

  // ── Amazon 手数料の内訳（fee_events から手数料/送料を分離） ──
  const SHIPPING_FEE_TYPES = new Set([
    'FBAPerUnitFulfillmentFee', 'FBAPerOrderFulfillmentFee', 'FBAWeightBasedFee',
    'ShippingCharge', 'ShippingTax', 'ShippingDiscount',
    'ShippingLabel', 'Shipping label purchase',
    'PostageBilling', 'PostageBilling_VAT', 'PostageRefund',
  ]);

  let amazonCommission = 0; // 販売手数料
  let amazonShipping = 0;   // 配送関連費用

  const { data: feeEvents } = await supabase
    .from('amazon_fee_events')
    .select('fee_type, fee_amount_yen')
    .eq('user_id', user.id)
    .gte('posted_date', startDate)
    .lte('posted_date', endDate);

  for (const fe of feeEvents ?? []) {
    const isShipping = SHIPPING_FEE_TYPES.has(fe.fee_type) ||
      (fe.fee_type ?? '').startsWith('PostageBilling') ||
      (fe.fee_type ?? '').startsWith('PostageRefund') ||
      (fe.fee_type ?? '').startsWith('FBA');
    if (isShipping) {
      amazonShipping += fe.fee_amount_yen;
    } else {
      amazonCommission += fe.fee_amount_yen;
    }
  }

  // ── Amazon 売れ筋ランキング（選択期間でフィルタ） ──
  const { data: amSalesLines } = await supabase
    .from('amazon_sales_lines')
    .select('seller_sku, product_name, quantity, item_price_yen, purchase_date')
    .eq('user_id', user.id)
    .gte('purchase_date', startDate + 'T00:00:00')
    .lte('purchase_date', endDate + 'T23:59:59');

  for (const sl of amSalesLines ?? []) {
    const pid = `amazon_${sl.seller_sku}`;
    if (!byProduct[pid]) {
      byProduct[pid] = {
        name: sl.product_name ?? sl.seller_sku,
        sku: sl.seller_sku,
        quantity: 0,
        revenue: 0,
        profit: 0,
        source: 'Amazon',
      };
    }
    byProduct[pid].quantity += sl.quantity;
    byProduct[pid].revenue += sl.item_price_yen;
  }

  // Amazon SKU の利益を按分（売上比率で手数料を配分）
  const amazonSkuKeys = Object.keys(byProduct).filter((k) => k.startsWith('amazon_'));
  if (amazonRevenue > 0) {
    for (const key of amazonSkuKeys) {
      const p = byProduct[key];
      const ratio = p.revenue / amazonRevenue;
      p.profit = Math.round(p.revenue + (amazonFee * ratio)); // fee is negative
    }
  }

  // Amazon をプラットフォーム別に追加（手数料/送料を分離）
  if (amazonRevenue > 0 || amazonFee !== 0) {
    byPlatform['Amazon'] = {
      revenue: amazonRevenue,
      fee: Math.abs(amazonCommission),
      shipping: Math.abs(amazonShipping),
      profit: amazonAfterFee,
    };
  }

  // ── 全チャネル合算 ──
  const totalRevenue = frimaRevenue + amazonRevenue;
  const totalExpense = frimaFee + frimaShipping + frimaMaterial + Math.abs(amazonCommission) + Math.abs(amazonShipping);
  const totalProfit = frimaProfit + amazonAfterFee;

  const productRanking = Object.values(byProduct)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10);

  let chartData: { label: string; 売上: number; 利益: number; 利益率: number }[] = [];
  if (period === 'year') {
    const monthLabels = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    chartData = Array.from({ length: 12 }, (_, i) => {
      const key = `${year}-${String(i + 1).padStart(2, '0')}`;
      const d = chartByKey[key] ?? { revenue: 0, profit: 0 };
      const rate = d.revenue > 0 ? Math.round((d.profit / d.revenue) * 100) : 0;
      return { label: monthLabels[i], 売上: d.revenue, 利益: d.profit, 利益率: rate };
    });
  } else {
    const lastDay = new Date(year, month, 0).getDate();
    chartData = Array.from({ length: lastDay }, (_, i) => {
      const day = i + 1;
      const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const d = chartByKey[key] ?? { revenue: 0, profit: 0 };
      const rate = d.revenue > 0 ? Math.round((d.profit / d.revenue) * 100) : 0;
      return { label: `${day}日`, 売上: d.revenue, 利益: d.profit, 利益率: rate };
    });
  }

  const periodLabel = period === 'year'
    ? `${year}年の集計`
    : `${year}年${month}月の集計`;

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">ダッシュボード<span className="text-base font-normal text-slate-500 ml-2">全チャネル統合</span></h1>
        <Suspense fallback={<div className="h-12 mb-6" />}>
          <DashboardFilters />
        </Suspense>
        <p className="text-slate-600 mb-6">{periodLabel}</p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-medium text-slate-500">売上合計<span className="text-xs font-normal ml-1">（全チャネル）</span></h3>
            <p className="text-2xl font-bold mt-2">¥{totalRevenue.toLocaleString()}</p>
            {amazonRevenue > 0 && frimaRevenue > 0 && (
              <p className="text-xs text-slate-400 mt-1">
                フリマ ¥{frimaRevenue.toLocaleString()} / Amazon ¥{amazonRevenue.toLocaleString()}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-medium text-slate-500">経費合計<span className="text-xs font-normal ml-1">（手数料＋送料＋資材）</span></h3>
            <p className="text-2xl font-bold mt-2 text-rose-600">¥{totalExpense.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-medium text-slate-500">利益合計</h3>
            <p className="text-2xl font-bold mt-2 text-emerald-600">¥{totalProfit.toLocaleString()}</p>
            {amazonAfterFee > 0 && frimaProfit > 0 && (
              <p className="text-xs text-slate-400 mt-1">
                フリマ ¥{frimaProfit.toLocaleString()} / Amazon ¥{amazonAfterFee.toLocaleString()}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-medium text-slate-500">利益率</h3>
            <p className="text-2xl font-bold mt-2 text-emerald-600">
              {totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0}%
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-medium text-slate-500">手数料合計</h3>
            <p className="text-xl font-bold mt-2">¥{(frimaFee + Math.abs(amazonCommission)).toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-medium text-slate-500">送料合計<span className="text-xs font-normal ml-1">（FBA配送料含む）</span></h3>
            <p className="text-xl font-bold mt-2">¥{(frimaShipping + Math.abs(amazonShipping)).toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-medium text-slate-500">資材代合計</h3>
            <p className="text-xl font-bold mt-2">¥{frimaMaterial.toLocaleString()}</p>
          </div>
        </div>
        <div className="mb-8">
          <DashboardCharts data={chartData} period={period} height={320} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="font-bold text-lg mb-4">プラットフォーム別集計</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="py-2 text-left">プラットフォーム</th>
                    <th className="py-2 text-right">売上</th>
                    <th className="py-2 text-right">手数料</th>
                    <th className="py-2 text-right">送料</th>
                    <th className="py-2 text-right">利益</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(byPlatform).map(([platform, data]) => (
                    <tr key={platform} className="border-b border-slate-100">
                      <td className="py-2 font-medium">{platform}</td>
                      <td className="py-2 text-right">¥{data.revenue.toLocaleString()}</td>
                      <td className="py-2 text-right">¥{data.fee.toLocaleString()}</td>
                      <td className="py-2 text-right">¥{data.shipping.toLocaleString()}</td>
                      <td className="py-2 text-right text-emerald-600">¥{data.profit.toLocaleString()}</td>
                    </tr>
                  ))}
                  {Object.keys(byPlatform).length > 1 && (
                    <tr className="border-t-2 border-slate-300 font-bold">
                      <td className="py-2">合計</td>
                      <td className="py-2 text-right">¥{totalRevenue.toLocaleString()}</td>
                      <td className="py-2 text-right">¥{(frimaFee + Math.abs(amazonCommission)).toLocaleString()}</td>
                      <td className="py-2 text-right">¥{(frimaShipping + Math.abs(amazonShipping)).toLocaleString()}</td>
                      <td className="py-2 text-right text-emerald-600">¥{totalProfit.toLocaleString()}</td>
                    </tr>
                  )}
                  {Object.keys(byPlatform).length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-500">
                        {periodLabel}に販売データがありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="font-bold text-lg mb-4">売れ筋ランキング TOP10<span className="text-sm font-normal text-slate-500 ml-2">（{periodLabel} / 利益順・全チャネル）</span></h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="py-2 text-left w-8">#</th>
                    <th className="py-2 text-left">商品名</th>
                    <th className="py-2 text-center">販路</th>
                    <th className="py-2 text-right">個数</th>
                    <th className="py-2 text-right">利益</th>
                  </tr>
                </thead>
                <tbody>
                  {productRanking.map((p, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2 text-slate-400 font-medium">{i + 1}</td>
                      <td className="py-2">
                        <div className="font-medium text-sm truncate max-w-[160px]" title={p.name}>{p.name}</div>
                        {p.sku && <div className="text-xs text-slate-400">{p.sku}</div>}
                      </td>
                      <td className="py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          p.source === 'Amazon' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {p.source}
                        </span>
                      </td>
                      <td className="py-2 text-right text-sm">{p.quantity}個</td>
                      <td className="py-2 text-right text-emerald-600 font-medium">¥{p.profit.toLocaleString()}</td>
                    </tr>
                  ))}
                  {productRanking.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-500">
                        {periodLabel}に販売データがありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
