-- 取込SKUの編集制限と、ユーザー用管理番号の追加
-- sku: Excel取込等の荷重平均用SKU（取込品は編集不可）
-- custom_sku: ユーザー自由の管理番号（常に編集可）

ALTER TABLE products ADD COLUMN IF NOT EXISTS sku_locked BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS custom_sku TEXT;

COMMENT ON COLUMN products.sku_locked IS 'true=Excel取込由来のSKUで編集不可';
COMMENT ON COLUMN products.custom_sku IS 'ユーザー自由の管理番号（常に編集可）';
