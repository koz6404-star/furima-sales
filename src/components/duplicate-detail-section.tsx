'use client';

import { useEffect, useState } from 'react';

type Group = {
  key: string;
  sold_at: string;
  orderId: string | null;
  records: Array<{ id: string; quantity: number; unit_price_yen: number; fee_yen: number }>;
  isDuplicate: boolean;
};

type DetailRes = {
  product: string;
  productId: string;
  records: Array<{ id: string; sold_at: string; quantity: number; unit_price_yen: number; amazon_order_id: string | null }>;
  groups: Group[];
  summary: { totalRecords: number; totalQuantity: number; dateCount: number; duplicateGroupCount: number };
};

export function DuplicateDetailSection({ productId }: { productId: string }) {
  const [data, setData] = useState<DetailRes | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/duplicate-detail?productId=${encodeURIComponent(productId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [productId]);

  if (loading) return <p className="text-sm text-slate-500">読み込み中…</p>;
  if (!data?.summary) return null;
  if (data.summary.duplicateGroupCount === 0) {
    return (
      <p className="text-sm text-slate-600">重複はありません（{data.summary.totalRecords}件の販売記録）</p>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mt-4">
      <h3 className="font-bold text-amber-900 mb-2">重複パターン詳細</h3>
      <p className="text-xs text-amber-800 mb-2">
        全{data.summary.totalRecords}件 / 重複グループ{data.summary.duplicateGroupCount}件（同日・同注文で複数レコード）
      </p>
      <div className="space-y-3">
        {data.groups
          .filter((g) => g.isDuplicate)
          .map((g, i) => (
            <div key={i} className="rounded border border-amber-300 bg-white p-2 text-sm">
              <p className="font-medium text-amber-900">
                {g.sold_at} 注文ID:{g.orderId || '(なし)'}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {g.records.map((r) => (
                  <li key={r.id}>
                    ID:{r.id.slice(0, 8)}… 個数{r.quantity} 単価¥{r.unit_price_yen.toLocaleString()} 手数料¥{r.fee_yen}
                  </li>
                ))}
              </ul>
              <p className="text-amber-700 text-xs mt-1">
                → 1件を残して他を削除するには、商品一覧の「重複チェック」→「重複の解消内容を確認」→「重複を削除して解消する」を実行
              </p>
            </div>
          ))}
      </div>
    </div>
  );
}
