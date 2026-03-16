# 現在の正本タスク

**用途**: 今の作業指示の正本。作業完了・切替時に本ファイルを更新する。

---

## 現在の作業指示

### タイトル
Phase15: FBM 売上結合・統合在庫

### 更新日
2026-03-16

### 状態
実装済み（検証待ち）

### 目的
FBA + FBM の在庫データを統合し、SKU 売上サマリーに fulfillment_type（FBA/FBM/MIXED）と現在庫数を付与する。

### 実行結果
- `supabase/migrations/030_phase15_inventory_unified.sql` 作成（fulfillment_type/current_inventory 列追加 + 統合在庫 VIEW）
- `src/lib/amazon/build-sales-mart.ts` 更新（FBA+FBM 在庫取得、fulfillment_type 判定、current_inventory 付与）
- `src/app/api/amazon-inventory-unified/route.ts` 作成（統合在庫 + 売上結合 API）

### 検証手順
1. Supabase SQL Editor で migration 030 を実行: https://supabase.com/dashboard/project/ewxzsftkxkqrvhjavrfd/sql/new
2. `npm run amazon-build-sales-mart -- --user-id=b654d797-cae4-4af8-b22c-ffa91763698c` を実行
3. amazon_sales_summary_sku テーブルで fulfillment_type / current_inventory が入っていることを確認: https://supabase.com/dashboard/project/ewxzsftkxkqrvhjavrfd/editor
4. 統合在庫 API を確認: `/api/amazon-inventory-unified`

### 次アクション
Phase15 検証完了後 → Phase16（Amazon 取り込み完成整理）へ

---

## テンプレート

新規タスクに差し替える際の記入用。

```markdown
### タイトル
[タイトル]

### 更新日
[YYYY年M月]

### 状態
完了（Claude Code 実装） / 進行中 / 完了

### 目的
[何を達成するか]

### 背景
[なぜ今やるか。00_PROJECT_STATE または 03_ISSUES への参照]

### やること
1. [タスク1]
2. [タスク2]

### やらないこと
- [ ]

### 変更候補ファイル
- [パス]

### 検証条件
- [ ]

### 完了条件
- [ ]

### 実行結果
[未着手 / 実施内容の要約]

### 未解決事項
[なし / 発生した論点]

### 次アクション
[次のタスクへの着手方法]
```

---

## 記入例

上記テンプレートを埋めた具体例（本タスクの元ネタ）。

| 項目 | 記入例 |
|------|--------|
| 目的 | `amazon_orders_raw` / `amazon_order_items_raw` → `amazon_sales_lines` の整形を script から実行可能にする |
| 背景 | 再設計 Phase2 で fee_events 完了。sales_lines も同パターンで実施可能 |
| やること | run-sales-lines-transform 新規、script 新規、package.json 追加、API 薄ラッパー維持、docs 作成 |
| やらないこと | Orders 取得の分離、mart テーブル作成 |
| 完了条件 | `npm run amazon-sales-lines-transform -- --user-id=xxx` で実行可能、02_CHANGELOG 追記済み |
