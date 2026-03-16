# Phase5 完了確認レポート

## 検証API

`GET /api/amazon-phase5-verify` で以下を確認する。

---

## 1. seller_sku の取得状況

| 確認項目 | 仕様 | 結果 |
|----------|------|------|
| raw に seller_sku が入っているか | source_key = seller_sku、payload_json.sellerSku にもあり | 検証APIで確認 |
| null / 空文字の件数 | 同期時スキップするため 0 であるべき | skuNull, skuEmpty |
| SKU 単位で識別可能か | (user_id, source_key) で一意 | ✅ |

**実装**: 空の sellerSku はスキップし `result.errors` に記録。source_key に保存するため、DB 上では null/空は存在しない設計。

---

## 2. snapshot_at の確認

| 確認項目 | 仕様 |
|----------|------|
| 同期ごとに snapshot_at 保存 | ✅ fetched_at と同時刻で保存 |
| 最新 snapshot の識別 | 1行1SKU。upsert のため同一 (user_id, source_key) は1件のみ。当該行が最新。 |

**構造**:
- `snapshot_at` = `fetched_at`（同一バッチ）
- 履歴は保持しない。再同期で上書き。
- 最新識別: 該当 source_key の行を取得すればそれが最新。

---

## 3. 在庫項目の確認

### raw から取得できる在庫関連項目

| 項目 | payload パス | Phase6 採用案 |
|------|--------------|--------------|
| fulfillableQuantity | inventoryDetails.fulfillableQuantity | fulfillable |
| inboundWorkingQuantity | inventoryDetails.inboundWorkingQuantity | inbound の一部 |
| inboundShippedQuantity | inventoryDetails.inboundShippedQuantity | inbound の一部 |
| inboundReceivingQuantity | inventoryDetails.inboundReceivingQuantity | inbound の一部 |
| reservedQuantity.totalReservedQuantity | inventoryDetails.reservedQuantity.totalReservedQuantity | reserved |
| unfulfillableQuantity.totalUnfulfillableQuantity | inventoryDetails.unfulfillableQuantity.totalUnfulfillableQuantity | unfulfillable |
| researchingQuantity.totalResearchingQuantity | inventoryDetails.researchingQuantity.totalResearchingQuantity | researching |

**inbound 集計** = inboundWorkingQuantity + inboundShippedQuantity + inboundReceivingQuantity

---

## 4. 再同期耐性

| 確認項目 | 実装 |
|----------|------|
| 複数回同期でエラーにならないか | upsert。同一 key で上書き。✅ |
| raw が壊れないか | upsert のみ。削除なし。✅ |
| 空レスポンス時 | items=[]、loop スキップ、正常終了。✅ |
| エラーログ | result.errors に蓄積、logAmazonInfo で出力。API の catch で console.error。✅ |

---

## 5. inventory_current の列案

```sql
CREATE TABLE inventory_current (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  seller_sku TEXT NOT NULL,
  asin TEXT,
  product_name TEXT,
  fulfillable INT NOT NULL DEFAULT 0,
  inbound INT NOT NULL DEFAULT 0,
  reserved INT NOT NULL DEFAULT 0,
  unfulfillable INT NOT NULL DEFAULT 0,
  researching INT NOT NULL DEFAULT 0,
  total_available_qty INT NOT NULL DEFAULT 0,  -- 後述
  snapshot_at TIMESTAMPTZ NOT NULL,
  source_raw_id UUID REFERENCES amazon_fba_inventory_raw(id),
  UNIQUE(user_id, seller_sku)
);
```

---

## 6. total_available_qty の定義案

### 案A: 出荷可能のみ（控えめ）

```
total_available_qty = fulfillableQuantity
```

- 出荷可能数のみ。在庫切れ判定に使う場合はこれで十分。

### 案B: 出荷可能 + 入荷中（やや楽観）

```
total_available_qty = fulfillableQuantity + inboundWorkingQuantity + inboundShippedQuantity + inboundReceivingQuantity
```

- 入荷予定も含める。販売可能在庫の目安。

### 案C: 全在庫から予約・不能を除く

```
total_available_qty = totalQuantity - reservedQuantity.totalReservedQuantity - unfulfillableQuantity.totalUnfulfillableQuantity
```

- API の totalQuantity ベース。計算で調整。

**推奨**: **案A**（fulfillable のみ）を基本とし、必要に応じて `inbound` を別列で持つ。`total_available_qty` は「今出荷できる数」と明確にすることが多い。

---

## 7. 判定基準

| 項目 | 合格条件 |
|------|----------|
| seller_sku | null/空 0 件 |
| snapshot_at | 全行で保持 |
| 在庫項目 | fulfillable / inbound / reserved / unfulfillable が取得可能 |
| 再同期 | 複数回実行でエラーなし |

---

## 8. Phase6 への可否

検証API で `passed: true` かつ `verdict: "合格: Phase6 へ進んでよい"` であれば Phase6 へ進む。
