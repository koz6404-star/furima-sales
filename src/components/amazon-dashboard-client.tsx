'use client';

import { useEffect, useState, useRef } from 'react';

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

/** 原価インライン編集セル */
function CostCell({
  sku,
  costYen,
  onSave,
}: {
  sku: string;
  costYen: number | undefined;
  onSave: (sku: string, value: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setValue(costYen != null ? String(costYen) : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function commit() {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(sku, num);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        disabled={saving}
        className="w-20 px-1 py-0.5 text-right text-sm border border-emerald-400 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className="text-right w-full hover:bg-emerald-50 rounded px-1 py-0.5 transition-colors"
      title="クリックして原価を入力"
    >
      {costYen != null ? (
        <span>¥{costYen.toLocaleString()}</span>
      ) : (
        <span className="text-slate-300">---</span>
      )}
    </button>
  );
}

export function AmazonDashboardClient() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [inventory, setInventory] = useState<InventoryData | null>(null);
  const [costMap, setCostMap] = useState<Record<string, { cost_yen: number; shipping_yen: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'sku' | 'inventory' | 'monthly'>('sku');

  useEffect(() => {
    async function load() {
      try {
        const [sumRes, invRes, costRes] = await Promise.all([
          fetch('/api/amazon-sales-summary'),
          fetch('/api/amazon-inventory-unified'),
          fetch('/api/amazon-sku-cost'),
        ]);
        if (!sumRes.ok) throw new Error(`売上API: ${sumRes.status}`);
        if (!invRes.ok) throw new Error(`在庫API: ${invRes.status}`);
        const sumData = await sumRes.json();
        const invData = await invRes.json();
        setSummary(sumData);
        setInventory(invData);
        if (costRes.ok) {
          const costData = await costRes.json();
          setCostMap(costData.costs ?? {});
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function saveCost(sku: string, field: 'cost_yen' | 'shipping_yen', value: number) {
    const res = await fetch('/api/amazon-sku-cost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku, [field]: value }),
    });
    if (!res.ok) throw new Error('保存に失敗しました');
    setCostMap((prev) => {
      const existing = prev[sku] ?? { cost_yen: 0, shipping_yen: 0 };
      return { ...prev, [sku]: { ...existing, [field]: value } };
    });
  }

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

  // 原価が入力されている SKU の利益合計
  let totalProfit: number | null = null;
  let costEnteredCount = 0;
  for (const r of skuRows) {
    const entry = costMap[r.sku];
    if (entry && entry.cost_yen > 0) {
      const unitCost = entry.cost_yen + (entry.shipping_yen ?? 0);
      const profit = r.sales_after_fee_yen - unitCost * r.units_sold;
      totalProfit = (totalProfit ?? 0) + profit;
      costEnteredCount++;
    }
  }

  return (
    <div>
      {/* サマリーカード */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-6">
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
          <h3 className="text-sm font-medium text-slate-500">粗利合計<span className="text-xs font-normal ml-1">（原価入力済のみ）</span></h3>
          <p className={`text-2xl font-bold mt-2 ${totalProfit != null && totalProfit >= 0 ? 'text-emerald-600' : totalProfit != null ? 'text-rose-600' : 'text-slate-300'}`}>
            {totalProfit != null ? `¥${totalProfit.toLocaleString()}` : '---'}
          </p>
          {costEnteredCount > 0 && (
            <p className="text-xs text-slate-400 mt-1">{costEnteredCount}/{skuRows.length} SKU</p>
          )}
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
                <th className="py-3 px-3 text-right font-medium text-slate-600">原価<span className="text-xs font-normal block text-slate-400">クリックで入力</span></th>
                <th className="py-3 px-3 text-right font-medium text-slate-600">送料<span className="text-xs font-normal block text-slate-400">FBM用</span></th>
                <th className="py-3 px-4 text-right font-medium text-slate-600">粗利</th>
                <th className="py-3 px-4 text-right font-medium text-slate-600">在庫</th>
              </tr>
            </thead>
            <tbody>
              {skuRows.map((r) => {
                const entry = costMap[r.sku];
                const costYen = entry?.cost_yen;
                const shippingYen = entry?.shipping_yen ?? 0;
                const hasCost = costYen != null && costYen > 0;
                const unitCost = (costYen ?? 0) + shippingYen;
                const profit = hasCost ? r.sales_after_fee_yen - unitCost * r.units_sold : null;
                const isFbm = r.fulfillment_type === 'FBM' || r.fulfillment_type === 'MIXED';
                return (
                  <tr key={r.sku} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-4 font-mono text-xs">{r.sku}</td>
                    <td className="py-2 px-4 truncate max-w-[200px]" title={r.product_name ?? ''}>{r.product_name ?? '-'}</td>
                    <td className="py-2 px-4 text-center"><Badge type={r.fulfillment_type} /></td>
                    <td className="py-2 px-4 text-right">{r.units_sold}</td>
                    <td className="py-2 px-4 text-right">¥{r.sales_amount_yen.toLocaleString()}</td>
                    <td className="py-2 px-4 text-right text-rose-600">¥{Math.abs(r.fee_amount_yen).toLocaleString()}</td>
                    <td className="py-2 px-4 text-right text-emerald-600 font-medium">¥{r.sales_after_fee_yen.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right">
                      <CostCell sku={r.sku} costYen={costYen} onSave={(sku, val) => saveCost(sku, 'cost_yen', val)} />
                    </td>
                    <td className="py-2 px-3 text-right">
                      {isFbm ? (
                        <CostCell sku={r.sku} costYen={shippingYen || undefined} onSave={(sku, val) => saveCost(sku, 'shipping_yen', val)} />
                      ) : (
                        <span className="text-slate-300 text-xs">FBA</span>
                      )}
                    </td>
                    <td className={`py-2 px-4 text-right font-medium ${profit != null && profit >= 0 ? 'text-emerald-600' : profit != null ? 'text-rose-600' : 'text-slate-300'}`}>
                      {profit != null ? `¥${profit.toLocaleString()}` : '---'}
                    </td>
                    <td className="py-2 px-4 text-right font-medium">{r.current_inventory != null ? r.current_inventory : '-'}</td>
                  </tr>
                );
              })}
              {skuRows.length === 0 && (
                <tr><td colSpan={11} className="py-8 text-center text-slate-400">SKU データがありません</td></tr>
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
