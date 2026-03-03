'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Option = { display_name: string; base_fee_yen: number };

export function BulkShippingModal({
  productIds,
  onClose,
  onSuccess,
}: {
  productIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [options, setOptions] = useState<Option[]>([]);
  const [selectedYen, setSelectedYen] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from('shipping_rates')
        .select('display_name, base_fee_yen')
        .eq('platform', 'mercari')
        .eq('is_custom', false)
        .order('base_fee_yen');
      setOptions(data ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const handleApply = async () => {
    const yen = selectedYen ? parseInt(selectedYen, 10) : null;
    setApplying(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setApplying(false);
      return;
    }
    const { error } = await supabase
      .from('products')
      .update({ default_shipping_yen: yen, updated_at: new Date().toISOString() })
      .in('id', productIds)
      .eq('user_id', user.id);
    setApplying(false);
    if (error) {
      alert('送料の一括変更に失敗しました: ' + error.message);
      return;
    }
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold mb-4">目安価格用送料を一括設定</h2>
        <p className="text-sm text-slate-600 mb-4">
          選択した{productIds.length}件の商品に同じ送料を設定します。
        </p>
        {loading ? (
          <p className="text-slate-500">読み込み中...</p>
        ) : (
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">送料</label>
            <select
              value={selectedYen}
              onChange={(e) => setSelectedYen(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2.5 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">未設定（210円で計算）</option>
              {options.map((s) => (
                <option key={`${s.display_name}-${s.base_fee_yen}`} value={s.base_fee_yen}>
                  {s.display_name} ¥{s.base_fee_yen}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleApply}
            disabled={loading || applying}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {applying ? '反映中...' : '反映する'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-4 py-2.5 text-slate-700 hover:bg-slate-50"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
