# Phase8 次フェーズ前確認レポート

## 確認方法

**分析 API**: `GET /api/amazon-phase8-analyze`

ログイン状態でブラウザで開く: `http://localhost:3000/api/amazon-phase8-analyze`

---

## 1. order_id 取得状況

| 項目 | 取得方法 |
|------|----------|
| 全体件数 | `summary.total` |
| order_id あり件数 | `summary.withOrderId` |
| order_id なし件数 | `summary.withoutOrderId` |
| order_id 取得率 | `summary.orderIdRatePercent` |
| transaction_type ごと | `transactionTypeBreakdown` の `with_order_id` / `without_order_id` / `order_id_rate` |

---

## 2. transaction_type 内訳

| 種別 | 説明 | fee_events 採用候補 |
|------|------|---------------------|
| **ShipmentEventList** | 出荷売上。OrderFeeList, ShipmentFeeList, ShipmentItemList.ItemFeeList に手数料 | ◎ 必須 |
| **RefundEventList** | 返金。FeeAdjustment に手数料調整 | ◎ 必須 |
| **ServiceFeeEventList** | サービス手数料（FBA手数料等）。FeeList に手数料 | ◎ 必須 |
| **AdjustmentEventList** | 調整。AdjustmentItemList に金額 | ○ 採用検討 |
| **GuaranteeClaimEventList** | 保証請求 | △ 必要に応じ |
| **ChargebackEventList** | チャージバック | △ 必要に応じ |
| その他 | Retrocharge, SAFET, Coupon 等 | Phase9 範囲外で保留 |

---

## 3. 金額構造（payload_json）

| パス | 含まれるイベント | 内容 |
|------|------------------|------|
| `OrderChargeList` | ShipmentEvent, RefundEvent | 注文チャージ（売上） |
| `OrderFeeList` | ShipmentEvent | 注文手数料 |
| `OrderFeeAdjustmentList` | RefundEvent | 手数料調整（返金時） |
| `ShipmentFeeList` | ShipmentEvent | 送料関連 |
| `ShipmentFeeAdjustmentList` | RefundEvent | 送料調整 |
| `ShipmentItemList[].ItemFeeList` | ShipmentEvent | 商品単位手数料（FBA手数料等） |
| `ShipmentItemList[].ItemChargeList` | ShipmentEvent | 商品単位チャージ（売上） |
| `FeeList` | ServiceFeeEvent | 手数料一覧 |
| `PromotionList` | ShipmentItem | プロモーション割引 |

**金額オブジェクト**: `{ CurrencyCode, CurrencyAmount }` または `{ currencyCode, amount }`

---

## 4. order_id 単位のイベント数

| 項目 | 取得方法 | 判定 |
|------|----------|------|
| 1注文あたり最大イベント数 | `orderIdUnit.maxEventsPerOrder` | >1 なら集約必要 |
| 複数イベントを持つ注文数 | `orderIdUnit.multiEventOrders` | |
| 集約必要性 | `orderIdUnit.needsAggregation` | true なら order 単位で集約 |

**Phase9 整形単位案**:
- **明細単位**: `amazon_fee_events` に 1 イベント 1 行（raw と同様）。order_id, order_item_id（あれば）, fee_type, fee_amount_yen
- **集約単位**: 売上一覧との結合用に、order_id + order_item_id 単位で手数料合計を集約したビューまたはテーブルを別途持つ

→ **両方持つ**: 明細テーブル（履歴・検証用）+ 集約ビュー（売上表示用）

---

## 5. source_key の安定性

| 確認方法 | 内容 |
|----------|------|
| `POST /api/amazon-phase8-verify` | 再同期 2 回実行し、`after1 === after2` を確認 |
| ハッシュ方式 | `SHA256(JSON.stringify(event) + eventType + index)` の先頭 40 文字 |
| 安定性 | 同一イベントは同一 JSON → 同一ハッシュ。再取得で upsert され重複しない |

**注意**: `index` がレスポンス順序に依存する場合、API の返却順が変わるとハッシュが変わる可能性。現状は `event` 自体に一意性があれば影響小。

---

## 出力テンプレート（分析結果を貼り付け）

```
## Phase8 次フェーズ前確認 結果

### 合格 / 不合格
(分析 API の verdict を記載)

### order_id 取得率
- 全体: X%
- transaction_type 別: (分析 API の transactionTypeBreakdown を記載)

### transaction_type 内訳
(分析 API の transactionTypeBreakdown を表形式で)

### fee 候補イベント案
- ShipmentEventList
- RefundEventList
- ServiceFeeEventList
- (分析 API の feeCandidateTypes を参照)

### Phase9 の整形単位案
- 明細: amazon_fee_events（1イベント1行）
- 集約: order_id + order_item_id 単位の手数料合計（売上表示用）

### 注意すべきケース
- order_id なしイベント: 売上と結合できない。FeeList のみの ServiceFeeEvent 等は注文紐付け不可の場合あり
- 1注文複数イベント: Shipment + Refund + ServiceFee 等が混在。集約時に合算・相殺に注意
- 通貨: JPY 以外の場合は換算ロジックが必要
```
