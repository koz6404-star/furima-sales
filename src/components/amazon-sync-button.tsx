'use client';

/**
 * Amazon同期ボタン（再構築中）
 *
 * Phase 0 にて旧実装をリセットしました。
 * 旧コードは legacy/amazon_import_old/amazon-sync-button.backup.tsx に退避済み。
 *
 * Phase 1〜4 の実装完了後に、新しい同期UIに差し替えます。
 */
export function AmazonSyncButton() {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-wrap">
      <div className="rounded border border-amber-300 bg-amber-50 px-4 py-2 text-amber-800 text-sm">
        <span className="font-medium">Amazon連携は再構築中です。</span>
        <span className="ml-1">
          Phase 1（接続基盤）より順次実装します。認証情報は保持されています。
        </span>
      </div>
    </div>
  );
}
