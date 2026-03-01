import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import Image from 'next/image';
import { Nav } from '@/components/nav';
import { calcTargetPriceForMargin, calcFee } from '@/lib/calculations';
import { SaleForm } from './sale-form';
import { RestockForm } from './restock-form';
import { ProductDeleteButton } from '@/components/product-delete-button';
import { DefaultShippingSelector } from './default-shipping-selector';
import { StockAgeBadge } from '@/components/stock-age-badge';

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!product) notFound();

  const { data: sales } = await supabase
    .from('sales')
    .select('*')
    .eq('product_id', id)
    .order('sold_at', { ascending: false })
    .limit(50);

  const { data: feeRates } = await supabase
    .from('fee_rates')
    .select('*')
    .or(`platform.eq.mercari,platform.eq.rakuma`);

  const { data: shippingRates } = await supabase
    .from('shipping_rates')
    .select('*')
    .or(`platform.eq.mercari,platform.eq.rakuma`);

  const { data: settings } = await supabase
    .from('app_settings')
    .select('*')
    .eq('user_id', user.id);

  let setComponents: { component_product_id: string; quantity_per_set: number }[] = [];
  let setComponentNames: { name: string; quantity_per_set: number }[] = [];
  const { data: setItems } = await supabase
    .from('product_set_items')
    .select('component_product_id, quantity_per_set')
    .eq('set_product_id', id);
  if (setItems?.length) {
    setComponents = setItems;
    const compIds = setItems.map((i) => i.component_product_id);
    const { data: comps } = await supabase
      .from('products')
      .select('id, name')
      .in('id', compIds);
    setComponentNames = setItems.map((i) => {
      const c = comps?.find((p) => p.id === i.component_product_id);
      return { name: c?.name || '(不明)', quantity_per_set: i.quantity_per_set };
    });
  }

  const nekoPos = shippingRates?.find((s) => s.platform === 'mercari' && (s.display_name || '').includes('ネコポス'));
  const defaultShippingYen = product.default_shipping_yen ?? nekoPos?.base_fee_yen ?? 210;
  const defaultMaterialYen = 0;
  const feeRatePercent = 10;
  const price20 = calcTargetPriceForMargin(product.cost_yen, feeRatePercent, defaultShippingYen, defaultMaterialYen, 20);
  const price30 = calcTargetPriceForMargin(product.cost_yen, feeRatePercent, defaultShippingYen, defaultMaterialYen, 30);
  const fee20 = calcFee(price20, feeRatePercent, 'floor');
  const fee30 = calcFee(price30, feeRatePercent, 'floor');
  const gross20 = price20 - fee20 - defaultShippingYen - defaultMaterialYen - product.cost_yen;
  const gross30 = price30 - fee30 - defaultShippingYen - defaultMaterialYen - product.cost_yen;

  const defaultMercariFee = feeRates?.find((f) => f.platform === 'mercari' && f.rate_percent === 10);
  const defaultRakumaFees = feeRates?.filter((f) => f.platform === 'rakuma') || [];

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href={product.stock > 0 ? '/products' : '/products/sold-out'} className="text-emerald-600 hover:underline mb-4 inline-block min-h-[44px] flex items-center touch-manipulation">
          ← 一覧に戻る
        </Link>
        <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
            <div className="flex-shrink-0 mx-auto sm:mx-0">
              {product.image_url ? (
                <div className="relative h-28 w-28 sm:h-32 sm:w-32">
                  <Image
                    src={product.image_url}
                    alt={product.name}
                    fill
                    className="object-cover rounded-lg"
                  />
                </div>
              ) : (
                <div className="h-28 w-28 sm:h-32 sm:w-32 bg-slate-200 rounded-lg flex items-center justify-center text-slate-400">
                  画像なし
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">{product.name}</h1>
                {(product.size || product.color) && (
                  <span className="text-slate-600 text-base font-normal">
                    {[product.size && `サイズ:${product.size}`, product.color && `色:${product.color}`].filter(Boolean).join('　')}
                  </span>
                )}
                <Link
                  href={`/products/${product.id}/edit`}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 min-h-[44px] touch-manipulation"
                >
                  編集
                </Link>
                <ProductDeleteButton
                  productId={product.id}
                  productName={product.name}
                  redirectTo={product.stock > 0 ? '/products' : '/products/sold-out'}
                  variant="icon"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 items-start">
                <StockAgeBadge
                  oldestReceivedAt={(product as { oldest_received_at?: string | null }).oldest_received_at}
                  stockReceivedAt={product.stock_received_at}
                  stock={product.stock}
                  variant="full"
                />
                {(product.sku || (product as { custom_sku?: string | null }).custom_sku || product.campaign) && (
                  <>
                  {product.sku && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-sm">
                      SKU: {product.sku}
                    </span>
                  )}
                  {(product as { custom_sku?: string | null }).custom_sku && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-sm">
                      管理番号: {(product as { custom_sku: string }).custom_sku}
                    </span>
                  )}
                  {product.campaign && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-sm">
                      企画: {product.campaign}
                    </span>
                  )}
                </>
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">原価（税込）</span>
                  <p className="font-semibold">¥{product.cost_yen.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-slate-500">在庫数</span>
                  <p className="font-semibold">{product.stock}</p>
                </div>
                {product.stock_received_at && (
                  <div>
                    <span className="text-slate-500">入荷日</span>
                    <p className="font-semibold">{String(product.stock_received_at).slice(0, 10)}</p>
                  </div>
                )}
                <div>
                  <span className="text-slate-500">利益20%目安価格</span>
                  <p className="font-semibold">¥{price20.toLocaleString()}</p>
                  <p className="text-slate-600 text-xs mt-0.5">原価¥{product.cost_yen.toLocaleString()} / 送料¥{defaultShippingYen.toLocaleString()} / 手数料¥{fee20.toLocaleString()} / 資材代¥{defaultMaterialYen.toLocaleString()} → 粗利¥{gross20.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-slate-500">利益30%目安価格</span>
                  <p className="font-semibold">¥{price30.toLocaleString()}</p>
                  <p className="text-slate-600 text-xs mt-0.5">原価¥{product.cost_yen.toLocaleString()} / 送料¥{defaultShippingYen.toLocaleString()} / 手数料¥{fee30.toLocaleString()} / 資材代¥{defaultMaterialYen.toLocaleString()} → 粗利¥{gross30.toLocaleString()}</p>
                </div>
              </div>
              <div className="mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200">
                <DefaultShippingSelector
                  productId={product.id}
                  currentYen={(product as { default_shipping_yen?: number }).default_shipping_yen ?? 0}
                  options={(shippingRates ?? []).filter((s) => s.platform === 'mercari' && !(s as { is_custom?: boolean }).is_custom).map((s) => ({ display_name: s.display_name, base_fee_yen: s.base_fee_yen }))}
                />
              </div>
              {setComponentNames.length > 0 && (
                <div className="mt-3 text-sm">
                  <span className="text-slate-500">セット構成: </span>
                  <span className="text-slate-700">
                    {setComponentNames.map((c) => `${c.name}×${c.quantity_per_set}`).join(' + ')}
                  </span>
                </div>
              )}
              {product.memo && (
                <p className="mt-4 text-slate-600 text-sm">メモ: {product.memo}</p>
              )}
            </div>
          </div>
        </div>

        {product.stock > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-6 mb-6">
            <h2 className="font-bold text-lg mb-4">販売登録</h2>
            <SaleForm
              productId={product.id}
              currentStock={product.stock}
              costYen={product.cost_yen}
              feeRates={feeRates || []}
              shippingRates={shippingRates || []}
              settings={settings || []}
            />
          </div>
        )}

        {product.stock === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-6 mb-6">
            <h2 className="font-bold text-lg mb-4">再入荷</h2>
            <RestockForm
              productId={product.id}
              setComponents={setComponents?.map((c) => ({ component_product_id: c.component_product_id, quantity_per_set: c.quantity_per_set })) || []}
            />
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="font-bold text-lg mb-4">販売履歴</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 text-left">販売日</th>
                  <th className="py-2 text-right">個数</th>
                  <th className="py-2 text-right">単価</th>
                  <th className="py-2 text-right">手数料</th>
                  <th className="py-2 text-right">送料</th>
                  <th className="py-2 text-right">粗利</th>
                </tr>
              </thead>
              <tbody>
                {(!sales || sales.length === 0) && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-500">
                      販売履歴がありません
                    </td>
                  </tr>
                )}
                {sales?.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-2">{s.sold_at}</td>
                    <td className="py-2 text-right">{s.quantity}</td>
                    <td className="py-2 text-right">¥{s.unit_price_yen.toLocaleString()}</td>
                    <td className="py-2 text-right">¥{s.fee_yen.toLocaleString()}</td>
                    <td className="py-2 text-right">¥{s.shipping_yen.toLocaleString()}</td>
                    <td className="py-2 text-right">¥{s.gross_profit_yen.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
