-- 在庫の最古入荷日（不良在庫判定用）
-- 在庫0のときのみリセット、0→入荷のときのみセット
ALTER TABLE products ADD COLUMN IF NOT EXISTS oldest_received_at DATE;

COMMENT ON COLUMN products.oldest_received_at IS '在庫が残っている間の最古入荷日。在庫0でリセット、0からの入荷時のみセット';
