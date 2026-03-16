-- amazon_fee_events（Phase 9）
-- amazon_finance_raw から fee 候補イベントを整形

CREATE TABLE amazon_fee_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  fee_type TEXT,
  fee_amount_yen INT NOT NULL DEFAULT 0,
  posted_date DATE,
  raw_source UUID REFERENCES amazon_finance_raw(id) ON DELETE SET NULL,
  fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_amazon_fee_events_user_order
  ON amazon_fee_events (user_id, order_id);

CREATE INDEX idx_amazon_fee_events_user_posted
  ON amazon_fee_events (user_id, posted_date DESC NULLS LAST);

CREATE INDEX idx_amazon_fee_events_user_type
  ON amazon_fee_events (user_id, transaction_type);

COMMENT ON TABLE amazon_fee_events IS 'Finances raw から整形した手数料イベント（order_id で売上と結合）';
COMMENT ON COLUMN amazon_fee_events.fee_type IS 'FeeType（FBAPerUnitFulfillmentFee 等）';
COMMENT ON COLUMN amazon_fee_events.fee_amount_yen IS '手数料金額（円）。JPY以外は0扱い';

ALTER TABLE amazon_fee_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "amazon_fee_events_own"
  ON amazon_fee_events FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
