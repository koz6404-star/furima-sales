# sales_amount_yen = 0 問題 調査レポート

Phase 4 確認で判明した「売れているのに sales_amount = 0」問題について、原因の構造的特定と修正方針をまとめます。

---

## 1. 調査方法

### 1.1 診断ツールの追加

次の2つの手段で原因特定が可能です。

| 手段 | 用途 | 実行方法 |
|------|------|----------|
| **診断API** | ログイン中のユーザー対象 | `npm run dev` 起動後、ブラウザで `/api/amazon-sales-zero-diagnostic` にアクセス |
| **診断スクリプト** | DB直接アクセス（全ユーザー） | `SUPABASE_DB_URL` を設定後、`npm run amazon-sales-zero-diagnostic` を実行 |

### 1.2 確認済み事項

- **Orders API raw**: `amazon_orders_raw.payload_json` に Order オブジェクトをそのまま保存
- **Order item raw**: `amazon_order_items_raw.payload_json` に OrderItem オブジェクトをそのまま保存
- **Transform**: `transform-sales-lines.ts` で `ItemPrice.Amount`（または `itemPrice.amount`）を `sales_amount_yen` に変換
- **null の扱い**: `toYen(null)` は `0` を返す（意図的な設計）

---

## 2. 想定される原因の分類一覧

| 分類 | 説明 | 発生条件 |
|------|------|----------|
| **A. 注文ステータス Pending** | API仕様により Pending 注文では価格情報が返らない | `OrderStatus` が `Pending` または `PendingAvailability` |
| **B. ItemPrice が null/未定義** | OrderItem に `ItemPrice` フィールドが存在しない | A のサブケース、または API の不整合 |
| **C. ItemPrice.Amount が空** | `ItemPrice` はあるが `Amount` が null / 空文字 | API の仕様・不具合 |
| **D. Amount が "0" / "0.00"** | API から 0 円として返っている | プロモーション無料、クーポン全額割引、ギフト等 |
| **E. raw 欠損** | `amazon_order_items_raw` に該当 OrderItem が存在しない | sync 漏れ、削除、取得失敗 |
| **F. フィールド名の違い** | 大文字小文字・別名で Amount が入っている | API バージョンや形式による |
| **G. プロモーション・割引** | 実売上は `ItemPrice - PromotionDiscount` 等で計算すべき | 現状は `ItemPrice` のみ参照 |

---

## 3. Amazon Orders API 公式仕様（重要）

**getOrderItems（v0）の公式ドキュメント**より：

> When an order is in the **Pending** state, the getOrderItems operation **does not return** information about pricing, taxes, shipping charges, gift status or promotions for the order items in the order.

**GitHub Issue #5139（Amazon 公式回答）**より：

> When an order is in **PENDING** status, payment has not yet been authorized, so **finalized pricing, tax, shipping charges, and promotion data are not available**. This is a business-logic, not an API-version issue. The order hasn't been financially committed yet, so there's nothing finalized to return.

つまり、**注文が Pending のまま取得されている場合、`ItemPrice` は null となり、transform で 0 になるのは API 仕様通りの挙動**です。

---

## 4. 各原因ごとの想定件数（実データ取得後に更新）

診断API または 診断スクリプトを実行すると、以下が得られます。

```
byClassification: { "原因A | 原因B": 件数, ... }
byFulfillment:    { "FBA": 件数, "FBM": 件数, "null": 件数 }
byOrderStatus:   { "Pending": 件数, "Shipped": 件数, ... }
```

**実行コマンド（DB直接）**:

```powershell
# .env.local に SUPABASE_DB_URL を設定してから
npm run amazon-sales-zero-diagnostic
```

**実行方法（API）**:

1. `npm run dev` でアプリ起動
2. ログイン状態で `https://localhost:3000/api/amazon-sales-zero-diagnostic` にアクセス

---

## 5. 正常注文との違い

| 項目 | 正常（sales_amount > 0） | 異常（sales_amount = 0） |
|------|-------------------------|---------------------------|
| OrderStatus | Unshipped, Shipped, PartialShipped 等 | 多い: **Pending**, PendingAvailability |
| ItemPrice | 存在し Amount に数値 | **null** または Amount が空/0 |
| 支払い承認 | 完了済み | **未完了**（Pending 時） |
| FBA/FBM 偏り | 特になし | 偏りがある場合は要確認 |

---

## 6. sales_amount に使うべき正しいフィールド候補

### 6.1 現状

```ts
// transform-sales-lines.ts 146–147行
const itemPrice = payload.ItemPrice ?? payload.itemPrice;
const amountStr = itemPrice?.Amount ?? itemPrice?.amount;
const salesAmountYen = toYen(amountStr);
```

- 参照: **ItemPrice.Amount** のみ
- null 時: `toYen()` が 0 を返す

### 6.2 OrderItem の金額関連フィールド（Orders API）

| フィールド | 用途 |
|------------|------|
| `ItemPrice` | 商品単価 × 数量（税込目安） |
| `ShippingPrice` | 送料 |
| `ItemTax` | 商品税 |
| `ShippingTax` | 送料税 |
| `PromotionDiscount` | プロモーション割引 |
| `ShippingDiscount` | 送料割引 |

**売上金額の考え方**:
- **控えめ**: `ItemPrice` のみ（現状）
- **精緻**: `ItemPrice - PromotionDiscount` 等（割引を反映）
- **送料込み**: `ItemPrice + ShippingPrice - 各種割引`（仕様要確認）

### 6.3 推奨フィールド

- **主**: `ItemPrice.Amount`（現状維持で問題なし）
- **補助**: `PromotionDiscount` は「割引額」として別カラムで持つ選択肢あり
- **Pending 対策**: `ItemPrice` が null の場合は「価格未確定」として扱う設計が望ましい

---

## 7. 修正方針

### 7.1 方針A: Pending 注文の扱いを明確化（推奨）

| 対応 | 内容 |
|------|------|
| **表示** | sales_amount = 0 の行に「価格未確定（Pending）」等のラベルを表示 |
| **再取得** | 注文ステータスが Unshipped/Shipped 等に変わったら再度 sync し、transform を再実行 |
| **Filter** | Phase 5 で「金額未確定を除外」オプションを検討 |

**コード変更**:
- `amazon_sales_lines` に `price_status: 'confirmed' | 'pending'` 等を追加するか、既存の `fee_status` を拡張
- または `order_status` を sales_lines に冗長に持たせ、画面で表示

### 7.2 方針B: 代替フィールドの探索

- `ItemPrice` が null でも `unitPrice` 等が v2026 で使える可能性はあるが、現行は v0 ベース
- 必要に応じて Orders API v2026 への移行を検討

### 7.3 方針C: raw 欠損への対応

- sync 失敗時のリトライ
- `amazon_order_items_raw` に存在しない OrderItem は transform でスキップ済み（order が無い場合はエラー）
- **raw 欠損**が診断で多ければ、sync ロジックの見直し

### 7.4 即時対応（最小限）

1. **画面**: sales_amount = 0 の行に「（価格未確定）」等の注釈を表示
2. **ドキュメント**: Pending では金額が取れない仕様であることをガイドに追記
3. **再sync**: 定期的に raw を再取得し、transform を再実行すれば、Unshipped 移行後の注文は正しい金額になる

---

## 8. Phase 5 へ進めるかどうか

### 結論: **はい、Phase 5 へ進めます**

| 観点 | 判断 |
|------|------|
| 原因の特定 | **Pending 注文で API が価格を返さない**ことが主因と推定（公式仕様と一致） |
| データ不整合 | transform の不具合ではなく、**raw の内容（API 仕様）に起因** |
| 修正の緊急度 | 致命的ではない。表示・運用で対応可能 |
| Phase 5 への影響 | 売上集計で 0 円が含まれる可能性はあるが、フェーズを止めるほどの障害ではない |

### 進める前に推奨する作業

1. **診断実行**: `npm run amazon-sales-zero-diagnostic` で実データの内訳を確認
2. **Pending 割合の確認**: 0 円のほとんどが Pending であれば、上記結論を裏付け
3. **軽微なUX改善**: 0 円行に「価格未確定」ラベルを表示（任意）

---

## 9. 付録: 診断結果の見方

診断API/スクリプトの出力例:

```json
{
  "ok": true,
  "zeroCount": 15,
  "uniqueOrders": 12,
  "byClassification": {
    "ItemPriceがnull/未定義 | 注文ステータスPending（価格非返却）": 14,
    "APIでAmountが0または0.00": 1
  },
  "byFulfillment": { "FBA": 10, "FBM": 5 },
  "byOrderStatus": { "Pending": 14, "Shipped": 1 },
  "details": [ ... ]
}
```

- `byClassification`: 原因の組み合わせごとの件数
- `byOrderStatus`: 0 円のほとんどが `Pending` なら、API 仕様通りの挙動と判断
- `details`: 各レコードの raw 構造・`ItemPrice` の有無を確認可能
