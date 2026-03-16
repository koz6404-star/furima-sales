# 015 マイグレーションを今すぐ反映する手順（約30秒）

1. **以下をクリックして SQL Editor を開く**  
   https://supabase.com/dashboard/project/ewxzsftkxkqrvhjavrfd/sql/new

2. **下の SQL をすべてコピーして貼り付け**

3. **「Run」をクリック**

---

```sql
CREATE OR REPLACE FUNCTION delete_product_with_stock_restore(p_product_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock INT;
  v_sold INT;
  v_restore_per_component INT;
  r RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Product not found or access denied';
  END IF;
  SELECT stock INTO v_stock FROM products WHERE id = p_product_id;
  SELECT COALESCE(SUM(quantity), 0)::INT INTO v_sold
  FROM sales WHERE product_id = p_product_id AND user_id = p_user_id;
  FOR r IN
    SELECT component_product_id, quantity_per_set
    FROM product_set_items
    WHERE set_product_id = p_product_id
  LOOP
    v_restore_per_component := (v_stock + v_sold) * r.quantity_per_set;
    IF v_restore_per_component > 0 THEN
      UPDATE products SET stock = stock + v_restore_per_component, updated_at = NOW()
      WHERE id = r.component_product_id AND user_id = p_user_id;
      INSERT INTO product_location_stock (product_id, location, quantity, updated_at)
      VALUES (r.component_product_id, 'home', v_restore_per_component, NOW())
      ON CONFLICT (product_id, location) DO UPDATE
      SET quantity = product_location_stock.quantity + EXCLUDED.quantity, updated_at = NOW();
    END IF;
  END LOOP;
  DELETE FROM products WHERE id = p_product_id AND user_id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION delete_product_with_stock_restore(UUID, UUID) TO authenticated;
```
