# Phase6 次フェーズ前確認レポート

## 1. SKU 結合率

### 確認API

```
GET /api/amazon-phase6-sku-match
```

**返却例**:
```json
{
  "ok": true,
  "summary": {
    "totalConfirmed": 150,
    "joined": 120,
    "notJoined": 30,
    "skuNullCount": 5,
    "joinableTotal": 145,
    "ratePercent": 82.76,
    "ratePercentAll": 80
  },
  "inventorySkusCount": 200,
  "mismatchSamples": [ ... ],
  "totalMismatchSkus": 12
}
```

- **joined**: confirmed 売上明細のうち、`sku` が存在しかつ `amazon_inventory_current` に該当 SKU があった件数
- **notJoined**: 結合できなかった件数（total - joined）
- **skuNullCount**: `amazon_sales_lines.sku` が null の件数（Orders API に SellerSKU が無い）
- **ratePercent**: SKU が設定されている行のみ対象の結合率（joined / joinableTotal）
- **ratePercentAll**: 全件を分母にした結合率（joined / total）
- **mismatchSamples**: 不一致 SKU のサンプル（最大20件）

---

### 不一致理由の想定

| 理由 | 説明 |
|------|------|
| **sku が null** | Orders API の OrderItem に SellerSKU が含まれていない。一部注文・商品で発生しうる。 |
| **FBM 出品** | 売上が FBM（MFN）の場合、FBA 在庫 API には該当 SKU が存在しない。FBA 在庫のみ取得しているため結合不可。 |
| **販売済み・在庫切れ** | 売れた時点で在庫が 0 になり、その後 FBA から削除された場合、getInventorySummaries に含まれない可能性がある。 |
| **在庫未同期** | 売上取得後に FBA 在庫を一度も同期していない。または、該当 SKU が初回同期時に API に含まれていなかった。 |
| **SKU 表記差** | 両 API で大文字小文字・スペースなど表記が異なる場合（稀）。 |

---

## 2. raw テーブルの保持方針

### 現状

- **保持方式**: **1 SKU 1 行の上書き型**
- **根拠**:
  - `amazon_fba_inventory_raw` に `UNIQUE INDEX (user_id, source_key)` あり
  - `source_key = seller_sku`
  - `syncFbaInventoryToRaw` で `upsert` に `onConflict: 'user_id,source_key'` を使用
- **結論**: 履歴は保存していない。毎回同期時に同じ SKU を上書きする。

---

### 履歴保存の改善案（将来的に必要になった場合）

| 案 | 内容 | メリット | デメリット |
|----|------|----------|------------|
| **A. source_key に日時を含める** | `source_key = ${sellerSku}_${snapshotAtISO}` などにして unique を変更 | 既存 raw スキーマ変更が小さい | 履歴が無制限に増える |
| **B. 履歴専用テーブル** | `amazon_fba_inventory_history` を新設し、insert only。current 用に raw は現状維持 | 現在の raw/current フローをそのまま使える | テーブル・同期処理の追加が必要 |
| **C. パーティション** | `snapshot_at` で日次パーティションし、一定期間でアーカイブ | 大量履歴でも運用しやすい | 設計・運用が複雑 |

**推奨**: 当面は現状維持で問題ない。履歴が必要になったら **案B** で履歴テーブルを追加するのが扱いやすい。

---

## 3. 次フェーズの表示方針

| 項目 | 方針 |
|------|------|
| **売上一覧に current_available を付与** | `amazon_sales_lines` と `amazon_inventory_current` を SKU で LEFT JOIN し、`total_available_qty` を `current_available` として表示 |
| **0 在庫を目立たせる** | `current_available = 0` の行をハイライト（例: 背景色を薄い赤・オレンジ、アイコン表示） |
| **結合不能な SKU** | `current_available` は null 表示（例: `-` または `取得なし`）。 tooltip で「FBM / SKU未設定 / 未同期」などの理由を示す |

### 実装イメージ

- 売上一覧 API: `amazon_sales_lines` を取得する際に、`amazon_inventory_current` を LEFT JOIN して `total_available_qty` を付与
- フロント: `current_available === 0` → 赤字／アイコン、`current_available === null` → `-` 表示
