'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/nav';

interface Shipment {
  id: string;
  shipment_code: string;
  shipped_at: string | null;
  arrived_at: string | null;
  exchange_rate: number | null;
  intl_shipping_jpy: number;
  customs_duty_jpy: number;
  total_items: number;
  status: string;
  source_file_name: string | null;
  created_at: string;
  ckb_shipment_items: { count: number }[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: '下書き', color: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: '確定済', color: 'bg-green-100 text-green-800' },
  customs_added: { label: '関税反映済', color: 'bg-blue-100 text-blue-800' },
};

export default function CkbShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ckb-shipments')
      .then(r => r.json())
      .then(data => {
        setShipments(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <>
      <Nav />
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800">CKB���入れ管理</h1>
          <Link
            href="/ckb-shipments/import"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Excel取込
          </Link>
        </div>

        {loading ? (
          <p className="text-slate-500">読み込み中...</p>
        ) : shipments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
            <p className="text-slate-500 mb-4">まだ発送データがありま���ん</p>
            <Link
              href="/ckb-shipments/import"
              className="text-emerald-600 font-medium hover:underline"
            >
              CKB納品書を取り込む →
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {shipments.map(s => {
              const st = STATUS_LABELS[s.status] || STATUS_LABELS.draft;
              const itemCount = s.ckb_shipment_items?.[0]?.count ?? s.total_items;
              return (
                <Link
                  key={s.id}
                  href={`/ckb-shipments/${s.id}`}
                  className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-emerald-300 hover:shadow-sm transition"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-lg text-slate-800">{s.shipment_code}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>
                          {st.label}
                        </span>
                      </div>
                      <div className="text-sm text-slate-500 space-x-3">
                        {s.shipped_at && <span>発送: {s.shipped_at}</span>}
                        {s.arrived_at && <span>到着: {s.arrived_at}</span>}
                        <span>{itemCount}種類 / {s.total_items}��</span>
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="text-slate-600">
                        送料: ¥{s.intl_shipping_jpy.toLocaleString()}
                      </div>
                      {s.customs_duty_jpy > 0 && (
                        <div className="text-slate-600">
                          関税: ¥{s.customs_duty_jpy.toLocaleString()}
                        </div>
                      )}
                      {s.exchange_rate && (
                        <div className="text-slate-400 text-xs">{s.exchange_rate}円/元</div>
                      )}
                    </div>
                  </div>
                  {s.source_file_name && (
                    <div className="mt-2 text-xs text-slate-400">{s.source_file_name}</div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
