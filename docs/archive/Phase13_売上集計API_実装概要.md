# Phase13 売上集計API基盤 実装概要

## 目的

confirmed 売上を対象に、期間別・商品別の集計ができる API 基盤を整備する。

---

## 1. 実装概要

- `amazon_sales_lines` を基準テーブルに、`sales_state = confirmed` のみ対象
- `amazon_fee_events` を `order_id` 単位で集約し、手数料を付与
- 日次・月次・SKU別・ASIN別の集計を返す `/api/amazon-sales-summary`
- Phase13 検証 API（`/api/amazon-phase13-verify`）を追加
- `/amazon-sales` に集計サマリ表示ボタンを追加

---

## 2. 変更ファイル一覧

| 種類 | パス |
|------|------|
| 集計 API | `src/app/api/amazon-sales-summary/route.ts` |
| 検証 API | `src/app/api/amazon-phase13-verify/route.ts` |
| 売上クライアント | `src/components/amazon-sales-list-client.tsx` |
| ドキュメント | `docs/Phase13_売上集計API_実装概要.md` |

---

## 3. 追加した集計API一覧

| API | メソッド | 役割 |
|-----|----------|------|
| `/api/amazon-sales-summary` | GET | confirmed 売上を期間別・SKU別・ASIN別に集計 |
| `/api/amazon-phase13-verify` | GET | 集計対象件数・fee 反映・サンプルを検証 |

### クエリパラメータ（amazon-sales-summary）

| パラメータ | 説明 |
|------------|------|
| from | 開始日（YYYY-MM-DD）。order_date の基準 |
| to | 終了日（YYYY-MM-DD）。order_date の基準 |

---

## 4. 集計対象の基準

| 項目 | 内容 |
|------|------|
| **対象条件** | `sales_state = confirmed` のみ |
| **除外** | pending_price, canceled, other_excluded は集計対象外 |
| **日付基準列** | `order_date`（売上日） |
| **集計単位** | 売上行件数（`line_count`）= amazon_sales_lines の1行 = 1注文1商品 |
| **注文数** | `order_count` = ユニーク order_id 数 |

---

## 5. 集計項目一覧

| 項目 | 説明 |
|------|------|
| order_count | ユニーク注文数 |
| line_count | 売上行件数（1注文1商品=1行） |
| units_sold | 販売数量の合計 |
| sales_amount_yen | 売上金額の合計 |
| fee_amount_yen | 手数料合計（order_id 単位で集約した fee_events の SUM） |
| sales_after_fee_yen | 売上−手数料（手数料差引後売上） |

---

## 6. fee_amount_aggregated の反映方法

1. `amazon_fee_events` を `order_id` 単位で SUM して fee マップを作成
2. **日次・月次・合計**: その期間に含まれる order_id の fee をそのまま合計（重複なし）
3. **SKU別・ASIN別**: 同一 order 内の売上比率で fee を按分。1注文に複数 SKU がある場合、各 SKU に配分
4. 売上行を直接 JOIN して増やさず、既存の 1 行 = 1 商品 を維持
5. **Phase14**: `sales_after_fee_yen = sales_amount_yen + fee_amount_yen`（fee 負=コストで差引後は減少）

---

## 7. 日次 / 月次 / SKU別 / ASIN別の返却内容

### summary.total
- order_count, line_count, units_sold, sales_amount_yen, fee_amount_yen, sales_after_fee_yen

### summary.by_day
- date, order_count, line_count, units_sold, sales_amount_yen, fee_amount_yen, sales_after_fee_yen
- order_date でグループ。日付昇順

### summary.by_month
- month (YYYY-MM), order_count, line_count, units_sold, sales_amount_yen, fee_amount_yen, sales_after_fee_yen
- order_date の年月でグループ。月昇順

### summary.by_sku
- sku, product_name, order_count, line_count, units_sold, sales_amount_yen, fee_amount_yen, sales_after_fee_yen
- sku でグループ。売上金額降順

### summary.by_asin
- asin, product_name, order_count, line_count, units_sold, sales_amount_yen, fee_amount_yen, sales_after_fee_yen
- asin でグループ。売上金額降順

---

## 8. 未対応として残したもの

| 項目 | 内容 |
|------|------|
| 原価を含めた粗利 | Phase13 範囲外 |
| 会計帳簿レベルの厳密一致 | 対象外 |
| FBM 在庫の完全対応 | 今後検討 |
| DebtRecoveryEventList | 範囲外 |
| DirectPaymentList の厳密再計算 | 範囲外 |
| 返金後売上金額の完全再計算 | 範囲外 |
| ダッシュボードの最終 UI | 検証しやすさ優先で簡素表示 |

---

## 9. 次に粗利対応へ進むべきか、FBM対応を先にやるべきかの意見

| 観点 | 意見 |
|------|------|
| **粗利対応** | 原価データの取り込み方法（手入力 / CSV / 他システム）が決まっていれば、Phase13 の集計基盤の上に乗せやすい。`sales_after_fee_yen` まで出ているので、原価を足せば粗利は算出可能。 |
| **FBM 対応** | 在庫・出荷管理が FBA と異なる。FBM 売上の集計自体は Phase13 で含まれている（confirmed であれば FBA/FBM 区別なし）。在庫や出荷の「FBM 完全対応」は別フェーズ。 |
| **推奨** | まず Phase13 の集計結果を実データで確認し、原価の取得手段が固まっていれば粗利対応、在庫・出荷の FBM 強化が必要なら FBM 対応、を検討。 |

---

## 10. 検証 API

- **GET** `/api/amazon-phase13-verify`

クエリ: `from`, `to`（任意。集計期間の検証用）

確認項目:
- confirmed / 除外件数
- fee 結合成功件数・未取得 order 数
- 売上合計・手数料合計・売上−手数料
- 日次・月次・SKU別・ASIN別サンプル
- confirmed のみ集計・fee 反映・売上行重複なしのチェック
