-- amazon_sku_cost の RLS ポリシー修正
-- FOR ALL + USING のみだと INSERT/UPDATE 時に WITH CHECK が効かずサイレントに失敗する場合がある。
-- 操作別にポリシーを分けて明示的に WITH CHECK を付与する。

DROP POLICY IF EXISTS "Users can manage own sku cost" ON amazon_sku_cost;

CREATE POLICY "Users can select own sku cost"
  ON amazon_sku_cost FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sku cost"
  ON amazon_sku_cost FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sku cost"
  ON amazon_sku_cost FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sku cost"
  ON amazon_sku_cost FOR DELETE
  USING (auth.uid() = user_id);
