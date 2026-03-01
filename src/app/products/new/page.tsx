'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Nav } from '@/components/nav';

export default function NewProductPage() {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [costYen, setCostYen] = useState('');
  const [stock, setStock] = useState('');
  const [campaign, setCampaign] = useState('');
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [memo, setMemo] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [stockReceivedAt, setStockReceivedAt] = useState('');
  const [defaultShippingYen, setDefaultShippingYen] = useState<string>('');
  const [shippingOptions, setShippingOptions] = useState<{ display_name: string; base_fee_yen: number }[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from('shipping_rates')
      .select('display_name, base_fee_yen')
      .eq('platform', 'mercari')
      .eq('is_custom', false)
      .order('base_fee_yen')
      .then(({ data }) => {
        if (data?.length) setShippingOptions(data);
      });
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const cost = parseInt(costYen, 10);
    const stockNum = parseInt(stock, 10);
    if (isNaN(cost) || cost < 0) {
      setError('原価は0以上の数値で入力してください');
      setLoading(false);
      return;
    }
    if (isNaN(stockNum) || stockNum < 0) {
      setError('在庫数は0以上の整数で入力してください');
      setLoading(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('ログインしてください');
      setLoading(false);
      return;
    }
    let imageUrl: string | null = null;
    if (imageFile) {
      const ext = imageFile.name.split('.').pop() || 'jpg';
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(path, imageFile, { upsert: true });
      if (uploadError) {
        setError('画像アップロードに失敗しました: ' + uploadError.message);
        setLoading(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
      imageUrl = urlData.publicUrl;
    }
    const { error } = await supabase.from('products').insert({
      user_id: user.id,
      name,
      sku: sku || null,
      cost_yen: cost,
      stock: stockNum,
      campaign: campaign || null,
      size: size || null,
      color: color || null,
      memo: memo || null,
      image_url: imageUrl,
      stock_received_at: stockReceivedAt.trim() || null,
      default_shipping_yen: defaultShippingYen ? parseInt(defaultShippingYen, 10) : null,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/products');
    router.refresh();
  };

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8 max-w-xl">
        <h1 className="text-2xl font-bold mb-6">商品登録（手動）</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">商品名 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">SKU（任意）</label>
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">原価（税込）*</label>
            <input
              type="number"
              value={costYen}
              onChange={(e) => setCostYen(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
              min={0}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">目安価格用送料（任意）</label>
            <p className="text-xs text-slate-500 mb-1">利益20%・30%目安価格の計算に使用。未選択時は210円（ネコポス相当）</p>
            <select
              value={defaultShippingYen}
              onChange={(e) => setDefaultShippingYen(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="">未設定（210円を使用）</option>
              {shippingOptions.map((s) => (
                <option key={`${s.display_name}-${s.base_fee_yen}`} value={s.base_fee_yen}>{s.display_name} ¥{s.base_fee_yen}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">入荷日（任意）</label>
            <input
              type="date"
              value={stockReceivedAt}
              onChange={(e) => setStockReceivedAt(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">在庫数 *</label>
            <input
              type="number"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
              min={0}
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">企画（任意）</label>
              <input
                type="text"
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">サイズ（任意）</label>
              <input
                type="text"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">色（任意）</label>
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">画像（任意）</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">メモ（任意）</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
              rows={3}
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-emerald-600 px-4 py-2 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? '登録中...' : '登録'}
            </button>
            <Link
              href="/products"
              className="rounded border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
            >
              キャンセル
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
