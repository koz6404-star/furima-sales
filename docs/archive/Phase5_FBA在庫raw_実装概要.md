# Phase5 FBA在庫 raw 取得 実装概要

## 目的

FBA在庫の raw 取得と、SKU 単位での保持基盤を作ること。FBA のみ対応。FBM は対象外。

---

## 1. 変更ファイル一覧

| 種類 | パス |
|------|------|
| マイグレーション | `supabase/migrations/024_amazon_fba_inventory_raw.sql` |
| API クライアント | `src/lib/amazon/fba-inventory.ts` |
| raw 同期ロジック | `src/lib/amazon/fba-inventory-raw-sync.ts` |
| 同期 API | `src/app/api/amazon-fba-inventory-sync/route.ts` |
| raw 取得 API | `src/app/api/amazon-fba-inventory-raw/route.ts` |
| 画面 | `src/app/amazon-fba-inventory/page.tsx` |
| クライアントコンポーネント | `src/components/amazon-fba-inventory-client.tsx` |
| ナビ | `src/components/nav.tsx`（FBA在庫リンク追加） |

---

## 2. 取得できた在庫項目一覧

FBA Inventory API `getInventorySummaries`（details: true）の主な項目:

| 項目 | 説明 | パス |
|------|------|------|
| sellerSku | 出品者 SKU | payload_json.sellerSku |
| asin | ASIN | payload_json.asin |
| fnSku | FBA 倉庫用 SKU | payload_json.fnSku |
| productName | 商品名 | payload_json.productName |
| totalQuantity | 総在庫数 | payload_json.totalQuantity |
| lastUpdatedTime | 最終更新日時 | payload_json.lastUpdatedTime |
| fulfillableQuantity | 出荷可能数 | payload_json.inventoryDetails.fulfillableQuantity |
| inboundWorkingQuantity | 入荷処理中 | payload_json.inventoryDetails.inboundWorkingQuantity |
| inboundShippedQuantity | 入荷配送中 | payload_json.inventoryDetails.inboundShippedQuantity |
| inboundReceivingQuantity | 入荷受取中 | payload_json.inventoryDetails.inboundReceivingQuantity |
| totalReservedQuantity | 予約在庫合計 | payload_json.inventoryDetails.reservedQuantity.totalReservedQuantity |
| totalResearchingQuantity | 調査中合計 | payload_json.inventoryDetails.researchingQuantity.totalResearchingQuantity |
| totalUnfulfillableQuantity | 出荷不能合計 | payload_json.inventoryDetails.unfulfillableQuantity.totalUnfulfillableQuantity |

---

## 3. raw 保存テーブル（amazon_fba_inventory_raw）

| カラム | 型 | 説明 |
|--------|------|------|
| id | UUID | 主キー |
| user_id | UUID | ユーザー |
| fetched_at | TIMESTAMPTZ | 取得日時 |
| snapshot_at | TIMESTAMPTZ | 在庫スナップショット時点 |
| source_api | TEXT | 例: fbaInventory.getInventorySummaries |
| source_key | TEXT | seller_sku（ユニークキー） |
| payload_json | JSONB | InventorySummary オブジェクト |
| created_at | TIMESTAMPTZ | 作成日時 |
| updated_at | TIMESTAMPTZ | 更新日時 |

- 一意制約: (user_id, source_key)
- 再同期時は upsert で上書き

---

## 4. raw 保存確認

- **同期**: `/amazon-fba-inventory` で「FBA在庫 同期」を実行
- **API**: `POST /api/amazon-fba-inventory-sync`
- **一覧**: `GET /api/amazon-fba-inventory-raw` で seller_sku 単位で確認

---

## 5. Phase6 inventory_current への整形案

### 5.1 想定テーブル構造

```sql
CREATE TABLE inventory_current (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_sku TEXT NOT NULL,
  asin TEXT,
  product_name TEXT,
  fulfillable INT DEFAULT 0,
  inbound INT DEFAULT 0,      -- inboundWorking + inboundShipped + inboundReceiving
  reserved INT DEFAULT 0,
  unfulfillable INT DEFAULT 0,
  researching INT DEFAULT 0,
  snapshot_at TIMESTAMPTZ NOT NULL,
  source_raw_id UUID REFERENCES amazon_fba_inventory_raw(id),
  UNIQUE(user_id, seller_sku)
);
```

### 5.2 変換ロジック

- **入力**: amazon_fba_inventory_raw（同一 snapshot_at でまとめた最新分）
- **変換**:
  - seller_sku ← payload_json.sellerSku
  - fulfillable ← inventoryDetails.fulfillableQuantity
  - inbound ← inboundWorkingQuantity + inboundShippedQuantity + inboundReceivingQuantity
  - reserved ← reservedQuantity.totalReservedQuantity
  - unfulfillable ← unfulfillableQuantity.totalUnfulfillableQuantity
  - researching ← researchingQuantity.totalResearchingQuantity
- **出力**: inventory_current へ upsert（user_id, seller_sku で衝突時は上書き）

### 5.3 実行タイミング

- FBA 在庫同期（sync）完了後に transform を実行
- または、同期 API 内で sync と transform を連続実行

### 5.4 注意点

- FBA のみを inventory_current に含める（FBM は別扱い）
- 履歴が必要な場合は inventory_snapshots を別テーブルで検討
