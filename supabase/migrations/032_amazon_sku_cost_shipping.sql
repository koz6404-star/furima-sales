-- amazon_sku_cost に FBM 送料列を追加
-- FBM 商品は出品者が自分で発送するため、1個あたりの送料を手動入力する。
-- 粗利 = 差引後 - (原価 + 送料) × 販売数
ALTER TABLE amazon_sku_cost
  ADD COLUMN IF NOT EXISTS shipping_yen integer NOT NULL DEFAULT 0;
