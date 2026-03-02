-- products.stock > 0 だが product_location_stock（家+倉庫）が 0 または少ない不整合を修正
-- 差分を「家」に追加して整合させる

-- 1. home 行がなく、在庫合計が stock 未満の場合に home を追加
INSERT INTO product_location_stock (product_id, location, quantity, updated_at)
SELECT p.id, 'home',
  GREATEST(0, p.stock - COALESCE(
    (SELECT SUM(quantity) FROM product_location_stock WHERE product_id = p.id),
    0
  )),
  NOW()
FROM products p
WHERE p.stock > 0
  AND NOT EXISTS (SELECT 1 FROM product_location_stock pls WHERE pls.product_id = p.id AND pls.location = 'home')
  AND COALESCE((SELECT SUM(quantity) FROM product_location_stock WHERE product_id = p.id), 0) < p.stock
ON CONFLICT (product_id, location) DO NOTHING;

-- 2. home 行が存在するが在庫合計が stock 未満の場合、home を増加
UPDATE product_location_stock pls
SET quantity = GREATEST(0, p.stock - COALESCE(
  (SELECT quantity FROM product_location_stock pls2 WHERE pls2.product_id = pls.product_id AND pls2.location = 'warehouse'),
  0
)),
    updated_at = NOW()
FROM products p
WHERE pls.product_id = p.id
  AND pls.location = 'home'
  AND p.stock > 0
  AND (pls.quantity + COALESCE(
    (SELECT quantity FROM product_location_stock pls3 WHERE pls3.product_id = pls.product_id AND pls3.location = 'warehouse'),
    0
  )) < p.stock;
