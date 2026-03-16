'use client';

import { useState } from 'react';

/**
 * Phase4 最終確認用ページ
 * ログイン状態で /amazon-sales/verify にアクセスし、実行ボタンで検証
 */
export default function AmazonSalesVerifyPage() {
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'GET' | 'POST'>('POST');

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/amazon-phase4-verify', { method: mode });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-bold">Phase4 最終確認</h1>
      <p className="text-sm text-slate-600">
        ログイン状態で検証APIを実行します。POST で再transform 2回 + 前後比較を行います。
      </p>
      <div className="flex gap-3">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as 'GET' | 'POST')}
          className="rounded border border-slate-300 px-3 py-1.5"
        >
          <option value="GET">GET（現状サマリーのみ）</option>
          <option value="POST">POST（再transform + 前後比較）</option>
        </select>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="rounded bg-slate-700 px-4 py-1.5 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? '実行中...' : '実行'}
        </button>
      </div>
      {result && (
        <pre className="rounded border border-slate-200 bg-slate-50 p-4 text-sm overflow-auto max-h-[60vh]">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
