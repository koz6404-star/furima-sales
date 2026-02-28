'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

type FeeRate = { id: string; platform: string; display_name: string; rate_percent: number; rakuma_rank: number | null };
type Setting = { id?: string; platform: string; fee_rate_id: string | null; rounding: string; include_material_in_shipping: boolean; rakuma_manual_rank: number | null };

export function SettingsForm({
  userId,
  feeRates,
  shippingRates,
  settings,
}: {
  userId: string;
  feeRates: FeeRate[];
  shippingRates: unknown[];
  settings: Setting[];
}) {
  const [mercariFeeId, setMercariFeeId] = useState('');
  const [rakumaRank, setRakumaRank] = useState(1);
  const [rounding, setRounding] = useState<'floor' | 'ceil' | 'round'>('floor');
  const [includeMaterial, setIncludeMaterial] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const mercariRates = feeRates.filter((f) => f.platform === 'mercari');
  const rakumaRates = feeRates.filter((f) => f.platform === 'rakuma').sort((a, b) => (b.rakuma_rank ?? 0) - (a.rakuma_rank ?? 0));

  useEffect(() => {
    const m = settings.find((s) => s.platform === 'mercari');
    const r = settings.find((s) => s.platform === 'rakuma');
    const mercari = feeRates.filter((f) => f.platform === 'mercari');
    if (m) setMercariFeeId(m.fee_rate_id || '');
    else if (mercari[0]) setMercariFeeId(mercari[0].id);
    if (r) setRakumaRank(r.rakuma_manual_rank ?? 1);
    if (m) setRounding((m.rounding as 'floor' | 'ceil' | 'round') || 'floor');
    if (m) setIncludeMaterial(m.include_material_in_shipping ?? false);
  }, [settings, feeRates]);

  const handleSave = async () => {
    setLoading(true);
    setSaved(false);
    for (const platform of ['mercari', 'rakuma']) {
      const feeRateId = platform === 'mercari' ? mercariFeeId : rakumaRates.find((f) => f.rakuma_rank === rakumaRank)?.id || null;
      await supabase.from('app_settings').upsert(
        {
          user_id: userId,
          platform,
          fee_rate_id: feeRateId,
          rounding,
          include_material_in_shipping: includeMaterial,
          rakuma_manual_rank: platform === 'rakuma' ? rakumaRank : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,platform' }
      );
    }
    setLoading(false);
    setSaved(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">メルカリ手数料</label>
        <select
          value={mercariFeeId}
          onChange={(e) => setMercariFeeId(e.target.value)}
          className="w-full rounded border px-3 py-2"
        >
          {mercariRates.map((f) => (
            <option key={f.id} value={f.id}>{f.display_name} ({f.rate_percent}%)</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">ラクマ手数料ランク（手動選択）</label>
        <select
          value={rakumaRank}
          onChange={(e) => setRakumaRank(parseInt(e.target.value, 10))}
          className="w-full rounded border px-3 py-2"
        >
          {rakumaRates.map((f) => (
            <option key={f.id} value={f.rakuma_rank ?? 1}>
              {f.display_name} ({f.rate_percent}%)
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500 mt-1">当月のランクを手動で選択</p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">端数処理</label>
        <select
          value={rounding}
          onChange={(e) => setRounding(e.target.value as 'floor' | 'ceil' | 'round')}
          className="w-full rounded border px-3 py-2"
        >
          <option value="floor">切り捨て</option>
          <option value="ceil">切り上げ</option>
          <option value="round">四捨五入</option>
        </select>
      </div>
      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeMaterial}
            onChange={(e) => setIncludeMaterial(e.target.checked)}
          />
          <span className="text-sm">送料に資材代を含める（MVPでは未使用）</span>
        </label>
      </div>
      <button
        onClick={handleSave}
        disabled={loading}
        className="rounded bg-emerald-600 px-4 py-2 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        {loading ? '保存中...' : '保存'}
      </button>
      {saved && <p className="text-emerald-600 text-sm">保存しました</p>}
    </div>
  );
}
