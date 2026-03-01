-- フリマ売上管理アプリ 一括セットアップSQL
-- Supabase の SQL Editor でこのファイル全体を貼り付けて「Run」をクリック

-- プラットフォーム enum
CREATE TYPE platform_type AS ENUM ('mercari', 'rakuma');

-- 端数処理 enum
CREATE TYPE rounding_type AS ENUM ('floor', 'ceil', 'round');

-- 販売手数料マスタ
CREATE TABLE fee_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform platform_type NOT NULL,
  display_name TEXT NOT NULL,
  rate_percent NUMERIC(5,2) NOT NULL,
  rakuma_rank INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 送料マスタ
CREATE TABLE shipping_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform platform_type NOT NULL,
  display_name TEXT NOT NULL,
  base_fee_yen INT NOT NULL,
  size_label TEXT,
  is_custom BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 資材代マスタ
CREATE TABLE material_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform platform_type NOT NULL,
  display_name TEXT NOT NULL,
  fee_yen INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- アプリ設定
CREATE TABLE app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  platform platform_type NOT NULL,
  fee_rate_id UUID REFERENCES fee_rates(id),
  rounding rounding_type DEFAULT 'floor',
  include_material_in_shipping BOOLEAN DEFAULT false,
  rakuma_manual_rank INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, platform)
);

-- 商品マスタ
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sku TEXT,
  name TEXT NOT NULL,
  cost_yen INT NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  image_url TEXT,
  memo TEXT,
  campaign TEXT,
  size TEXT,
  color TEXT,
  stock_received_at DATE,
  default_shipping_yen INT,
  sku_locked BOOLEAN DEFAULT false,
  custom_sku TEXT,
  oldest_received_at DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_products_user_id ON products(user_id);
CREATE INDEX idx_products_sku ON products(user_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_products_stock ON products(user_id, stock) WHERE stock > 0;

-- セット出品：セット商品と構成商品の紐付け
CREATE TABLE product_set_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_per_set INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(set_product_id, component_product_id)
);

CREATE INDEX idx_product_set_items_set ON product_set_items(set_product_id);

-- 販売履歴
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INT NOT NULL,
  unit_price_yen INT NOT NULL,
  platform platform_type NOT NULL,
  fee_rate_percent NUMERIC(5,2) NOT NULL,
  fee_yen INT NOT NULL,
  shipping_id UUID REFERENCES shipping_rates(id),
  shipping_yen INT NOT NULL DEFAULT 0,
  material_yen INT DEFAULT 0,
  gross_profit_yen INT NOT NULL,
  sold_at DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sales_user_id ON sales(user_id);
CREATE INDEX idx_sales_product_id ON sales(product_id);
CREATE INDEX idx_sales_sold_at ON sales(user_id, sold_at);

-- RLS
ALTER TABLE fee_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_set_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_set_items_all" ON product_set_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM products p WHERE p.id = set_product_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM products p WHERE p.id = set_product_id AND p.user_id = auth.uid()));

CREATE POLICY "fee_rates_read" ON fee_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "shipping_rates_read" ON shipping_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "material_fees_read" ON material_fees FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_settings_all" ON app_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "products_all" ON products FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sales_all" ON sales FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Storage バケット
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true) ON CONFLICT (id) DO NOTHING;

-- 料金・送料・資材マスタ投入
INSERT INTO fee_rates (platform, display_name, rate_percent, rakuma_rank) VALUES
  ('mercari', 'メルカリ（10%固定）', 10, NULL),
  ('rakuma', 'ラクマ 10%', 10, 1),
  ('rakuma', 'ラクマ 9%', 9, 2),
  ('rakuma', 'ラクマ 8%', 8, 3),
  ('rakuma', 'ラクマ 7%', 7, 4),
  ('rakuma', 'ラクマ 6%', 6, 5),
  ('rakuma', 'ラクマ 4.5%', 4.5, 6);

INSERT INTO shipping_rates (platform, display_name, base_fee_yen, size_label) VALUES
  ('mercari', 'ネコポス', 210, NULL),
  ('mercari', '宅急便コンパクト', 450, NULL),
  ('mercari', '宅急便60', 750, '60'),
  ('mercari', '宅急便80', 950, '80'),
  ('mercari', '宅急便100', 1150, '100'),
  ('mercari', '宅急便120', 1350, '120'),
  ('mercari', '宅急便140', 1500, '140'),
  ('mercari', '宅急便160', 1700, '160'),
  ('mercari', 'ゆうパケットポストmini', 160, NULL),
  ('mercari', 'ゆうパケット', 230, NULL),
  ('mercari', 'ゆうパケットポスト', 215, NULL),
  ('mercari', 'ゆうパケットプラス', 455, NULL),
  ('mercari', 'ゆうパック60', 770, '60'),
  ('mercari', 'ゆうパック80', 900, '80'),
  ('mercari', 'ゆうパック100', 1200, '100'),
  ('mercari', 'ゆうパック120', 1400, '120'),
  ('mercari', 'たのメル便', 180, NULL),
  ('mercari', 'エコメルカリ便', 230, NULL),
  ('mercari', '定形郵便', 94, NULL),
  ('mercari', '定形外郵便', 120, NULL),
  ('mercari', 'レターパックライト', 370, NULL),
  ('mercari', 'レターパックプラス', 520, NULL),
  ('mercari', 'クリックポスト', 198, NULL),
  ('mercari', 'スマートレター', 180, NULL);

INSERT INTO shipping_rates (platform, display_name, base_fee_yen, size_label) VALUES
  ('rakuma', 'ゆうパケット', 180, NULL),
  ('rakuma', 'ゆうパケットポスト', 175, NULL),
  ('rakuma', 'ゆうパケットポストmini', 160, NULL),
  ('rakuma', 'ゆうパケットプラス', 380, NULL),
  ('rakuma', 'ゆうパック60', 700, '60'),
  ('rakuma', 'ゆうパック80', 800, '80'),
  ('rakuma', 'ゆうパック100', 1150, '100'),
  ('rakuma', 'ゆうパック120', 1350, '120'),
  ('rakuma', 'ゆうパック140', 1500, '140'),
  ('rakuma', 'ゆうパック160', 1500, '160'),
  ('rakuma', 'ゆうパック170', 1500, '170'),
  ('rakuma', 'ネコポス', 200, NULL),
  ('rakuma', '宅急便コンパクト', 590, NULL),
  ('rakuma', '宅急便60', 900, '60'),
  ('rakuma', '宅急便80', 1000, '80'),
  ('rakuma', '宅急便100', 1150, '100'),
  ('rakuma', '宅急便120', 1350, '120'),
  ('rakuma', '宅急便140', 1800, '140'),
  ('rakuma', '宅急便160', 2000, '160'),
  ('rakuma', '宅急便180', 2800, '180'),
  ('rakuma', '宅急便200', 3350, '200');

INSERT INTO shipping_rates (platform, display_name, base_fee_yen, is_custom) VALUES
  ('mercari', 'その他（自由入力）', 0, true),
  ('rakuma', 'その他（自由入力）', 0, true);

INSERT INTO material_fees (platform, display_name, fee_yen) VALUES
  ('mercari', '宅急便コンパクト専用BOX', 70),
  ('mercari', 'ゆうパケットポスト専用箱', 65),
  ('mercari', 'ゆうパケットポストmini封筒', 20),
  ('mercari', 'ゆうパケットプラス専用箱', 65),
  ('rakuma', '宅急便コンパクト専用資材', 70),
  ('rakuma', 'ゆうパケットポスト専用箱', 65),
  ('rakuma', 'ゆうパケットポストmini封筒', 20),
  ('rakuma', 'ゆうパケットプラス専用箱', 65);

-- セット商品削除時に構成商品の在庫を復元する関数
CREATE OR REPLACE FUNCTION delete_product_with_stock_restore(p_product_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock INT;
  r RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Product not found or access denied';
  END IF;
  SELECT stock INTO v_stock FROM products WHERE id = p_product_id;
  FOR r IN
    SELECT component_product_id, quantity_per_set
    FROM product_set_items
    WHERE set_product_id = p_product_id
  LOOP
    UPDATE products
    SET stock = stock + (v_stock * r.quantity_per_set),
        updated_at = NOW()
    WHERE id = r.component_product_id AND user_id = p_user_id;
  END LOOP;
  DELETE FROM products WHERE id = p_product_id AND user_id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION delete_product_with_stock_restore(UUID, UUID) TO authenticated;
