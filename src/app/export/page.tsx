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
            戦略分析用データ
          </p>
          <p className="text-emerald-700 text-sm">
            フリマ＋Amazonの全商品データをAIに入れて、仕入れ判断・在庫最適化・売れ筋分析ができます。
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="font-semibold mb-2">戦略分析データ</h2>
          <p className="text-slate-600 text-sm mb-3">
            全チャネル統合の商品別データです。以下の戦略指標を含みます:
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 mb-4">
            <div>1個あたり利益 / ROI%</div>
            <div>販売速度（個/月）</div>
            <div>売上トレンド（加速/安定/減速）</div>
            <div>残在庫日数</div>
            <div>在庫金額（寝ている資金）</div>
            <div>在庫ステータス（好調/滞留等）</div>
          </div>
          <ExportDownloadClient />
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-700 mb-2">【使い方】</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>CSV形式 または Markdown形式 でダウンロード</li>
            <li>ダウンロードしたファイルを開いて中身をコピー</li>
            <li>ChatGPT等のAIの入力欄に貼り付ける</li>
            <li>「仕入れ判断のアドバイスをください」「在庫を最適化したい」などと依頼する</li>
          </ol>
          <p className="mt-2 text-xs text-slate-400">Markdown形式はAIに読ませるのに最適です。CSV形式はExcelで開けます。</p>
        </div>
      </main>
    </div>
  );
}
