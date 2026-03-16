# マイグレーション接続の設定

「Tenant or user not found」が出る原因は、**接続文字列のホスト名や形式の誤り**です。
プロジェクトごとにリージョン（例: aws-1-ap-southeast-1）が異なるため、ダッシュボードの表示をそのまま使う必要があります。

## 推奨: SUPABASE_DB_PASSWORD を使う（最も簡単）

`supabase link` 済みのプロジェクトでは、パスワードだけ設定すれば正しい接続先が自動で使われます。

1. `.env.local` に追加（SUPABASE_DB_URL は削除またはコメントアウト）:
   ```
   SUPABASE_DB_PASSWORD=あなたのデータベースパスワード
   ```

2. マイグレーション実行:
   ```powershell
   npm run supabase-migrate
   ```

※ `supabase link` 未実行の場合は、プロジェクトルートで `npx supabase link` を実行してください。

## 方法2: SUPABASE_DB_URL を直接設定

Connect モーダルで **Session pooler** を選択し、表示された URI をそのままコピー。
`[YOUR-PASSWORD]` を実際のパスワードに置き換え、`.env.local` に設定:

```
SUPABASE_DB_URL=postgresql://postgres.プロジェクトID:パスワード@aws-X-リージョン.pooler.supabase.com:5432/postgres
```

**注意**: ホスト名（aws-0-ap-northeast-1 等）はプロジェクトにより異なります。必ず Connect モーダルの表示を使ってください。
