# Amazon連携 Phase 0: 現状調査レポート

作成日: 2025-03-14

---

## 1. 現状のAmazon連携コードの調査結果

### 1.1 アーキテクチャ概要

現在の実装は **Finances API 中心** で、Orders API は使用していません。

| 項目 | 現状 |
|------|------|
| 売上データ取得 | Finances API `listTransactions`（Shipment のみ） |
| 在庫取得 | FBA Inventory API + Listings API（FBM） |
| データ保存 | **raw保存なし**。APIレスポンスを直接パースして products/sales へ即挿入 |
| 手数料 | Finances の breakdowns からパース（null の場合は 0 円） |
| 重複防止 | amazon_order_id + sold_at + quantity 等の複雑なマッチングロジック |

### 1.2 主要ファイル一覧

| ファイル | 役割 | 行数 | 問題点 |
|----------|------|------|--------|
| `src/lib/amazon-sp-api.ts` | SP-API クライアント作成 | 33 | 署名処理等は amazon-sp-api パッケージ内蔵。**再利用可能** |
| `src/app/api/amazon-sync/route.ts` | 売上・在庫同期のメイン処理 | 666 | 肥大化、Finances→sales 直結、raw 保存なし |
| `src/app/api/amazon-diagnostic/route.ts` | API 診断・重複チェック | 233 | 診断ロジックは有用だが現行スキーマ前提 |
| `src/app/api/reset-amazon-data/route.ts` | Amazonデータ完全リセット | 104 | 対象は sales/products のみ。新rawテーブルには未対応 |
| `src/app/api/resolve-duplicates/route.ts` | 重複売上の解消 | 165 | 対症療法。新設計では不要になる |
| `src/app/api/duplicate-detail/route.ts` | 重複詳細取得 | - | 同上 |
| `src/components/amazon-sync-button.tsx` | 同期・重複・リセットUI | 381 | 現行API・スキーマに依存 |
| `scripts/get-amazon-refresh-token.mjs` | リフレッシュトークン取得ヘルパー | 66 | **再利用** |
| `AMAZON_SP_API_SETUP.md` | 認証・環境変数ドキュメント | - | **保持** |

### 1.3 データフロー（現状）

```
Finances API → パース（parseAmount, getFeeBreakdown 等）
            → 重複排除（dedupeKey）
            → products 検索/作成（ASIN/SKU）
            → sales に INSERT/UPDATE

FBA Inventory API → fbaMap / fbaByAsin
                 → products 更新 or 新規作成
                 → product_location_stock upsert

Listings API (FBM) → 同上（AMAZON_SELLER_ID 必須）
```

### 1.4 既知の問題点（指摘事項）

1. **手数料・送料が 0 円のまま**: Finances API の `breakdowns` が null の場合や、ネスト構造のパース漏れ
2. **売上レコードの重複**: 1注文1商品なのに複数レコード（例: キャンディ1件→4件）
3. **raw 保存なし**: API レスポンスを直接画面用に加工。デバッグ・再処理が困難
4. **Orders API 未使用**: 注文明細を Orders API で取得していない（現状は Finances のみ）
5. **UI が sales/products に直結**: 正本が不明瞭で、変更影響範囲が広い

---

## 2. リセット対象一覧

| 種別 | 対象 | 理由 |
|------|------|------|
| **退避** | `src/app/api/amazon-sync/route.ts` | 660行超の巨大ルート。新実装の妨げになる。legacy へ移動 |
| **退避** | `src/app/api/resolve-duplicates/route.ts` | 旧スキーマ前提の重複解消。新設計で不要 |
| **退避** | `src/app/api/duplicate-detail/route.ts` | 同上 |
| **退避** | `src/app/api/reset-amazon-data/route.ts` | 対象が sales/products のみ。新 raw テーブル対応で再実装 |
| **退避** | `src/components/amazon-sync-button.tsx` | 現行 API に密結合。新 API 用に再設計 |
| **保留** | `src/app/api/amazon-diagnostic/route.ts` | 診断ロジックは有用。接続確認・構造確認として一時維持し、必要に応じて更新 |
| **更新** | `src/components/products-list-client.tsx` | AmazonSyncButton の呼び出しを一時無効化 or 新コンポーネントに差し替え |

---

## 3. 保存すべき認証情報一覧

**削除・変更しないこと。**

| 環境変数 / 設定 | 用途 | 保存場所 |
|-----------------|------|----------|
| `SELLING_PARTNER_APP_CLIENT_ID` | LWA クライアント ID | `.env.local` / Vercel |
| `SELLING_PARTNER_APP_CLIENT_SECRET` | LWA クライアントシークレット | `.env.local` / Vercel |
| `AMAZON_REFRESH_TOKEN` | OAuth リフレッシュトークン | `.env.local` / Vercel |
| `AMAZON_SELLER_ID` | 商取引アカウントID（FBM在庫用） | `.env.local` / Vercel（任意） |
| `JAPAN_REGION` | `fe`（日本） | `amazon-sp-api.ts` |
| `JAPAN_MARKETPLACE` | `A1VC38T7YXB528` | `amazon-sp-api.ts` |

### 認証情報の保存確認

- `.env.local` は `.gitignore` により Git に含まれない（正しい）
- ユーザー側で手動バックアップを取ることを推奨
- `AMAZON_SP_API_SETUP.md` に設定手順を記載済み

---

## 4. 再利用できるコード一覧

| コード | 場所 | 再利用内容 |
|--------|------|------------|
| `createSpApiClient()` | `src/lib/amazon-sp-api.ts` | そのまま使用。region, credentials 設定済み |
| `JAPAN_REGION`, `JAPAN_MARKETPLACE` | 同上 | 定数として使用 |
| `amazon-sp-api` パッケージ | `package.json` | callAPI による API 呼び出し基盤 |
| `get-amazon-refresh-token.mjs` | `scripts/` | リフレッシュトークン取得の手順 |
| `parseAmount` の考え方 | amazon-sync/route.ts | 金額パースの参考（raw 保存後は別実装） |
| `API_TIME_OFFSET_MS` の扱い | 同上 | postedAfter/postedBefore 用の 10 分オフセット |
| `buildChunks` の考え方 | 同上 | 180 日チャンク分割の参考 |
| `sleep` | 同上 | レート制限対策 |
| FBA Inventory レスポンス構造の把握 | amazon-sync, amazon-diagnostic | 新 FBA raw 保存時の参考 |

---

## 5. 新しい構成案

### 5.1 データフロー（新設計）

```
Phase 1: 接続基盤
  amazon-sp-api.ts（既存を維持）
  + 共通エラーハンドリング
  + 接続確認スクリプト / エンドポイント

Phase 2: Orders API raw 取得
  getOrders → amazon_orders_raw
  getOrderItems → amazon_order_items_raw

Phase 3: 売上明細整形
  amazon_orders_raw + amazon_order_items_raw
    → transform → amazon_sales_lines

Phase 4: 売上一覧画面
  amazon_sales_lines を表示（UI は normalized のみ参照）

Phase 5 以降: FBA在庫、Finances、FBM在庫...
```

### 5.2 新テーブル構成

**raw テーブル（今回作成予定）**

- `amazon_orders_raw` (id, fetched_at, source_api, source_key, payload_json)
- `amazon_order_items_raw` (同上)

**normalized テーブル（Phase 3 で作成）**

- `amazon_sales_lines` (注文日, 注文ID, SKU, ASIN, 商品名, 数量, 売上金額, FBA/FBM, fee_status, ...)

**既存テーブルとの関係**

- `sales` / `products` はフリマ用として維持
- 新 `amazon_sales_lines` は Amazon 専用の売上明細（Phase 4 で表示）
- 将来的に `sales` との連携を検討する場合も、まずは `amazon_sales_lines` 単体で完結

### 5.3 ディレクトリ構成案

```
src/
  lib/
    amazon-sp-api.ts          # 維持
    amazon/                    # 新規
      client.ts               # 共通 API クライアント（Phase 1）
      orders.ts               # Orders API 呼び出し（Phase 2）
      errors.ts               # エラーハンドリング
  app/
    api/
      amazon-sync/            # 新実装（Phase 2 以降）
      amazon-diagnostic/      # 一時維持（接続確認用に更新）
      amazon-orders-raw/      # Orders raw 取得用（Phase 2）
      legacy/                 # 退避用
        amazon_import_old/    # 旧 amazon-sync 等
```

---

## 6. Phase 0 の具体的作業

### 完了済み
- [x] 既存 Amazon 関連コードの調査
- [x] リセット対象・保存対象・再利用対象の分類
- [x] 現状調査レポートの作成
- [x] **legacy フォルダ作成** と旧コード退避（`legacy/amazon_import_old/`）
- [x] **認証情報の確認**（.env.example に Amazon 関連変数を追記）
- [x] **AmazonSyncButton の一時無効化**（「再構築中」表示に変更）
- [x] **amazon-sync のスタブ作成**（再構築中レスポンスを返す）
- [x] ビルド確認（`npm run build` 成功）

### 次 Phase で実施予定
- 新マイグレーション（amazon_orders_raw, amazon_order_items_raw）の作成
- Phase 1: 接続基盤の最小再構築

---

## 7. 注意事項

- **既存の sales / products データは削除しない**（ユーザーの手動リセット時以外）
- **認証情報は一切変更・削除しない**
- **フリマ（mercari/rakuma）機能には影響を与えない**
- 旧コードは `legacy/` に退避し、必要に応じて参照可能な状態で保持
