# Phase4 集計単位の説明と 53件 vs 45件 の差分理由

## 1. 集計単位の定義

| 用語 | 意味 | 単位 |
|------|------|------|
| **商品行** | amazon_sales_lines の1行 | 1注文1商品（OrderItem） |
| **注文件数** | 注文（Order）の数 | 1注文に複数商品があっても 1 |
| **DB全体件数** | amazon_sales_lines の行数 | 対象ユーザー分の全商品行 |

**重要**: amazon_sales_lines は「1注文1商品行」で、1注文に3商品あれば3行になる。したがって **商品行数 ≠ 注文件数**。

---

## 2. 53件と45件の差分理由（想定）

報告値:
- sales_state別: confirmed=48, canceled=5 → 合計 53 商品行
- 総件数: 45 件

### 原因（推測）

**旧検証APIの集計元が異なっていた可能性**:

| 項目 | 旧APIの集計元 | 正しい意味 |
|------|----------------|------------|
| sales_state別件数 | `select()` で取得した行を1件ずつカウント | **商品行数**（amazon_sales_lines） |
| total | `rows.length`（取得した配列の長さ） | **取得できた行数** |

**Supabase の仕様**: `.select()` にはデフォルトで行数制限（例: 1000行）がある。  
さらに、何らかの理由で **全行が返らず途中で打ち切られた** 場合:
- `rows.length = 45`（実際に返った行数）
- 一方、byState はその45行をループして集計するため、合計も45になるはず

したがって、**byState の合計が 53 になるには矛盾**がある。考えられるのは:
1. **異なるタイミングのデータ**: 検証実行中に別タブで同期され、データが変わった
2. **表示の取り違え**: `total` が transform の `processed`（45）を指しており、byState は別のタイミングのもの

### 結論

- **sales_state別件数** と **総件数** は、どちらも **商品行（amazon_sales_lines の行）** を数えている。
- 数学上、`confirmed + pending_price + canceled + other_excluded = db総商品行数` が成り立つ。
- 矛盾が出た場合は、片方の取得が不完全（制限・キャッシュ等）か、別データ参照の可能性がある。

---

## 3. 修正後の検証API出力（明確化）

### 出力項目名

| 項目名 | 意味 |
|--------|------|
| `sales_state_商品行数` | confirmed / pending_price / canceled / other_excluded それぞれの商品行数 |
| `db総商品行数` | 対象ユーザーの amazon_sales_lines の全行数（COUNT） |
| `byState合計` | sales_state別の合計（＝ db総商品行数 と一致すべき） |
| `consistent` | db総商品行数 と byState合計 が一致するか |
| `confirmedで金額null` | sales_state=confirmed かつ sales_amount_yen が null の件数（0 であるべき） |
| `transform_処理件数` | 今回の transform で処理した amazon_order_items_raw の件数 |

### transform_処理件数 と db総商品行数 の関係

- **transform_処理件数**: 今回の transform で読み込んだ `amazon_order_items_raw` の件数。
- **db総商品行数**: `amazon_sales_lines` の現在の行数。
- transform は upsert のみで削除しないため、過去の同期分が残っていれば `db総商品行数 > transform_処理件数` になり得る。
- 逆に、raw に存在しない注文は transform で触れないため、`amazon_sales_lines` に古い行が残る場合がある。

---

## 4. 今後の検証での注意

1. **商品行** を単位にする（注文ではない）。
2. `db総商品行数` と `byState合計` は必ず一致する。一致しない場合は要調査。
3. `transform_処理件数` は「今回の処理件数」であり、db総商品行数とは別指標。
