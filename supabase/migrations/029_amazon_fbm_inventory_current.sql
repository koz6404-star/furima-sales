-- Phase14: FBM 在庫 current テーブル
-- amazon_inventory_current が FBA 専用なのに対し、FBM（自己発送）商品の在庫を管理する
-- Listings Items API から取得した出品在庫数（quantity）を SKU 単位で保持

CREATE TABLE amazon_fbm_inventory_current (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_sku   TEXT        NOT NULL,
  asin         TEXT,
  item_name    TEXT,
  listing_status TEXT,               -- ACTIVE / INACTIVE 等
  quantity     INT         NOT NULL DEFAULT 0,  -- Listings Items API の fulfillmentAvailability（DEFAULT チャンネル）
  snapshot_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, seller_sku)
);

CREATE INDEX idx_fbm_inventory_current_user ON amazon_fbm_inventory_current(user_id);
CREATE INDEX idx_fbm_inventory_current_sku  ON amazon_fbm_inventory_current(user_id, seller_sku);

ALTER TABLE amazon_fbm_inventory_current ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fbm_inventory_current_user"
  ON amazon_fbm_inventory_current
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fbm_inventory_current_service"
  ON amazon_fbm_inventory_current
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
