-- amazon_inventory_current（Phase 6）
-- amazon_fba_inventory_raw から SKU ごとの最新在庫を整形

CREATE TABLE amazon_inventory_current (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_sku TEXT NOT NULL,
  channel_type TEXT NOT NULL DEFAULT 'FBA',
  fulfillable_qty INT NOT NULL DEFAULT 0,
  inbound_qty INT NOT NULL DEFAULT 0,
  reserved_qty INT NOT NULL DEFAULT 0,
  unfulfillable_qty INT NOT NULL DEFAULT 0,
  total_available_qty INT NOT NULL DEFAULT 0,
  snapshot_at TIMESTAMPTZ NOT NULL,
  raw_source UUID REFERENCES amazon_fba_inventory_raw(id) ON DELETE SET NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_amazon_inventory_current_user_sku
  ON amazon_inventory_current (user_id, seller_sku);

CREATE INDEX idx_amazon_inventory_current_user_snapshot
  ON amazon_inventory_current (user_id, snapshot_at DESC);

COMMENT ON TABLE amazon_inventory_current IS 'FBA 在庫の SKU 単位最新状態（raw から整形）';
COMMENT ON COLUMN amazon_inventory_current.channel_type IS 'FBA 固定';
COMMENT ON COLUMN amazon_inventory_current.total_available_qty IS 'fulfillable_qty と同値（出荷可能数）';
COMMENT ON COLUMN amazon_inventory_current.raw_source IS '元の amazon_fba_inventory_raw.id';

ALTER TABLE amazon_inventory_current ENABLE ROW LEVEL SECURITY;

CREATE POLICY "amazon_inventory_current_own"
  ON amazon_inventory_current FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
