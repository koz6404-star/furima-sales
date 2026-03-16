# Phase11 RefundEventList 対応 実装概要

## 目的

Finances の RefundEventList を取り込み、返金・返品に伴う手数料調整を売上管理に反映できる基盤を実装する。

---

## 1. 実装概要

- amazon_finance_raw の RefundEventList を fee_events の transform 対象に追加
- OrderFeeAdjustmentList, ShipmentFeeAdjustmentList, ShipmentItemAdjustmentList[].ItemFeeAdjustmentList から FeeComponent を抽出
- Refund 由来の fee_amount_yen は**負の値**で保存（既存手数料と order_id 単位で相殺）
- 売上一覧の手数料列で負数表示（`-¥120`）に対応

---

## 2. 変更ファイル一覧

| 種類 | パス |
|------|------|
| 変換ロジック | `src/lib/amazon/transform-fee-events.ts` |
| 売上クライアント | `src/components/amazon-sales-list-client.tsx` |
| 検証 API | `src/app/api/amazon-phase11-verify/route.ts` |
| 画面 | `src/app/amazon-finance/page.tsx` |

---

## 3. RefundEventList で採用したリスト一覧

| リスト | 採用 | 内容 |
|--------|------|------|
| **OrderFeeAdjustmentList** | ◎ | 注文手数料の調整（返金時の相殺） |
| **ShipmentFeeAdjustmentList** | ◎ | 送料関連の調整 |
| **ShipmentItemAdjustmentList[].ItemFeeAdjustmentList** | ◎ | 商品単位手数料の調整 |

### 採用しなかったリスト

| リスト | 理由 |
|--------|------|
| DirectPaymentList | 返金額そのもの。手数料調整とは別。Phase11 は「手数料調整」に集中 |
| OrderChargeAdjustmentList | 売上金額の調整。手数料ではない |

---

## 4. fee_amount_yen の符号ルール

| transaction_type | 符号 | 理由 |
|------------------|------|------|
| ShipmentEventList | 正 | 手数料は売上への課金 |
| ServiceFeeEventList | 正 | 同上 |
| RefundEventList | **負** | 返金時の手数料相殺。parseAmountYen で得た正値を negate して保存 |

---

## 5. order_id 紐付け率

- RefundEvent は ShipmentEvent と同様、AmazonOrderId を持つ
- raw 保存時の extractOrderId で AmazonOrderId / relatedIdentifiers.ORDER_ID から抽出
- Phase11 検証 API（`GET /api/amazon-phase11-verify`）で raw の order_id あり件数・紐付け率を確認可能

---

## 6. 売上一覧への反映内容

- **手数料列**: fee_amount_aggregated を表示（既存ロジック。order_id 単位 SUM に Refund 分が含まれる）
- **正の値**: `¥1,234`
- **0**: `¥0`
- **負の値**: `-¥120`（緑色、ツールチップ「返金調整込み」）
- **未取得**: 「未取得」

---

## 7. まだ未対応として残したもの

| 項目 | 内容 |
|------|------|
| AdjustmentEventList | 調整イベント。Phase11 範囲外 |
| DebtRecoveryEventList | 債権回収。Phase11 範囲外 |
| 返金後の売上金額の完全再計算 | 会計帳簿レベルは対象外 |
| DirectPaymentList の返金額 | 手数料とは別の項目 |

---

## 8. AdjustmentEventList / DebtRecoveryEventList を扱うべきかの意見

| 対象 | 意見 |
|------|------|
| **AdjustmentEventList** | 手数料以外の調整（在庫差異等）を含む可能性が高い。fee_events への追加は、payload 構造を確認し、FeeList / FeeAdjustment に該当するものだけを抽出する形で検討。優先度は中。 |
| **DebtRecoveryEventList** | 債権回収は特殊イベント。通常の売上・返金サイクルとは別。必要になった段階で、別テーブルまたは fee_source_category で区別して扱うのがよい。優先度は低。 |

**推奨**: まずは RefundEventList の運用を安定させ、実データで返金影響を確認してから、Adjustment / DebtRecovery の要否を判断する。

---

## 9. 検証 API

- **GET** `/api/amazon-phase11-verify`

確認項目:
- RefundEventList の raw 件数
- order_id あり / なし件数
- Refund 由来 fee_events 件数
- fee_amount_yen が負値の件数
- order_id 単位集約後のサンプル
