# 再設計 Phase5: 取得→整形の連鎖スクリプト

**完了日**: 2026年3月
**担当**: Claude Code

---

## 目的

Orders / Finance / FBA Inventory の取得から整形まで、1コマンドで全パイプラインを実行できるようにする。

---

## 変更ファイル一覧

| 種類 | パス |
|------|------|
| 新規: inventory_current 実行エントリ | `src/lib/amazon/run-inventory-current-transform.ts` |
| 新規: inventory_current CLI スクリプト | `scripts/amazon-inventory-current-transform.ts` |
| 新規: 全パイプライン連鎖スクリプト | `scripts/amazon-full-sync.ts` |
| 更新: npm scripts 追加 | `package.json` |

---

## 使い方

### 全パイプライン実行（推奨）

```bash
# 直近30日分を全ステップ実行
npm run amazon-full-sync -- --user-id=<UUID>

# 期間を指定して実行
npm run amazon-full-sync -- --user-id=<UUID> --from=2026-01-01 --to=2026-03-31

# 環境変数で指定
AMAZON_USER_ID=<UUID> npm run amazon-full-sync
```

### スキップオプション（一部だけ再実行したい場合）

```bash
# 取得はスキップ、整形のみ再実行
npm run amazon-full-sync -- --user-id=<UUID> --skip-orders --skip-finance --skip-inventory

# Orders のみスキップ
npm run amazon-full-sync -- --user-id=<UUID> --skip-orders
```

### 個別実行（トラブルシュート用）

```bash
npm run amazon-inventory-current-transform -- --user-id=<UUID>
```

---

## パイプライン全体像

```
npm run amazon-full-sync
  │
  ├─ 1/6 Orders raw 取得
  │     runOrdersRawSync → amazon_orders_raw / amazon_order_items_raw
  │
  ├─ 2/6 sales_lines 整形
  │     runSalesLinesTransform → amazon_sales_lines
  │
  ├─ 3/6 Finance raw 取得
  │     runFinanceRawSync → amazon_finance_raw
  │
  ├─ 4/6 fee_events 整形
  │     runFeeEventsTransform → amazon_fee_events
  │
  ├─ 5/6 FBA Inventory raw 取得
  │     runFbaInventoryRawSync → amazon_fba_inventory_raw
  │
  └─ 6/6 inventory_current 整形
        runInventoryCurrentTransform → amazon_inventory_current
```

- ステップ途中でエラーが起きても残りのステップは継続実行する
- 全ステップ終了後にエラーをまとめて報告する
- `--skip-*` で特定の取得ステップを飛ばせる

---

## 必要な環境変数（.env.local）

```
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SELLING_PARTNER_APP_CLIENT_ID
SELLING_PARTNER_APP_CLIENT_SECRET
AMAZON_REFRESH_TOKEN
```

---

## 全 npm script 一覧（再設計分）

| コマンド | 内容 |
|---------|------|
| `amazon-fee-events-transform` | fee_events 整形のみ |
| `amazon-sales-lines-transform` | sales_lines 整形のみ |
| `amazon-inventory-current-transform` | inventory_current 整形のみ |
| `amazon-orders-raw-sync` | Orders 取得のみ |
| `amazon-finance-raw-sync` | Finance 取得のみ |
| `amazon-fba-inventory-raw-sync` | FBA Inventory 取得のみ |
| `amazon-full-sync` | **全パイプライン（取得→整形）** |

---

## 次フェーズ

- **検証API・開発導線の運用画面からの分離**（UI クリーンアップ）
- **mart テーブル（amazon_sales_summary_*）の導入**
