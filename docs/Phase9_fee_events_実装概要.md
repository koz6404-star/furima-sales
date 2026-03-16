# Phase9 fee_events 整形 実装概要

## 目的

amazon_finance_raw から fee 候補イベント（ShipmentEvent, ServiceFeeEvent）を抽出し、order_id 単位で amazon_sales_lines と結びつけやすい形にする。

---

## 1. 実装概要

- amazon_finance_raw の ShipmentEventList, ServiceFeeEventList のみ対象
- OrderFeeList, ShipmentFeeList, ShipmentItemList[].ItemFeeList, FeeList から FeeComponent を抽出
- 1 FeeComponent = 1 amazon_fee_events 行
- 再整形時は当該 user の既存 fee_events を削除してから再挿入（重複しない）

---

## 2. 変更ファイル一覧

| 種類 | パス |
|------|------|
| マイグレーション | `supabase/migrations/027_amazon_fee_events.sql` |
| 変換ロジック | `src/lib/amazon/transform-fee-events.ts` |
| 取得 API | `src/app/api/amazon-fee-events/route.ts` |
| 変換 API | `src/app/api/amazon-fee-events-transform/route.ts` |
| 検証 API | `src/app/api/amazon-phase9-verify/route.ts` |
| クライアント | `src/components/amazon-finance-client.tsx`（fee_events 表示・整形ボタン） |

---

## 3. amazon_fee_events の列定義

| 列 | 型 | 説明 |
|----|-----|------|
| id | UUID | 主キー |
| user_id | UUID | ユーザー |
| order_id | TEXT | 注文ID（必須） |
| transaction_type | TEXT | ShipmentEventList / ServiceFeeEventList |
| fee_type | TEXT | FeeType（FBAPerUnitFulfillmentFee 等） |
| fee_amount_yen | INT | 手数料金額（円）。JPY 以外は 0 |
| posted_date | DATE | 確定日 |
| raw_source | UUID | 元の amazon_finance_raw.id |
| fetched_at | TIMESTAMPTZ | 取得日時 |
| created_at | TIMESTAMPTZ | 作成日時 |

---

## 4. fee 候補に採用した transaction_type

| transaction_type | 対象 | fee 取得元 |
|------------------|------|------------|
| **ShipmentEventList** | 出荷売上 | OrderFeeList, ShipmentFeeList, ShipmentItemList[].ItemFeeList |
| **ServiceFeeEventList** | サービス手数料 | FeeList |

---

## 5. 除外した transaction_type と理由

| transaction_type | 理由 |
|------------------|------|
| **AdjustmentEventList** | 調整系。初期段階では対象外 |
| **DebtRecoveryEventList** | 債権回収系。初期段階では対象外 |
| **RefundEventList** | Phase9 では一旦除外。Phase10 で返金時の手数料調整を追加検討 |
| その他 | ShipmentSettleEvent, Retrocharge, SAFET 等は初期範囲外 |

---

## 6. fee_amount の取得元

| イベント | パス | 構造 |
|----------|------|------|
| ShipmentEvent | OrderFeeList, ShipmentFeeList | FeeComponent[] { FeeType, FeeAmount: { CurrencyCode, CurrencyAmount } } |
| ShipmentEvent | ShipmentItemList[].ItemFeeList | 同上 |
| ServiceFeeEvent | FeeList | 同上 |

**通貨**: JPY の場合のみ fee_amount_yen に反映。USD 等は 0 扱い（Phase10 で換算検討）。

---

## 7. Phase10 で amazon_sales_lines へ反映する案

| 方式 | 内容 |
|------|------|
| **結合** | amazon_sales_lines.order_id = amazon_fee_events.order_id |
| **集約** | order_id 単位で fee_amount_yen を SUM し、fee_amount_yen として付与 |
| **表示** | 売上一覧に「手数料」列を追加。fee_amount_yen を表示 |
| **order_item_id** | ShipmentItemList に OrderItemId がある場合は order_item_id で絞り込み可能。Phase10 で検討 |

---

## 8. 検証 API

- **GET** `/api/amazon-phase9-verify` 件数・transaction_type 別集計
- **POST** `/api/amazon-phase9-verify` 再整形 2 回で件数安定性確認
