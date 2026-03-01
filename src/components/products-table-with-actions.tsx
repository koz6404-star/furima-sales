'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { calcTargetPriceForMargin, calcFee } from '@/lib/calculations';
import { ProductDeleteButton } from './product-delete-button';
import { SetCreateModal } from './set-create-modal';

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
  default_shipping_yen?: number | null;
};

export function ProductsTableWithActions({
  products,
  showStock = true,
  redirectAfterDelete = '/products',
  allowSetCreation = false,
}: {
  products: Product[];
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
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('user_id', user.id)
      .in('id', ids);
    setBulkDeleting(false);
    if (!error) {
      setSelected(new Set());
      router.refresh();
    } else {
      alert('削除に失敗しました: ' + error.message);
    }
  };

  const selectedProductObjects = products.filter((p) => selected.has(p.id));
  const canCreateSet = allowSetCreation && selectedProductObjects.length >= 2;

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {selected.size > 0 && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-4 flex-wrap">
          <span className="text-sm font-medium">{selected.size}件選択中</span>
          {selected.size === 1 && allowSetCreation && (
            <span className="text-sm text-amber-700">あと1件選択でセット出品できます</span>
          )}
          {canCreateSet && (
            <button
              type="button"
              onClick={() => setShowSetModal(true)}
              className="rounded px-3 py-1 bg-emerald-600 text-white text-sm hover:bg-emerald-700"
            >
              セット出品
            </button>
          )}
          <button
            type="button"
            onClick={bulkDelete}
            disabled={bulkDeleting}
            className="rounded px-3 py-1 bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50"
          >
            {bulkDeleting ? '削除中...' : '一括削除'}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-slate-600 text-sm hover:underline"
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
      <table className="w-full">
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
            <th className="px-4 py-3 text-left text-sm font-semibold">SKU</th>
            {showStock && (
              <th className="px-4 py-3 text-right text-sm font-semibold">在庫</th>
            )}
            <th className="px-4 py-3 text-right text-sm font-semibold">入荷日</th>
            <th className="px-4 py-3 text-right text-sm font-semibold">原価</th>
            {showStock && (
              <>
                <th className="px-4 py-3 text-right text-sm font-semibold">20%価格</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">30%価格</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">想定粗利(20%)</th>
              </>
            )}
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {(!products || products.length === 0) && (
            <tr>
              <td
                colSpan={showStock ? 12 : 8}
                className="px-4 py-8 text-center text-slate-500"
              >
                {showStock ? '在庫ありの商品がありません' : '完売商品がありません'}
              </td>
            </tr>
          )}
          {products?.map((p) => {
            const defaultShippingYen = p.default_shipping_yen ?? 210;
            const defaultMaterialYen = 0;
            const feeRatePercent = 10;
            const price20 = calcTargetPriceForMargin(p.cost_yen, feeRatePercent, defaultShippingYen, defaultMaterialYen, 20);
            const price30 = calcTargetPriceForMargin(p.cost_yen, feeRatePercent, defaultShippingYen, defaultMaterialYen, 30);
            const fee20 = calcFee(price20, feeRatePercent, 'floor');
            const gross20 = price20 - fee20 - defaultShippingYen - defaultMaterialYen - p.cost_yen;
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
                <td className="px-4 py-3 text-slate-600">{p.sku || '-'}</td>
                {showStock && (
                  <td className="px-4 py-3 text-right">{p.stock}</td>
                )}
                <td className="px-4 py-3 text-right text-slate-600">
                  {p.stock_received_at ? String(p.stock_received_at).slice(0, 10) : '-'}
                </td>
                <td className="px-4 py-3 text-right">¥{p.cost_yen.toLocaleString()}</td>
                {showStock && (
                  <>
                    <td className="px-4 py-3 text-right">¥{price20.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">¥{price30.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">¥{gross20.toLocaleString()}</td>
                  </>
                )}
                <td className="px-4 py-3 flex gap-2 items-center">
                  <Link
                    href={`/products/${p.id}`}
                    className="text-emerald-600 hover:underline text-sm"
                  >
                    {showStock ? '詳細' : '詳細・再入荷'}
                  </Link>
                  <ProductDeleteButton
                    productId={p.id}
                    productName={p.name}
                    redirectTo={redirectAfterDelete}
                    variant="ghost"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
