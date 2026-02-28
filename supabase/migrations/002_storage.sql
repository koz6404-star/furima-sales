-- Storage: 商品画像用バケット
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);

-- 認証済みユーザーが自分のフォルダにのみアップロード可能
CREATE POLICY "product_images_upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "product_images_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'product-images');
CREATE POLICY "product_images_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "product_images_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);
