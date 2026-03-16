# sales_state 設計と Pending / Cancelled 分離

## 1. sales_state の設計案

### 1.1 新規 ENUM 型

```sql
CREATE TYPE amazon_sales_state AS ENUM (
  'confirmed',       -- 確定売上（集計対象）
  'pending_price',   -- 価格未確定（Pending）
  'canceled',        -- キャンセル済み
  'other_excluded'   -- 判定しきれない除外対象（Unfulfillable 等）
);
```

### 1.2 除外条件ベースの判定ロジック（厳密）

| 優先順位 | 条件 | sales_state   | sales_amount_yen |
|----------|------|---------------|------------------|
| 1 | OrderStatus in ('Pending', 'PendingAvailability') | pending_price | NULL |
| 2 | OrderStatus in ('Canceled') | canceled | NULL |
| 3 | ItemPrice が取得できる（Amount がパース可能） | confirmed | 算出値 |
| 4 | それ以外（Unfulfillable、不明等） | other_excluded | NULL |

**画面表示文言**:
- pending_price => 価格未確定
- canceled => キャンセル
- other_excluded => 対象外

### 1.3 OrderStatus → sales_state マッピング（参考）

| Amazon OrderStatus | sales_state   |
|-------------------|---------------|
| Pending           | pending_price |
| PendingAvailability | pending_price |
| Canceled          | canceled     |
| Unshipped / PartialShipped / Shipped / InvoiceUnconfirmed | ItemPrice あり → confirmed、なし → other_excluded |
| Unfulfillable 等 | other_excluded（canceled に即分類しない） |

### 1.4 スキーマ変更

```sql
-- sales_amount_yen を NULL 許容に
ALTER TABLE amazon_sales_lines
  ALTER COLUMN sales_amount_yen DROP NOT NULL,
  ALTER COLUMN sales_amount_yen DROP DEFAULT;

-- sales_state カラム追加
ALTER TABLE amazon_sales_lines
  ADD COLUMN sales_state amazon_sales_state NOT NULL DEFAULT 'confirmed';

-- インデックス（フィルタ用）
CREATE INDEX idx_amazon_sales_lines_user_state
  ON amazon_sales_lines (user_id, sales_state);
```

---

## 2. include_in_sales の要否

### 結論: **不要**

| 理由 | 説明 |
|------|------|
| 冗長 | `sales_state = 'confirmed'` で集計対象を一意に判定できる |
| 単純性 | 状態は sales_state に集約し、条件分岐を減らす |
| 拡張性 | 将来的に confirmed 以外を集計に含める要件が出た場合も、sales_state の定義変更で対応可能 |

**集計対象の判定**:
```sql
WHERE sales_state = 'confirmed'
```

---

## 3. 画面の初期表示仕様

### 3.1 初期表示（デフォルト）

- **表示**: `sales_state = 'confirmed'` のみ
- **集計**: 同上
- **URL パラメータ**: `salesState=confirmed`（省略時も confirmed 扱い）
- **ヘッダー**: 「売上明細（確定分のみ）」

### 3.2 件数表示（上部サマリー）

```
確定売上: 142件 | 価格未確定: 3件 | キャンセル: 2件
```

- 全 sales_state の件数を取得して表示
- API: `GET /api/amazon-sales-lines/summary` または既存 API に `?summary=1` を追加

### 3.3 フィルタ

- **salesState** パラメータ:
  - `confirmed`（デフォルト）: 確定売上のみ
  - `pending_price`: 価格未確定のみ
  - `canceled`: キャンセルのみ
  - `all`: 全件（確認用）

- UI: タブまたはセレクトで切替
  - 「確定」 / 「価格未確定」 / 「キャンセル」 / 「すべて」

### 3.4 売上金額の表示

| sales_state   | sales_amount_yen | 表示 |
|---------------|------------------|------|
| confirmed     | 1234             | ¥1,234 |
| pending_price | NULL             | （価格未確定） |
| canceled      | NULL             | — |

### 3.5 初期表示フロー

1. ページロード → `salesState=confirmed` で取得（パラメータなしは confirmed）
2. サマリー取得 → 全 state の件数を表示
3. フィルタ切替 → `salesState` を変更して再取得

---

## 4. 既存データの再整形手順

### 4.1 前提

- 現状: `sales_amount_yen` は NOT NULL DEFAULT 0
- `amazon_orders_raw` に OrderStatus あり
- `amazon_order_items_raw` に OrderItem（ItemPrice の有無）あり

### 4.2 マイグレーション手順

#### Step 1: スキーマ変更（マイグレーションファイル）

```sql
-- 023_amazon_sales_state.sql
CREATE TYPE amazon_sales_state AS ENUM ('confirmed', 'pending_price', 'canceled');

ALTER TABLE amazon_sales_lines
  ADD COLUMN sales_state amazon_sales_state;

-- 一時的に DEFAULT をつけて NOT NULL 化の準備
UPDATE amazon_sales_lines SET sales_state = 'confirmed' WHERE sales_state IS NULL;
ALTER TABLE amazon_sales_lines
  ALTER COLUMN sales_state SET NOT NULL,
  ALTER COLUMN sales_state SET DEFAULT 'confirmed';

ALTER TABLE amazon_sales_lines
  ALTER COLUMN sales_amount_yen DROP NOT NULL,
  ALTER COLUMN sales_amount_yen DROP DEFAULT;

CREATE INDEX idx_amazon_sales_lines_user_state
  ON amazon_sales_lines (user_id, sales_state);
```

#### Step 2: 再 transform で正しい sales_state を設定

**transform ロジックの変更**（後述）により、Order の OrderStatus と ItemPrice の有無から `sales_state` を算出する。

再 transform 実行:

```
POST /api/amazon-orders-sync  (transform: true)
または
POST /api/amazon-sales-lines-transform
```

これで全レコードが upsert され、`sales_state` と `sales_amount_yen` が再計算される。

#### Step 3: 既存の sales_amount_yen = 0 の扱い

再 transform 前のデータについて:

- `sales_amount_yen = 0` のレコードは、raw の OrderStatus に応じて再 transform で上書きされる
- 再 transform で Order を参照するため、**raw が存在すれば** 正しい sales_state が設定される
- **raw が欠損している** ケース: Order が取れないため transform でスキップされる可能性あり → その場合は `sales_state = 'confirmed'` のまま（既存の 0 円）になる。欠損が多い場合は別途対応検討。

### 4.3 推奨実行順

1. マイグレーション適用
2. `transform-sales-lines.ts` を修正（OrderStatus / ItemPrice から sales_state 算出）
3. 再 transform 実行
4. API・画面を sales_state 対応に更新

### 4.4 再 transform 後の検証

**API**: `GET /api/amazon-sales-lines-validate`  
**スクリプト**: `npm run amazon-sales-state-validate`（SUPABASE_DB_URL 必要）

**確認項目**:
- sales_state 別件数（confirmed / pending_price / canceled / other_excluded）
- confirmed なのに sales_amount_yen is null の件数（0 であるべき）
- state 変更前後の差分: 再 transform 前にスクリプト実行 → 出力保存 → 再 transform → 再実行して比較

---

## 5. 再 sync / 再 transform での更新フロー

### 5.1 Pending → confirmed

1. 初回 sync: OrderStatus = Pending → raw に ItemPrice なしで保存
2. Transform: `sales_state = 'pending_price'`, `sales_amount_yen = NULL`
3. 翌日などに再 sync: OrderStatus = Unshipped, raw に ItemPrice ありで上書き
4. 再 transform: `sales_state = 'confirmed'`, `sales_amount_yen = 正の値`

### 5.2 Pending → canceled

1. 初回 sync: OrderStatus = Pending
2. Transform: `sales_state = 'pending_price'`
3. 再 sync: OrderStatus = Canceled に更新
4. 再 transform: `sales_state = 'canceled'`, `sales_amount_yen = NULL`

### 5.3 既存 confirmed の維持

- 再 transform で OrderStatus と ItemPrice を再評価
- 変化がなければ `sales_state = 'confirmed'` のまま
