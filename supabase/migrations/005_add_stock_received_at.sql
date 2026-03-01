-- 入荷日（在庫が入った日）を追加
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_received_at DATE;
