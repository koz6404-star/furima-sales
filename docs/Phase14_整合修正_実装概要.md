# Phase14 手数料符号・Adjustment 整合修正 実装概要

## 目的

Phase11〜13 検証で発見した2点を修正する。

1. **手数料符号**: `fee_amount_yen` が負値のとき、`sales_after_fee_yen` が実質「売上+手数料絶対値」になっていた問題
2. **AdjustmentEventList**: 実データの AdjustmentType（`PostageBilling_VAT` 等）が想定（`PostageBilling`）と異なり、fee_events に取り込めていなかった問題

---

## 1. 実装概要

- `sales_after_fee_yen = sales_amount_yen + fee_amount_yen` に変更（選択肢A）
- `AdjustmentType` 判定を `startsWith('PostageBilling')` / `startsWith('PostageRefund')` に変更
- order_id なし Adjustment は引き続き fee_events に登録しない
- Phase14 検証 API を追加

---

## 2. 変更ファイル一覧

| 種類 | パス |
|------|------|
| 集計 API | `src/app/api/amazon-sales-summary/route.ts` |
| transform | `src/lib/amazon/transform-fee-events.ts` |
| Phase12 検証 | `src/app/api/amazon-phase12-verify/route.ts` |
| Phase13 検証 | `src/app/api/amazon-phase13-verify/route.ts` |
| Phase14 検証 | `src/app/api/amazon-phase14-verify/route.ts`（新規） |
| 売上クライアント | `src/components/amazon-sales-list-client.tsx` |
| 検証スクリプト | `scripts/amazon-phase111213-verify.mjs` |
| 画面 | `src/app/amazon-finance/page.tsx` |
| ドキュメント | `docs/Phase14_整合修正_実装概要.md` |

---

## 3. 手数料符号ルールの整理

### 現状の確認

- `amazon_fee_events.fee_amount_yen` は Shipment / ServiceFee / Refund / Adjustment の raw 値を保存
- UK/EU マーケット等では負値で返る場合あり（コスト = 負の符号）
- 集計時の扱い: **DB 保存値をそのまま使用**

### 採用したルール（選択肢A）

| 項目 | 内容 |
|------|------|
| fee_amount_yen | DB 保存値のまま（Amazon 符号維持） |
| sales_after_fee_yen | `sales_amount_yen + fee_amount_yen` |
| 意味 | fee が負（コスト）なら差引後は売上より小、fee が正（還元）なら差引後は売上より大 |

**修正前**: `sales_after_fee = sales - fee` → fee=-5795 のとき 58728（誤）  
**修正後**: `sales_after_fee = sales + fee` → fee=-5795 のとき 47138（正）

---

## 4. sales_after_fee_yen の修正内容

- 全集計（total, by_day, by_month, by_sku, by_asin）で `sales_amount_yen - fee_amount_yen` を `sales_amount_yen + fee_amount_yen` に変更
- API の `note` に「sales_after_fee_yen=sales+fee（fee負=コストで差引後減少）」を追記

---

## 5. 表示ルール

| 表示箇所 | 内容 |
|----------|------|
| 手数料合計 | DB 値のまま表示（負なら -¥5,795） |
| 差引後売上 | 売上 + 手数料 |
| ツールチップ | 手数料: 「DB保存値。負=コスト（UK等）」、差引後: 「差引後=売上+手数料（手数料負なら減少）」 |

---

## 6. AdjustmentType 判定の見直し

### 変更前

```ts
ADJUSTMENT_TYPES_FEE_LIKE.has(adjType) // 完全一致
// 'PostageBilling', 'PostageRefund' のみ
```

### 変更後

```ts
function isAdjustmentTypeFeeLike(adjType: string): boolean {
  const t = (adjType ?? '').trim();
  return t.startsWith('PostageBilling') || t.startsWith('PostageRefund');
}
```

### 実データで拾える型

| 種別 | 採用 |
|------|------|
| PostageBilling_VAT | ◎ |
| PostageBilling_Postage | ◎ |
| PostageBilling_DeliveryConfirmation | ◎ |
| PostageRefund_* | ◎（将来） |

### order_id の扱い

- **order_id あり**: fee_events に登録対象
- **order_id なし**: fee_events には登録しない（維持）

---

## 7. order_id あり / なし 件数（検証時点）

| 項目 | 件数 |
|------|------|
| AdjustmentEventList raw | 74 |
| startsWith で候補 | 74（全件） |
| order_id あり | 0 |
| order_id なし | 74 |
| fee_events 採用 | 0（order_id なしのため） |

---

## 8. 未対応として残したもの

- order_id なし Adjustment の売上配賦
- 原価・粗利の完成
- FBM 在庫完全対応
- DebtRecoveryEventList
- 会計帳簿レベルの厳密一致

---

## 9. 次に粗利対応へ進むべきか、FBM対応を先にやるべきか

| 観点 | 意見 |
|------|------|
| **粗利対応** | Phase14 で数字の意味が整ったため、原価の取得手段が固まっていれば粗利対応を検討可能。 |
| **FBM対応** | 集計は FBA/FBM 区別なし。在庫・出荷の FBM 対応は別フェーズ。 |
| **推奨** | まず Phase14 修正後の検証を確認し、集計結果を実データでチェックしてから次フェーズを判断。 |

---

## 10. 検証 API

- **GET** `/api/amazon-phase14-verify`

確認項目:
- 手数料 raw 符号の現状
- sales_after_fee 修正前後の比較
- AdjustmentType 候補件数（startsWith）
- order_id あり / なし件数
- 日次サンプル
