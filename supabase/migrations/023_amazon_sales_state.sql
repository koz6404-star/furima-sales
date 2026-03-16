-- sales_state 追加: Pending/Cancelled/対象外を分離
-- 判定ロジック:
--   OrderStatus in ('Pending','PendingAvailability') => pending_price
--   OrderStatus in ('Canceled') => canceled
--   ItemPrice 取得可 => confirmed
--   それ以外 => other_excluded

CREATE TYPE amazon_sales_state AS ENUM (
  'confirmed',       -- 確定売上（集計対象）
  'pending_price',   -- 価格未確定（Pending）
  'canceled',        -- キャンセル済み
  'other_excluded'   -- 判定しきれない除外対象（Unfulfillable 等）
);

-- sales_amount_yen を NULL 許容に
ALTER TABLE amazon_sales_lines
  ALTER COLUMN sales_amount_yen DROP NOT NULL,
  ALTER COLUMN sales_amount_yen DROP DEFAULT;

-- sales_state カラム追加
ALTER TABLE amazon_sales_lines
  ADD COLUMN sales_state amazon_sales_state NOT NULL DEFAULT 'other_excluded';

-- 既存データは ADD COLUMN の DEFAULT で other_excluded になる。再 transform で正しく更新される。

-- インデックス（フィルタ用）
CREATE INDEX idx_amazon_sales_lines_user_state
  ON amazon_sales_lines (user_id, sales_state);

COMMENT ON COLUMN amazon_sales_lines.sales_state IS 'confirmed=確定, pending_price=価格未確定, canceled=キャンセル, other_excluded=対象外';
