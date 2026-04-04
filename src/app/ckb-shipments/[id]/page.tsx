'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Nav } from '@/components/nav';
import type { CkbShipment, CkbShipmentItem } from '@/types';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: '下書き', color: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: '確定済', color: 'bg-green-100 text-green-800' },
  customs_added: { label: '関税反映済', color: 'bg-blue-100 text-blue-800' },
};

export default function CkbShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [shipment, setShipment] = useState<CkbShipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [customsDuty, setCustomsDuty] = useState('');
  const [showCustomsForm, setShowCustomsForm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = useCallback(() => {
    fetch(`/api/ckb-shipments/${id}`)
      .then(r => r.json())
      .then(data => { setShipment(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleConfirm = async () => {
    if (!confirm('コストを確定して商品マスタに反映しますか？\n（この操作は取り消せません）')) return;
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/ckb-shipments/${id}/confirm`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({ type: 'success', text: data.message });
      fetchData();
    } catch (e) {
      setMessage({ type: 'error', text: String(e) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCustoms = async () => {
    const amount = parseInt(customsDuty);
    if (isNaN(amount) || amount < 0) {
      setMessage({ type: 'error', text: '正しい金額を入力してください' });
      return;
    }
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/ckb-shipments/${id}/customs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customs_duty_jpy: amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({ type: 'success', text: data.message });
      setShowCustomsForm(false);
      setCustomsDuty('');
      fetchData();
    } catch (e) {
      setMessage({ type: 'error', text: String(e) });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('この発送データを削除しますか？')) return;
    const res = await fetch(`/api/ckb-shipments/${id}`, { method: 'DELETE' });
    if (res.ok) router.push('/ckb-shipments');
  };

  if (loading) return <><Nav /><main className="container mx-auto px-4 py-6"><p>読み込み中...</p></main></>;
  if (!shipment) return <><Nav /><main className="container mx-auto px-4 py-6"><p>発送が見つかりません</p></main></>;

  const items: CkbShipmentItem[] = shipment.items || (shipment as unknown as { ckb_shipment_items: CkbShipmentItem[] }).ckb_shipment_items || [];
  const st = STATUS_LABELS[shipment.status] || STATUS_LABELS.draft;

  return (
    <>
      <Nav />
      <main className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="mb-4">
          <Link href="/ckb-shipments" className="text-sm text-slate-500 hover:text-emerald-600">← 一覧に戻る</Link>
        </div>

        {/* ヘッダー */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-800">{shipment.shipment_code}</h1>
              <span className={`text-sm px-3 py-1 rounded-full font-medium ${st.color}`}>{st.label}</span>
            </div>
            <div className="mt-1 text-sm text-slate-500 space-x-4">
              {shipment.shipped_at && <span>発送: {shipment.shipped_at}</span>}
              {shipment.arrived_at && <span>到着: {shipment.arrived_at}</span>}
              {shipment.source_file_name && <span>ファイル: {shipment.source_file_name}</span>}
            </div>
          </div>
          {shipment.status === 'draft' && (
            <button onClick={handleDelete} className="text-sm text-red-500 hover:text-red-700">削除</button>
          )}
        </div>

        {/* コスト概要 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-slate-500">商品数</div>
            <div className="text-lg font-bold">{shipment.total_items}個</div>
            <div className="text-xs text-slate-400">{items.length}種類</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-slate-500">為替レート</div>
            <div className="text-lg font-bold">{shipment.exchange_rate || 20.8}円/元</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-slate-500">国際送料</div>
            <div className="text-lg font-bold">¥{shipment.intl_shipping_jpy.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-slate-500">関税</div>
            <div className="text-lg font-bold">¥{shipment.customs_duty_jpy.toLocaleString()}</div>
          </div>
        </div>

        {/* メッセージ */}
        {message && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {message.text}
          </div>
        )}

        {/* アクションボタン */}
        <div className="flex gap-3 mb-6">
          {shipment.status === 'draft' && (
            <button
              onClick={handleConfirm}
              disabled={actionLoading}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {actionLoading ? '処理中...' : 'コスト確定 → 商品マスタ反映'}
            </button>
          )}
          {(shipment.status === 'confirmed' || shipment.status === 'customs_added') && (
            <button
              onClick={() => setShowCustomsForm(!showCustomsForm)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              関税を{shipment.customs_duty_jpy > 0 ? '更新' : '追加'}
            </button>
          )}
        </div>

        {/* 関税入力フォーム */}
        {showCustomsForm && (
          <div className="mb-6 p-4 rounded-lg border bg-blue-50">
            <div className="flex items-end gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">関税額（円）</label>
                <input
                  type="number"
                  value={customsDuty}
                  onChange={e => setCustomsDuty(e.target.value)}
                  placeholder="例: 3500"
                  className="rounded border border-slate-300 px-3 py-2 text-sm w-40"
                />
              </div>
              <button
                onClick={handleCustoms}
                disabled={actionLoading}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {actionLoading ? '処理中...' : '反映'}
              </button>
              <button onClick={() => setShowCustomsForm(false)} className="text-sm text-slate-500 hover:text-slate-700">
                キャンセル
              </button>
            </div>
            {shipment.customs_duty_jpy > 0 && (
              <p className="mt-2 text-xs text-slate-500">現在の関税: ¥{shipment.customs_duty_jpy.toLocaleString()}</p>
            )}
          </div>
        )}

        {/* 商品テーブル */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="p-2 border-b font-medium text-slate-600">画像</th>
                <th className="p-2 border-b font-medium text-slate-600">SKU</th>
                <th className="p-2 border-b font-medium text-slate-600">商品名</th>
                <th className="p-2 border-b font-medium text-slate-600">規格</th>
                <th className="p-2 border-b font-medium text-slate-600 text-right">数量</th>
                <th className="p-2 border-b font-medium text-slate-600 text-right">単価(元)</th>
                <th className="p-2 border-b font-medium text-slate-600 text-right">単価(円)</th>
                {shipment.status !== 'draft' && (
                  <>
                    <th className="p-2 border-b font-medium text-slate-600 text-right">送料按分</th>
                    <th className="p-2 border-b font-medium text-slate-600 text-right">関税按分</th>
                    <th className="p-2 border-b font-medium text-slate-600 text-right">1個あたり</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b hover:bg-slate-50">
                  <td className="p-2">
                    {item.image_url ? (
                      <img src={item.image_url} alt="" className="w-10 h-10 object-cover rounded" />
                    ) : (
                      <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center text-slate-400 text-xs">-</div>
                    )}
                  </td>
                  <td className="p-2 text-slate-500 font-mono text-xs">{item.ckb_sku || '-'}</td>
                  <td className="p-2">{item.product_name}</td>
                  <td className="p-2 text-slate-500">
                    {[item.size, item.color].filter(Boolean).join(' / ') || '-'}
                  </td>
                  <td className="p-2 text-right">{item.quantity}</td>
                  <td className="p-2 text-right">{item.unit_cost_cny ?? '-'}</td>
                  <td className="p-2 text-right">{item.unit_cost_jpy != null ? `¥${item.unit_cost_jpy}` : '-'}</td>
                  {shipment.status !== 'draft' && (
                    <>
                      <td className="p-2 text-right text-slate-500">¥{item.allocated_intl_shipping_jpy}</td>
                      <td className="p-2 text-right text-slate-500">¥{item.allocated_customs_jpy}</td>
                      <td className="p-2 text-right font-bold text-emerald-700">
                        ¥{item.unit_total_cost_jpy?.toLocaleString() ?? '-'}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
