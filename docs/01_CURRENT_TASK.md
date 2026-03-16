# 現在の正本タスク

**用途**: 今の作業指示の正本。作業完了・切替時に本ファイルを更新する。

---

## 現在の作業指示

### タイトル
Phase14: FBM 在庫取得（Listings Items API）

### 更新日
2026-03-16

### 状態
実装完了 → 検証待ち

### 目的
FBM（自己発送）商品の出品在庫数を Amazon Listings Items API から取得し、`amazon_fbm_inventory_current` テーブルに保存する。

### 実行結果
- `supabase/migrations/029_amazon_fbm_inventory_current.sql` 作成
- `src/lib/amazon/fbm-listings.ts` 作成（Listings Items API ラッパー）
- `src/lib/amazon/fbm-inventory-sync.ts` 作成（同期ロジック）
- `src/lib/amazon/run-fbm-inventory-sync.ts` 作成（サービスラッパー）
- `scripts/amazon-fbm-inventory-sync.ts` 作成（CLI スクリプト）
- `src/app/api/amazon-fbm-inventory-sync/route.ts` 作成（API ルート）
- `package.json` に `amazon-fbm-inventory-sync` 追加
- `scripts/amazon-full-sync.ts` にステップ 7/8 として FBM 追加

### 検証手順
1. Supabase で migration 029 を適用する
2. `.env.local` に `AMAZON_SELLER_ID=Axxxxxxxxx` を追加する
3. `npm run amazon-fbm-inventory-sync -- --user-id=<UUID>` を実行する
4. `amazon_fbm_inventory_current` テーブルに結果が入っていることを確認

### 次アクション
Phase14 検証完了後 → Phase15（FBM 売上との結合整理）へ

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
