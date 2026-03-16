-- Amazon 売上集計 mart テーブル（再設計 Phase7）
-- 事前集計による高速読み取り用。amazon_sales_lines + amazon_fee_events を集約。
-- 更新は scripts/amazon-build-sales-mart.ts から実行（upsert で全量置き換え）。

-- 日次集計
CREATE TABLE IF NOT EXISTS amazon_sales_summary_daily (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        date        NOT NULL,
  order_count integer     NOT NULL DEFAULT 0,
  line_count  integer     NOT NULL DEFAULT 0,
  units_sold  integer     NOT NULL DEFAULT 0,
  sales_amount_yen    integer NOT NULL DEFAULT 0,
  fee_amount_yen      integer NOT NULL DEFAULT 0,
  sales_after_fee_yen integer NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

-- 月次集計
CREATE TABLE IF NOT EXISTS amazon_sales_summary_monthly (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month       text        NOT NULL, -- YYYY-MM
  order_count integer     NOT NULL DEFAULT 0,
  line_count  integer     NOT NULL DEFAULT 0,
  units_sold  integer     NOT NULL DEFAULT 0,
  sales_amount_yen    integer NOT NULL DEFAULT 0,
  fee_amount_yen      integer NOT NULL DEFAULT 0,
  sales_after_fee_yen integer NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);

-- SKU別集計（全期間）
CREATE TABLE IF NOT EXISTS amazon_sales_summary_sku (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sku          text        NOT NULL,
  product_name text,
  order_count  integer     NOT NULL DEFAULT 0,
  line_count   integer     NOT NULL DEFAULT 0,
  units_sold   integer     NOT NULL DEFAULT 0,
  sales_amount_yen    integer NOT NULL DEFAULT 0,
  fee_amount_yen      integer NOT NULL DEFAULT 0,
  sales_after_fee_yen integer NOT NULL DEFAULT 0,
  computed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sku)
);

-- ASIN別集計（全期間）
CREATE TABLE IF NOT EXISTS amazon_sales_summary_asin (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asin         text        NOT NULL,
  product_name text,
  order_count  integer     NOT NULL DEFAULT 0,
  line_count   integer     NOT NULL DEFAULT 0,
  units_sold   integer     NOT NULL DEFAULT 0,
  sales_amount_yen    integer NOT NULL DEFAULT 0,
  fee_amount_yen      integer NOT NULL DEFAULT 0,
  sales_after_fee_yen integer NOT NULL DEFAULT 0,
  computed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, asin)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_sales_summary_daily_user_date
  ON amazon_sales_summary_daily (user_id, date);

CREATE INDEX IF NOT EXISTS idx_sales_summary_monthly_user_month
  ON amazon_sales_summary_monthly (user_id, month);

CREATE INDEX IF NOT EXISTS idx_sales_summary_sku_user_sales
  ON amazon_sales_summary_sku (user_id, sales_amount_yen DESC);

CREATE INDEX IF NOT EXISTS idx_sales_summary_asin_user_sales
  ON amazon_sales_summary_asin (user_id, sales_amount_yen DESC);

-- RLS
ALTER TABLE amazon_sales_summary_daily    ENABLE ROW LEVEL SECURITY;
ALTER TABLE amazon_sales_summary_monthly  ENABLE ROW LEVEL SECURITY;
ALTER TABLE amazon_sales_summary_sku      ENABLE ROW LEVEL SECURITY;
ALTER TABLE amazon_sales_summary_asin     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own daily summary"
  ON amazon_sales_summary_daily FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own monthly summary"
  ON amazon_sales_summary_monthly FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own sku summary"
  ON amazon_sales_summary_sku FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own asin summary"
  ON amazon_sales_summary_asin FOR ALL USING (auth.uid() = user_id);

-- Service role 用ポリシー（スクリプトからの upsert に必要）
CREATE POLICY "Service role full access daily"
  ON amazon_sales_summary_daily FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access monthly"
  ON amazon_sales_summary_monthly FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access sku"
  ON amazon_sales_summary_sku FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access asin"
  ON amazon_sales_summary_asin FOR ALL TO service_role USING (true) WITH CHECK (true);
