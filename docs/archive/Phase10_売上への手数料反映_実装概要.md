# Phase10 売上一覧への手数料反映 実装概要

## 目的

amazon_fee_events を order_id 単位で集約し、売上一覧に手数料列を追加。confirmed 売上に対して主要手数料を表示できるようにする。

---

## 1. 実装概要

- amazon_fee_events の fee_amount_yen を order_id 単位で SUM
- amazon_sales_lines 取得後に、該当 order_id の集約結果を付与
- 売上一覧に「手数料」列を追加。fee_amount_aggregated を表示
- 結合できない or fee 未取得時は「未取得」表示

---

## 2. 変更ファイル一覧

| 種類 | パス |
|------|------|
| 売上 API | `src/app/api/amazon-sales-lines/route.ts` |
| 売上クライアント | `src/components/amazon-sales-list-client.tsx` |

---

## 3. fee_amount_yen の符号ルール

| 対象 | 符号 | 備考 |
|------|------|------|
| ShipmentEventList | 正 | 手数料は売上への課金（正の値） |
| ServiceFeeEventList | 正 | 同上 |
| RefundEventList（将来） | 負 | 返金時の手数料調整。FeeAdjustment は負の値の可能性 |

**Phase10**: ShipmentEventList / ServiceFeeEventList のみのため、いずれも正。SUM で集約してそのまま使用。

---

## 4. order_id 集約ロジック

```
1. 売上行から order_id 一覧を取得（重複排除）
2. amazon_fee_events から user_id + order_id IN (...) で取得
3. アプリ側で order_id ごとに fee_amount_yen を SUM
4. feeMap[order_id] = 集約値
5. 各行に row.fee_amount_aggregated = feeMap[order_id] ?? null
```

- JOIN で行を重複させない（事前集約してから付与）
- 1 注文に複数 fee 行がある場合は SUM で合算

---

## 5. 売上一覧での表示仕様

| 条件 | 表示 |
|------|------|
| fee_amount_aggregated が数値 | ¥XX,XXX |
| fee_amount_aggregated が null | 未取得 |

- 同 order_id の複数明細行には同じ集約手数料を表示
- 集計時に注文単位で合算する場合は、重複カウントに注意

---

## 6. 未取得時の表示仕様

- **表示文言**: 「未取得」
- **スタイル**: グレー文字（text-slate-400）
- **ツールチップ**: 「fee_events 未取得」

---

## 7. 次に Refund をどう扱うかの候補

| 案 | 内容 |
|----|------|
| **A. RefundEventList を fee_events に追加** | Phase9 の transform に RefundEventList を追加。OrderFeeAdjustmentList, ShipmentFeeAdjustmentList から FeeComponent を抽出。負の値となり、order_id 集約時に相殺される |
| **B. 別テーブル refund_fee_events** | 返金関連を分離。売上表示では Shipment+ServiceFee と Refund を別列で表示 |
| **C. fee_events に refund フラグ** | transaction_type で区別。表示時は Shipment+Service と Refund を分けて集計し、正味手数料を表示 |

**推奨**: 案 A。RefundEventList を fee_events に追加し、負の fee_amount_yen で相殺。Phase10 の集約ロジックはそのまま使える。
