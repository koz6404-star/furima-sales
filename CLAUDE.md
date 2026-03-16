# CLAUDE.md — Claude Code プロジェクトガイド

このファイルは Claude Code が自動読み込みするプロジェクト概要です。

---

## プロジェクト概要

**Amazon + フリマ（メルカリ・ラクマ）の売上を一元管理する物販管理 Web アプリ。**
最終目標: AI による仕入れ判断の自動化。

- **フロントエンド**: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS
- **バックエンド**: Supabase (PostgreSQL + RLS + Storage)
- **外部連携**: Amazon SP-API（注文・財務・在庫）
- **デプロイ**: Vercel（main ブランチ自動デプロイ）

---

## 重要ドキュメント（必読）

| ファイル | 内容 |
|----------|------|
| `docs/00_PROJECT_STATE.md` | 現在の完了状況・アーキテクチャ・次のタスク |
| `docs/01_CURRENT_TASK.md` | 今の作業指示（正本） |
| `docs/02_CHANGELOG.md` | 変更履歴 |
| `docs/03_ISSUES.md` | 未解決論点 |
| `docs/TODO_提案リスト.md` | 優先順位付き TODO |

---

## ディレクトリ構成（主要部分）

```
src/
  app/              # Next.js App Router ページ
    page.tsx        # ホーム（ナビカード）
    dashboard/      # 月次ダッシュボード（売上・利益・ランキング）
    products/       # 商品一覧・登録・編集
    import/         # Excel取り込み
    export/         # CSV出力
    settings/       # プラットフォーム設定
    api/            # API ルート群
  components/       # 共通コンポーネント
  lib/
    amazon/         # Amazon SP-API 連携ライブラリ（コア）
    supabase/       # Supabase クライアント（server/client/service）
    amazon-sp-api.ts # SP-API クライアント初期化

scripts/            # CLI バッチスクリプト（tsx で実行）
supabase/migrations/ # DBマイグレーション SQL
docs/               # プロジェクトドキュメント
docs/archive/       # 完了済み旧ドキュメント（参照用）
```

---

## Amazon データパイプライン

```
[Amazon SP-API]
  ↓ npm run amazon-full-sync（全8ステップ）
  1. Orders raw       → amazon_orders_raw / amazon_order_items_raw
  2. sales_lines 整形 → amazon_sales_lines
  3. Finance raw      → amazon_finance_raw
  4. fee_events 整形  → amazon_fee_events
  5. FBA 在庫         → amazon_fba_inventory_raw
  6. inventory_current→ amazon_inventory_current（FBA）
  7. FBM 在庫         → amazon_fbm_inventory_current（Listings Items API）
  8. mart 構築        → amazon_sales_summary_daily/monthly/sku/asin
```

**個別実行コマンド**（`--user-id=<UUID>` 必須）:
```bash
npm run amazon-full-sync -- --user-id=<UUID>
npm run amazon-orders-raw-sync -- --user-id=<UUID>
npm run amazon-finance-raw-sync -- --user-id=<UUID>
npm run amazon-fba-inventory-raw-sync -- --user-id=<UUID>
npm run amazon-fbm-inventory-sync -- --user-id=<UUID>
npm run amazon-sales-lines-transform -- --user-id=<UUID>
npm run amazon-fee-events-transform -- --user-id=<UUID>
npm run amazon-inventory-current-transform -- --user-id=<UUID>
npm run amazon-build-sales-mart -- --user-id=<UUID>
```

---

## 主要 DB テーブル

| テーブル | 内容 |
|----------|------|
| `products` | 商品マスタ（SKU・原価・在庫数） |
| `sales` | フリマ売上履歴（手動入力） |
| `amazon_orders_raw` | Amazon 注文 raw |
| `amazon_order_items_raw` | Amazon 注文明細 raw |
| `amazon_sales_lines` | Amazon 売上明細（整形済） |
| `amazon_finance_raw` | Amazon 財務イベント raw |
| `amazon_fee_events` | Amazon 手数料（整形済） |
| `amazon_fba_inventory_raw` | FBA 在庫 raw |
| `amazon_inventory_current` | FBA 在庫 current（SKU 単位） |
| `amazon_fbm_inventory_current` | FBM 在庫 current（SKU 単位） |
| `amazon_sales_summary_*` | mart テーブル（日次・月次・SKU・ASIN） |

---

## 環境変数（.env.local）

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SELLING_PARTNER_APP_CLIENT_ID
SELLING_PARTNER_APP_CLIENT_SECRET
AMAZON_REFRESH_TOKEN
AMAZON_SELLER_ID        # FBM 在庫取得に必要
```

---

## Supabase リンク（プロジェクト ID: ewxzsftkxkqrvhjavrfd）

- SQL エディタ: https://supabase.com/dashboard/project/ewxzsftkxkqrvhjavrfd/sql/new
- テーブルエディタ: https://supabase.com/dashboard/project/ewxzsftkxkqrvhjavrfd/editor
- 認証ユーザー: https://supabase.com/dashboard/project/ewxzsftkxkqrvhjavrfd/auth/users

---

## コーディング規約

- **サービスロール**: バッチ/スクリプトは `createServiceRoleClient()` を使用
- **認証クライアント**: ページ/APIルートは `createClient()` を使用
- **upsert**: raw テーブルへの保存は常に `upsert`（再実行安全）
- **rate limit**: API 呼び出しは `delayBeforeMs` で間隔を守る
- **エラー**: エラーはスキップして続行し、`result.errors` に記録する

---

## 作業ルール

- 作業完了後は必ず `docs/00〜03` と `TODO_提案リスト.md` を更新する
- 説明は中学生でも分かるレベルで平易に
- 手順提示時は Supabase 等の直リンクを必ず添える
- 「本番反映」の指示があれば git commit → push まで自動実行する
