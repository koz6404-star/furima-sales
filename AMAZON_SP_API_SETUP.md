# Amazon SP-API 認証・環境変数セットアップ

Amazon自動同期を使うには、SP-API の認証情報が必要です。以下を順に実施してください。

---

## 1. 前提条件

- **開発者プロフィール**が承認済みであること（開発者コンソールで確認）
- **財務会計（Finance & Accounting）**ロールが承認されていること（売上同期用）
- **在庫と注文の追跡（Inventory and Order Tracking）**ロールが承認されていること（FBA在庫同期用・必須）
  - 未承認の場合「Access to requested resource is denied」となり在庫が取得できません
  - 開発者コンソールで該当アプリを開き、**Inventory and Order Tracking** または **Amazon Warehousing and Distribution** ロールを追加。追加後、セルフ認証の場合は再認証が必要

---

## 2. アプリクライアントの作成

1. セラーセントラルにログインし、いずれかから開発者コンソールを開く：
   - **方法A**: [開発者コンソール（日本）](https://sellercentral.amazon.co.jp/sellingpartner/developerconsole) に直接アクセス
   - **方法B**: セラーセントラル → **アプリとサービス** メニュー → **アプリを開発**（Develop Apps）
2. **認証情報を管理**
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

自社向けアプリとして扱う場合、セルフ認証でリフレッシュトークンを取得できます。

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
| `AMAZON_SELLER_ID` | （任意）FBM在庫取得用。Seller Central「商取引アカウント ID」。未設定時は FBA 在庫のみ同期 | `A1XXXXXXX` |

### 4.1 ローカル開発（.env.local）

プロジェクトルートの `.env.local` に追加：

```
SELLING_PARTNER_APP_CLIENT_ID=amzn1.application-oa2-client.xxxxx
SELLING_PARTNER_APP_CLIENT_SECRET=amzn1.oa2-cs.v1.xxxxx
AMAZON_REFRESH_TOKEN=Atzr|xxxxx
# FBM在庫を同期する場合は Seller Central の商取引アカウント ID を追加
AMAZON_SELLER_ID=A1XXXXXXX
```

`.env.local` は git にコミットしないでください（`.gitignore` に含まれている想定）。

### 4.2 Vercel（本番）

1. Vercel プロジェクト → **Settings** → **Environment Variables**
2. 上記3つの変数を追加
3. **Production / Preview / Development** のいずれかに適用
4. 再デプロイ後、反映されます

### 4.3 AMAZON_SELLER_ID（商取引アカウント ID）の確認方法（FBM 在庫同期用）

FBM（自社発送）商品の在庫を同期するには、**商取引アカウント ID**（セラーID / 出品者ID / 出品者トークン）を環境変数 `AMAZON_SELLER_ID` に設定する必要があります。

この ID は **13〜14桁の英数字**で、**「A1」で始まる**形式です（例: `A1XX22YY33ZZ44`）。

#### 方法1: セラーセントラル設定画面から確認（推奨）

1. [Seller Central（セラーセントラル）](https://sellercentral.amazon.co.jp/) にログイン
2. ページ右上の **歯車アイコン（設定）** をクリック
3. **出品用アカウント情報** → **出品者情報** をクリック
4. **「あなたの出品者トークン」** をクリック
5. 表示された英数字（`A1` で始まる13〜14桁）が商取引アカウント ID です

> **注意**: 小口出品プランの場合、「出品者トークン」が表示されないことがあります。その場合は方法2を試してください。

#### 方法2: インテグレーション画面から確認

1. セラーセントラルにログイン
2. 右上の **設定** → **インテグレーション** を選択
3. **出品者ID** の欄に表示されている英数字を確認

> 「インテグレーション」が表示されない場合は、アカウントのプライマリユーザーに権限付与を依頼してください。

#### 方法3: ストアフロントの URL から確認

1. セラーセントラルにログイン
2. **パフォーマンス** → **評価** → **詳しい出品者情報** をクリック
3. ストアフロントページが開くので、ブラウザのアドレスバーの URL を確認
4. `amazon.co.jp/shops/` の **直後に続く英数字**、または URL 内の **`seller=`** の後に続く英数字がセラーID です

#### 方法4: 自社出品商品のリンクから確認

1. 自社で出品している商品のページを Amazon で開く
2. **「新品の出品：XX円」** のリンクから自社のショップ名をクリック
3. 開いたストアページの URL に `seller=A1XXXXXXXXXXXX` のように含まれている部分の `A1...` がセラーID

#### 設定例

確認した ID を `.env.local` または Vercel の環境変数に追加：

```
AMAZON_SELLER_ID=A1XX22YY33ZZ44
```

> `AMAZON_SELLER_ID` を設定しない場合、**FBA 在庫のみ**同期され、FBM 在庫は取得されません。

---

## 5. 同期の使い方

1. アプリにログインする
2. **商品一覧** ページを開く

### 初回取込（2025年2月〜の全データ）

初回のみ **「初回取込（2月～）」** ボタンをクリック。2025年2月から今日までを180日ずつ分割して取得します。

> **補足**: 取得に時間がかかることがあります。Vercel 無料プラン（10秒タイムアウト）の場合は、ローカルで `npm run dev` を起動してから実行すると確実です。

### 日常の更新同期

以降は **「Amazon同期」** ボタンで、過去90日分の売上差分と在庫を取得します。既に登録済みの注文は重複登録されません。

### 在庫同期について

- **FBA在庫**: FBA Inventory API で全SKUの在庫を取得します。
  - 既存の Amazon 商品（`platform=amazon` かつ `sku` あり）の在庫を更新します。
  - **products に未登録の FBA SKU で在庫ありのものは、新規商品として自動登録**されます（売上未発生でも出品中商品が商品一覧に表示されます）。
- **FBM在庫**: 環境変数 `AMAZON_SELLER_ID` を設定している場合、FBAにないSKUについて Listings API でFBM在庫を取得します。
- 在庫は `product_location_stock` に反映されます（FBA在庫→`fba`、FBM在庫→`warehouse`）。

---

## 5.5 FBA在庫用ロールの追加（「Access denied」が出る場合）

FBA在庫が「Access to requested resource is denied」で取得できない場合：

1. **[開発者コンソール（日本）](https://sellercentral.amazon.co.jp/sellingpartner/developerconsole)** を開く
2. ログイン後、該当アプリを選択
3. **ロール（Roles）** の設定で以下を追加：
   - **Inventory and Order Tracking**（在庫と注文の追跡）
   - または **Amazon Warehousing and Distribution**（Amazon Warehousing and Distribution）
4. 保存後、3章の認証URLで**再認証**し、新しいリフレッシュトークンを取得して環境変数を更新

---

## 6. トラブルシューティング

| 症状 | 対処 |
|------|------|
| 「Amazon SP-API credentials missing」 | 環境変数が未設定。4章を確認 |
| 「Access to requested resource is denied」 | 財務会計ロール未承認、またはリフレッシュトークンが無効 |
| 「Invalid refresh token」 | リフレッシュトークンの再取得（3章をやり直し） |
| 同期は動くがデータが0件 | 対象期間に Shipment トランザクションがない、またはマーケットプレイスが日本（A1VC38T7YXB528）でない |
| **FBA在庫が反映されない** | 「Access to requested resource is denied」の場合はロール不足。[開発者コンソール](https://sellercentral.amazon.co.jp/sellingpartner/developerconsole)で該当アプリのロールに「在庫と注文の追跡」または「Amazon Warehousing and Distribution」を追加 |
| **手数料・送料が0円のまま** | 初回同期後、再度「Amazon同期」を実行。既存売上は再実行時に手数料・送料が上書き更新されます |

---

## 参考

- [SP-API Developer Guide](https://developer-docs.amazon.com/sp-api/docs)
- [Finances API - listTransactions](https://developer-docs.amazon.com/sp-api/docs/finances-api-v1-reference#listtransactions)
- [Self authorization](https://developer-docs.amazon.com/sp-api/docs/registering-your-application#self-authorization)
