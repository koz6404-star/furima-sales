# Amazon SP-API 認証・環境変数セットアップ

Amazon自動同期を使うには、SP-API の認証情報が必要です。以下を順に実施してください。

---

## 1. 前提条件

- **開発者プロフィール**が承認済みであること（SPPで確認）
- **財務会計（Finance & Accounting）**ロールが承認されていること

---

## 2. アプリクライアントの作成（SPP）

1. [Selling Partner Platform（SPP）](https://sellercentral.amazon.co.jp/sp) にログイン
2. **アプリとサービス** → **アプリを開発** → **認証情報を管理**
3. **アプリを追加** をクリック
4. 以下を入力して作成：
   - **アプリ名**: 例）フリマ売上管理
   - **OAuth ログイン URI**:  
     - セルフ認証用に `https://localhost` など（実際のリダイレクト先は使用しません）
   - **OAuth リダイレクト URI**:  
     - セルフ認証の場合、後述のツールで取得するため、ここでは `https://localhost/callback` でOK

5. 作成後、**LWA クライアント ID** と **LWA クライアントシークレット** を控える

---

## 3. リフレッシュトークンの取得（セルフ認証）

SPP が自社向けアプリとして扱う場合、セルフ認証でリフレッシュトークンを取得できます。

### 3.1 認証URLの生成

以下のURLをブラウザで開き、ログインして同意するとリダイレクト先URLに `spapi_oauth_code` が含まれます。

```
https://sellercentral.amazon.co.jp/apps/authorize/consent
  ?application_id=<LWAクライアントID>
  &state=state123
  &version=beta
```

- `<LWAクライアントID>` を、ステップ2で取得した LWA クライアント ID に置き換える
- リダイレクト先は「許可されていない」と表示される場合があるが、**アドレスバーのURL全体をコピー**する

### 3.2 リフレッシュトークンへの交換

取得した `spapi_oauth_code` を使って、以下のAPIでリフレッシュトークンを取得します。

```bash
curl -X POST "https://api.amazon.co.jp/auth/o2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=<spapi_oauth_codeの値>" \
  -d "client_id=<LWAクライアントID>" \
  -d "client_secret=<LWAクライアントシークレット>"
```

レスポンスの `refresh_token` を控えます。

> **Tip**: [amazon-sp-api](https://www.npmjs.com/package/amazon-sp-api) の `authorize` ユーティリティや、[SP-API OAuth ツール](https://github.com/amzn/selling-partner-api-docs/blob/main/guides/en-US/developer-guide/SellingPartnerApiDeveloperGuide.md#self-authorization) を使うと楽に取得できます。

---

## 4. 環境変数の設定

以下の3つを環境変数に設定してください。

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `SELLING_PARTNER_APP_CLIENT_ID` | LWA クライアント ID | `amzn1.application-oa2-client.xxx` |
| `SELLING_PARTNER_APP_CLIENT_SECRET` | LWA クライアントシークレット | `amzn1.oa2-cs.v1.xxx` |
| `AMAZON_REFRESH_TOKEN` | ステップ3で取得したリフレッシュトークン | `Atzr|xxx` |

### 4.1 ローカル開発（.env.local）

プロジェクトルートの `.env.local` に追加：

```
SELLING_PARTNER_APP_CLIENT_ID=amzn1.application-oa2-client.xxxxx
SELLING_PARTNER_APP_CLIENT_SECRET=amzn1.oa2-cs.v1.xxxxx
AMAZON_REFRESH_TOKEN=Atzr|xxxxx
```

`.env.local` は git にコミットしないでください（`.gitignore` に含まれている想定）。

### 4.2 Vercel（本番）

1. Vercel プロジェクト → **Settings** → **Environment Variables**
2. 上記3つの変数を追加
3. **Production / Preview / Development** のいずれかに適用
4. 再デプロイ後、反映されます

---

## 5. 同期の使い方

1. アプリにログインする
2. **商品一覧** ページを開く

### 初回取込（2025年2月〜の全データ）

初回のみ **「初回取込（2月～）」** ボタンをクリック。2025年2月から今日までを180日ずつ分割して取得します。

> **補足**: 取得に時間がかかることがあります。Vercel 無料プラン（10秒タイムアウト）の場合は、ローカルで `npm run dev` を起動してから実行すると確実です。

### 日常の更新同期

以降は **「Amazon同期」** ボタンで、過去90日分の差分のみを取得します。既に登録済みの注文は重複登録されません。

---

## 6. トラブルシューティング

| 症状 | 対処 |
|------|------|
| 「Amazon SP-API credentials missing」 | 環境変数が未設定。4章を確認 |
| 「Access to requested resource is denied」 | 財務会計ロール未承認、またはリフレッシュトークンが無効 |
| 「Invalid refresh token」 | リフレッシュトークンの再取得（3章をやり直し） |
| 同期は動くがデータが0件 | 対象期間に Shipment トランザクションがない、またはマーケットプレイスが日本（A1VC38T7YXB528）でない |

---

## 参考

- [SP-API Developer Guide](https://developer-docs.amazon.com/sp-api/docs)
- [Finances API - listTransactions](https://developer-docs.amazon.com/sp-api/docs/finances-api-v1-reference#listtransactions)
- [Self authorization](https://developer-docs.amazon.com/sp-api/docs/registering-your-application#self-authorization)
