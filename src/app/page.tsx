import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Nav } from '@/components/nav';
import Link from 'next/link';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">ダッシュボード</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Link
            href="/products"
            className="block p-6 rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md transition"
          >
            <h2 className="font-semibold text-lg text-slate-800">商品一覧</h2>
            <p className="text-slate-600 text-sm mt-1">在庫あり商品の一覧</p>
          </Link>
          <Link
            href="/products/sold-out"
            className="block p-6 rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md transition"
          >
            <h2 className="font-semibold text-lg text-slate-800">完売一覧</h2>
            <p className="text-slate-600 text-sm mt-1">在庫0の商品</p>
          </Link>
          <Link
            href="/products/new"
            className="block p-6 rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md transition"
          >
            <h2 className="font-semibold text-lg text-slate-800">商品登録</h2>
            <p className="text-slate-600 text-sm mt-1">手動で商品を登録</p>
          </Link>
          <Link
            href="/import"
            className="block p-6 rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md transition"
          >
            <h2 className="font-semibold text-lg text-slate-800">Excel取り込み</h2>
            <p className="text-slate-600 text-sm mt-1">Excel/ZIPで一括取込</p>
          </Link>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-lg mb-4">月次集計</h2>
          <p className="text-slate-500">集計データはダッシュボードページで表示されます。</p>
          <Link href="/dashboard" className="mt-4 inline-block text-emerald-600 hover:underline">
            詳細を見る →
          </Link>
        </div>
      </main>
    </div>
  );
}
