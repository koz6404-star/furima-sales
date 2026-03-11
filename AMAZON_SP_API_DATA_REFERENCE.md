# Amazon SP-API 取得可能データ一覧

本ドキュメントは、Amazon SP-API で取得できる**在庫**・**注文・売上・手数料**に関連するデータを整理し、現在の実装との対応関係を明示するものです。再設計のための参照資料としてご利用ください。

---

## 1. 現在使用している API

| API | 操作 | 用途 | レート制限 |
|-----|------|------|-----------|
| **Finances API** | `listTransactions` | 売上・手数料・送料の取得 | 0.5 req/sec |
| **FBA Inventory API** | `getInventorySummaries` | FBA在庫の取得 | 0.5 req/sec |
| **Listings Items API** | `getListingsItem` / `searchListingsItems` | FBM在庫の取得 | 5 req/sec |

---

## 2. Finances API（取引・売上・手数料）

**エンドポイント**: `GET /finances/2024-06-19/transactions`

### 2.1 取得できるデータ

#### Transaction（取引）

| フィールド | 説明 | 取得用途 |
|-----------|------|----------|
| `transactionType` | 取引種別。売上は `Shipment` のみ | 売上・出荷の識別 |
| `transactionId` | 取引の一意ID | 重複判定 |
| `postedDate` | 取引確定日時（ISO 8601） | 販売日 |
| `totalAmount` | 取引総額 | 売上金額 |
| `description` | 説明（例: Order Payment） | - |
| `relatedIdentifiers` | 関連識別子の配列 | 注文ID・出荷IDの取得 |
| `breakdowns` | 金額の内訳（ネスト可） | 手数料・送料 |
| `items` | 明細アイテムの配列 | ASIN/SKU/数量/単価 |

#### RelatedIdentifier（関連識別子）

| relatedIdentifierName | 説明 |
|-----------------------|------|
| `ORDER_ID` | 注文ID（売上と紐づけに使用） |
| `SHIPMENT_ID` | 出荷ID |
| `FINANCIAL_EVENT_GROUP_ID` | 金銭イベントグループID |

#### Item（明細）

| フィールド | 説明 |
|-----------|------|
| `totalAmount` | アイテム合計金額（Currency） |
| `breakdowns` | アイテム単位の手数料・送料内訳 |
| `contexts` | 追加情報（ASIN, SKU, quantityShipped） |

#### Context（アイテムの追加情報）

| フィールド | 説明 |
|-----------|------|
| `asin` | 商品のASIN |
| `sku` | 出品者のSKU |
| `quantityShipped` | 出荷数量 |

#### Breakdown（金額内訳）

手数料・送料は `breakdownType` と `breakdownAmount` で表現。ネスト構造を持つ場合あり。

**主な breakdownType 例**（API仕様では文字列であり、実データは地域・年度で変動）：

- 売上本体: `OurPricePrincipal`, `ProductCharges` 等
- 手数料: `Commission`, `ReferralFee`, `AmazonFees`, `FBA`, `VariableClosingFee`, `VAT` 等
- 送料: `Shipping`, `Postage`, `PostageBilling`, `Delivery` 等
- 広告: `Advertising`, `SponsoredProducts` 等

**制約**:
- `postedAfter` / `postedBefore` の間隔は最大 **180日**
- 直近 **48時間** の注文は含まれない場合がある
- `breakdowns` が `null` の場合あり（GitHub issue #4993）

---

## 3. FBA Inventory API（FBA在庫）

**エンドポイント**: `GET /fba/inventory/v1/summaries`

### 3.1 取得できるデータ

| フィールド | 説明 |
|-----------|------|
| `sellerSku` | 出品者SKU |
| `asin` | ASIN |
| `fnSku` | Amazon物流ネットワークSKU |
| `fulfillableQuantity` | 出荷可能数量 |
| `inboundWorkingQuantity` | 入庫作業中数量 |
| `inboundShippedQuantity` | 入庫発送済み数量 |
| `inboundReceivingQuantity` | 入庫受入中数量 |
| `reservedQuantity` | 保留数量 |
| `researchingQuantityInShortTerm` | 1–10日調査中 |
| `researchingQuantityInMidTerm` | 11–20日調査中 |
| `researchingQuantityInLongTerm` | 21日以上調査中 |
| `unfulfillableQuantity` | 出荷不可数量 |
| `productName` | 商品名 |

**パラメータ**:
- `granularityType`: `Marketplace`
- `granularityId`: マーケットプレイスID（日本: `A1VC38T7YXB528`）
- `details`: `true` で詳細取得

**補足**: `sellerId` は不要。SKU または ASIN で商品と照合可能。

---

## 4. Listings Items API（FBM在庫）

**エンドポイント例**:
- `GET /listings/2021-08-01/items/{sellerId}/{sku}`（getListingsItem）
- `GET /listings/2021-08-01/items`（searchListingsItems）

### 4.1 取得できるデータ

`includedData=fulfillmentAvailability` を指定した場合:

| フィールド | 説明 |
|-----------|------|
| `fulfillmentAvailability` | 履行チャネル別の在庫（数量の配列） |

**必要条件**:
- 商取引アカウントID（`AMAZON_SELLER_ID`）必須
- SKU が `pr_` で始まる場合は `getListingsItem` が使えない場合あり → ASIN で `searchListingsItems` を使用

---

## 5. Orders API（注文）

**エンドポイント**: `GET /orders/v0/orders`（getOrders）

### 5.1 取得できるデータ

| フィールド例 | 説明 |
|--------------|------|
| `AmazonOrderId` | 注文ID |
| `PurchaseDate` | 注文日時 |
| `OrderStatus` | NEW, SHIPPED, CANCELLED 等 |
| `OrderTotal` | 注文合計 |
| `NumberOfItemsShipped` | 出荷済み商品数 |
| 明細 | `getOrderItems` で取得 |

**補足**:
- 手数料・送料の詳細は **Finances API** の方が適している
- Orders API は注文・出荷ステータスの把握に向く
- v0 は非推奨、v2026-01-01 への移行が推奨

---

## 6. Reports API（レポート）

### 6.1 売上・在庫に関係する主なレポート

| レポートタイプ | 内容 |
|----------------|------|
| `GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL` | FBA出荷データ（一般） |
| `GET_FBA_FULFILLMENT_CUSTOMER_SHIPMENT_SALES_DATA` | FBA出荷売上データ |
| `GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL` | 全注文（注文日ベース） |
| `GET_AFN_INVENTORY_DATA` | FBA在庫データ |
| `GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE` | 精算レポート（入金・手数料等） |

**利用方法**:
1. `createReport` でレポート作成リクエスト
2. `getReport` でステータス確認
3. 完了後に `getReportDocument` でダウンロード

**制約**:
- 非同期（数分〜数十分かかる場合あり）
- デフォルトで 90 日保持
- フォーマットは CSV/XML 等のテキスト

---

## 7. データ取得の選択肢（比較）

| 目的 | Finances API | Orders API | Reports API |
|------|--------------|------------|-------------|
| 売上・手数料・送料の即時取得 | ◎ リアルタイム性が高い | △ 手数料詳細なし | ○ 精算ベースで詳細 |
| 注文IDの確実な取得 | ○ relatedIdentifiers で取得 | ◎ 注文が主体 | ○ レポートに含まれる |
| 重複の発生しやすさ | △ 同一取引の重複あり得る | ○ 注文単位で一意 | ○ レポート単位で一意 |
| 48時間以内のデータ | △ 含まれない場合あり | ◎ 含む | △ レポート作成タイミング依存 |
| 実装の複雑さ | 低 | 低 | 高（非同期・フォーマット解析） |

---

## 8. 現在の実装と課題

### 8.1 売上・手数料の取得（Finances API）

- **使用**: `listTransactions` の `transactionType === 'Shipment'` を対象
- **取得項目**: `postedDate`, `totalAmount`, `items[].totalAmount`, `breakdowns`, `relatedIdentifiers`（ORDER_ID）, `contexts`（ASIN, SKU, quantityShipped）
- **既知の制限**:
  1. `breakdowns` が `null` の場合に手数料・送料が 0 円になる（GitHub issue #4993）。この場合、`unit_price_yen` は純利益ベースとなり手数料欄が 0 表示になるが、粗利の計算値は正しい
  2. `breakdownType` の naming が年度・地域で変動。未知の type はキャッチオール（手数料扱い）で処理
- **対応済み**:
  - アイテム単位の `breakdowns` が null の場合、トランザクション階層の `breakdowns` をフォールバックとして使用
  - 複数アイテムの場合はトランザクション手数料を件数で按分
  - 再帰的なネスト構造の解析（葉ノードのみ集計、親は二重計上しない）

### 8.2 在庫の取得

- **FBA**: `getInventorySummaries` → SKU/ASIN で照合
- **FBM**: `getListingsItem`（SKU）/ `searchListingsItems`（ASIN）で `fulfillmentAvailability` を取得
- **課題**: FBM 利用には `AMAZON_SELLER_ID` が必須

### 8.3 マッチング・重複

- Finances の取引と既存の `sales` レコードを、注文ID・販売日・単価・数量で照合
- **対応済み（2026-03）**:
  1. **results 配列の事前重複排除**: `(orderId, ASIN, SKU, postedDate)` をキーに重複を排除し、手数料が最多のレコードを採用
  2. **INSERT 直前の二重防止**: 今回の同期内で既に INSERT した `(orderId, product_id)` ペアをメモリで追跡
  3. **DB 最終確認**: INSERT 前に `(amazon_order_id, product_id)` で既存レコードを DB 照会し、存在する場合はスキップ
- **残課題**: `breakdowns` が null の注文は手数料 0 のまま登録される（API 側の制限）

---

## 9. 再設計案の検討ポイント

1. **Orders API との併用**
   - Finances の取引を Orders の注文明細と突き合わせ、注文ID・商品・数量を確実に特定する

2. **Reports API の活用**
   - 定期的に精算レポートを取得し、Finances の結果と突き合わせて手数料を補完する

3. **breakdowns パースの強化**
   - 診断用に取得した実データに基づき、`breakdownType` のパターンを段階的に拡張する

4. **重複防止**
   - 注文ID + 商品（ASIN/SKU）を一意キーとし、Finances の複数返却をマージして 1 件として扱う

5. **Orders API 主導の売上登録**
   - Orders で注文・明細を取得し、手数料は Finances または Reports から補完する方式の検討

---

*最終更新: 2026-03*
