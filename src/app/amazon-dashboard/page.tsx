import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Nav } from '@/components/nav';
import { AmazonDashboardClient } from '@/components/amazon-dashboard-client';

export default async function AmazonDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Amazon 売上管理</h1>
        <AmazonDashboardClient />
      </main>
    </div>
  );
}
