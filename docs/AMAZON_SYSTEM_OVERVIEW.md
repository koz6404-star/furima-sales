# Amazon 連携システム概要

## 目指す姿

1. **売上同期**: Amazon Finances API から取引データを取得し、`products` + `sales` に反映。手数料・送料・広告費を正しくパースし、粗利を原価ベースで計算する。
2. **在庫同期**: Amazon上の全SKU（FBA・FBM）の在庫を取得し、`products.stock` および `product_location_stock` に反映。**商品一覧に「出品中かつ在庫あり」の商品が確実に表示される**ことを目標とする。
3. **原価管理**: Amazon商品の原価（`cost_yen`）を商品編集画面で設定可能。設定後、既存売上の粗利を再計算する。

---

## 現状のフロー

### 1. 売上同期（Finances API）
- `listTransactions` で Shipment トランザクションを取得
- ASIN/SKU で既存商品を検索。なければ新規作成（`platform=amazon`）
- `sales` に登録（unit_price, fee, shipping, ad_spend, gross_profit）
- 重複チェック: `amazon_order_id` または (sold_at + unit_price) でスキップ

### 2. 在庫同期（現在のロジック）
- **FBA**: `getInventorySummaries` で全FBA在庫を取得 → `fbaMap` (SKU → 数量)
- **対象商品**: `products` のうち `platform=amazon` かつ `sku` が登録されている商品のみ
- 各対象商品について:
  - `fbaMap` に SKU があれば → 在庫更新
  - なければ FBM を試行（`getListingsItem`）
  - どちらもなければ → 在庫 0
- `product_location_stock` に fba/warehouse/home を反映

---

## 問題点（指摘された内容）

### 1. 在庫のあるFBA商品が商品一覧に反映されない（重大）
**原因**: 商品は**売上が発生したときだけ** `products` に作成される。  
FBA に在庫があるがまだ1件も売れていないSKUは、`products` に存在しないため在庫同期の**対象外**になっている。

- 売上同期 → 取引発生時のみ商品作成
- 在庫同期 → 既存の amazon 商品に対してのみ在庫更新
- **結果**: 売れていない FBA SKU は永遠に商品一覧に表示されない

### 2. FBM在庫の取得
- `getListingsItem` の `fulfillmentAvailability` のレスポンス構造が API バージョン・パスによって異なる可能性
- `AMAZON_SELLER_ID` 未設定時は FBM 取得自体がスキップされる

### 3. FBA API レスポンスのパース
- `fulfillableQuantity` が `inventoryDetails` 内にある場合の考慮が必要（`details: true` 時）
- 大文字小文字の違い（camelCase / PascalCase）は一応対応済み

---

## 修正内容（実施済み）

1. **FBA在庫 → 商品登録の逆方向追加**:  
   `fbaMap` の全 SKU のうち、`products` に存在しないものは**新規商品として作成**する。  
   これにより「売れていないがFBAに在庫がある商品」も商品一覧に表示される。

2. **FBA API レスポンスのパース強化**:  
   `payload` / 直下の複数パスから `inventorySummaries` を取得。`inventoryDetails.fulfillableQuantity`、`productName` を参照。

3. **Finances API breakdowns のネスト対応**:  
   `Sales` → `Product Charges` → `Principle`、`Expenses` 配下など、再帰的に手数料・送料・広告費を集計。  
   既存売上についても、同期時に手数料・送料を上書き更新するように変更。
