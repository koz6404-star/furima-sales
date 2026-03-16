# 現在の正本タスク

**用途**: 今の作業指示の正本。作業完了・切替時に本ファイルを更新する。

---

## 現在の作業指示

### タイトル
Phase16: Amazon 取り込み完成（新 UI・nav 復活）

### 更新日
2026-03-16

### 状態
実装済み（デプロイ検証待ち）

### 目的
FBA + FBM 統合の新しい Amazon 売上管理画面を作成し、ナビゲーションに復活させる。

### 実行結果
- `src/app/amazon-dashboard/page.tsx` 作成（サーバーコンポーネント、認証チェック）
- `src/components/amazon-dashboard-client.tsx` 作成（SKU別売上・統合在庫・月別集計の3タブ UI）
- `src/components/nav.tsx` に「Amazon売上」メニュー追加
- 型エラー修正（finances.ts, transform-fee-events.ts, amazon-sales-lines/route.ts, verify ページ）
- `tsconfig.json` に legacy 除外追加
- ビルド成功確認

### 検証手順
1. Vercel に自動デプロイされるのを待つ
2. `/amazon-dashboard` にアクセスし、3タブ（SKU別売上・統合在庫・月別集計）が表示されることを確認
3. nav に「Amazon売上」メニューが表示されることを確認

### 次アクション
- Amazon 商品原価入力 UI（SKU ごとに仕入れ原価を手動登録）
- Amazon＋フリマ合算表示

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
