# Phase14: FBM 在庫取得 実装概要

**実装日**: 2026-03-16

---

## 目的

FBM（自己発送）商品の出品在庫数を Amazon Listings Items API から取得し、`amazon_fbm_inventory_current` テーブルに保存する。

FBA 在庫（`amazon_inventory_current`）は Amazon 倉庫の在庫を管理しているが、FBM 在庫は Amazon が把握しないため別 API が必要。

---

## 使用 API

**Listings Items API**
- `GET /listings/2021-08-01/items/{sellerId}/{sku}`
- 取得データ: `summaries`（ASIN・商品名・出品ステータス）、`fulfillmentAvailability`（在庫数）
- `fulfillmentChannelCode = "DEFAULT"` のものが FBM（自己発送）在庫数
- Rate limit: 5 req/sec → 210ms 間隔

---

## 処理フロー

```
amazon_sales_lines（fulfillment_type='FBM'）
  → FBM SKU 一覧取得（DB から）
  → 各 SKU に Listings Items API 呼び出し
  → amazon_fbm_inventory_current に upsert
```

---

## 新規ファイル

| ファイル | 役割 |
|----------|------|
| `supabase/migrations/029_amazon_fbm_inventory_current.sql` | テーブル・RLS 定義 |
| `src/lib/amazon/fbm-listings.ts` | Listings Items API ラッパー |
| `src/lib/amazon/fbm-inventory-sync.ts` | 同期ロジック本体 |
| `src/lib/amazon/run-fbm-inventory-sync.ts` | サービスラッパー（CLI 用） |
| `scripts/amazon-fbm-inventory-sync.ts` | CLI スクリプト |
| `src/app/api/amazon-fbm-inventory-sync/route.ts` | API ルート |

---

## 更新ファイル

| ファイル | 変更内容 |
|----------|----------|
| `package.json` | `amazon-fbm-inventory-sync` スクリプト追加 |
| `scripts/amazon-full-sync.ts` | ステップ 7/8 として FBM 在庫取得を追加。`--skip-fbm` オプション追加 |

---

## 必要な環境変数（新規追加）

```
AMAZON_SELLER_ID=Axxxxxxxxxxxxxxxxx
```

Amazon セラーセントラルの「アカウント情報」から確認できる。
`AMAZON_SELLER_ID` が未設定の場合、full-sync は FBM ステップを自動スキップする。

---

## 実行方法

```bash
# 単体実行
npm run amazon-fbm-inventory-sync -- --user-id=<UUID>

# full-sync に含めて実行（AMAZON_SELLER_ID が設定されていれば自動実行）
npm run amazon-full-sync -- --user-id=<UUID>

# FBM スキップして full-sync
npm run amazon-full-sync -- --user-id=<UUID> --skip-fbm
```

---

## 検証条件

1. `AMAZON_SELLER_ID` を `.env.local` に設定
2. `npm run amazon-fbm-inventory-sync -- --user-id=<UUID>` を実行
3. `amazon_fbm_inventory_current` テーブルに FBM SKU の在庫数が入っていること
4. FBM 注文が存在しない場合は「FBM SKU なし」メッセージが出て正常終了
