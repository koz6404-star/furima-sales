# 017 マイグレーション（Amazon統合サポート）の適用手順

**ロールバック方法**: `supabase/migrations/ROLLBACK_017.md` を参照

---

## 手順（約1分）

1. **Supabase SQL Editor を開く**  
   https://supabase.com/dashboard/project/ewxzsftkxkqrvhjavrfd/sql/new

2. **下の SQL をすべてコピーして貼り付け**

3. **「Run」をクリック**

---

```sql
-- Amazon統合サポート
ALTER TYPE platform_type ADD VALUE IF NOT EXISTS 'amazon';

ALTER TABLE products ADD COLUMN IF NOT EXISTS platform platform_type;
COMMENT ON COLUMN products.platform IS 'amazon=Amazon商品, NULL/mercari/rakuma=フリマ商品';

ALTER TABLE sales ADD COLUMN IF NOT EXISTS ad_spend_yen INT DEFAULT 0;
COMMENT ON COLUMN sales.ad_spend_yen IS '広告費（Amazonのみ使用、他は0）';

ALTER TABLE products ADD COLUMN IF NOT EXISTS asin TEXT;
COMMENT ON COLUMN products.asin IS 'Amazon ASIN（platform=amazonの場合に使用）';
CREATE INDEX IF NOT EXISTS idx_products_asin ON products(user_id, asin) WHERE asin IS NOT NULL;
```

---

## 失敗した場合のロールバック

`supabase/migrations/ROLLBACK_017.md` の SQL を実行してください。
