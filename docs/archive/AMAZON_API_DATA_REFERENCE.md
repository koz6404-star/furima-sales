# Amazon SP-API データ仕様リファレンス

Amazon SP-API で取得できる在庫・注文・取引データの整理。統合再構築時の参照用。

---

## 1. Finances API（取引・手数料・送料）

**エンドポイント**: `GET /finances/2024-06-19/transactions`  
**用途**: 売上、手数料、送料、粗利の元データ

### リクエストパラメータ

| パラメータ | 必須 | 説明 |
|-----------|------|------|
| postedAfter | ○* | ISO 8601形式、リクエスト2分以上前 |
| postedBefore | - | 省略時はリクエスト2分前。postedAfter と180日以上離れると空 |
| marketplaceId | - | マーケットプレイスID（日本: A1VC38T7YXB528） |
| transactionStatus | - | DEFERRED / RELEASED / DEFERRED_RELEASED |
| relatedIdentifierName | - | FINANCIAL_EVENT_GROUP_ID / ORDER_ID |
| relatedIdentifierValue | - | 上記の値 |
| nextToken | - | ページネーション |

* relatedIdentifier 未指定時は必須

### レスポンス構造（Transaction）

| 項目 | 型 | 説明 |
|-----|-----|------|
| transactionType | string | `Shipment`（出荷取引） |
| transactionId | string | 取引ID |
| transactionStatus | string | ステータス |
| description | string | 例: 'Order Payment', 'Refund Order' |
| postedDate | string | 取引日時（ISO 8601） |
| totalAmount | Currency | 合計金額 |
| relatedIdentifiers | array | 注文ID等 |
| items | array | 明細（複数商品あり） |
| breakdowns | array | 内訳（手数料・送料等） |
| contexts | array | 追加情報 |

### RelatedIdentifier（注文ID等）

| Name | 説明 |
|------|------|
| ORDER_ID | 注文ID |
| SHIPMENT_ID | 出荷ID |
| FINANCIAL_EVENT_GROUP_ID | 財務イベントグループID |
| REFUND_ID | 返品ID |

### Item（明細）

| 項目 | 説明 |
|-----|------|
| description | 説明 |
| totalAmount | Currency | 合計 |
| breakdowns | array | 手数料等の内訳 |
| contexts | array | ASIN, SKU, quantityShipped 等 |

### Context（商品情報）

| 項目 | 説明 |
|-----|------|
| asin | ASIN |
| sku | SKU |
| quantityShipped | 出荷数量 |
| fulfillmentNetwork | 履行ネットワーク |

### Breakdown（手数料・送料内訳）

| 項目 | 説明 |
|-----|------|
| breakdownType |  charge の種類（例: Commission, ShippingServiceCharges, FBA...） |
| breakdownAmount | Currency | 金額 |
| breakdowns | array | 子要素（ネスト可） |

**注意**: 
- 過去48時間の注文は含まれない場合あり
- レート制限: 0.5 req/sec、バースト 10
- レスポンスは `payload.transactions` 経由の可能性あり

---

## 2. FBA Inventory API（FBA在庫）

**エンドポイント**: `getInventorySummaries`  
**用途**: FBA の販売可能・保留・入庫中等の数量

### レスポンス項目（sku 単位）

| 項目 | 説明 |
|-----|------|
| sellerSku | 出品者SKU |
| fnSku | Amazon 履行ネットワークSKU |
| asin | ASIN |
| fulfillable | 販売可能数量 |
| inbound | 入庫中 |
| reserved | 保留（ピッキング・梱包・配送中等） |
| unfulfillable | 販売不可 |
| researchingQuantityInShortTerm | 1–10日調査中 |
| researchingQuantityInMidTerm | 11–20日調査中 |
| researchingQuantityInLongTerm | 21日以上調査中 |

### ReservedQuantity（保留詳細）

| 項目 | 説明 |
|-----|------|
| totalReservedQuantity | 総保留数 |
| pendingCustomerOrderQuantity | 顧客注文保留 |
| pendingTransshipmentQuantity | FC間転送中 |
| fcProcessingQuantity | 処理保留 |

---

## 3. Listings Items API（FBM在庫）

**操作**: `getListingsItem`（SKU指定）、`searchListingsItems`（ASIN検索）  
**用途**: FBM（自社発送）の在庫・出品情報  

**必要な環境変数**: `AMAZON_SELLER_ID`（商取引アカウントID、A1で始まる）

### 取得データ（includedData: fulfillmentAvailability）

- FBM の fulfillmentAvailability（在庫）
- デフォルトは FBM、AMAZON_XX は FBA 用

---

## 4. Orders API（注文）

**用途**: 注文一覧・詳細

### getOrders パラメータ

| パラメータ | 説明 |
|-----------|------|
| createdAfter/createdBefore | 必須、ISO-8601 |
| status | NEW, SHIPPED, ACCEPTED, CANCELLED |
| limit | 最大100 |
| includeDetails | 詳細含むか |
| nextToken | ページネーション |

**注意**: Orders API v0 は非推奨、v2026-01-01 への移行推奨

---

## 5. Reports API（レポート）

**用途**: 各種 CSV/XML レポート（売上、在庫、注文等）  
動的テーブルとは別のデータソースとして利用可能。

---

## 6. 現行実装で使用中

| API | 使用箇所 | 取得項目 |
|-----|----------|----------|
| listTransactions | amazon-sync, amazon-diagnostic | Shipment, items, breakdowns, relatedIdentifiers |
| getInventorySummaries | amazon-sync | SKU, fulfillable, asin 等 |
| getListingsItem | amazon-sync | fulfillmentAvailability（FBM） |
| searchListingsItems | amazon-sync | ASIN検索時 |

---

## 7. 反映されやすい問題ポイント

1. **breakdowns の構造差**: PascalCase / camelCase、ネスト、charge 種別の違い
2. **item 階層の breakdowns 欠損**: GitHub #4993 で報告、トランザクション階層をフォールバックに使用
3. **複数 item 時の按分**: トランザクション階層のみに breakdowns がある場合の按分ロジック
4. **postedDate と sold_at**: タイムゾーン・フォーマットの統一
