# Amazon統合実装サマリー（マイグレーション017）

## 実装内容

### 1. データベース変更
- `platform_type` に `'amazon'` を追加
- `products` テーブル: `platform`, `asin` 列を追加
- `sales` テーブル: `ad_spend_yen` 列を追加（広告費、Amazonのみ使用）

### 2. アプリ変更
- **商品詳細ページ**: platform=amazon の場合
  - 販売登録フォーム・保管場所移動・再入荷フォームを非表示
  - 送料セレクターを非表示
  - 在庫表示を「FBA在庫（API同期）」に変更
  - ASINバッジを表示
- **販売履歴**: 広告費列を追加（Amazon売上がある場合に表示）
- **SaleRowActions**: Amazon売上は編集・削除を非表示（「API同期」と表示）
- **商品一覧**: Amazon商品にバッジ表示、FBA在庫表示に対応

### 3. ロールバック方法
- **マイグレーションのみ戻す**: `supabase/migrations/ROLLBACK_017.md` のSQLを実行
- **アプリ変更を戻す**: 本コミットをrevert

### 4. マイグレーション実行手順
`APPLY_MIGRATION_017.md` を参照し、Supabase SQL Editorで実行してください。
スクリプト実行: `node scripts/run-migration-017.mjs`（SUPABASE_DB_URL要設定）

## 次のステップ
- SP-API アプリクライアント作成・認証
- Finances API / Inventory API の実装
- 定期同期ジョブの実装
