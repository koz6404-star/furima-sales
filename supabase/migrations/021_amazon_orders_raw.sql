-- Amazon Orders API raw 保存用テーブル（Phase 2）
-- 注文一覧・注文明細をそのまま保存。整形は Phase 3 で実施

-- 注文 raw
CREATE TABLE amazon_orders_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_api TEXT NOT NULL,
  source_key TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_amazon_orders_raw_user_source
  ON amazon_orders_raw (user_id, source_key);

CREATE INDEX idx_amazon_orders_raw_user_fetched
  ON amazon_orders_raw (user_id, fetched_at);

COMMENT ON TABLE amazon_orders_raw IS 'Orders API getOrders のレスポンスをそのまま保存';
COMMENT ON COLUMN amazon_orders_raw.source_api IS '例: orders.getOrders';
COMMENT ON COLUMN amazon_orders_raw.source_key IS '注文ID（AmazonOrderId）';
COMMENT ON COLUMN amazon_orders_raw.payload_json IS 'API レスポンスの Order オブジェクト';

-- 注文明細（商品行）raw
CREATE TABLE amazon_order_items_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_api TEXT NOT NULL,
  source_key TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_amazon_order_items_raw_user_source
  ON amazon_order_items_raw (user_id, source_key);

CREATE INDEX idx_amazon_order_items_raw_user_fetched
  ON amazon_order_items_raw (user_id, fetched_at);

COMMENT ON TABLE amazon_order_items_raw IS 'Orders API getOrderItems の各 OrderItem を保存';
COMMENT ON COLUMN amazon_order_items_raw.source_api IS '例: orders.getOrderItems';
COMMENT ON COLUMN amazon_order_items_raw.source_key IS 'orderId|orderItemId 形式';
COMMENT ON COLUMN amazon_order_items_raw.payload_json IS 'API レスポンスの OrderItem オブジェクト';

-- RLS
ALTER TABLE amazon_orders_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE amazon_order_items_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "amazon_orders_raw_own"
  ON amazon_orders_raw FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "amazon_order_items_raw_own"
  ON amazon_order_items_raw FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
