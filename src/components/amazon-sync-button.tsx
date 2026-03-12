'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type DupCheck = {
  totalAmazonSales?: number;
  duplicateOrderGroups?: number;
  duplicateOrderSamples?: Array<{ key: string; count: number; ids: string[] }>;
  productSummary?: Array<{ product_id: string; name: string; sale_count: number; record_count: number; duplicateOrderIds?: string[] }>;
  error?: string;
};

type ResolveResult = {
  dryRun?: boolean;
  wouldDeleteCount?: number;
  deletedCount?: number;
  groupsProcessed?: number;
  details?: Array<{ productName: string; sold_at: string; orderId: string | null; keep: { id: string; quantity: number }; remove: Array<{ id: string; quantity: number }> }>;
  error?: string;
};

type ResetResult = {
  ok?: boolean;
  dryRun?: boolean;
  wouldDeleteSales?: number;
  wouldResetProducts?: number;
  deletedSales?: number;
  resetProducts?: number;
  message?: string;
  error?: string;
};

export function AmazonSyncButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dupResult, setDupResult] = useState<DupCheck | null>(null);
  const [resolvePreview, setResolvePreview] = useState<ResolveResult | null>(null);
  const [resetPreview, setResetPreview] = useState<ResetResult | null>(null);
  const router = useRouter();

  async function handleSync(from?: string, inventoryOnly?: boolean, salesOnly?: boolean, to?: string) {
    setLoading(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {};
      if (from) body.from = from;
      if (to) body.to = to;
      if (inventoryOnly) body.inventoryOnly = true;
      if (salesOnly) body.salesOnly = true;
      const res = await fetch('/api/amazon-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : '{}',
      });
      const text = await res.text();
      let data: Record<string, unknown>;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(text || '同期に失敗しました（応答が不正です）');
      }
      if (!res.ok) throw new Error((data.error as string) || text || '同期に失敗しました');
      const inv = Number(data.inventoryUpdated ?? 0);
      const fbaSkus = Number(data.fbaSkusFound ?? 0);
      const fbaAsins = Number(data.fbaByAsinCount ?? 0);
      const invErr = data.inventoryError;
      const debug = data.debug as string | undefined;
      let msg = inventoryOnly
        ? `在庫更新: ${inv}件`
        : salesOnly
          ? `販売履歴: 取得${data.transactionsFound ?? 0}件、登録${data.synced ?? 0}件`
          : `取得: ${data.transactionsFound ?? 0}件、登録: ${data.synced ?? 0}件`;
      if (!inventoryOnly && inv > 0) msg += `、在庫更新: ${inv}件`;
      if (fbaSkus > 0 || fbaAsins > 0) msg += `（FBA: SKU ${fbaSkus}件、ASIN ${fbaAsins}件）`;
      if (invErr) msg += ` ※${invErr}`;
      if (debug) msg += ` ${debug}`;
      setMessage(msg);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  async function handleDupCheck() {
    setDupResult(null);
    setResolvePreview(null);
    try {
      const res = await fetch('/api/amazon-diagnostic');
      const data = await res.json();
      const dc = data.duplicateCheck as DupCheck | undefined;
      if (dc?.error) setDupResult({ error: dc.error });
      else if (dc) setDupResult(dc);
      else setDupResult({ error: '取得できませんでした' });
    } catch {
      setDupResult({ error: '通信エラー' });
    }
  }

  async function handleResolvePreview() {
    if (!dupResult?.duplicateOrderGroups || dupResult.duplicateOrderGroups === 0) return;
    setLoading(true);
    setResolvePreview(null);
    try {
      const res = await fetch('/api/resolve-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '取得に失敗しました');
      setResolvePreview(data);
    } catch (e) {
      setResolvePreview({ error: e instanceof Error ? e.message : 'エラー' });
    } finally {
      setLoading(false);
    }
  }

  async function handleResolveExecute() {
    setLoading(true);
    try {
      const res = await fetch('/api/resolve-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '実行に失敗しました');
      setResolvePreview(data);
      setMessage(`重複${data.deletedCount ?? 0}件を削除しました`);
      handleDupCheck();
      router.refresh();
    } catch (e) {
      setResolvePreview({ error: e instanceof Error ? e.message : 'エラー' });
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPreview() {
    setResetPreview(null);
    try {
      const res = await fetch('/api/reset-amazon-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '取得に失敗しました');
      setResetPreview(data);
    } catch (e) {
      setResetPreview({ error: e instanceof Error ? e.message : 'エラー' });
    }
  }

  async function handleResetExecute() {
    if (!confirm('本当にAmazonの販売履歴と在庫をすべて削除しますか？削除後は「初回取込」で再取り込みが必要です。')) return;
    setLoading(true);
    setResetPreview(null);
    try {
      const res = await fetch('/api/reset-amazon-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '実行に失敗しました');
      setResetPreview(data);
      setMessage(data.message ?? 'リセット完了');
      setDupResult(null);
      setResolvePreview(null);
      router.refresh();
    } catch (e) {
      setResetPreview({ error: e instanceof Error ? e.message : 'エラー' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => handleSync()}
        disabled={loading}
        className="rounded bg-orange-500 px-4 py-2 text-white font-medium hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
      >
        {loading ? '同期中…' : 'Amazon同期'}
      </button>
      <button
        type="button"
        onClick={() => handleSync('2025-02-01')}
        disabled={loading}
        className="rounded border border-orange-500 px-4 py-2 text-orange-600 font-medium hover:bg-orange-50 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
        title="2025年2月から初回取込（1回のみ実行）"
      >
        初回取込（2月～）
      </button>
      <button
        type="button"
        onClick={() => handleSync(undefined, true)}
        disabled={loading}
        className="rounded border border-emerald-500 px-4 py-2 text-emerald-600 font-medium hover:bg-emerald-50 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
        title="販売履歴は取得せず、FBA/FBM在庫のみ更新。時短・タイムアウト対策"
      >
        在庫のみ更新
      </button>
      <button
        type="button"
        onClick={() => handleSync('2025-02-01', false, true)}
        disabled={loading}
        className="rounded border border-sky-500 px-4 py-2 text-sky-600 font-medium hover:bg-sky-50 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
        title="販売履歴のみ取込（FBA/FBM両方）。在庫は更新しない。2月～今日まで"
      >
        販売履歴のみ取込（2月～）
      </button>
      <span className="text-slate-500 text-xs self-center">月別:</span>
      {[
        ['2月', '2025-02-01', '2025-02-28'],
        ['3月', '2025-03-01', '2025-03-31'],
        ['4月', '2025-04-01', '2025-04-30'],
        ['5月', '2025-05-01', '2025-05-31'],
        ['6月', '2025-06-01', '2025-06-30'],
        ['7月', '2025-07-01', '2025-07-31'],
        ['8月', '2025-08-01', '2025-08-31'],
        ['9月', '2025-09-01', '2025-09-30'],
        ['10月', '2025-10-01', '2025-10-31'],
        ['11月', '2025-11-01', '2025-11-30'],
        ['12月', '2025-12-01', '2025-12-31'],
      ].map(([label, from, to]) => (
        <button
          key={from}
          type="button"
          onClick={() => handleSync(from, false, true, to)}
          disabled={loading}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          title={`${label}の販売履歴のみ取込（FBA/FBM両方）`}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => handleSync('2025-09-01')}
        disabled={loading}
        className="rounded border border-slate-400 px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
        title="既存の販売履歴に手数料・送料を反映（9月～の取引を再取得）"
      >
        手数料・送料を再取得
      </button>
      <button
        type="button"
        onClick={handleDupCheck}
        disabled={loading}
        className="rounded border border-amber-500 px-4 py-2 text-amber-700 font-medium hover:bg-amber-50 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
        title="販売履歴の重複をチェック（同じ注文で複数件登録されていないか）"
      >
        重複チェック
      </button>
      <button
        type="button"
        onClick={handleResetPreview}
        disabled={loading}
        className="rounded border border-red-400 px-4 py-2 text-red-600 font-medium hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
        title="Amazonの販売履歴・在庫をすべて削除し、一から再取り込みできる状態にする"
      >
        Amazonデータをリセット
      </button>
      {message && <span className="text-sm text-slate-600">{message}</span>}
      {dupResult && (
        <div className="w-full mt-2 p-3 rounded border border-amber-200 bg-amber-50 text-sm">
          {dupResult.error ? (
            <p className="text-amber-800">{dupResult.error}</p>
          ) : (
            <>
              <p className="font-medium text-amber-900 mb-1">
                Amazon販売: {dupResult.totalAmazonSales ?? 0}件 / 重複疑いグループ: {dupResult.duplicateOrderGroups ?? 0}件
              </p>
              {dupResult.duplicateOrderGroups && dupResult.duplicateOrderGroups > 0 && (
                <>
                  <p className="text-amber-800 text-xs mb-1">
                    同じ注文・日付・商品で複数件あるケースがあります。1件を残して重複を削除できます。
                  </p>
                  <button
                    type="button"
                    onClick={handleResolvePreview}
                    disabled={loading}
                    className="mt-1 rounded bg-amber-600 px-3 py-1.5 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-60"
                  >
                    重複の解消内容を確認
                  </button>
                </>
              )}
              {dupResult.productSummary && dupResult.productSummary.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-amber-800">商品別件数（上位20件）</summary>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {dupResult.productSummary.map((p) => (
                      <li key={p.product_id}>
                        <Link href={`/products/${p.product_id}?dup=1`} className="text-emerald-700 hover:underline">
                          {p.name}
                        </Link>
                        : 販売数{p.sale_count}件 / レコード{p.record_count}件
                        {p.duplicateOrderIds && p.duplicateOrderIds.length > 0 && (
                          <span className="text-amber-600 ml-1">⚠重複</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
      {resolvePreview && !resolvePreview.error && (
        <div className="w-full mt-2 p-3 rounded border border-amber-300 bg-white text-sm">
          <p className="font-medium text-amber-900 mb-1">
            {resolvePreview.dryRun
              ? `削除予定: ${resolvePreview.wouldDeleteCount ?? 0}件（${resolvePreview.groupsProcessed ?? 0}グループ）`
              : `削除完了: ${resolvePreview.deletedCount ?? 0}件`}
          </p>
          {resolvePreview.details && resolvePreview.details.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-amber-800">詳細</summary>
              <ul className="mt-1 space-y-1 text-xs">
                {resolvePreview.details.map((d, i) => (
                  <li key={i}>
                    {d.productName} {d.sold_at}: 残す=個数{d.keep.quantity} / 削除={d.remove.map((r) => `個数${r.quantity}`).join(', ')}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {resolvePreview.dryRun && (resolvePreview.wouldDeleteCount ?? 0) > 0 && (
            <button
              type="button"
              onClick={handleResolveExecute}
              disabled={loading}
              className="mt-2 rounded bg-red-600 px-3 py-1.5 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-60"
            >
              重複を削除して解消する
            </button>
          )}
        </div>
      )}
      {resolvePreview?.error && (
        <p className="mt-2 text-sm text-red-600">{resolvePreview.error}</p>
      )}
      {resetPreview && !resetPreview.error && (
        <div className="w-full mt-2 p-3 rounded border border-red-200 bg-red-50 text-sm">
          <p className="font-medium text-red-900 mb-1">
            {resetPreview.dryRun
              ? `削除予定: 販売${resetPreview.wouldDeleteSales ?? 0}件、在庫リセット${resetPreview.wouldResetProducts ?? 0}件`
              : resetPreview.message}
          </p>
          {resetPreview.dryRun && ((resetPreview.wouldDeleteSales ?? 0) > 0 || (resetPreview.wouldResetProducts ?? 0) > 0) && (
            <>
              <p className="text-red-800 text-xs mb-2">実行後は「初回取込（2月～）」で再取り込みしてください。</p>
              <button
                type="button"
                onClick={handleResetExecute}
                disabled={loading}
                className="rounded bg-red-600 px-3 py-1.5 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-60"
              >
                リセットを実行する
              </button>
            </>
          )}
          {resetPreview.dryRun && (resetPreview.wouldDeleteSales ?? 0) === 0 && (resetPreview.wouldResetProducts ?? 0) === 0 && (
            <p className="text-red-700 text-xs">リセット対象のAmazonデータがありません。</p>
          )}
        </div>
      )}
      {resetPreview?.error && (
        <p className="mt-2 text-sm text-red-600">{resetPreview.error}</p>
      )}
    </div>
  );
}
