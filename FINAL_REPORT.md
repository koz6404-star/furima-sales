# フリマ売上管理アプリ 最終レポート

## 1. 追加/変更した主要ファイル

### 新規作成
| ファイル | 説明 |
|---------|------|
| `src/app/page.tsx` | ホーム（ダッシュボードリンク） |
| `src/app/login/page.tsx` | ログイン |
| `src/app/signup/page.tsx` | 新規登録 |
| `src/app/products/page.tsx` | 商品一覧（在庫あり） |
| `src/app/products/sold-out/page.tsx` | 完売一覧 |
| `src/app/products/new/page.tsx` | 商品手動登録 |
| `src/app/products/[id]/page.tsx` | 商品詳細・販売登録・販売履歴 |
| `src/app/products/[id]/sale-form.tsx` | 販売登録フォーム |
| `src/app/products/[id]/restock-form.tsx` | 再入荷フォーム |
| `src/app/import/page.tsx` | Excel/ZIP 取り込み |
| `src/app/dashboard/page.tsx` | 月次ダッシュボード |
| `src/app/settings/page.tsx` | 設定 |
| `src/app/settings/settings-form.tsx` | 設定フォーム |
| `src/components/nav.tsx` | ナビゲーション |
| `src/lib/supabase/client.ts` | Supabase ブラウザクライアント |
| `src/lib/supabase/server.ts` | Supabase サーバークライアント |
| `src/lib/supabase/middleware.ts` | 認証ミドルウェア |
| `src/lib/calculations.ts` | 手数料・粗利計算 |
| `src/lib/__tests__/calculations.test.ts` | 計算ユニットテスト |
| `src/middleware.ts` | Next.js ミドルウェア |
| `src/types/index.ts` | 型定義 |
| `supabase/migrations/001_initial_schema.sql` | DB スキーマ |
| `supabase/migrations/002_storage.sql` | Storage バケット |
| `supabase/seed.sql` | 初期マスタ（手数料・送料・資材） |
| `e2e/app.spec.ts` | E2E テスト |
| `vitest.config.ts` | Vitest 設定 |
| `playwright.config.ts` | Playwright 設定 |

---

## 2. 実行したコマンド（成功/失敗）

| コマンド | 結果 |
|---------|------|
| `git init` | 成功 |
| `git checkout -b auto/furima-sales-share` | 成功 |
| `npx create-next-app` | 成功（furima-sales で作成後、ルートへ移動） |
| `npm install @supabase/supabase-js @supabase/ssr xlsx jszip uuid` | 成功 |
| `npm install -D vitest @playwright/test` 等 | 成功 |
| `npm run test` (Vitest) | 成功（9 tests passed） |
| `npm run build` | 成功 |
| `npm run test:e2e` (Playwright) | 成功（3 tests passed） |
| `git commit` | 成功 |

---

## 3. テスト結果

### Vitest（ユニットテスト）
- `src/lib/__tests__/calculations.test.ts`: 9 tests passed
- 手数料計算、利益率価格、粗利計算を検証

### Playwright（E2E）
- ログインページ表示
- 未認証時のリダイレクト
- 新規登録ページ表示

---

## 4. 共有 URL

Vercel デプロイ後に発行されます。

**デプロイ手順（要ログイン）:**

1. [Vercel](https://vercel.com) にログイン
2. **Add New** → **Project** → このフォルダをインポート
3. 環境変数を設定:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Deploy** を実行

---

## 5. Supabase/Vercel 設定手順（日本語・コピペ中心）

### Supabase
1. https://supabase.com でアカウント作成・ログイン
2. **New Project** でプロジェクト作成（リージョン等を選択）
3. **Settings** → **API** で Project URL と anon key をコピー
4. `.env.local` に設定:
   ```
   NEXT_PUBLIC_SUPABASE_URL=<Project URL>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```
5. **SQL Editor** で順に実行:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_storage.sql`  
     （エラー時は Storage から手動で `product-images` バケット作成）
   - `supabase/seed.sql`
6. **Authentication** → **Providers** で Email を有効化

### Vercel
1. https://vercel.com でログイン
2. **Add New** → **Project**
3. リポジトリをインポート（GitHub 連携または手動アップロード）
4. **Environment Variables** に Supabase の URL と anon key を追加
5. **Deploy**

---

## 6. Excel テンプレート例

推奨列: **SKU**, **商品名**, **原価（税込）**, **在庫数**, **メモ**

| SKU | 商品名 | 原価（税込） | 在庫数 | メモ |
|-----|--------|-------------|--------|------|
| A001 | サンプル商品A | 1000 | 5 | テスト用 |
| A002 | サンプル商品B | 2500 | 3 | |

サンプル生成: `node scripts/generate-excel-template.mjs`

---

## 7. 料金マスタ一覧（初期値）

### 販売手数料
- メルカリ: 10%（固定）
- ラクマ: 10%, 9%, 8%, 7%, 6%, 4.5%（6段階）

### 送料（メルカリ）
ネコポス 210円、宅急便コンパクト 450円、宅急便60 750円、ゆうパケットポストmini 160円、ゆうパケット 230円、ゆうパケットポスト 220円、ゆうパケットプラス 455円、ゆうパック60 770円、たのメル便 180円、定形郵便 94円、定形外 120円、レターパックライト 370円、レターパックプラス 520円、クリックポスト 198円、スマートレター 180円、その他（自由入力）

### 送料（ラクマ）
ゆうパケット 200円、ゆうパケットポスト 175円、ゆうパケットポストmini 150円、ゆうパケットプラス 380円、ゆうパック60〜170、ネコポス 200円、宅急便コンパクト 430円、宅急便60〜200、その他（自由入力）

### 資材代
宅急便コンパクト専用BOX 70円、ゆうパケットポスト専用箱 65円、ゆうパケットポストmini封筒 20円、ゆうパケットプラス専用箱 65円（メルカリ・ラクマ各）

---

## 8. ログインが必要な作業

**Vercel デプロイ時:**  
Vercel にログインし、プロジェクトをインポートして環境変数を設定する必要があります。ログイン後は上記手順に従ってデプロイを完了してください。
