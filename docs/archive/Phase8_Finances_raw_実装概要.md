# Phase8 Finances raw 取得 実装概要

## 目的

Amazon の手数料・財務情報を取得するための raw 保存基盤を作ること。この Phase では「手数料の表示完成」ではなく、「取得して保存し、注文との紐付けキーを確認できる状態」にする。

---

## 1. 実装概要

- Finances API `listFinancialEvents` で日付範囲（過去90日）の財務イベントを取得
- `FinancialEvents` 内の各配列（ShipmentEventList, RefundEventList 等）をフラット化して 1 イベント 1 行で保存
- `amazon_finance_raw` に orderId / postedDate / transactionType 等の主要キーを抽出して保存
- 再取得時は source_key（イベントハッシュ）で upsert し、重複しない

---

## 2. 変更ファイル一覧

| 種類 | パス |
|------|------|
| マイグレーション | `supabase/migrations/026_amazon_finance_raw.sql` |
| API クライアント | `src/lib/amazon/finances.ts` |
| raw 同期ロジック | `src/lib/amazon/finance-raw-sync.ts` |
| 同期 API | `src/app/api/amazon-finance-sync/route.ts` |
| raw 取得 API | `src/app/api/amazon-finance-raw/route.ts` |
| 検証 API | `src/app/api/amazon-phase8-verify/route.ts` |
| 画面 | `src/app/amazon-finance/page.tsx` |
| クライアント | `src/components/amazon-finance-client.tsx` |
| ナビ | `src/components/nav.tsx`（Finances リンク追加） |

---

## 3. amazon_finance_raw の列定義

| 列 | 型 | 説明 |
|----|-----|------|
| id | UUID | 主キー |
| user_id | UUID | ユーザー |
| fetched_at | TIMESTAMPTZ | 取得日時 |
| source_api | TEXT | 例: finances.listFinancialEvents |
| source_key | TEXT | イベント一意キー（SHA256 ハッシュの先頭40文字） |
| posted_date | DATE | PostedDate から抽出 |
| order_id | TEXT | AmazonOrderId / relatedIdentifiers.ORDER_ID から抽出 |
| transaction_id | TEXT | TransactionId（あれば） |
| transaction_type | TEXT | ShipmentEvent / RefundEvent / ServiceFeeEvent 等 |
| payload_json | JSONB | イベントオブジェクト全体 |
| created_at | TIMESTAMPTZ | 作成日時 |
| updated_at | TIMESTAMPTZ | 更新日時 |

**一意制約**: (user_id, source_key)

---

## 4. 取得できた主要キー一覧

| キー | 抽出元 | 備考 |
|------|--------|------|
| posted_date | PostedDate, TransactionPostedDate | イベント種別によりパスが異なる |
| order_id | AmazonOrderId, relatedIdentifiers.ORDER_ID | ShipmentEvent 等に存在。一部イベントは null |
| transaction_id | TransactionId | 2024 API の Transaction に存在。v0 では多くが null |
| transaction_type | 配列名 | ShipmentEventList → ShipmentEvent 等 |

---

## 5. 注文紐付けに使う候補キー

| キー | 用途 | 備考 |
|------|------|------|
| **order_id** | amazon_sales_lines.order_id と結合 | 最も直接的な紐付け。ShipmentEvent / RefundEvent 等に AmazonOrderId あり |
| posted_date | 日付範囲での絞り込み | 注文日と財務確定日にずれありうる |
| transaction_type | イベント種別のフィルタ | ShipmentEvent = 出荷売上、RefundEvent = 返金、ServiceFeeEvent = 手数料等 |
| transaction_id | 1 トランザクション 1 件の識別 | v0 では多くのイベントで null。2024 API では利用可能 |

**推奨**: Phase9 では `order_id` を主キーに `amazon_sales_lines` と結合。`transaction_type` で ShipmentEvent（売上）と ServiceFeeEvent（手数料）を区別。

---

## 6. 日付範囲取得 vs 注文単位取得

| 方式 | API | メリット | デメリット |
|------|-----|----------|------------|
| **日付範囲** | listFinancialEvents | 一括取得で効率的。再取得で同期しやすい | 全イベント取得にページネーションが必要 |
| 注文単位 | listFinancialEventsByOrderId | 注文ごとに確実に取得 | 注文数が多いと API 呼び出しが膨大 |

**Phase8 採用**: 日付範囲取得（PostedAfter/PostedBefore で過去90日）。

---

## 7. Phase9 で fee_events に整形する案

| テーブル案 | 内容 |
|------------|------|
| `amazon_fee_events` | raw から手数料関連イベントを整形。order_id, order_item_id, fee_type, fee_amount_yen, posted_date |
| 結合 | amazon_sales_lines.order_id = amazon_fee_events.order_id。OrderItemId があれば order_item_id でさらに絞り込み |
| イベント種別 | ServiceFeeEvent → 手数料。ShipmentEvent の FeeList → 送料・その他手数料。RefundEvent の FeeAdjustment → 返金時の手数料調整 |

---

## 8. 検証 API

- **GET** `/api/amazon-phase8-verify`  
  raw 件数、order_id 保有率、サンプル表示
- **POST** `/api/amazon-phase8-verify`  
  再同期 2 回実行し、件数安定性を確認
