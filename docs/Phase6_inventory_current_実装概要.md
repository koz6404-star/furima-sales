# Phase6 inventory_current 実装概要

## 1. 実装概要

- `amazon_fba_inventory_raw` から SKU ごとの最新在庫を整形
- `amazon_inventory_current` テーブルへ upsert
- channel_type = 'FBA' 固定
- total_available_qty = fulfillable_qty
- 同期後に自動で transform を実行

---

## 2. 変更ファイル一覧

| 種類 | パス |
|------|------|
| マイグレーション | `supabase/migrations/025_amazon_inventory_current.sql` |
| 変換ロジック | `src/lib/amazon/transform-inventory-current.ts` |
| 同期 API | `src/app/api/amazon-fba-inventory-sync/route.ts`（transform 追加） |
| 取得 API | `src/app/api/amazon-inventory-current/route.ts` |
| 変換 API | `src/app/api/amazon-inventory-current-transform/route.ts` |
| 検証 API | `src/app/api/amazon-phase6-verify/route.ts` |
| クライアント | `src/components/amazon-fba-inventory-client.tsx`（Current/Raw 切替） |

---

## 3. amazon_inventory_current の列定義

| 列 | 型 | 説明 |
|----|-----|------|
| id | UUID | 主キー |
| user_id | UUID | ユーザー |
| seller_sku | TEXT | 出品者 SKU |
| channel_type | TEXT | 'FBA' 固定 |
| fulfillable_qty | INT | 出荷可能在庫 |
| inbound_qty | INT | 入荷中（3項目の合計） |
| reserved_qty | INT | 予約在庫 |
| unfulfillable_qty | INT | 出荷不能 |
| total_available_qty | INT | fulfillable_qty と同値 |
| snapshot_at | TIMESTAMPTZ | スナップショット取得時刻 |
| raw_source | UUID | 元の amazon_fba_inventory_raw.id |
| fetched_at | TIMESTAMPTZ | 取得日時 |

**一意制約**: (user_id, seller_sku)

---

## 4. 最新 snapshot 抽出ロジック

- **raw の構造**: (user_id, source_key) で1行1SKU。同期時に upsert で上書きするため、常に最新1件のみ。
- **抽出**: raw の全行を読み、各行を current 形式に変換して upsert。
- **「最新」の根拠**: raw が1SKUあたり1行のため、該当行がその時点の最新。`ORDER BY snapshot_at DESC` で取得し、同一 SKU が複数ある場合は先頭のみ使用する必要はなく、現状は1行のみ。

※ 将来 raw で履歴を保持する場合は、`snapshot_at` 最大の行を採用する集約が必要。

---

## 5. 検証結果

| 項目 | 確認方法 |
|------|----------|
| 同一SKUで複数 snapshot | raw は1行1SKUのため発生しない。発生時は先頭採用で対応可。 |
| current に SKU 重複なし | GET /api/amazon-phase6-verify で uniqueSkus と totalRows を比較 |
| 0件在庫の表示 | fulfillable_qty=0 でも行を保存。toInt で 0 を返すため正常表示。 |
| 再transform の安定性 | POST /api/amazon-phase6-verify で2回実行し、after1=after2 を確認 |

---

## 6. 売上一覧との結合案

### 結合キー

- **amazon_sales_lines**: `sku`（SellerSKU）
- **amazon_inventory_current**: `seller_sku`

→ `amazon_sales_lines.sku = amazon_inventory_current.seller_sku` で結合。

### 結合例（SQL）

```sql
SELECT
  s.order_date,
  s.order_id,
  s.sku,
  s.product_name,
  s.sales_amount_yen,
  s.quantity,
  i.fulfillable_qty AS current_fulfillable,
  i.total_available_qty AS current_available
FROM amazon_sales_lines s
LEFT JOIN amazon_inventory_current i
  ON i.user_id = s.user_id AND i.seller_sku = s.sku
WHERE s.user_id = :user_id AND s.sales_state = 'confirmed'
ORDER BY s.order_date DESC;
```

### 利用例

- 売上明細行に「現在在庫」を付与して表示
- 在庫切れ（total_available_qty = 0）の商品をハイライト
- 売上と在庫の突合・差異確認

### 注意

- sales_lines の `sku` が null の行は結合できない
- 複数チャネル（FBA/FBM）を扱う場合は、`channel_type` でフィルタするか、将来的に FBM 在庫テーブルを追加する想定
