'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * ページが前面に戻った時（タブ切替・デバイス切替後）に自動でデータを再取得する。
 * マルチデバイス利用時に他端末での変更を反映させる。
 */
export function RefreshOnFocus() {
  const router = useRouter();

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        router.refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [router]);

  return null;
}
