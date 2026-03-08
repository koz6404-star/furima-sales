'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { calcTargetPriceForMargin } from '@/lib/calculations';
import { ProductDeleteButton } from './product-delete-button';
import { SetCreateModal } from './set-create-modal';
import { BulkShippingModal } from './bulk-shipping-modal';
import { StockAgeBadge } from './stock-age-badge';
import { LocationQuickTransfer } from './location-quick-transfer';

const SELECTION_STORAGE_KEY = 'products-set-selection';

function loadSelectedFromStorage(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(SELECTION_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSelectedToStorage(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    if (ids.size === 0) sessionStorage.removeItem(SELECTION_STORAGE_KEY);
    else sessionStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    //
  }
}

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
  platform?: string | null;
};

export function ProductsTableWithActions({
  products,
  locationStockMap = {},
  showStock = true,
  redirectAfterDelete = '/products',
  allowSetCreation = false,
  fromParam,
  returnTo,
}: {
  products: Product[];
  locationStockMap?: Record<string, { home: number; warehouse: number }>;
  showStock?: boolean;
  redirectAfterDelete?: '/products' | '/products/sold-out' | '/products/by-profit';
  allowSetCreation?: boolean;
  fromParam?: 'products' | 'sold-out' | 'by-profit';
  returnTo?: string;
}) {
  const from = fromParam ?? (redirectAfterDelete === '/products' ? 'products' : redirectAfterDelete === '/products/by-profit' ? 'by-profit' : 'sold-out');
  const detailQuery = returnTo ? `?from=${from}&returnTo=${encodeURIComponent(returnTo)}` : `?from=${from}`;
  const [selected, setSelected] = useState<Set<string>>(loadSelectedFromStorage);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showSetModal, setShowSetModal] = useState(false);
  const [modalProducts, setModalProducts] = useState<Product[] | null>(null);
  const [preparingSetModal, setPreparingSetModal] = useState(false);
  const [showBulkShippingModal, setShowBulkShippingModal] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveSelectedToStorage(next);
      return next;
    });
  };

  const toggleAll = () => {
    const currentIds = new Set(products.map((p) => p.id));
    const allCurrentSelected = [...currentIds].every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allCurrentSelected) {
        currentIds.forEach((id) => next.delete(id));
      } else {
        currentIds.forEach((id) => next.add(id));
      }
      saveSelectedToStorage(next);
      return next;
    });
  };

  const clearSelection = () => {
    setSelected(new Set());
    saveSelectedToStorage(new Set());
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
    clearSelection();
    router.refresh();
    if (failed > 0) {
      alert(`${ids.length - failed}件削除しましたが、${failed}件は失敗しました。`);
    }
  };

  const canCreateSet = allowSetCreation && selected.size >= 1;

  const openSetModal = async () => {
    if (selected.size < 1) return;
    setPreparingSetModal(true);
    const ids = Array.from(selected);
    const fromCurrent = products.filter((p) => selected.has(p.id));
    const missingIds = ids.filter((id) => !products.some((p) => p.id === id));
    let allProducts: Product[] = [...fromCurrent];
    if (missingIds.length > 0) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('products').select('id, name, sku, cost_yen, stock, image_url, campaign, size, color, stock_received_at, oldest_received_at, default_shipping_yen').in('id', missingIds).eq('user_id', user.id);
        if (data) allProducts = [...fromCurrent, ...data];
      }
    }
    allProducts = ids.map((id) => allProducts.find((p) => p.id === id)).filter((p): p is Product => !!p);
    setModalProducts(allProducts);
    setShowSetModal(true);
    setPreparingSetModal(false);
  };

  return (
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {selected.size > 0 && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">{selected.size}件選択中</span>
          {selected.size === 1 && allowSetCreation && (
            <span className="text-sm text-amber-700">同一商品を2個セットなどでセット出品できます</span>
          )}
          {canCreateSet && (
            <button
              type="button"
              onClick={openSetModal}
              disabled={preparingSetModal}
              className="rounded px-4 py-2.5 bg-emerald-600 text-white text-sm min-h-[44px] touch-manipulation hover:bg-emerald-700 disabled:opacity-50"
            >
              {preparingSetModal ? '読み込み中...' : 'セット出品'}
            </button>
          )}
          {showStock && (
            <button
              type="button"
              onClick={() => setShowBulkShippingModal(true)}
              className="rounded px-4 py-2.5 bg-slate-600 text-white text-sm min-h-[44px] touch-manipulation hover:bg-slate-700"
            >
              送料を一括変更
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
            onClick={clearSelection}
            className="text-slate-600 text-sm min-h-[44px] touch-manipulation flex items-center hover:underline"
          >
            選択をクリア
          </button>
        </div>
      )}
      {showBulkShippingModal && selected.size > 0 && (
        <BulkShippingModal
          productIds={Array.from(selected)}
          onClose={() => setShowBulkShippingModal(false)}
          onSuccess={() => {
            setShowBulkShippingModal(false);
            clearSelection();
            router.refresh();
          }}
        />
      )}
      {showSetModal && modalProducts && modalProducts.length >= 1 && (
        <SetCreateModal
          selectedProducts={modalProducts}
          onClose={() => {
            setShowSetModal(false);
            setModalProducts(null);
          }}
          onSuccess={() => {
            setShowSetModal(false);
            setModalProducts(null);
            clearSelection();
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
          const priceCutLoss = hasDefaultShipping ? calcTargetPriceForMargin(p.cost_yen, feeRatePercent, defaultShippingYen, defaultMaterialYen, 0) : 0;
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
                  <Link
                    href={`/products/${p.id}${detailQuery}`}
                    className="flex-shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 min-h-[44px] flex items-center justify-center touch-manipulation self-start"
                  >
                    詳細
                  </Link>
                  {p.image_url ? (
                    <div className="relative h-16 w-16 flex-shrink-0 rounded overflow-hidden">
                      <Image src={p.image_url} alt={p.name} fill className="object-cover" unoptimized />
                    </div>
                  ) : (
                    <div className="h-16 w-16 flex-shrink-0 bg-slate-200 rounded flex items-center justify-center text-slate-400 text-xs">画像なし</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 line-clamp-2 flex items-center gap-2 flex-wrap">
                      {p.name}
                      {p.platform === 'amazon' && (
                        <span className="inline-flex px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 text-xs">Amazon</span>
                      )}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {[p.campaign, p.size, p.color].filter(Boolean).join(' / ') || '-'}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-sm text-slate-600 items-center">
                      <StockAgeBadge oldestReceivedAt={p.oldest_received_at} stockReceivedAt={p.stock_received_at} stock={p.stock} variant="dot-only" />
                      {showStock && (
                        <>
                          {p.platform === 'amazon' ? (
                            <span>FBA在庫: {p.stock}</span>
                          ) : (
                            <>
                              <span className="inline-flex items-center gap-1">
                                家: {locationStockMap[p.id]?.home ?? '-'}
                                <LocationQuickTransfer
                                  productId={p.id}
                                  stockAtHome={locationStockMap[p.id]?.home ?? 0}
                                  stockAtWarehouse={locationStockMap[p.id]?.warehouse ?? 0}
                                />
                              </span>
                              <span>倉庫: {locationStockMap[p.id]?.warehouse ?? '-'}</span>
                              <span>在庫: {p.stock}</span>
                            </>
                          )}
                        </>
                      )}
                      <span>¥{p.cost_yen.toLocaleString()}</span>
                      {showStock && (
                        <>
                          <span className={!hasDefaultShipping ? 'text-slate-400' : ''}>{hasDefaultShipping ? `20%: ¥${price20.toLocaleString()}` : '—'}</span>
                          <span className={!hasDefaultShipping ? 'text-slate-400' : ''}>{hasDefaultShipping ? `30%: ¥${price30.toLocaleString()}` : '—'}</span>
                          <span className={!hasDefaultShipping ? 'text-slate-400' : 'text-amber-700'}>{hasDefaultShipping ? `損切: ¥${priceCutLoss.toLocaleString()}` : '—'}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
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
                  checked={products.length > 0 && products.every((p) => selected.has(p.id))}
                  onChange={toggleAll}
                  className="rounded border-2 border-slate-400 w-5 h-5 accent-emerald-600 cursor-pointer flex-shrink-0"
                  title="全選択"
                />
                <span className="text-sm font-semibold text-slate-700">選択</span>
              </label>
            </th>
            <th className="px-4 py-3 text-left text-sm font-semibold">詳細</th>
            <th className="px-4 py-3 text-left text-sm font-semibold">画像</th>
            <th className="px-4 py-3 text-left text-sm font-semibold">商品名</th>
            <th className="px-4 py-3 text-left text-sm font-semibold">企画/サイズ/色</th>
            <th className="px-2 py-3 text-center text-sm font-semibold w-10">状態</th>
            {showStock && (
              <>
                <th className="px-4 py-3 text-right text-sm font-semibold">家</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">倉庫</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">在庫</th>
              </>
            )}
            <th className="px-4 py-3 text-right text-sm font-semibold">原価</th>
            {showStock && (
              <>
                <th className="px-4 py-3 text-right text-sm font-semibold">20%価格</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">30%価格</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">損切り価格</th>
              </>
            )}
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {(!products || products.length === 0) && (
            <tr>
              <td
                colSpan={showStock ? 14 : 8}
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
            const priceCutLoss = hasDefaultShipping ? calcTargetPriceForMargin(p.cost_yen, feeRatePercent, defaultShippingYen, defaultMaterialYen, 0) : 0;
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
                  <Link
                    href={`/products/${p.id}${detailQuery}`}
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 min-h-[36px]"
                  >
                    詳細
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {p.image_url ? (
                    <div className="relative h-12 w-12">
                      <Image
                        src={p.image_url}
                        alt={p.name}
                        fill
                        className="object-cover rounded"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="h-12 w-12 bg-slate-200 rounded flex items-center justify-center text-slate-400 text-xs">
                      画像なし
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-medium">
                  <span className="inline-flex items-center gap-2 flex-wrap">
                    {p.name}
                    {p.platform === 'amazon' && (
                      <span className="inline-flex px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 text-xs">Amazon</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 text-sm">
                  {[p.campaign, p.size, p.color].filter(Boolean).join(' / ') || '-'}
                </td>
                <td className="px-2 py-3 w-10 text-center">
                  <StockAgeBadge oldestReceivedAt={p.oldest_received_at} stockReceivedAt={p.stock_received_at} stock={p.stock} variant="dot-only" />
                </td>
                {showStock && (
                  <>
                    {p.platform === 'amazon' ? (
                      <>
                        <td className="px-4 py-3 text-right text-slate-400">—</td>
                        <td className="px-4 py-3 text-right text-slate-400">—</td>
                        <td className="px-4 py-3 text-right text-slate-600">FBA: {p.stock}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-right text-slate-600">
                          <span className="inline-flex items-center justify-end gap-1">
                            {locationStockMap[p.id]?.home ?? '-'}
                            <LocationQuickTransfer
                              productId={p.id}
                              stockAtHome={locationStockMap[p.id]?.home ?? 0}
                              stockAtWarehouse={locationStockMap[p.id]?.warehouse ?? 0}
                            />
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">{locationStockMap[p.id]?.warehouse ?? '-'}</td>
                        <td className="px-4 py-3 text-right">{p.stock}</td>
                      </>
                    )}
                  </>
                )}
                <td className="px-4 py-3 text-right">¥{p.cost_yen.toLocaleString()}</td>
                {showStock && (
                  <>
                    <td className={`px-4 py-3 text-right ${!hasDefaultShipping ? 'text-slate-400' : ''}`}>{hasDefaultShipping ? `¥${price20.toLocaleString()}` : '—'}</td>
                    <td className={`px-4 py-3 text-right ${!hasDefaultShipping ? 'text-slate-400' : ''}`}>{hasDefaultShipping ? `¥${price30.toLocaleString()}` : '—'}</td>
                    <td className={`px-4 py-3 text-right ${!hasDefaultShipping ? 'text-slate-400' : 'text-amber-700 font-medium'}`}>{hasDefaultShipping ? `¥${priceCutLoss.toLocaleString()}` : '—'}</td>
                  </>
                )}
                <td className="px-3 sm:px-4 py-3">
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
