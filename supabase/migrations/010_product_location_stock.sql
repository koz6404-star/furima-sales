-- 保管場所別在庫（家・倉庫）
CREATE TABLE IF NOT EXISTS product_location_stock (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location TEXT NOT NULL CHECK (location IN ('home', 'warehouse')),
  quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (product_id, location)
);

CREATE INDEX idx_product_location_stock_product ON product_location_stock(product_id);

ALTER TABLE product_location_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_location_stock_all" ON product_location_stock FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND p.user_id = auth.uid())
  );

-- 既存商品の在庫を「家」に初期セット
INSERT INTO product_location_stock (product_id, location, quantity, updated_at)
SELECT id, 'home', stock, now()
FROM products
WHERE stock > 0
  AND NOT EXISTS (SELECT 1 FROM product_location_stock pls WHERE pls.product_id = products.id)
ON CONFLICT (product_id, location) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at;
