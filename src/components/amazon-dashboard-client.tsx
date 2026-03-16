'use client';

import { useEffect, useState } from 'react';

type SkuRow = {
  sku: string;
  product_name: string | null;
  fulfillment_type: string | null;
  units_sold: number;
  sales_amount_yen: number;
  fee_amount_yen: number;
  sales_after_fee_yen: number;
  current_inventory: number | null;
};

type MonthlyRow = {
  month: string;
  order_count: number;
  units_sold: number;
  sales_amount_yen: number;
  fee_amount_yen: number;
  sales_after_fee_yen: number;
};

type InventoryRow = {
  seller_sku: string;
  channel_type: string;
  product_name: string | null;
  available_qty: number;
  inbound_qty: number;
  reserved_qty: number;
  units_sold: number;
  sales_amount_yen: number;
  fee_amount_yen: number;
  sales_after_fee_yen: number;
};

type SummaryData = {
  ok: boolean;
  source: string;
  summary: {
    total: {
      order_count: number;
      units_sold: number;
      sales_amount_yen: number;
      fee_amount_yen: number;
      sales_after_fee_yen: number;
    };
    by_month: MonthlyRow[];
    by_sku: SkuRow[];
  };
};

type InventoryData = {
  ok: boolean;
  count: number;
  items: InventoryRow[];
};

function Badge({ type }: { type: string | null }) {
  if (!type) return <span className="text-xs text-slate-400">-</span>;
  const colors: Record<string, string> = {
    FBA: 'bg-blue-100 text-blue-700',
    FBM: 'bg-amber-100 text-amber-700',
    MIXED: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${colors[type] ?? 'bg-slate-100 text-slate-600'}`}>
      {type}
    </span>
  );
}

export function AmazonDashboardClient() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [inventory, setInventory] = useState<InventoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'sku' | 'inventory' | 'monthly'>('sku');

  useEffect(() => {
    async function load() {
      try {
        const [sumRes, invRes] = await Promise.all([
          fetch('/api/amazon-sales-summary'),
          fetch('/api/amazon-inventory-unified'),
        ]);
        if (!sumRes.ok) throw new Error(`売上API: ${sumRes.status}`);
        if (!invRes.ok) throw new Error(`在庫API: ${invRes.status}`);
        const sumData = await sumRes.json();
        const invData = await invRes.json();
        setSummary(sumData);
        setInventory(invData);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
        <span className="ml-3 text-slate-500">Amazon データを読み込み中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-700">
        <p className="font-bold">読み込みエラー</p>
        <p className="mt-1 text-sm">{error}</p>
      </div>
    );
  }

  const total = summary?.summary?.total;
  const skuRows = (summary?.summary?.by_sku ?? []) as SkuRow[];
  const monthlyRows = summary?.summary?.by_month ?? [];
  const inventoryItems = inventory?.items ?? [];

  return (
    <div>
      {/* サマリーカード */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="text-sm font-medium text-slate-500">売上合計</h3>
          <p className="text-2xl font-bold mt-2">¥{(total?.sales_amount_yen ?? 0).toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="text-sm font-medium text-slate-500">手数料合計</h3>
          <p className="text-2xl font-bold mt-2 text-rose-600">¥{Math.abs(total?.fee_amount_yen ?? 0).toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="text-sm font-medium text-slate-500">手数料差引後</h3>
          <p className="text-2xl font-bold mt-2 text-emerald-600">¥{(total?.sales_after_fee_yen ?? 0).toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="text-sm font-medium text-slate-500">販売個数 / 注文数</h3>
          <p className="text-2xl font-bold mt-2">{(total?.units_sold ?? 0).toLocaleString()}個<span className="text-base text-slate-400 ml-2">/ {(total?.order_count ?? 0)}件</span></p>
        </div>
      </div>

      {/* データソース表示 */}
      <div className="mb-4 text-xs text-slate-400">
        データソース: {summary?.source === 'mart' ? 'mart テーブル（事前集計）' : 'リアルタイム計算'}
        {' ・ '}在庫 SKU 数: {inventory?.count ?? 0}
      </div>

      {/* タブ */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {([
          ['sku', 'SKU別 売上・在庫'],
          ['inventory', '統合在庫一覧'],
          ['monthly', '月別集計'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* SKU別テーブル */}
      {tab === 'sku' && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-3 px-4 text-left font-medium text-slate-600">SKU</th>
                <th className="py-3 px-4 text-left font-medium text-slate-600">商品名</th>
                <th className="py-3 px-4 text-center font-medium text-slate-600">区分</th>
                <th className="py-3 px-4 text-right font-medium text-slate-600">販売数</th>
                <th className="py-3 px-4 text-right font-medium text-slate-600">売上</th>
                <th className="py-3 px-4 text-right font-medium text-slate-600">手数料</th>
                <th className="py-3 px-4 text-right font-medium text-slate-600">差引後</th>
                <th className="py-3 px-4 text-right font-medium text-slate-600">在庫</th>
              </tr>
            </thead>
            <tbody>
              {skuRows.map((r) => (
                <tr key={r.sku} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-4 font-mono text-xs">{r.sku}</td>
                  <td className="py-2 px-4 truncate max-w-[200px]" title={r.product_name ?? ''}>{r.product_name ?? '-'}</td>
                  <td className="py-2 px-4 text-center"><Badge type={r.fulfillment_type} /></td>
                  <td className="py-2 px-4 text-right">{r.units_sold}</td>
                  <td className="py-2 px-4 text-right">¥{r.sales_amount_yen.toLocaleString()}</td>
                  <td className="py-2 px-4 text-right text-rose-600">¥{Math.abs(r.fee_amount_yen).toLocaleString()}</td>
                  <td className="py-2 px-4 text-right text-emerald-600 font-medium">¥{r.sales_after_fee_yen.toLocaleString()}</td>
                  <td className="py-2 px-4 text-right font-medium">{r.current_inventory != null ? r.current_inventory : '-'}</td>
                </tr>
              ))}
              {skuRows.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-slate-400">SKU データがありません</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 統合在庫テーブル */}
      {tab === 'inventory' && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-3 px-4 text-left font-medium text-slate-600">SKU</th>
                <th className="py-3 px-4 text-left font-medium text-slate-600">商品名</th>
                <th className="py-3 px-4 text-center font-medium text-slate-600">区分</th>
                <th className="py-3 px-4 text-right font-medium text-slate-600">在庫数</th>
                <th className="py-3 px-4 text-right font-medium text-slate-600">入荷中</th>
                <th className="py-3 px-4 text-right font-medium text-slate-600">予約済</th>
                <th className="py-3 px-4 text-right font-medium text-slate-600">販売数</th>
                <th className="py-3 px-4 text-right font-medium text-slate-600">売上</th>
              </tr>
            </thead>
            <tbody>
              {inventoryItems.map((r) => (
                <tr key={`${r.seller_sku}-${r.channel_type}`} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-4 font-mono text-xs">{r.seller_sku}</td>
                  <td className="py-2 px-4 truncate max-w-[200px]" title={r.product_name ?? ''}>{r.product_name ?? '-'}</td>
                  <td className="py-2 px-4 text-center"><Badge type={r.channel_type} /></td>
                  <td className="py-2 px-4 text-right font-medium">{r.available_qty}</td>
                  <td className="py-2 px-4 text-right text-slate-500">{r.inbound_qty}</td>
                  <td className="py-2 px-4 text-right text-slate-500">{r.reserved_qty}</td>
                  <td className="py-2 px-4 text-right">{r.units_sold}</td>
                  <td className="py-2 px-4 text-right">¥{r.sales_amount_yen.toLocaleString()}</td>
                </tr>
              ))}
              {inventoryItems.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-slate-400">在庫データがありません</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 月別集計テーブル */}
      {tab === 'monthly' && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-3 px-4 text-left font-medium text-slate-600">月</th>
                <th className="py-3 px-4 text-right font-medium text-slate-600">注文数</th>
                <th className="py-3 px-4 text-right font-medium text-slate-600">販売数</th>
                <th className="py-3 px-4 text-right font-medium text-slate-600">売上</th>
                <th className="py-3 px-4 text-right font-medium text-slate-600">手数料</th>
                <th className="py-3 px-4 text-right font-medium text-slate-600">差引後</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRows.map((r) => (
                <tr key={r.month} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-4 font-medium">{r.month}</td>
                  <td className="py-2 px-4 text-right">{r.order_count}</td>
                  <td className="py-2 px-4 text-right">{r.units_sold}</td>
                  <td className="py-2 px-4 text-right">¥{r.sales_amount_yen.toLocaleString()}</td>
                  <td className="py-2 px-4 text-right text-rose-600">¥{Math.abs(r.fee_amount_yen).toLocaleString()}</td>
                  <td className="py-2 px-4 text-right text-emerald-600 font-medium">¥{r.sales_after_fee_yen.toLocaleString()}</td>
                </tr>
              ))}
              {monthlyRows.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-400">月別データがありません</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
