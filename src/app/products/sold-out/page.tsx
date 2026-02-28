import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Suspense } from 'react';
import { Nav } from '@/components/nav';
import { ProductSearchBar } from '@/components/product-search-bar';
import { ProductsTableWithActions } from '@/components/products-table-with-actions';

export default async function SoldOutPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; match?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const match = params.match === 'exact' ? 'exact' : 'partial';

  let query = supabase
    .from('products')
    .select('*')
    .eq('user_id', user.id)
    .eq('stock', 0);

  if (q) {
    if (match === 'exact') {
      query = query.eq('name', q);
    } else {
      query = query.ilike('name', `%${q}%`);
    }
  }

  const { data: products } = await query.order('updated_at', { ascending: false });

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-between sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">完売一覧</h1>
            <p className="text-sm text-slate-600 mt-1">
              {q ? `「${q}」の検索結果: ${products?.length ?? 0}件（${match === 'exact' ? '完全一致' : '部分一致'}）` : '2件以上選択でセット出品が可能です'}
            </p>
          </div>
          <Suspense fallback={<div className="h-10 w-48 bg-slate-200 rounded animate-pulse" />}>
            <ProductSearchBar basePath="/products/sold-out" />
          </Suspense>
        </div>
        <ProductsTableWithActions
          products={products || []}
          showStock={false}
          redirectAfterDelete="/products/sold-out"
          allowSetCreation={true}
        />
      </main>
    </div>
  );
}
