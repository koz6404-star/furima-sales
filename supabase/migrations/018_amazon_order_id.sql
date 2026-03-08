-- Amazon注文ID（重複防止用）
ALTER TABLE sales ADD COLUMN IF NOT EXISTS amazon_order_id TEXT;
CREATE INDEX IF NOT EXISTS idx_sales_amazon_order_id ON sales(user_id, amazon_order_id) WHERE amazon_order_id IS NOT NULL;
