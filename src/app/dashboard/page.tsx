import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Nav } from '@/components/nav';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
  const endOfMonth = new Date(year, month, 0);
  const endStr = endOfMonth.toISOString().slice(0, 10);

  const { data: sales } = await supabase
    .from('sales')
    .select('*')
    .eq('user_id', user.id)
    .gte('sold_at', startOfMonth)
    .lte('sold_at', endStr);

  let totalRevenue = 0;
  let totalFee = 0;
  let totalShipping = 0;
  let totalMaterial = 0;
  let totalProfit = 0;
  const byPlatform: Record<string, { revenue: number; fee: number; shipping: number; profit: number }> = {};

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
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">ダッシュボード</h1>
        <p className="text-slate-600 mb-6">
          {year}年{month}月の集計
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-8">
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
                      今月の販売データがありません
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
