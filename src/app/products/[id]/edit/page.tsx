'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Nav } from '@/components/nav';

export default function ProductEditPage() {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [campaign, setCampaign] = useState('');
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [memo, setMemo] = useState('');
  const [stockReceivedAt, setStockReceivedAt] = useState('');
  const [defaultShippingYen, setDefaultShippingYen] = useState<string>('');
  const [shippingOptions, setShippingOptions] = useState<{ display_name: string; base_fee_yen: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      const { data: shippingData } = await supabase
        .from('shipping_rates')
        .select('display_name, base_fee_yen')
        .eq('platform', 'mercari')
        .eq('is_custom', false)
        .order('base_fee_yen');
      if (shippingData?.length) setShippingOptions(shippingData);

      const { data, error: fetchError } = await supabase
        .from('products')
        .select('name, sku, campaign, size, color, memo, stock_received_at, default_shipping_yen')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();
      if (fetchError || !data) {
        setError('商品が見つかりません');
        setLoading(false);
        return;
      }
      setName(data.name);
      setSku(data.sku || '');
      setCampaign(data.campaign || '');
      setSize(data.size || '');
      setColor(data.color || '');
      setMemo(data.memo || '');
      setStockReceivedAt(data.stock_received_at ? String(data.stock_received_at).slice(0, 10) : '');
      setDefaultShippingYen(data.default_shipping_yen != null ? String(data.default_shipping_yen) : '');
      setLoading(false);
    })();
  }, [id, supabase, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('ログインしてください');
      setSaving(false);
      return;
    }
    const { error: updateError } = await supabase
      .from('products')
      .update({
        name: name.trim(),
        sku: sku.trim() || null,
        campaign: campaign.trim() || null,
        size: size.trim() || null,
        color: color.trim() || null,
        memo: memo.trim() || null,
        stock_received_at: stockReceivedAt.trim() || null,
        default_shipping_yen: defaultShippingYen ? parseInt(defaultShippingYen, 10) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.push(`/products/${id}`);
    router.refresh();
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Nav />
        <main className="container mx-auto px-4 py-8 max-w-xl">
          <p className="text-slate-600">読み込み中...</p>
        </main>
      </div>
    );
  }

  if (error && !name) {
    return (
      <div className="min-h-screen">
        <Nav />
        <main className="container mx-auto px-4 py-8 max-w-xl">
          <p className="text-red-600">{error}</p>
          <Link href="/products" className="text-emerald-600 hover:underline mt-4 inline-block">← 一覧に戻る</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="container mx-auto px-4 py-8 max-w-xl">
        <h1 className="text-2xl font-bold mb-6">商品を編集</h1>
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
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">企画</label>
              <input
                type="text"
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">サイズ</label>
              <input
                type="text"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">色</label>
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2"
              />
            </div>
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
            <label className="block text-sm font-medium text-slate-700 mb-1">メモ</label>
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
              disabled={saving}
              className="rounded bg-emerald-600 px-4 py-2 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <Link
              href={`/products/${id}`}
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
