-- ソート用の算出カラム（目安価格20%）
-- 利益率20%を実現する販売価格（手数料10%・送料込み）
ALTER TABLE products ADD COLUMN IF NOT EXISTS target_price_20 INT GENERATED ALWAYS AS (
  CASE WHEN default_shipping_yen IS NOT NULL
  THEN CEIL((cost_yen * 1.2::numeric + default_shipping_yen) / 0.9)::int
  ELSE NULL
  END
) STORED;
