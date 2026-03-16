# Amazon連携 Phase 3 完了報告

完了日: 2025-03-14

---

## 何を実装したか

### 1. amazon_sales_lines テーブル（マイグレーション 022）
- 1注文1商品行の整形済み売上明細
- 必須項目: order_date, order_id, sku, asin, product_name, quantity, sales_amount_yen, fulfillment_type, fee_status, fetched_at
- fee_status は `pending` 固定（Phase 8 で Finances 連携）
- 一意制約: (user_id, order_id, order_item_id)

### 2. transform service（`src/lib/amazon/transform-sales-lines.ts`）
- `transformRawToSalesLines()`: raw から amazon_sales_lines を生成
- amazon_orders_raw + amazon_order_items_raw を結合
- 再実行時は upsert で破綻しない

### 3. API エンドポイント
| エンドポイント | メソッド | 説明 |
|----------------|----------|------|
| `/api/amazon-sales-lines-transform` | POST | raw から整形実行（単体） |
| `/api/amazon-sales-lines` | GET | 売上明細一覧取得（Phase 4 用） |
| `/api/amazon-orders-sync` | POST | `transform: true` で同期後に自動整形 |

### 4. 同期 API 拡張
- `transform: true` を指定で raw 同期後に amazon_sales_lines へ変換

---

## 変更ファイル一覧

| ファイル | 種別 |
|----------|------|
| `supabase/migrations/022_amazon_sales_lines.sql` | 新規 |
| `src/lib/amazon/transform-sales-lines.ts` | 新規 |
| `src/app/api/amazon-sales-lines-transform/route.ts` | 新規 |
| `src/app/api/amazon-sales-lines/route.ts` | 新規 |
| `src/app/api/amazon-orders-sync/route.ts` | 更新（transform オプション追加） |
| `docs/AMAZON_PHASE3_COMPLETE.md` | 新規 |

---

## DB 変更点

- **amazon_sales_lines**: 新規作成
- **amazon_fee_status**: enum (pending, confirmed, missing)
- **amazon_fulfillment_type**: enum (FBA, FBM)

### マイグレーション実行
```bash
npm run supabase-migrate
```

---

## 動作確認方法

### 1. フロー（同期 + 整形）
```bash
POST /api/amazon-orders-sync
Body: { "from": "2025-01-01", "to": "2025-03-14", "transform": true }
```

### 2. 整形のみ（既に raw がある場合）
```bash
POST /api/amazon-sales-lines-transform
```

### 3. 売上明細一覧取得
```
GET /api/amazon-sales-lines
GET /api/amazon-sales-lines?from=2025-03-01&to=2025-03-14&limit=20
GET /api/amazon-sales-lines?sku=XXX&fulfillmentType=FBA
```

---

## 次 Phase でやること（Phase 4）

1. 売上一覧画面の最小実装
2. amazon_sales_lines を一覧表示
3. 並び順: 注文日 desc
4. 検索: 日付範囲、SKU、商品名、FBA/FBM
