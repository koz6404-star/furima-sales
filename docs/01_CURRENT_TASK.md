# 現在の正本タスク

**用途**: 今の作業指示の正本。作業完了・切替時に本ファイルを更新する。

---

## 現在の作業指示

### タイトル
3タスク一括実行: Settlement Postage 組込み・Vercel Cron・統合ダッシュボード

### 更新日
2026-03-17

### 状態
実装済み（デプロイ検証待ち）

### 目的
1. Settlement Postage（配送ラベル代）を full-sync パイプラインに組み込み
2. amazon-full-sync を Vercel Cron で毎日自動実行
3. ダッシュボードに Amazon データを合算表示（全チャネル統合）

### 実行結果
**Task 1: Settlement Postage 組込み**
- `scripts/amazon-full-sync.ts` にステップ 5/9 として配送ラベル代取得を追加
- `src/app/api/cron/amazon-sync/route.ts` にも Settlement Postage ステップ追加済み
- `src/lib/amazon/run-settlement-postage-sync.ts` を利用

**Task 2: Vercel Cron 定期実行**
- `src/app/api/cron/amazon-sync/route.ts` 作成（全9ステップ、maxDuration=300、CRON_SECRET 認証）
- `vercel.json` に cron schedule 追加（毎日 UTC 18:00 = JST 3:00）
- 環境変数: `CRON_SECRET`（認証用）、`AMAZON_CRON_USER_ID`（対象ユーザー）を Vercel に設定が必要

**Task 3: 統合ダッシュボード**
- `/dashboard` を全チャネル統合に拡張（フリマ + Amazon mart データを合算）
- サマリーカードにフリマ/Amazon 内訳を表示
- プラットフォーム別テーブルに「Amazon(自動)」行と合計行を追加
- 売れ筋ランキングに Amazon SKU も含め、販路バッジ付き
- グラフ（日別/月別推移）に Amazon 売上も合算

### 検証手順
1. Vercel にデプロイ後、`/dashboard` でフリマ + Amazon のデータが合算表示されることを確認
2. プラットフォーム別テーブルに Amazon(自動) 行が表示されることを確認
3. Vercel 環境変数に `CRON_SECRET` と `AMAZON_CRON_USER_ID` を設定
4. Vercel Cron Jobs 画面で `/api/cron/amazon-sync` が登録されていることを確認

### 次アクション
- Vercel 環境変数の設定（CRON_SECRET, AMAZON_CRON_USER_ID）
- デプロイ後の動作確認

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
