-- Storage: 商品画像用バケット
-- ※ Supabase Dashboard の Storage から手動でバケット作成する場合もある
-- バケット名: product-images, Public: true
INSERT INTO storage.buckets (id, name, public) 
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;
