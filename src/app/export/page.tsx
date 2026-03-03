import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Nav } from '@/components/nav';
import { ExportDownloadClient } from './export-download-client';

export default async function ExportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">出力エクスポート</h1>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 mb-6">
          <p className="text-lg font-medium text-emerald-800 mb-2">
            このデータを出力エクスポートに入れます
          </p>
          <p className="text-emerald-700 text-sm">
            ダウンロードしたCSVをChatGPT等のAIに入れて、売上分析・在庫アドバイス・仕入れ判断の材料として活用できます。
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="font-semibold mb-2">詳細分析用データ</h2>
          <p className="text-slate-600 text-sm mb-4">
            商品ごとの販売実績・在庫状況・利益率などをまとめたデータです。直近30日・90日の販売数も含みます。
          </p>
          <ExportDownloadClient />
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-700 mb-2">【使い方】</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>「詳細分析用データをダウンロード」をクリック</li>
            <li>ダウンロードしたCSVファイルを開く</li>
            <li>中身をすべてコピー</li>
            <li>ChatGPT等のAIの入力欄に貼り付ける</li>
            <li>「このデータを分析してアドバイスをください」などと依頼する</li>
          </ol>
        </div>
      </main>
    </div>
  );
}
