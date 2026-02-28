import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Nav } from '@/components/nav';
import { SettingsForm } from './settings-form';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: feeRates } = await supabase.from('fee_rates').select('*');
  const { data: shippingRates } = await supabase.from('shipping_rates').select('*');
  const { data: settings } = await supabase
    .from('app_settings')
    .select('*')
    .eq('user_id', user.id);

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">設定</h1>
        <div className="space-y-8">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="font-semibold text-lg mb-4">手数料率</h2>
            <p className="text-sm text-slate-600 mb-4">
              メルカリは10%固定。ラクマは手動で当月ランクを選択してください。
            </p>
            <SettingsForm
              userId={user.id}
              feeRates={feeRates || []}
              shippingRates={shippingRates || []}
              settings={settings || []}
            />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="font-semibold text-lg mb-2">送料マスタ</h2>
            <p className="text-sm text-slate-600">
              販売登録時に選択できる送料一覧です。編集機能は将来追加予定です。
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
