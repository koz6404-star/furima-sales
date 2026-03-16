# メール確認リンクが開けない場合の対処

## 方法A: スクリプトで Site URL を自動設定（おすすめ）

ブラウザ操作は **トークン取得の1回だけ** です。

### ステップ1: トークンを作成（1回だけ・ブラウザで）

1. 次のリンクを開く: https://supabase.com/dashboard/account/tokens
2. 「Generate new token」をクリック
3. 名前を入力（例: auth-config）→ 作成
4. 表示されたトークンをコピー

### ステップ2: .env.local に追加（PC内のファイル）

以下の2行を .env.local に追加:

```
SUPABASE_ACCESS_TOKEN=コピーしたトークン
APP_URL=https://furima-sales-4jpp2oc0d-koz6404-3041s-projects.vercel.app
```

※ APP_URL は Vercel のドメイン一覧で確認した実際のURLに置き換えてください。

### ステップ3: スクリプトを実行

```powershell
cd "d:\カーサープロジェクト\フリマアプリ　売上管理アプリ作成"
node scripts/set-supabase-auth-url.mjs
```

→ Site URL が自動で設定されます。

### ステップ4: Redirect URLs を手動追加（1回だけ）

https://supabase.com/dashboard/project/ewxzsftkxkqrvhjavrfd/auth/url-configuration

「Redirect URLs」に以下を追加:
- `https://あなたのアプリURL/**`
- `https://あなたのアプリURL/auth/callback`

---

## 方法B: すべて手動で設定

https://supabase.com/dashboard/project/ewxzsftkxkqrvhjavrfd/auth/url-configuration

Site URL と Redirect URLs を手動で入力して Save。

---

## 補足: メール確認を省略する（開発時のみ）

Supabase > Authentication > Providers > Email で  
**「Confirm email」** をオフにすると、確認メールなしで即ログインできます。
