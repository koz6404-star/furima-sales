import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Nav } from '@/components/nav';
import { PerformanceClient } from './performance-client';

export default async function PerformancePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-6">
        <h1 className="text-xl font-bold mb-4">商品別パフォーマンス</h1>
        <PerformanceClient />
      </main>
    </div>
  );
}
