# マイグレーション 017 のロールバック手順

**017_amazon_support** を元に戻す場合は、以下のSQLを Supabase SQL Editor で実行してください。

```sql
-- 1. products の platform, asin 列を削除
ALTER TABLE products DROP COLUMN IF EXISTS platform;
ALTER TABLE products DROP COLUMN IF EXISTS asin;
DROP INDEX IF EXISTS idx_products_asin;

-- 2. sales の ad_spend_yen 列を削除
ALTER TABLE sales DROP COLUMN IF EXISTS ad_spend_yen;
```

**注意**: PostgreSQL の ENUM から `'amazon'` の値を削除するのは複雑なため、enum の変更は戻しません。
未使用のままでも動作に支障はありません。完全に戻すには新規 enum の作成とテーブル変更が必要です。
