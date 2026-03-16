# Amazon取り込み 旧実装（退避）

Phase 0（2025-03-14）にて、Amazon商品取り込み機能をリセットするため、旧コードをここに退避しました。

## 退避ファイル一覧

| ファイル | 元の場所 | 備考 |
|----------|----------|------|
| amazon-sync-route.backup.ts | src/app/api/amazon-sync/route.ts | Finances API による売上・在庫同期（666行） |
| resolve-duplicates-route.backup.ts | src/app/api/resolve-duplicates/route.ts | 重複売上解消API |
| duplicate-detail-route.backup.ts | src/app/api/duplicate-detail/route.ts | 重複詳細取得API |
| reset-amazon-data-route.backup.ts | src/app/api/reset-amazon-data/route.ts | AmazonデータリセットAPI |
| amazon-sync-button.backup.tsx | src/components/amazon-sync-button.tsx | 同期・重複チェック・リセットUI |

## 参照時の注意

- これらのファイルは **Next.js のルーティング対象外** です。実行するには元のパスに戻す必要があります。
- 新実装（Orders API raw → amazon_sales_lines）と設計が異なります。
- 認証情報（.env.local）は削除していません。Phase 1 で再利用します。

## 新実装の進め方

`docs/AMAZON_PHASE0_REPORT.md` および指示書の Phase 1〜4 を参照してください。
