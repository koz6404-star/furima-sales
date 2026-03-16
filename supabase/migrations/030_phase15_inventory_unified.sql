-- Phase15: FBM 売上結合・統合在庫ビュー
-- 1. amazon_sales_summary_sku に fulfillment_type / current_inventory 列を追加
-- 2. FBA + FBM 在庫を統合するビューを作成

-- ─── 1. SKU サマリーに列追加 ──────────────────────────────
ALTER TABLE amazon_sales_summary_sku
  ADD COLUMN IF NOT EXISTS fulfillment_type TEXT,      -- FBA / FBM / MIXED
  ADD COLUMN IF NOT EXISTS current_inventory INT;      -- 最新在庫数（FBA or FBM から取得）

-- ─── 2. 統合在庫ビュー ───────────────────────────────────
-- FBA（amazon_inventory_current）と FBM（amazon_fbm_inventory_current）を
-- 同じ形式で UNION ALL したビュー。
-- 画面やAPIから「全 SKU の在庫」を1回で取得できる。
CREATE OR REPLACE VIEW amazon_inventory_unified AS
SELECT
  ic.user_id,
  ic.seller_sku,
  'FBA'::TEXT          AS channel_type,
  ic.fulfillable_qty   AS available_qty,
  ic.inbound_qty,
  ic.reserved_qty,
  ic.unfulfillable_qty,
  ic.snapshot_at,
  ic.fetched_at,
  NULL::TEXT           AS item_name,
  NULL::TEXT           AS listing_status
FROM amazon_inventory_current ic
UNION ALL
SELECT
  fc.user_id,
  fc.seller_sku,
  'FBM'::TEXT          AS channel_type,
  fc.quantity           AS available_qty,
  0                     AS inbound_qty,
  0                     AS reserved_qty,
  0                     AS unfulfillable_qty,
  fc.snapshot_at,
  fc.fetched_at,
  fc.item_name,
  fc.listing_status
FROM amazon_fbm_inventory_current fc;
