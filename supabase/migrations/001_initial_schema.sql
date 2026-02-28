-- フリマ売上・在庫管理アプリ 初期スキーマ
-- RLS有効化
ALTER DATABASE postgres SET "app.settings.jwt_secret" = '';

-- プラットフォーム enum
CREATE TYPE platform_type AS ENUM ('mercari', 'rakuma');

-- 端数処理 enum
CREATE TYPE rounding_type AS ENUM ('floor', 'ceil', 'round');

-- 販売手数料マスタ（メルカリ固定、ラクマ6段階）
CREATE TABLE fee_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform platform_type NOT NULL,
  display_name TEXT NOT NULL,
  rate_percent NUMERIC(5,2) NOT NULL,
  rakuma_rank INT, -- ラクマのみ: 1-6 (4.5%が最小=6)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 送料マスタ
CREATE TABLE shipping_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform platform_type NOT NULL,
  display_name TEXT NOT NULL,
  base_fee_yen INT NOT NULL,
  size_label TEXT, -- 60/80/100等（大型用）
  is_custom BOOLEAN DEFAULT false, -- 自由入力用
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 資材代マスタ（送料とは別）
CREATE TABLE material_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform platform_type NOT NULL,
  display_name TEXT NOT NULL,
  fee_yen INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- アプリ設定（手数料率・端数処理・送料に資材を含めるか）
CREATE TABLE app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  platform platform_type NOT NULL,
  fee_rate_id UUID REFERENCES fee_rates(id),
  rounding rounding_type DEFAULT 'floor',
  include_material_in_shipping BOOLEAN DEFAULT false,
  rakuma_manual_rank INT, -- ラクマ手動ランク選択 (1-6)
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
  cost_yen INT NOT NULL, -- 原価(税込)
  stock INT NOT NULL DEFAULT 0,
  image_url TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_products_user_id ON products(user_id);
CREATE INDEX idx_products_sku ON products(user_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_products_stock ON products(user_id, stock) WHERE stock > 0;

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

-- RLS ポリシー
ALTER TABLE fee_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- マスタ系は全ユーザー読み取り可（認証済み）
CREATE POLICY "fee_rates_read" ON fee_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "shipping_rates_read" ON shipping_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "material_fees_read" ON material_fees FOR SELECT TO authenticated USING (true);

-- app_settings: 自分のみ
CREATE POLICY "app_settings_all" ON app_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- products: 自分のみ
CREATE POLICY "products_all" ON products FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- sales: 自分のみ
CREATE POLICY "sales_all" ON sales FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
