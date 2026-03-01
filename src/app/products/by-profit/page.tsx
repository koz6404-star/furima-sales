import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Nav } from '@/components/nav';
import { ProductsTableWithActions } from '@/components/products-table-with-actions';
import { ProfitSearchForm } from './profit-search-form';

const PER_PAGE = 20;

export default async function ByProfitPage({
  searchParams,
}: {
  searchParams: Promise<{ minProfit?: string; page?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const minProfit = Math.max(0, parseInt(params.minProfit ?? '0', 10) || 0);
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  type ProductRow = { id: string; name: string; sku: string | null; cost_yen: number; stock: number; image_url: string | null; campaign: string | null; size: string | null; color: string | null; stock_received_at?: string | null; oldest_received_at?: string | null; default_shipping_yen?: number | null; [k: string]: unknown };
  let products: ProductRow[] = [];
  let totalCount = 0;

  if (minProfit > 0) {
    const { data: sales } = await supabase
      .from('sales')
      .select('product_id')
      .eq('user_id', user.id)
      .gte('gross_profit_yen', minProfit);

    const productIds = [...new Set((sales ?? []).map((r) => r.product_id))];
    if (productIds.length > 0) {
      const from = (page - 1) * PER_PAGE;
      const to = from + PER_PAGE - 1;
      const { data: prods, count } = await supabase
        .from('products')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .in('id', productIds)
        .order('updated_at', { ascending: false })
        .range(from, to);
      products = (prods ?? []) as ProductRow[];
      totalCount = count ?? 0;
    }
  }

  const productIds = (products ?? []).map((p) => p.id);
  const locationStockMap: Record<string, { home: number; warehouse: number }> = {};
  if (productIds.length > 0) {
    const { data: locRows } = await supabase.from('product_location_stock').select('product_id, location, quantity').in('product_id', productIds);
    for (const p of products ?? []) {
      locationStockMap[p.id] = { home: 0, warehouse: 0 };
    }
    for (const r of locRows ?? []) {
      if (locationStockMap[r.product_id]) {
        if (r.location === 'home') locationStockMap[r.product_id].home = r.quantity ?? 0;
        else if (r.location === 'warehouse') locationStockMap[r.product_id].warehouse = r.quantity ?? 0;
      }
    }
  }

  const totalPages = totalCount ? Math.ceil(totalCount / PER_PAGE) : 1;
  const queryStr = minProfit > 0 ? `minProfit=${minProfit}` : '';

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">利益で検索</h1>
            <p className="text-sm text-slate-600 mt-1">
              指定した利益額以上で売れたことがある商品を表示します。販売履歴があれば対象になります。
            </p>
          </div>
          <ProfitSearchForm />
          {minProfit > 0 && (
            <p className="text-sm text-slate-600">
              {totalCount > 0
                ? `利益¥${minProfit.toLocaleString()}以上で売れた商品: ${totalCount}件`
                : '該当する商品はありません'}
            </p>
          )}
        </div>
        <ProductsTableWithActions
          products={products ?? []}
          locationStockMap={locationStockMap}
          showStock={true}
          redirectAfterDelete="/products/by-profit"
          allowSetCreation={false}
          fromParam="by-profit"
        />
        {minProfit > 0 && totalPages > 1 && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {page > 1 && (
              <Link
                href={`/products/by-profit?page=${page - 1}${queryStr ? `&${queryStr}` : ''}`}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 min-h-[44px] flex items-center"
              >
                ← 前へ
              </Link>
            )}
            <span className="px-4 py-2 text-sm text-slate-600 flex items-center">
              {page} / {totalPages}ページ
            </span>
            {page < totalPages && (
              <Link
                href={`/products/by-profit?page=${page + 1}${queryStr ? `&${queryStr}` : ''}`}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 min-h-[44px] flex items-center"
              >
                次へ →
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
