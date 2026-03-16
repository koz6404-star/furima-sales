# Amazon連携 Phase 1 完了報告

完了日: 2025-03-14

---

## 何を実装したか

### 1. 共通エラーハンドリング（`src/lib/amazon/errors.ts`）
- `normalizeAmazonError()`: API エラーを正規化（コード・メッセージ・詳細）
- `logAmazonError()`: エラーをログ出力し、ユーザー向けメッセージを返す
- `logAmazonInfo()`: 情報ログ出力
- エラーコード: CREDENTIALS_MISSING, INVALID_REFRESH_TOKEN, UNAUTHORIZED, FORBIDDEN, RATE_LIMITED, など

### 2. Amazon API 共通クライアント層（`src/lib/amazon/client.ts`）
- `callAmazonApi()`: callAPI のラップ（リトライ・レート制限・エラーハンドリング）
- `callOrdersApi()`: Orders API 用（1 req/sec 待機付き）
- `sleep()`: レート制限対策用
- リトライ: レート制限・タイムアウト時は最大2回リトライ

### 3. Orders API 呼び出し（`src/lib/amazon/orders.ts`）
- `getOrders()`: 注文一覧取得
- `getOrderItems()`: 注文明細（商品行）取得
- `toISO8601()`: 日付フォーマット

### 4. 接続確認エンドポイント（`src/app/api/amazon-connect-check/route.ts`）
- GET: 認証済みユーザーが Orders API の疎通確認を実行
- 直近7日分の注文を最大5件取得
- 成功時: ordersCount, sampleOrder を返却
- 失敗時: エラーコード・メッセージを返却

### 5. amazon-diagnostic の更新
- `ordersApi` セクションを追加（Orders API 疎通確認結果を最初に表示）

---

## 変更ファイル一覧

| ファイル | 種別 |
|----------|------|
| `src/lib/amazon/errors.ts` | 新規 |
| `src/lib/amazon/client.ts` | 新規 |
| `src/lib/amazon/orders.ts` | 新規 |
| `src/app/api/amazon-connect-check/route.ts` | 新規 |
| `src/app/api/amazon-diagnostic/route.ts` | 更新 |
| `docs/AMAZON_PHASE1_COMPLETE.md` | 新規 |

---

## DB 変更点

なし（Phase 1 では DB 変更なし）

---

## 未実装のもの

- UI 連携（Phase 4 で実施）
- raw 保存（Phase 2 で実施）
- 売上明細整形（Phase 3 で実施）
- FBA/FBM 在庫（Phase 5 以降）

---

## 次 Phase でやること（Phase 2）

1. `amazon_orders_raw` / `amazon_order_items_raw` テーブルのマイグレーション作成
2. Orders API から取得したデータを raw 保存
3. fetched_at, source_api, source_key, payload_json を付与
4. 再取得しても壊れない設計（upsert または重複チェック）

---

## 動作確認方法

### 接続確認
```
GET /api/amazon-connect-check
```
認証済みでアクセス。成功時は `{ ok: true, ordersCount, sampleOrder }` を返す。

### 診断（Orders API 含む）
```
GET /api/amazon-diagnostic
```
`ordersApi` セクションに Orders API の疎通結果が含まれる。

### ローカルで確認
```bash
npm run dev
```
ログイン後、`/api/amazon-connect-check` にアクセス（curl またはブラウザ）。

---

## 残課題

- Orders API の CreatedAfter / MarketplaceIds のパラメータ形式が API 仕様と完全に一致しているか実機確認
- 注文が0件の場合も「接続成功」として扱う（現状その通り）
