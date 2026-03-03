'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RefreshButton() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const handleClick = () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={refreshing}
      className="rounded bg-slate-100 p-2 text-slate-600 hover:bg-slate-200 min-h-[40px] min-w-[40px] flex items-center justify-center disabled:opacity-60"
      aria-label="更新"
      title="最新のデータを取得"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={refreshing ? 'animate-spin' : ''}
      >
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
      </svg>
    </button>
  );
}
