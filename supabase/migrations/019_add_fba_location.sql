-- FBA（Fulfillment by Amazon）保管場所を追加
-- Amazon FBA在庫は「家」「倉庫」とは別の FBA として管理

ALTER TABLE product_location_stock
  DROP CONSTRAINT IF EXISTS product_location_stock_location_check;

ALTER TABLE product_location_stock
  ADD CONSTRAINT product_location_stock_location_check
  CHECK (location IN ('home', 'warehouse', 'fba'));

COMMENT ON COLUMN product_location_stock.location IS 'home=家, warehouse=倉庫, fba=Amazon FBA';
