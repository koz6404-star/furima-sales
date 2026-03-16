# Migration 020 を SQL Editor で手動実行

接続文字列での実行がうまくいかない場合、Supabase Dashboard の SQL Editor から直接実行できます。

## 手順

1. [Supabase Dashboard](https://supabase.com/dashboard) を開く
2. プロジェクトを選択
3. 左メニュー **「SQL Editor」** をクリック
4. **「New query」** で新しいクエリを開く
5. 以下の SQL をコピー＆ペーストして **「Run」** をクリック

```sql
-- FBA詳細データの追加 (Migration 020)
-- products: fn_sku カラム追加
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS fn_sku TEXT;

CREATE INDEX IF NOT EXISTS idx_products_fn_sku
  ON products (user_id, fn_sku)
  WHERE fn_sku IS NOT NULL;

COMMENT ON COLUMN products.fn_sku IS 'Amazon FBA 履行ネットワーク SKU（fnSku）';

-- product_location_stock: location に 'inbound' を追加
ALTER TABLE product_location_stock
  DROP CONSTRAINT IF EXISTS product_location_stock_location_check;

ALTER TABLE product_location_stock
  ADD CONSTRAINT product_location_stock_location_check
  CHECK (location IN ('home', 'warehouse', 'fba', 'inbound'));

COMMENT ON COLUMN product_location_stock.location IS
  'home=家, warehouse=倉庫, fba=Amazon FBA（販売可能）, inbound=FBA入庫中（輸送中・受入中）';
```

6. 成功メッセージが表示されれば完了です。
