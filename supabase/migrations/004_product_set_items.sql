-- セット出品：セット商品と構成商品の紐付け
CREATE TABLE IF NOT EXISTS product_set_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_per_set INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(set_product_id, component_product_id)
);

CREATE INDEX idx_product_set_items_set ON product_set_items(set_product_id);

ALTER TABLE product_set_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_set_items_all" ON product_set_items FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM products p WHERE p.id = set_product_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM products p WHERE p.id = set_product_id AND p.user_id = auth.uid())
  );
