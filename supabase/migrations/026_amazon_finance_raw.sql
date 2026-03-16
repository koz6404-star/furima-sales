-- Finances API raw 保存（Phase 8）
-- 手数料・財務情報の raw レスポンスを保存

CREATE TABLE amazon_finance_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_api TEXT NOT NULL,
  source_key TEXT NOT NULL,
  posted_date DATE,
  order_id TEXT,
  transaction_id TEXT,
  transaction_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_amazon_finance_raw_user_source
  ON amazon_finance_raw (user_id, source_key);

CREATE INDEX idx_amazon_finance_raw_user_posted
  ON amazon_finance_raw (user_id, posted_date DESC NULLS LAST);

CREATE INDEX idx_amazon_finance_raw_user_order
  ON amazon_finance_raw (user_id, order_id) WHERE order_id IS NOT NULL;

CREATE INDEX idx_amazon_finance_raw_user_type
  ON amazon_finance_raw (user_id, transaction_type);

COMMENT ON TABLE amazon_finance_raw IS 'Finances API listFinancialEvents の各イベントを raw 保存';
COMMENT ON COLUMN amazon_finance_raw.source_api IS '例: finances.listFinancialEvents';
COMMENT ON COLUMN amazon_finance_raw.source_key IS 'イベント一意キー（ハッシュ等）';
COMMENT ON COLUMN amazon_finance_raw.posted_date IS 'PostedDate から抽出';
COMMENT ON COLUMN amazon_finance_raw.order_id IS 'AmazonOrderId / relatedIdentifiers から抽出';
COMMENT ON COLUMN amazon_finance_raw.transaction_id IS 'TransactionId（あれば）';
COMMENT ON COLUMN amazon_finance_raw.transaction_type IS 'ShipmentEvent / RefundEvent / ServiceFeeEvent 等';

-- RLS
ALTER TABLE amazon_finance_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "amazon_finance_raw_own"
  ON amazon_finance_raw FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
