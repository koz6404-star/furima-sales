import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Suspense } from 'react';
import { Nav } from '@/components/nav';
import { ProductSearchBar } from '@/components/product-search-bar';
import { ProductsTableWithActions } from '@/components/products-table-with-actions';
import { getOrderForSort } from '@/lib/product-sort';
import type { SortOption } from '@/components/product-search-bar';

const PER_PAGE = 20;

export default async function SoldOutPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; match?: string; page?: string; setOnly?: string; sort?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const match = params.match === 'exact' ? 'exact' : 'partial';
  const setOnly = params.setOnly === '1';
  const sort = (params.sort as SortOption) ?? '';
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const orderConfig = getOrderForSort(sort);

  let query = supabase
    .from('products')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .eq('stock', 0);

  if (setOnly) {
    const { data: setRows } = await supabase
      .from('product_set_items')
      .select('set_product_id');
    const setIds = [...new Set((setRows ?? []).map((r) => r.set_product_id))];
    if (setIds.length > 0) {
      query = query.in('id', setIds);
    } else {
      query = query.eq('id', '00000000-0000-0000-0000-000000000000');
    }
  }

  if (q) {
    if (match === 'exact') {
      query = query.eq('name', q);
    } else {
      query = query.ilike('name', `%${q}%`);
    }
  }

  const from = (page - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;
  const orderOpts: { ascending: boolean; nullsFirst?: boolean } = { ascending: orderConfig.ascending };
  if (orderConfig.nullsFirst !== undefined) orderOpts.nullsFirst = orderConfig.nullsFirst;
  const { data: products, count: totalCount } = await query.order(orderConfig.column, orderOpts).range(from, to);
  const totalPages = totalCount ? Math.ceil(totalCount / PER_PAGE) : 1;
  const queryStr = [
    q ? `q=${encodeURIComponent(q)}` : '',
    q ? `match=${match}` : '',
    setOnly ? 'setOnly=1' : '',
    sort ? `sort=${encodeURIComponent(sort)}` : '',
  ].filter(Boolean).join('&');

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-between sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">完売一覧</h1>
            <p className="text-sm text-slate-600 mt-1">
              {q
                ? `「${q}」の検索結果: ${totalCount ?? 0}件（${match === 'exact' ? '完全一致' : '部分一致'}）${setOnly ? '・セット品のみ' : ''}`
                : setOnly
                  ? `セット品: ${totalCount ?? 0}件`
                  : `全${totalCount ?? 0}件、2件以上選択でセット出品が可能です`}
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
        {totalPages > 1 && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {page > 1 && (
              <Link
                href={`/products/sold-out?page=${page - 1}${queryStr ? `&${queryStr}` : ''}`}
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
                href={`/products/sold-out?page=${page + 1}${queryStr ? `&${queryStr}` : ''}`}
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
