# フリマ売上・在庫管理アプリ

メルカリ・ラクマの売上・在庫を管理する共有Webアプリ（Next.js + Supabase + Vercel）

## 主な機能

- **ログイン**: Supabase Auth（メール+パスワード）
- **商品マスタ**: 手動登録、画像、在庫、原価、想定価格（20%/30%利益率）
- **Excel取り込み**: .xlsx一括取込、画像はZIP（ファイル名=SKU）でフォールバック
- **販売登録**: 在庫減算、完売一覧へ自動移動
- **ダッシュボード**: 月次売上/利益/手数料/送料の集計、プラットフォーム別集計
- **設定**: 手数料率、ラクマランク、送料マスタ、端数処理

## 技術スタック

- Next.js 16 (TypeScript, App Router)
- Supabase (PostgreSQL, Auth, Storage)
- Tailwind CSS
- Vitest / Playwright
- Vercel（デプロイ先）

---

## セットアップ手順

### 1. リポジトリのクローンと依存関係

```bash
cd "フリマアプリ　売上管理アプリ作成"
npm install
```

### 2. Supabase プロジェクト作成

1. [Supabase](https://supabase.com) にログイン
2. **New Project** でプロジェクト作成
3. **Settings** → **API** から以下をコピー:
   - Project URL
   - anon public key

### 3. 環境変数の設定

`.env.local` を作成:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. Supabase データベースのマイグレーション

Supabase Dashboard の **SQL Editor** で順に実行:

1. `supabase/migrations/001_initial_schema.sql` の内容をコピー＆実行
2. `supabase/migrations/002_storage.sql` の内容をコピー＆実行  
   ※ Storage バケット作成でエラーが出る場合、Dashboard の **Storage** から手動で `product-images` バケット（public）を作成
3. `supabase/seed.sql` の内容をコピー＆実行（料金マスタ投入）

### 5. Auth の有効化

Supabase Dashboard → **Authentication** → **Providers** で **Email** を有効化。

---

## ローカル開発

```bash
npm run dev
```

http://localhost:3000 を開き、新規登録後ログイン。

---

## デプロイ（Vercel）

### 事前: Vercel にログインが必要です

以下の手順は **Vercel にログインした状態** で行ってください。

1. [Vercel](https://vercel.com) にログイン
2. **Add New** → **Project** → このリポジトリをインポート（または手動デプロイ）
3. **Environment Variables** に以下を追加:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Deploy**

---

## 運用コストの確認

Vercel と Supabase の使用量・料金を確認する手順は、**`COST_CHECK_MANUAL.md`** にまとめてあります。  
無料枠内かどうか、手順に沿って確認できます。

---

## 初期料金マスタ一覧

### 販売手数料

| プラットフォーム | 表示名 | 率 |
|---|---|---|
| メルカリ | メルカリ（10%固定） | 10% |
| ラクマ | ラクマ 10% | 10% |
| ラクマ | ラクマ 9% | 9% |
| ラクマ | ラクマ 8% | 8% |
| ラクマ | ラクマ 7% | 7% |
| ラクマ | ラクマ 6% | 6% |
| ラクマ | ラクマ 4.5% | 4.5% |

### 送料マスタ（メルカリ）

ネコポス 210円、宅急便コンパクト 450円、宅急便60 750円、ゆうパケットポストmini 160円、ゆうパケット 230円、ゆうパケットポスト 215円、ゆうパケットプラス 455円、たのメル便 180円、定形郵便 94円、レターパック等

### 送料マスタ（ラクマ）

ゆうパケット 200円、ゆうパケットポスト 175円、ゆうパケットポストmini 150円、ネコポス 200円、宅急便コンパクト 430円、宅急便60 650円 等

### 資材代マスタ

宅急便コンパクト専用BOX 70円、ゆうパケットポスト専用箱 65円、ゆうパケットポストmini封筒 20円 等

---

## Excel テンプレート

推奨列名: **SKU**, **商品名**, **原価（税込）**, **在庫数**, **メモ**

| SKU | 商品名 | 原価（税込） | 在庫数 | メモ |
|-----|--------|-------------|--------|------|
| A001 | サンプル商品 | 1000 | 5 | テスト |

画像は **ZIP で別途アップロード**（ファイル名 = SKU、例: `A001.jpg`）

---

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | 本番ビルド |
| `npm run start` | 本番サーバー起動 |
| `npm run test` | Vitest ユニットテスト |
| `npm run test:e2e` | Playwright E2Eテスト |
| `npm run lint` | ESLint |

---

## 主要ファイル構成

```
src/
├── app/
│   ├── page.tsx           # ホーム（ダッシュボードリンク）
│   ├── login/page.tsx     # ログイン
│   ├── signup/page.tsx    # 新規登録
│   ├── products/          # 商品一覧・完売・新規・詳細
│   ├── import/page.tsx    # Excel/ZIP 取り込み
│   ├── dashboard/page.tsx # 月次集計
│   └── settings/          # 設定
├── components/nav.tsx     # ナビゲーション
├── lib/
│   ├── supabase/          # Supabase クライアント
│   ├── calculations.ts   # 手数料・粗利計算
│   └── __tests__/         # 計算テスト
supabase/
├── migrations/            # SQL スキーマ
└── seed.sql               # 初期マスタ投入
e2e/app.spec.ts            # E2E テスト
```

---

## ライセンス

MIT
