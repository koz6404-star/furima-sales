'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Option = { display_name: string; base_fee_yen: number };

export function DefaultShippingSelector({
  productId,
  currentYen,
  options,
}: {
  productId: string;
  currentYen: number;
  options: Option[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const yen = val ? parseInt(val, 10) : null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('products')
      .update({ default_shipping_yen: yen })
      .eq('id', productId)
      .eq('user_id', user.id);
    router.refresh();
  };

  return (
    <div>
      <label className="block text-sm font-medium text-amber-800 mb-2">目安価格用送料を設定</label>
      <p className="text-xs text-amber-700 mb-2">選択すると自動保存され、上記の目安価格・一覧に反映されます</p>
      <select
        value={currentYen || ''}
        onChange={handleChange}
        className="rounded border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">未設定（210円）</option>
        {options.map((s) => (
          <option key={`${s.display_name}-${s.base_fee_yen}`} value={s.base_fee_yen}>
            {s.display_name} ¥{s.base_fee_yen}
          </option>
        ))}
      </select>
    </div>
  );
}
