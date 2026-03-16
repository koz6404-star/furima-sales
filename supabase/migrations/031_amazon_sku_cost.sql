-- Phase16+: Amazon SKU 別原価テーブル
-- SP-API に原価情報がないため、ユーザーが手動で SKU ごとに仕入れ原価を登録する。

CREATE TABLE IF NOT EXISTS amazon_sku_cost (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sku         text        NOT NULL,
  cost_yen    integer     NOT NULL DEFAULT 0,
  note        text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_amazon_sku_cost_user
  ON amazon_sku_cost (user_id);

ALTER TABLE amazon_sku_cost ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sku cost"
  ON amazon_sku_cost FOR ALL USING (auth.uid() = user_id);
