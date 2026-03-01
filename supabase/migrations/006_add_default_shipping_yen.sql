-- 目安価格計算用のデフォルト送料（円）を商品ごとに保存
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_shipping_yen INT;
