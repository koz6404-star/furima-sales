-- FBA詳細データの追加
-- fn_sku（Amazon FBA履行ネットワークSKU）をproductsに追加
-- product_location_stock に 'inbound'（入庫中）ロケーションを追加

-- products: fn_sku カラム追加
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS fn_sku TEXT;

CREATE INDEX IF NOT EXISTS idx_products_fn_sku
  ON products (user_id, fn_sku)
  WHERE fn_sku IS NOT NULL;

COMMENT ON COLUMN products.fn_sku IS 'Amazon FBA 履行ネットワーク SKU（fnSku）';

-- product_location_stock: location の CHECK 制約に 'inbound' を追加
ALTER TABLE product_location_stock
  DROP CONSTRAINT IF EXISTS product_location_stock_location_check;

ALTER TABLE product_location_stock
  ADD CONSTRAINT product_location_stock_location_check
  CHECK (location IN ('home', 'warehouse', 'fba', 'inbound'));

COMMENT ON COLUMN product_location_stock.location IS
  'home=家, warehouse=倉庫, fba=Amazon FBA（販売可能）, inbound=FBA入庫中（輸送中・受入中）';
