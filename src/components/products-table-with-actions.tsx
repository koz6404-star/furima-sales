'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { calcTargetPriceForMargin } from '@/lib/calculations';
import { ProductDeleteButton } from './product-delete-button';
import { SetCreateModal } from './set-create-modal';
import { StockAgeBadge } from './stock-age-badge';

type Product = {
  id: string;
  name: string;
  sku: string | null;
  cost_yen: number;
  stock: number;
  image_url: string | null;
  campaign: string | null;
  size: string | null;
  color: string | null;
  stock_received_at?: string | null;
  oldest_received_at?: string | null;
  default_shipping_yen?: number | null;
};

export function ProductsTableWithActions({
  products,
  locationStockMap = {},
  showStock = true,
  redirectAfterDelete = '/products',
  allowSetCreation = false,
}: {
  products: Product[];
  locationStockMap?: Record<string, { home: number; warehouse: number }>;
  showStock?: boolean;
  redirectAfterDelete?: '/products' | '/products/sold-out';
  allowSetCreation?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showSetModal, setShowSetModal] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map((p) => p.id)));
    }
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`選択した${selected.size}件を削除しますか？`)) return;
    setBulkDeleting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setBulkDeleting(false);
      return;
    }
    const ids = Array.from(selected);
    let failed = 0;
    for (const id of ids) {
      const { error } = await supabase.rpc('delete_product_with_stock_restore', {
        p_product_id: id,
        p_user_id: user.id,
      });
      if (error) failed++;
    }
    setBulkDeleting(false);
    setSelected(new Set());
    router.refresh();
    if (failed > 0) {
      alert(`${ids.length - failed}件削除しましたが、${failed}件は失敗しました。`);
    }
  };

  const selectedProductObjects = products.filter((p) => selected.has(p.id));
  const canCreateSet = allowSetCreation && selectedProductObjects.length >= 2;

  return (
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {selected.size > 0 && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">{selected.size}件選択中</span>
          {selected.size === 1 && allowSetCreation && (
            <span className="text-sm text-amber-700">あと1件選択でセット出品できます</span>
          )}
          {canCreateSet && (
            <button
              type="button"
              onClick={() => setShowSetModal(true)}
              className="rounded px-4 py-2.5 bg-emerald-600 text-white text-sm min-h-[44px] touch-manipulation hover:bg-emerald-700"
            >
              セット出品
            </button>
          )}
          <button
            type="button"
            onClick={bulkDelete}
            disabled={bulkDeleting}
            className="rounded px-4 py-2.5 bg-red-600 text-white text-sm min-h-[44px] touch-manipulation hover:bg-red-700 disabled:opacity-50"
          >
            {bulkDeleting ? '削除中...' : '一括削除'}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-slate-600 text-sm min-h-[44px] touch-manipulation flex items-center hover:underline"
          >
            選択解除
          </button>
        </div>
      )}
      {showSetModal && canCreateSet && (
        <SetCreateModal
          selectedProducts={selectedProductObjects}
          onClose={() => setShowSetModal(false)}
          onSuccess={() => {
            setShowSetModal(false);
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}
      {/* スマホ・タブレット: カードレイアウト */}
      <div className="md:hidden divide-y divide-slate-200">
        {(!products || products.length === 0) && (
          <div className="px-4 py-8 text-center text-slate-500">
            {showStock ? '在庫ありの商品がありません' : '完売商品がありません'}
          </div>
        )}
        {products?.map((p) => {
          const hasDefaultShipping = p.default_shipping_yen != null;
          const defaultShippingYen = p.default_shipping_yen ?? 210;
          const defaultMaterialYen = 0;
          const feeRatePercent = 10;
          const price20 = hasDefaultShipping ? calcTargetPriceForMargin(p.cost_yen, feeRatePercent, defaultShippingYen, defaultMaterialYen, 20) : 0;
          const price30 = hasDefaultShipping ? calcTargetPriceForMargin(p.cost_yen, feeRatePercent, defaultShippingYen, defaultMaterialYen, 30) : 0;
          return (
            <div
              key={p.id}
              className="flex gap-3 p-4 items-start touch-manipulation active:bg-slate-50"
            >
              <label className="flex-shrink-0 pt-1 cursor-pointer select-none min-w-[44px] min-h-[44px] flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="rounded border-2 border-slate-400 w-5 h-5 accent-emerald-600"
                />
              </label>
              <div className="flex-1 min-w-0">
                <div className="flex gap-3">
                  {p.image_url ? (
                    <div className="relative h-16 w-16 flex-shrink-0 rounded overflow-hidden">
                      <Image src={p.image_url} alt={p.name} fill className="object-cover" />
                    </div>
                  ) : (
                    <div className="h-16 w-16 flex-shrink-0 bg-slate-200 rounded flex items-center justify-center text-slate-400 text-xs">画像なし</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 line-clamp-2">{p.name}</p>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {[p.campaign, p.size, p.color].filter(Boolean).join(' / ') || '-'}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-sm text-slate-600 items-center">
                      <StockAgeBadge oldestReceivedAt={p.oldest_received_at} stockReceivedAt={p.stock_received_at} stock={p.stock} variant="badge-only" />
                      {showStock && (
                        <>
                          <span>家: {locationStockMap[p.id]?.home ?? '-'}</span>
                          <span>倉庫: {locationStockMap[p.id]?.warehouse ?? '-'}</span>
                          <span>在庫: {p.stock}</span>
                        </>
                      )}
                      <span>{p.stock_received_at ? String(p.stock_received_at).slice(0, 10) : '-'}</span>
                      <span>¥{p.cost_yen.toLocaleString()}</span>
                      {showStock && (
                        <>
                          <span className={!hasDefaultShipping ? 'text-slate-400' : ''}>{hasDefaultShipping ? `20%: ¥${price20.toLocaleString()}` : '—'}</span>
                          <span className={!hasDefaultShipping ? 'text-slate-400' : ''}>{hasDefaultShipping ? `30%: ¥${price30.toLocaleString()}` : '—'}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Link
                    href={`/products/${p.id}`}
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 min-h-[44px] flex-1 touch-manipulation"
                  >
                    詳細
                  </Link>
                  <ProductDeleteButton
                    productId={p.id}
                    productName={p.name}
                    redirectTo={redirectAfterDelete}
                    variant="icon"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* デスクトップ: テーブルレイアウト */}
      <div className="hidden md:block overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 w-14 text-center bg-emerald-50 border-r border-emerald-100">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={products.length > 0 && selected.size === products.length}
                  onChange={toggleAll}
                  className="rounded border-2 border-slate-400 w-5 h-5 accent-emerald-600 cursor-pointer flex-shrink-0"
                  title="全選択"
                />
                <span className="text-sm font-semibold text-slate-700">選択</span>
              </label>
            </th>
            <th className="px-4 py-3 text-left text-sm font-semibold">画像</th>
            <th className="px-4 py-3 text-left text-sm font-semibold">商品名</th>
            <th className="px-4 py-3 text-left text-sm font-semibold">企画/サイズ/色</th>
            <th className="px-4 py-3 text-left text-sm font-semibold">状態</th>
            {showStock && (
              <>
                <th className="px-4 py-3 text-right text-sm font-semibold">家</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">倉庫</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">在庫</th>
              </>
            )}
            <th className="px-4 py-3 text-right text-sm font-semibold">入荷日</th>
            <th className="px-4 py-3 text-right text-sm font-semibold">原価</th>
            {showStock && (
              <>
                <th className="px-4 py-3 text-right text-sm font-semibold">20%価格</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">30%価格</th>
              </>
            )}
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {(!products || products.length === 0) && (
            <tr>
              <td
                colSpan={showStock ? 13 : 8}
                className="px-4 py-8 text-center text-slate-500"
              >
                {showStock ? '在庫ありの商品がありません' : '完売商品がありません'}
              </td>
            </tr>
          )}
          {products?.map((p) => {
            const hasDefaultShipping = p.default_shipping_yen != null;
            const defaultShippingYen = p.default_shipping_yen ?? 210;
            const defaultMaterialYen = 0;
            const feeRatePercent = 10;
            const price20 = hasDefaultShipping ? calcTargetPriceForMargin(p.cost_yen, feeRatePercent, defaultShippingYen, defaultMaterialYen, 20) : 0;
            const price30 = hasDefaultShipping ? calcTargetPriceForMargin(p.cost_yen, feeRatePercent, defaultShippingYen, defaultMaterialYen, 30) : 0;
            return (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 w-14 min-w-[3.5rem] text-center bg-emerald-50/50 border-r border-emerald-100/50 align-middle p-0">
                  <label className="flex items-center justify-center cursor-pointer w-full min-h-[3rem] hover:bg-emerald-100/50 py-3 select-none">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      className="rounded border-2 border-slate-400 w-5 h-5 accent-emerald-600 cursor-pointer flex-shrink-0"
                      title={`${p.name}を選択`}
                    />
                  </label>
                </td>
                <td className="px-4 py-3">
                  {p.image_url ? (
                    <div className="relative h-12 w-12">
                      <Image
                        src={p.image_url}
                        alt={p.name}
                        fill
                        className="object-cover rounded"
                      />
                    </div>
                  ) : (
                    <div className="h-12 w-12 bg-slate-200 rounded flex items-center justify-center text-slate-400 text-xs">
                      画像なし
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-slate-600 text-sm">
                  {[p.campaign, p.size, p.color].filter(Boolean).join(' / ') || '-'}
                </td>
                <td className="px-4 py-3 min-w-[6rem]">
                  <StockAgeBadge oldestReceivedAt={p.oldest_received_at} stockReceivedAt={p.stock_received_at} stock={p.stock} variant="badge-only" />
                </td>
                {showStock && (
                  <>
                    <td className="px-4 py-3 text-right text-slate-600">{locationStockMap[p.id]?.home ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{locationStockMap[p.id]?.warehouse ?? '-'}</td>
                    <td className="px-4 py-3 text-right">{p.stock}</td>
                  </>
                )}
                <td className="px-4 py-3 text-right text-slate-600">
                  {p.stock_received_at ? String(p.stock_received_at).slice(0, 10) : '-'}
                </td>
                <td className="px-4 py-3 text-right">¥{p.cost_yen.toLocaleString()}</td>
                {showStock && (
                  <>
                    <td className={`px-4 py-3 text-right ${!hasDefaultShipping ? 'text-slate-400' : ''}`}>{hasDefaultShipping ? `¥${price20.toLocaleString()}` : '—'}</td>
                    <td className={`px-4 py-3 text-right ${!hasDefaultShipping ? 'text-slate-400' : ''}`}>{hasDefaultShipping ? `¥${price30.toLocaleString()}` : '—'}</td>
                  </>
                )}
                <td className="px-3 sm:px-4 py-3 flex gap-2 items-center">
                  <Link
                    href={`/products/${p.id}`}
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 min-h-[44px] min-w-[4.5rem] touch-manipulation"
                  >
                    {showStock ? '詳細' : '詳細'}
                  </Link>
                  <ProductDeleteButton
                    productId={p.id}
                    productName={p.name}
                    redirectTo={redirectAfterDelete}
                    variant="icon"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
