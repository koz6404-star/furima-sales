# 再設計 Phase4: Orders / Finances / FBA 取得のアプリ外実行化

**完了日**: 2026年3月
**担当**: Claude Code

---

## 目的

Orders / Finances / FBA Inventory の raw 取得処理を、アプリ内 API + ボタン押下に依存せず、
スクリプトから CLI 実行できるようにする。

---

## 変更ファイル一覧

| 種類 | パス |
|------|------|
| 新規: Orders 実行エントリ | `src/lib/amazon/run-orders-raw-sync.ts` |
| 新規: Finance 実行エントリ | `src/lib/amazon/run-finance-raw-sync.ts` |
| 新規: FBA Inventory 実行エントリ | `src/lib/amazon/run-fba-inventory-raw-sync.ts` |
| 新規: Orders CLI スクリプト | `scripts/amazon-orders-raw-sync.ts` |
| 新規: Finance CLI スクリプト | `scripts/amazon-finance-raw-sync.ts` |
| 新規: FBA Inventory CLI スクリプト | `scripts/amazon-fba-inventory-raw-sync.ts` |
| 更新: npm scripts 追加 | `package.json` |

---

## 使い方

### Orders 取得（直近30日がデフォルト）

```bash
npm run amazon-orders-raw-sync -- --user-id=<UUID>
npm run amazon-orders-raw-sync -- --user-id=<UUID> --from=2026-01-01 --to=2026-03-31
AMAZON_USER_ID=<UUID> npm run amazon-orders-raw-sync
```

### Finance 取得（直近90日固定）

```bash
npm run amazon-finance-raw-sync -- --user-id=<UUID>
AMAZON_USER_ID=<UUID> npm run amazon-finance-raw-sync
```

### FBA Inventory 取得（全量スナップショット）

```bash
npm run amazon-fba-inventory-raw-sync -- --user-id=<UUID>
AMAZON_USER_ID=<UUID> npm run amazon-fba-inventory-raw-sync
```

### 必要な環境変数（.env.local）

```
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SELLING_PARTNER_APP_CLIENT_ID
SELLING_PARTNER_APP_CLIENT_SECRET
AMAZON_REFRESH_TOKEN
```

---

## アーキテクチャ

```
scripts/amazon-orders-raw-sync.ts
  └─ src/lib/amazon/run-orders-raw-sync.ts      ← 新規（薄いラッパー）
       └─ src/lib/amazon/orders-raw-sync.ts     ← 既存（変更なし）
            └─ Supabase: amazon_orders_raw / amazon_order_items_raw

scripts/amazon-finance-raw-sync.ts
  └─ src/lib/amazon/run-finance-raw-sync.ts     ← 新規（薄いラッパー）
       └─ src/lib/amazon/finance-raw-sync.ts    ← 既存（変更なし）
            └─ Supabase: amazon_finance_raw

scripts/amazon-fba-inventory-raw-sync.ts
  └─ src/lib/amazon/run-fba-inventory-raw-sync.ts  ← 新規（薄いラッパー）
       └─ src/lib/amazon/fba-inventory-raw-sync.ts ← 既存（変更なし）
            └─ Supabase: amazon_fba_inventory_raw
```

既存 API ルートは薄いラッパーとして維持。取得ボタンも現状通り動作する。

---

## Phase2〜4 パターン対比

| Phase | 対象 | run-*.ts | script | npm コマンド |
|-------|------|----------|--------|-------------|
| Phase2 | fee_events 整形 | `run-fee-events-transform` | ✓ | `amazon-fee-events-transform` |
| Phase3 | sales_lines 整形 | `run-sales-lines-transform` | ✓ | `amazon-sales-lines-transform` |
| Phase4 | Orders 取得 | `run-orders-raw-sync` | ✓ | `amazon-orders-raw-sync` |
| Phase4 | Finance 取得 | `run-finance-raw-sync` | ✓ | `amazon-finance-raw-sync` |
| Phase4 | FBA Inventory 取得 | `run-fba-inventory-raw-sync` | ✓ | `amazon-fba-inventory-raw-sync` |

---

## 次フェーズ

- **取得→整形の連鎖スクリプト**: Orders sync → sales_lines transform を1コマンドで実行
- **検証API・開発導線の運用画面からの分離**
- **mart テーブル（amazon_sales_summary_*）の導入検討**
