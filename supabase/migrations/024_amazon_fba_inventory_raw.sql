-- FBA Inventory API raw 保存（Phase 5）
-- seller_sku 単位で在庫スナップショットを保持

CREATE TABLE amazon_fba_inventory_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_api TEXT NOT NULL,
  source_key TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_amazon_fba_inventory_raw_user_source
  ON amazon_fba_inventory_raw (user_id, source_key);

CREATE INDEX idx_amazon_fba_inventory_raw_user_snapshot
  ON amazon_fba_inventory_raw (user_id, snapshot_at DESC);

COMMENT ON TABLE amazon_fba_inventory_raw IS 'FBA Inventory API getInventorySummaries の各 SKU 在庫を保存';
COMMENT ON COLUMN amazon_fba_inventory_raw.source_api IS '例: fbaInventory.getInventorySummaries';
COMMENT ON COLUMN amazon_fba_inventory_raw.source_key IS 'seller_sku（Seller SKU）';
COMMENT ON COLUMN amazon_fba_inventory_raw.snapshot_at IS '在庫取得時点（fetched_at と同期）';
COMMENT ON COLUMN amazon_fba_inventory_raw.payload_json IS 'API の InventorySummary オブジェクト';

-- RLS
ALTER TABLE amazon_fba_inventory_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "amazon_fba_inventory_raw_own"
  ON amazon_fba_inventory_raw FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
