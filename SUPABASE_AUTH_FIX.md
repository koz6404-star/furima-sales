# メール確認リンクが開けない場合の対処

## 原因

Supabase の「Site URL」と「Redirect URLs」が、実際のアプリURLと一致していないためです。

## 対処手順

### 1. URL Configuration を開く

次のリンクをクリック:
https://supabase.com/dashboard/project/ewxzsftkxkqrvhjavrfd/auth/url-configuration

### 2. 次のように設定する

**Site URL** にアプリのURLを入力:
```
https://furima-sales-4jpp2oc0d-koz6404-3041s-projects.vercel.app
```
（あなたのVercelの実際のURLに置き換えてください）

**Redirect URLs** に以下を追加（＋で追加）:
```
https://furima-sales-4jpp2oc0d-koz6404-3041s-projects.vercel.app/**
https://furima-sales-4jpp2oc0d-koz6404-3041s-projects.vercel.app/auth/callback
```

### 3. 「Save」をクリック

---

## アプリのURLの確認方法

Vercel のプロジェクト → ドメイン一覧に表示されているURLを使用してください。
例: `furima-sales-xxx.vercel.app` 形式

---

## 補足: メール確認を省略する（開発時のみ）

Supabase > Authentication > Providers > Email で  
**「Confirm email」** をオフにすると、確認メールなしで即ログインできます。  
本番ではオンにすることを推奨します。
