-- CKB仕入れ管理: 国際発送単位での商品管理・コスト按分

-- 国際発送管理
CREATE TABLE ckb_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shipment_code TEXT NOT NULL,
  shipped_at DATE,
  arrived_at DATE,
  exchange_rate NUMERIC(8,2),
  intl_shipping_jpy INT DEFAULT 0,
  customs_duty_jpy INT DEFAULT 0,
  total_items INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','customs_added')),
  source_file_hash TEXT,
  source_file_name TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, shipment_code)
);

CREATE INDEX idx_ckb_shipments_user ON ckb_shipments(user_id);

ALTER TABLE ckb_shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ckb_shipments_all" ON ckb_shipments FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 発送内商品明細
CREATE TABLE ckb_shipment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES ckb_shipments(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  ckb_sku TEXT,
  product_name TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_cost_cny NUMERIC(10,2),
  unit_cost_jpy INT,
  allocated_intl_shipping_jpy INT DEFAULT 0,
  allocated_customs_jpy INT DEFAULT 0,
  total_cost_jpy INT,
  unit_total_cost_jpy INT,
  spec_raw TEXT,
  size TEXT,
  color TEXT,
  image_url TEXT,
  source_file TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ckb_items_shipment ON ckb_shipment_items(shipment_id);
CREATE INDEX idx_ckb_items_sku ON ckb_shipment_items(ckb_sku) WHERE ckb_sku IS NOT NULL;
CREATE INDEX idx_ckb_items_product ON ckb_shipment_items(product_id) WHERE product_id IS NOT NULL;

ALTER TABLE ckb_shipment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ckb_shipment_items_all" ON ckb_shipment_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM ckb_shipments s WHERE s.id = shipment_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM ckb_shipments s WHERE s.id = shipment_id AND s.user_id = auth.uid()));

-- 為替レート管理
CREATE TABLE ckb_exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  rate NUMERIC(8,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, year_month)
);

ALTER TABLE ckb_exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ckb_exchange_rates_all" ON ckb_exchange_rates FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
