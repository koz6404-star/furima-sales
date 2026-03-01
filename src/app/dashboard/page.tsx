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

  const { data: sales } = await supabase
    .from('sales')
    .select('*')
    .eq('user_id', user.id)
    .gte('sold_at', startDate)
    .lte('sold_at', endDate);

  let totalRevenue = 0;
  let totalFee = 0;
  let totalShipping = 0;
  let totalMaterial = 0;
  let totalProfit = 0;
  const byPlatform: Record<string, { revenue: number; fee: number; shipping: number; profit: number }> = {};
  const chartByKey: Record<string, { revenue: number; profit: number }> = {};

  for (const s of sales || []) {
    const rev = s.unit_price_yen * s.quantity;
    totalRevenue += rev;
    totalFee += s.fee_yen;
    totalShipping += s.shipping_yen;
    totalMaterial += (s.material_yen || 0);
    totalProfit += s.gross_profit_yen;
    const platform = s.platform === 'mercari' ? 'メルカリ' : 'ラクマ';
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
  }

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
        <h1 className="text-2xl font-bold mb-4">ダッシュボード</h1>
        <Suspense fallback={<div className="h-12 mb-6" />}>
          <DashboardFilters />
        </Suspense>
        <p className="text-slate-600 mb-6">{periodLabel}</p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6 mb-6">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-medium text-slate-500">売上合計</h3>
            <p className="text-2xl font-bold mt-2">¥{totalRevenue.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-medium text-slate-500">利益合計</h3>
            <p className="text-2xl font-bold mt-2 text-emerald-600">¥{totalProfit.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-medium text-slate-500">手数料合計</h3>
            <p className="text-2xl font-bold mt-2">¥{totalFee.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-medium text-slate-500">送料合計</h3>
            <p className="text-2xl font-bold mt-2">¥{totalShipping.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-medium text-slate-500">資材代合計</h3>
            <p className="text-2xl font-bold mt-2">¥{totalMaterial.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-medium text-slate-500">利益率</h3>
            <p className="text-2xl font-bold mt-2 text-emerald-600">
              {totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0}%
            </p>
          </div>
        </div>
        <div className="mb-8 flex flex-col lg:flex-row lg:items-start lg:gap-6">
          <div className="flex-1 min-w-0">
            <DashboardCharts data={chartData} period={period} height={320} />
          </div>
          <div
            className="dashboard-mascot hidden sm:flex items-end justify-center lg:justify-end pt-4 lg:pt-0 lg:flex-shrink-0 lg:w-[150px]"
            aria-hidden
          >
            <img
              src="/dashboard-mascot.png"
              alt="統計確認キャラクター"
              width={135}
              height={135}
              className="w-[100px] sm:w-[120px] lg:w-[135px] h-auto object-contain drop-shadow-sm"
            />
          </div>
        </div>
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
      </main>
    </div>
  );
}
