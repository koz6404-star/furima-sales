import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Nav } from '@/components/nav';
import { ProductsTableWithActions } from '@/components/products-table-with-actions';

export default async function SoldOutPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('user_id', user.id)
    .eq('stock', 0)
    .order('updated_at', { ascending: false });

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">完売一覧</h1>
        <ProductsTableWithActions
          products={products || []}
          showStock={false}
          redirectAfterDelete="/products/sold-out"
        />
      </main>
    </div>
  );
}
