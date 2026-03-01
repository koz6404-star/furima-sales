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

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; match?: string; page?: string; setOnly?: string; location?: string; sort?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const match = params.match === 'exact' ? 'exact' : 'partial';
  const setOnly = params.setOnly === '1';
  const locationFilter = params.location === 'home' || params.location === 'warehouse' || params.location === 'both' ? params.location : '';
  const sort = (params.sort as SortOption) ?? '';
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const orderConfig = getOrderForSort(sort);

  let productIdsFromLocation: string[] | null = null;
  if (locationFilter) {
    if (locationFilter === 'both') {
      const { data: homeRows } = await supabase.from('product_location_stock').select('product_id').eq('location', 'home').gt('quantity', 0);
      const { data: whRows } = await supabase.from('product_location_stock').select('product_id').eq('location', 'warehouse').gt('quantity', 0);
      const homeIds = new Set((homeRows ?? []).map((r) => r.product_id));
      const whIds = new Set((whRows ?? []).map((r) => r.product_id));
      productIdsFromLocation = [...homeIds].filter((id) => whIds.has(id));
    } else {
      const { data: locRows } = await supabase
        .from('product_location_stock')
        .select('product_id')
        .eq('location', locationFilter)
        .gt('quantity', 0);
      productIdsFromLocation = [...new Set((locRows ?? []).map((r) => r.product_id))];
    }
  }

  let query = supabase
    .from('products')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .gt('stock', 0);

  if (productIdsFromLocation !== null) {
    if (productIdsFromLocation.length === 0) {
      query = query.eq('id', '00000000-0000-0000-0000-000000000000');
    } else {
      query = query.in('id', productIdsFromLocation);
    }
  }

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
  const queryStr = [
    q ? `q=${encodeURIComponent(q)}` : '',
    q ? `match=${match}` : '',
    setOnly ? 'setOnly=1' : '',
    locationFilter ? `location=${locationFilter}` : '',
    sort ? `sort=${encodeURIComponent(sort)}` : '',
  ].filter(Boolean).join('&');

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-between sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">商品一覧（在庫あり）</h1>
            <p className="text-sm text-slate-600 mt-1">
              {q
                ? `「${q}」の検索結果: ${totalCount ?? 0}件（${match === 'exact' ? '完全一致' : '部分一致'}）${setOnly ? '・セット品のみ' : ''}`
                : setOnly
                  ? `セット品: ${totalCount ?? 0}件`
                  : `全${totalCount ?? 0}件、2件以上選択でセット出品が可能です`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Suspense fallback={<div className="h-10 w-48 bg-slate-200 rounded animate-pulse" />}>
              <ProductSearchBar basePath="/products" />
            </Suspense>
            <Link
              href="/products/new"
              className="rounded bg-emerald-600 px-4 py-2 text-white font-medium hover:bg-emerald-700 whitespace-nowrap"
            >
              新規登録
            </Link>
          </div>
        </div>
        <ProductsTableWithActions
          products={products || []}
          locationStockMap={locationStockMap}
          showStock={true}
          redirectAfterDelete="/products"
          allowSetCreation={true}
        />
        {totalPages > 1 && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {page > 1 && (
              <Link
                href={`/products?page=${page - 1}${queryStr ? `&${queryStr}` : ''}`}
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
                href={`/products?page=${page + 1}${queryStr ? `&${queryStr}` : ''}`}
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
