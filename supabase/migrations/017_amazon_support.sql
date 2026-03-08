-- Amazon統合サポート
-- ロールバック方法は ROLLBACK_017.md を参照

-- 1. platform_type に 'amazon' を追加
ALTER TYPE platform_type ADD VALUE IF NOT EXISTS 'amazon';

-- 2. products に platform 列を追加（既存は NULL = フリマ扱い）
ALTER TABLE products ADD COLUMN IF NOT EXISTS platform platform_type;
COMMENT ON COLUMN products.platform IS 'amazon=Amazon商品, NULL/mercari/rakuma=フリマ商品';

-- 3. sales に ad_spend_yen 列を追加（Amazon広告費用）
ALTER TABLE sales ADD COLUMN IF NOT EXISTS ad_spend_yen INT DEFAULT 0;
COMMENT ON COLUMN sales.ad_spend_yen IS '広告費（Amazonのみ使用、他は0）';

-- 4. products に asin 列を追加（Amazon用識別子）
ALTER TABLE products ADD COLUMN IF NOT EXISTS asin TEXT;
COMMENT ON COLUMN products.asin IS 'Amazon ASIN（platform=amazonの場合に使用）';
CREATE INDEX IF NOT EXISTS idx_products_asin ON products(user_id, asin) WHERE asin IS NOT NULL;
