# Phase12 AdjustmentEventList 対応 実装概要

## 目的

Finances の AdjustmentEventList を取り込み、注文に紐づく手数料系調整を売上管理へ反映できる基盤を実装する。

---

## 1. 実装概要

- amazon_finance_raw の AdjustmentEventList を fee_events の transform 対象に追加
- AdjustmentEvent の **AdjustmentAmount** を採用（符号は payload のまま。反転しない）
- 手数料欄向きと判断した **AdjustmentType のみ** 採用（PostageBilling, PostageRefund）
- order_id があるものだけ amazon_fee_events に保存
- Phase12 検証 API で raw 件数・紐付け率・採用種別を確認可能

---

## 2. 変更ファイル一覧

| 種類 | パス |
|------|------|
| 変換ロジック | `src/lib/amazon/transform-fee-events.ts` |
| 検証 API | `src/app/api/amazon-phase12-verify/route.ts` |
| 画面 | `src/app/amazon-finance/page.tsx` |
| クライアント | `src/components/amazon-finance-client.tsx` |
| ドキュメント | `docs/Phase12_AdjustmentEventList_実装概要.md` |

---

## 3. AdjustmentEventList で採用したリスト一覧

| 対象 | 採用 | 内容 |
|------|------|------|
| **AdjustmentAmount** | ◎ | イベント単位の調整金額。payload の符号を尊重 |
| **AdjustmentItemList** | × | 内訳。AdjustmentAmount が合計を持っているため採用せず（二重計上防止） |

### 採用した AdjustmentType（Phase14 で startsWith に変更）

| 種別 | 説明 |
|------|------|
| **PostageBilling*** | 送料ラベル購入（PostageBilling_VAT, PostageBilling_Postage 等） |
| **PostageRefund*** | 送料返金（キャンセル等） |

### 採用しなかった AdjustmentType（代表例）

| 種別 | 理由 |
|------|------|
| FBAInventoryReimbursement / WAREHOUSE_DAMAGE | 在庫補填。手数料欄向きでない |
| ReserveEvent / ReserveCredit / ReserveDebit | 保留金。精算タイミングの調整 |
| LostOrDamagedReimbursement | 補填。手数料ではない |
| ReimbursementClawback / COMPENSATED_CLAWBACK | 補填取り消し。特殊精算 |
| SellerRewards | 報酬。手数料とは別 |
| その他不明な種別 | 意味が曖昧なものは除外し、実データで要否を判断 |

---

## 4. fee_amount_yen の符号ルール

| transaction_type | 符号 | 理由 |
|------------------|------|------|
| ShipmentEventList | 正 | 手数料は売上への課金 |
| ServiceFeeEventList | 正 | 同上 |
| RefundEventList | 負 | 返金時の手数料相殺。negate して保存 |
| **AdjustmentEventList** | **payload のまま** | 正負ともそのまま。反転しない |

---

## 5. order_id 紐付け率

- AdjustmentEvent は AmazonOrderId を持たない場合がある
- raw 保存時に extractOrderId で relatedIdentifiers.ORDER_ID から抽出を試行
- **order_id があるものだけ** amazon_fee_events に保存
- Phase12 検証 API（`GET /api/amazon-phase12-verify`）で raw の order_id あり件数・紐付け率を確認可能

---

## 6. 売上一覧への反映内容

- **手数料列**: fee_amount_aggregated を表示（既存ロジック。order_id 単位 SUM に Adjustment 分が含まれる）
- Adjustment 由来の fee_events は既存 Shipment / ServiceFee / Refund と同様に order_id 単位で集約
- 売上行の重複は発生させない（order_id 単位で SUM してから付与）
- 表示ルール: 正 `¥1,234` / 0 `¥0` / 負 `-¥120` / 未取得 `未取得`（Phase11 と同じ）

---

## 7. まだ未対応として残したもの

| 項目 | 内容 |
|------|------|
| AdjustmentEventList のうち非採用 AdjustmentType | 補填・保留・ペナルティ等。手数料欄に載せると誤解を生む |
| order_id なしの Adjustment | 注文に紐づかないため採用しない |
| FeeList / FeeAdjustmentList / ChargeAdjustmentList | AdjustmentEvent の v0 スキーマには存在しない。将来拡張時は payload 構造確認後に検討 |
| DebtRecoveryEventList | Phase12 範囲外 |
| 返金後の売上金額の完全再計算 | 会計帳簿レベルは対象外 |
| 利益計算の最終完成 | Phase12 範囲外 |

---

## 8. DebtRecoveryEventList を次に扱うべきかの意見

| 観点 | 意見 |
|------|------|
| **優先度** | 低。債権回収は特殊イベントで、通常の売上・返金サイクルとは別。 |
| **取り込み方** | 必要になった段階で、fee_events とは別の扱い（source_event_type や別テーブル）で区別するのがよい。 |
| **推奨** | Phase12 で Adjustment 基盤を固め、実データで手数料精度を確認してから検討。 |

---

## 9. 検証 API

- **GET** `/api/amazon-phase12-verify`

確認項目:
- AdjustmentEventList の raw 件数
- order_id あり / なし件数、紐付け率
- AdjustmentType 別件数
- 採用した adjustment 種別一覧
- 除外サンプル（種別・order_id）
- 採用サンプル（種別・order_id・金額）
- Adjustment 由来 fee_events 件数
- order_id 単位集約後のサンプル

---

## 10. finance 画面での確認補助

- `/amazon-finance` に Phase12 検証 API へのリンクを追加
- 「Phase12 確認」ボタンで raw 件数・紐付け率・fee_events 採用件数を簡易表示
- transactionType 別件数に AdjustmentEventList が含まれる（raw 表示時）
