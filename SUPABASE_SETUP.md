# Supabase セットアップ手順

**この手順で編集するファイルは、すべてあなたのPC内のファイルです。**

---

## 方法A: SQL Editor で貼り付けて実行（おすすめ・パスワード不要）

接続文字列やパスワードは不要です。Supabase にログインした状態で以下を実行してください。

### ステップ1: SQL Editor を開く

次のリンクをクリック:
https://supabase.com/dashboard/project/ewxzsftkxkqrvhjavrfd/sql/new

### ステップ2: SQL を貼り付け

1. プロジェクト内の `supabase/setup-all-in-one.sql` を開く（Cursor 左パネル）
2. 中身を**すべて**選択してコピー（Ctrl+A → Ctrl+C）
3. SQL Editor の入力欄に貼り付け（Ctrl+V）

### ステップ3: 実行

「Run」ボタンをクリック

### ステップ4: 認証を有効化

左メニュー **Authentication** → **Providers** → **Email** を有効にする

---

これでセットアップ完了です。方法B（スクリプト）は接続文字列が必要な場合の代替です。

### ゆうパケットポスト（メルカリ）の料金を215円に訂正する場合

既存の shipping_rates でゆうパケットポストが220円になっている場合、SQL Editor で以下を実行してください:

```sql
UPDATE shipping_rates
SET base_fee_yen = 215
WHERE platform = 'mercari' AND display_name = 'ゆうパケットポスト';
```

### ラクマ送料を公式料金に更新する場合

ラクマの送料を公式（2025年）に合わせて更新する場合は、SQL Editor で以下を実行してください:

```sql
-- supabase/migrations/013_rakuma_shipping_rates_update.sql の内容
UPDATE shipping_rates SET base_fee_yen = 180
  WHERE platform = 'rakuma' AND display_name = 'ゆうパケット';

UPDATE shipping_rates SET base_fee_yen = 160
  WHERE platform = 'rakuma' AND display_name = 'ゆうパケットポストmini';

UPDATE shipping_rates SET base_fee_yen = 590
  WHERE platform = 'rakuma' AND display_name = '宅急便コンパクト';

UPDATE shipping_rates SET base_fee_yen = 900
  WHERE platform = 'rakuma' AND display_name = '宅急便60';

UPDATE shipping_rates SET base_fee_yen = 1000
  WHERE platform = 'rakuma' AND display_name = '宅急便80';

UPDATE shipping_rates SET base_fee_yen = 1150
  WHERE platform = 'rakuma' AND display_name = '宅急便100';

UPDATE shipping_rates SET base_fee_yen = 1350
  WHERE platform = 'rakuma' AND display_name = '宅急便120';

UPDATE shipping_rates SET base_fee_yen = 1800
  WHERE platform = 'rakuma' AND display_name = '宅急便140';

UPDATE shipping_rates SET base_fee_yen = 2000
  WHERE platform = 'rakuma' AND display_name = '宅急便160';
```

### 既存プロジェクトで products に企画・サイズ・色を追加する場合

すでに `setup-all-in-one.sql` を実行済みで、その後に `products` に `campaign` / `size` / `color` を追加した場合は、SQL Editor で以下を実行してください:

```sql
-- supabase/migrations/003_add_product_attributes.sql の内容
ALTER TABLE products ADD COLUMN IF NOT EXISTS campaign TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS size TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS color TEXT;
```

### 入荷日を追加する場合

`products` に `stock_received_at`（入荷日）を追加する場合は、SQL Editor で以下を実行してください:

```sql
-- supabase/migrations/005_add_stock_received_at.sql の内容
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_received_at DATE;
```

### 目安価格用送料を追加する場合

`products` に `default_shipping_yen`（目安価格計算用のデフォルト送料）を追加する場合は、SQL Editor で以下を実行してください:

```sql
-- supabase/migrations/006_add_default_shipping_yen.sql の内容
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_shipping_yen INT;
```

### 不良在庫判定（oldest_received_at）を追加する場合

入荷からの経過日数で「注意/警告/危険」を表示する場合は、SQL Editor で以下を実行してください:

```sql
-- supabase/migrations/009_oldest_received_at.sql の内容
ALTER TABLE products ADD COLUMN IF NOT EXISTS oldest_received_at DATE;
```

### 取り込み済みExcelの重複警告を有効にする場合

同じExcelファイルを2回目以降取り込むときに警告を出したい場合は、SQL Editor で以下を実行してください:

```sql
-- supabase/migrations/011_imported_excel_files.sql の内容
CREATE TABLE IF NOT EXISTS imported_excel_files (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_hash TEXT NOT NULL,
  file_name TEXT,
  imported_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, file_hash)
);

CREATE INDEX idx_imported_excel_files_user ON imported_excel_files(user_id);

ALTER TABLE imported_excel_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imported_excel_files_all" ON imported_excel_files FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

### 商品の並べ替え（目安価格20%ソート）を有効にする場合

「目安価格20%（高い順/低い順）」のソートを使うには、SQL Editor で以下を実行してください:

```sql
-- supabase/migrations/012_product_sort_columns.sql の内容
ALTER TABLE products ADD COLUMN IF NOT EXISTS target_price_20 INT GENERATED ALWAYS AS (
  CASE WHEN default_shipping_yen IS NOT NULL
  THEN CEIL((cost_yen * 1.2::numeric + default_shipping_yen) / 0.9)::int
  ELSE NULL
  END
) STORED;
```

### 保管場所機能（家・倉庫）を追加する場合

在庫を「家」「倉庫」で分けて管理したい場合は、SQL Editor で以下を実行してください:

```sql
-- supabase/migrations/010_product_location_stock.sql の内容
CREATE TABLE IF NOT EXISTS product_location_stock (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location TEXT NOT NULL CHECK (location IN ('home', 'warehouse')),
  quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (product_id, location)
);

CREATE INDEX idx_product_location_stock_product ON product_location_stock(product_id);

ALTER TABLE product_location_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_location_stock_all" ON product_location_stock FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND p.user_id = auth.uid())
  );

-- 既存商品の在庫を「家」に初期セット
INSERT INTO product_location_stock (product_id, location, quantity, updated_at)
SELECT id, 'home', stock, now()
FROM products
WHERE stock > 0
  AND NOT EXISTS (SELECT 1 FROM product_location_stock pls WHERE pls.product_id = products.id)
ON CONFLICT (product_id, location) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at;
```

### SKU編集制限と管理番号を追加する場合

Excel取込品のSKUを編集不可にし、ユーザー用の管理番号（custom_sku）を使えるようにする場合は、SQL Editor で以下を実行してください:

```sql
-- supabase/migrations/008_sku_locked_and_custom_sku.sql の内容
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku_locked BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS custom_sku TEXT;
```

### Excel取込で画像を反映する場合（Storage ポリシー）

Excelの埋め込み画像をアップロードするには、SQL Editor で以下を実行してください:

```sql
-- product-images バケットへのアップロードを許可
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
CREATE POLICY "Allow authenticated uploads" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
CREATE POLICY "Allow public read" ON storage.objects FOR SELECT TO public
USING (bucket_id = 'product-images');
```

### セット出品機能を使う場合（product_set_items テーブル）

一括選択からの「セット出品」を使うには、SQL Editor で以下を実行してください:

```sql
-- supabase/migrations/004_product_set_items.sql の内容
CREATE TABLE IF NOT EXISTS product_set_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_per_set INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(set_product_id, component_product_id)
);
CREATE INDEX idx_product_set_items_set ON product_set_items(set_product_id);
ALTER TABLE product_set_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_set_items_all" ON product_set_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM products p WHERE p.id = set_product_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM products p WHERE p.id = set_product_id AND p.user_id = auth.uid()));
```

### セット削除時の在庫復元を行う場合

セット出品した商品を削除した際に、構成単品の在庫を自動で元に戻すには、SQL Editor で以下を実行してください:

```sql
-- supabase/migrations/007_delete_product_with_stock_restore.sql の内容
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
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Product not found or access denied';
  END IF;
  SELECT stock INTO v_stock FROM products WHERE id = p_product_id;
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
  DELETE FROM products WHERE id = p_product_id AND user_id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION delete_product_with_stock_restore(UUID, UUID) TO authenticated;
```

---

## 方法B: スクリプトで実行（接続文字列が必要）

### 1. データベース接続文字列を取得

1. [Supabase Dashboard](https://supabase.com/dashboard) を開く
2. 対象プロジェクト（koz6404-star's Project）を選択
3. 左メニュー **Settings** → **Database**
4. 「**Connection string**」セクションで **URI** を選択
5. 表示された文字列をコピー（例: `postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`）
6. **`[YOUR-PASSWORD]` をプロジェクト作成時に設定したデータベースパスワードに置き換える**
   - パスワードを忘れた場合: Settings → Database → 「Reset database password」

## 2. .env.local に追加

**※ ここで扱う `.env.local` は、あなたのPC内にあるファイルです（ネット上ではなく、プロジェクトフォルダ内）。**

### ステップ1: ファイルを開く

- **場所**: `d:\カーサープロジェクト\フリマアプリ　売上管理アプリ作成\.env.local`
- **開き方**: Cursor の左パネルで「フリマアプリ　売上管理アプリ作成」フォルダを開き、`.env.local` をクリック  
  （見つからない場合は Cursor で `Ctrl+P` → `.env.local` と入力して開く）

※ `.env.local` が無い場合は、新規ファイルとして作成してください。

### ステップ2: 以下の1行を追加

既存の内容の**下に**、次の行をコピー＆ペーストして追加:

```
SUPABASE_DB_URL=postgresql://postgres.ewxzsftkxkqrvhjavrfd:あなたのパスワード@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
```

### ステップ3: パスワードを置き換え

`あなたのパスワード` の部分を、Supabase のデータベースパスワード（実際の文字列）に書き換える。

※ リージョン（`ap-northeast-1` 等）は Supabase の Connect で表示された URI を確認してください。

## 3. セットアップスクリプトを実行

```powershell
cd "d:\カーサープロジェクト\フリマアプリ　売上管理アプリ作成"
npm run supabase-setup
```

成功すると以下が実行されます:
- テーブル・スキーマの作成
- Storage バケット（product-images）の作成
- 料金・送料・資材マスタの投入

## 4. 手動で行う作業（認証の有効化）

スクリプトではできないため、手動で設定してください:

1. Supabase Dashboard → 左メニュー **Authentication** → **Providers**
2. **Email** を開き、**Enable** をオンにする
3. 必要に応じて「Confirm email」の設定を変更

---

以上で Supabase の準備は完了です。アプリからログイン・新規登録ができるようになります。
