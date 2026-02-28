import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Nav } from '@/components/nav';
import { ProductsTableWithActions } from '@/components/products-table-with-actions';

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
        <ProductsTableWithActions
          products={products || []}
          showStock={true}
          redirectAfterDelete="/products"
          allowSetCreation={true}
        />
      </main>
    </div>
  );
}
