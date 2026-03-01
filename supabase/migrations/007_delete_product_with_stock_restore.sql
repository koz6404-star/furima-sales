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
  -- ユーザーが当該商品を所有しているか確認
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Product not found or access denied';
  END IF;

  -- セットの現在在庫を取得
  SELECT stock INTO v_stock FROM products WHERE id = p_product_id;

  -- セット品の場合のみ構成商品の在庫を復元（product_set_items に存在する場合）
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

  -- 商品を削除（CASCADE で product_set_items も削除される）
  DELETE FROM products WHERE id = p_product_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_product_with_stock_restore(UUID, UUID) TO authenticated;
