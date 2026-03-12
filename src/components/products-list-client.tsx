'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getOrderForSort } from '@/lib/product-sort';
import { ProductSearchBar } from '@/components/product-search-bar';
import { ProductsTableWithActions } from '@/components/products-table-with-actions';
import { AmazonSyncButton } from '@/components/amazon-sync-button';
import type { SortOption } from '@/components/product-search-bar';

const PER_PAGE = 20;

type Product = {
  id: string;
  name: string;
  sku: string | null;
  cost_yen: number;
  stock: number;
  image_url: string | null;
  campaign: string | null;
  size: string | null;
  color: string | null;
  [key: string]: unknown;
};

export function ProductsListClient() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [locationStockMap, setLocationStockMap] = useState<Record<string, { home: number; warehouse: number; fba: number }>>({});
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const q = (searchParams.get('q') ?? '').trim();
  const match = searchParams.get('match') === 'exact' ? 'exact' : 'partial';
  const setOnly = searchParams.get('setOnly') === '1';
  const locationFilter = ['home', 'warehouse', 'fba', 'both'].includes(searchParams.get('location') ?? '') ? searchParams.get('location')! : '';
  const platformFilter = ['mercari', 'rakuma', 'amazon'].includes(searchParams.get('platform') ?? '') ? searchParams.get('platform')! : '';
  const sort = (searchParams.get('sort') as SortOption) ?? '';
  const minProfit = Math.max(0, parseInt(searchParams.get('minProfit') ?? '0', 10) || 0);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const fetchProducts = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const orderConfig = getOrderForSort(sort);
      const [locationResult, setResult, profitResult] = await Promise.all([
        locationFilter === 'both'
          ? Promise.all([
              supabase.from('product_location_stock').select('product_id').eq('location', 'home').gt('quantity', 0),
              supabase.from('product_location_stock').select('product_id').eq('location', 'warehouse').gt('quantity', 0),
            ]).then(([a, b]) => {
              const homeIds = new Set((a.data ?? []).map((r) => r.product_id));
              return [...homeIds].filter((id) => new Set((b.data ?? []).map((r) => r.product_id)).has(id));
            })
          : locationFilter
            ? supabase.from('product_location_stock').select('product_id').eq('location', locationFilter).gt('quantity', 0).then(({ data }) => [...new Set((data ?? []).map((r) => r.product_id))])
            : Promise.resolve(null),
        setOnly ? supabase.from('product_set_items').select('set_product_id').then(({ data }) => [...new Set((data ?? []).map((r) => r.set_product_id))]) : Promise.resolve([]),
        minProfit > 0 ? supabase.from('sales').select('product_id').eq('user_id', user.id).gte('gross_profit_yen', minProfit).then(({ data }) => [...new Set((data ?? []).map((r) => r.product_id))]) : Promise.resolve([]),
      ]);

      const productIdsFromLocation = locationResult;
      const setIds = setOnly ? setResult : null;
      const profitProductIds = minProfit > 0 ? profitResult : null;

      let query = supabase.from('products').select('*', { count: 'exact' }).eq('user_id', user.id);
      if (platformFilter === 'amazon') {
        query = query.eq('platform', 'amazon').gte('stock', 0);
      } else {
        query = query.gt('stock', 0);
        if (platformFilter) query = query.eq('platform', platformFilter);
      }
      if (productIdsFromLocation !== null) {
        query = productIdsFromLocation.length === 0 ? query.eq('id', '00000000-0000-0000-0000-000000000000') : query.in('id', productIdsFromLocation);
      }
      if (setIds !== null) {
        query = setIds.length === 0 ? query.eq('id', '00000000-0000-0000-0000-000000000000') : query.in('id', setIds);
      }
      if (profitProductIds !== null) {
        query = profitProductIds.length === 0 ? query.eq('id', '00000000-0000-0000-0000-000000000000') : query.in('id', profitProductIds);
      }
      if (q) {
        query = match === 'exact' ? query.eq('name', q) : query.ilike('name', `%${q}%`);
      }

      const from = (page - 1) * PER_PAGE;
      const to = from + PER_PAGE - 1;
      const orderOpts: { ascending: boolean; nullsFirst?: boolean } = { ascending: orderConfig.ascending };
      if (orderConfig.nullsFirst !== undefined) orderOpts.nullsFirst = orderConfig.nullsFirst;

      const { data: prods, count, error: qErr } = await query.order(orderConfig.column, orderOpts).range(from, to);
      if (qErr) throw qErr;

      const prodList = (prods ?? []) as Product[];
      setProducts(prodList);
      setTotalCount(count ?? 0);

      if (prodList.length > 0) {
        const { data: locRows } = await supabase.from('product_location_stock').select('product_id, location, quantity').in('product_id', prodList.map((p) => p.id));
        const map: Record<string, { home: number; warehouse: number; fba: number }> = {};
        for (const p of prodList) map[p.id] = { home: 0, warehouse: 0, fba: 0 };
        for (const r of locRows ?? []) {
          if (map[r.product_id]) {
            if (r.location === 'home') map[r.product_id].home = r.quantity ?? 0;
            else if (r.location === 'warehouse') map[r.product_id].warehouse = r.quantity ?? 0;
            else if (r.location === 'fba') map[r.product_id].fba = r.quantity ?? 0;
          }
        }
        setLocationStockMap(map);
      } else {
        setLocationStockMap({});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [q, match, setOnly, locationFilter, platformFilter, sort, minProfit, page]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));
  const queryStr = [
    q ? `q=${encodeURIComponent(q)}` : '',
    q ? `match=${match}` : '',
    setOnly ? 'setOnly=1' : '',
    locationFilter ? `location=${locationFilter}` : '',
    platformFilter ? `platform=${platformFilter}` : '',
    sort ? `sort=${encodeURIComponent(sort)}` : '',
    minProfit > 0 ? `minProfit=${minProfit}` : '',
  ]
    .filter(Boolean)
    .join('&');
  const returnParts = [page > 1 ? `page=${page}` : '', queryStr].filter(Boolean);
  const returnTo = `/products${returnParts.length ? `?${returnParts.join('&')}` : ''}`;

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">商品一覧（在庫あり）</h1>
          <p className="text-sm text-slate-600 mt-1">
            {loading
              ? '読み込み中...'
              : q
                ? `「${q}」の検索結果: ${totalCount}件（${match === 'exact' ? '完全一致' : '部分一致'}）${setOnly ? '・セット品のみ' : ''}${minProfit > 0 ? `・利益¥${minProfit.toLocaleString()}以上` : ''}`
                : setOnly
                  ? `セット品: ${totalCount}件`
                  : minProfit > 0
                    ? `利益¥${minProfit.toLocaleString()}以上で売れた商品: ${totalCount}件`
                    : `全${totalCount}件、2件以上選択でセット出品が可能です`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="w-full min-w-0 sm:flex-1 sm:min-w-[200px]">
            <ProductSearchBar basePath="/products" />
          </div>
          <AmazonSyncButton />
          <Link href="/products/new" className="rounded bg-emerald-600 px-4 py-2 text-white font-medium hover:bg-emerald-700 whitespace-nowrap">
            新規登録
          </Link>
        </div>
      </div>
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-red-800">
          {error}
          <button type="button" onClick={fetchProducts} className="ml-2 underline">
            再試行
          </button>
        </div>
      )}
      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          <p className="mt-2">商品を読み込み中...</p>
        </div>
      ) : (
        <>
          <ProductsTableWithActions
            products={products}
            locationStockMap={locationStockMap}
            showStock={true}
            redirectAfterDelete="/products"
            allowSetCreation={true}
            returnTo={returnTo}
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
        </>
      )}
    </>
  );
}
