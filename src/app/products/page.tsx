import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import Image from 'next/image';
import { Nav } from '@/components/nav';
import { calcPriceWithMargin20, calcPriceWithMargin30, calcFee } from '@/lib/calculations';

export default async function ProductsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('user_id', user.id)
    .gt('stock', 0)
    .order('updated_at', { ascending: false });

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">商品一覧（在庫あり）</h1>
          <Link
            href="/products/new"
            className="rounded bg-emerald-600 px-4 py-2 text-white font-medium hover:bg-emerald-700"
          >
            新規登録
          </Link>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">画像</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">商品名</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">SKU</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">在庫</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">原価</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">20%価格</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">30%価格</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">想定粗利(20%)</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(!products || products.length === 0) && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    在庫ありの商品がありません
                  </td>
                </tr>
              )}
              {products?.map((p) => {
                const price20 = calcPriceWithMargin20(p.cost_yen);
                const price30 = calcPriceWithMargin30(p.cost_yen);
                const fee20 = calcFee(price20, 10, 'floor');
                const gross20 = price20 - fee20 - p.cost_yen;
                return (
                  <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      {p.image_url ? (
                        <div className="relative h-12 w-12">
                          <Image
                            src={p.image_url}
                            alt={p.name}
                            fill
                            className="object-cover rounded"
                          />
                        </div>
                      ) : (
                        <div className="h-12 w-12 bg-slate-200 rounded flex items-center justify-center text-slate-400 text-xs">
                          画像なし
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-slate-600">{p.sku || '-'}</td>
                    <td className="px-4 py-3 text-right">{p.stock}</td>
                    <td className="px-4 py-3 text-right">¥{p.cost_yen.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">¥{price20.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">¥{price30.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">¥{gross20.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/products/${p.id}`}
                        className="text-emerald-600 hover:underline text-sm"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
