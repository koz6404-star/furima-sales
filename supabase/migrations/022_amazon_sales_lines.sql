-- Amazon 売上明細（normalized）Phase 3
-- raw から整形された 1 注文 1 商品行

CREATE TYPE amazon_fee_status AS ENUM ('pending', 'confirmed', 'missing');
CREATE TYPE amazon_fulfillment_type AS ENUM ('FBA', 'FBM');

CREATE TABLE amazon_sales_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  order_item_id TEXT NOT NULL,
  order_date DATE NOT NULL,
  sku TEXT,
  asin TEXT,
  product_name TEXT,
  quantity INT NOT NULL DEFAULT 1,
  sales_amount_yen INT NOT NULL DEFAULT 0,
  fulfillment_type amazon_fulfillment_type,
  fee_status amazon_fee_status NOT NULL DEFAULT 'pending',
  fee_amount_yen INT DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE amazon_sales_lines
  ADD CONSTRAINT amazon_sales_lines_user_order_item_key UNIQUE (user_id, order_id, order_item_id);

CREATE INDEX idx_amazon_sales_lines_user_date
  ON amazon_sales_lines (user_id, order_date DESC);

CREATE INDEX idx_amazon_sales_lines_user_sku
  ON amazon_sales_lines (user_id, sku) WHERE sku IS NOT NULL;

COMMENT ON TABLE amazon_sales_lines IS 'Orders API raw から整形された売上明細（1注文1商品行）';
COMMENT ON COLUMN amazon_sales_lines.order_date IS '注文日（PurchaseDate）';
COMMENT ON COLUMN amazon_sales_lines.sales_amount_yen IS '売上金額（ItemPrice から円換算）';
COMMENT ON COLUMN amazon_sales_lines.fee_status IS 'pending=未取得, confirmed=取得済, missing=不明';

-- RLS
ALTER TABLE amazon_sales_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "amazon_sales_lines_own"
  ON amazon_sales_lines FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
