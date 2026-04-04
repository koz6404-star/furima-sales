'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Nav } from '@/components/nav';

export default function CkbImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [shipmentCode, setShipmentCode] = useState('');
  const [exchangeRate, setExchangeRate] = useState('20.8');
  const [intlShippingJpy, setIntlShippingJpy] = useState('');
  const [shippedAt, setShippedAt] = useState('');
  const [arrivedAt, setArrivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string; shipment_id?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !shipmentCode) return;

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('shipment_code', shipmentCode.trim());
    formData.append('exchange_rate', exchangeRate || '20.8');
    formData.append('intl_shipping_jpy', intlShippingJpy || '0');
    if (shippedAt) formData.append('shipped_at', shippedAt);
    if (arrivedAt) formData.append('arrived_at', arrivedAt);

    try {
      const res = await fetch('/api/ckb-shipments/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setResult({ type: 'error', text: data.error });
        if (data.existing_id) {
          setResult({ type: 'error', text: `${data.error}`, shipment_id: data.existing_id });
        }
      } else {
        setResult({ type: 'success', text: data.message, shipment_id: data.shipment_id });
      }
    } catch (err) {
      setResult({ type: 'error', text: String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Nav />
      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="mb-4">
          <Link href="/ckb-shipments" className="text-sm text-slate-500 hover:text-emerald-600">← 一覧に戻る</Link>
        </div>

        <h1 className="text-2xl font-bold text-slate-800 mb-6">CKB納品書 取込</h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ファイル選択 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">納品書Excel (.xlsx / .xls)</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
            />
          </div>

          {/* 国際配送依頼番号 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              国際配送依頼番号 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={shipmentCode}
              onChange={e => setShipmentCode(e.target.value)}
              placeholder="例: GJFH260404"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              required
            />
            <p className="text-xs text-slate-400 mt-1">CKBの国際発送ごとの管理番号</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* 為替レート */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">為替レート（円/元）</label>
              <input
                type="number"
                step="0.01"
                value={exchangeRate}
                onChange={e => setExchangeRate(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            {/* 国際送料 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">国際送料（円）</label>
              <input
                type="number"
                value={intlShippingJpy}
                onChange={e => setIntlShippingJpy(e.target.value)}
                placeholder="例: 5000"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* 発送日 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">発送日</label>
              <input
                type="date"
                value={shippedAt}
                onChange={e => setShippedAt(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            {/* 到着日 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">到着日</label>
              <input
                type="date"
                value={arrivedAt}
                onChange={e => setArrivedAt(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* 結果表示 */}
          {result && (
            <div className={`p-4 rounded-lg ${result.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              <p className="font-medium">{result.text}</p>
              {result.shipment_id && (
                <Link
                  href={`/ckb-shipments/${result.shipment_id}`}
                  className="inline-block mt-2 text-sm underline"
                >
                  発送詳細を見る →
                </Link>
              )}
            </div>
          )}

          {/* 送信ボタン */}
          <button
            type="submit"
            disabled={loading || !file || !shipmentCode}
            className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '取込中...' : '取り込む'}
          </button>
        </form>

        {/* ヘルプ */}
        <div className="mt-8 p-4 rounded-lg bg-slate-50 text-sm text-slate-600">
          <h3 className="font-medium mb-2">取込の流れ</h3>
          <ol className="list-decimal list-inside space-y-1">
            <li>CKBの納品書Excelをアップロード</li>
            <li>国際配送依頼番号・送料・為替を入力</li>
            <li>取り込む → 発送詳細ページでプレビュー</li>
            <li>「コスト確定」→ 商品マスタに反映</li>
            <li>関税は後から追加可能</li>
          </ol>
        </div>
      </main>
    </>
  );
}
