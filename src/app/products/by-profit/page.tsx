import { redirect } from 'next/navigation';

/**
 * 利益で検索はフィルターに統合したため、/products へリダイレクト。
 * 既存のブックマーク等のため minProfit パラメータは引き継ぐ。
 */
export default async function ByProfitRedirect({
  searchParams,
}: {
  searchParams: Promise<{ minProfit?: string; page?: string }>;
}) {
  const params = await searchParams;
  const minProfit = params.minProfit ?? '';
  const page = params.page ?? '';
  const query = new URLSearchParams();
  if (minProfit) query.set('minProfit', minProfit);
  if (page) query.set('page', page);
  const qs = query.toString();
  redirect(qs ? `/products?${qs}` : '/products');
}
