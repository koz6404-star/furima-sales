# 再設計 Phase3: sales_lines 整形のアプリ外実行化

**完了日**: 2026年3月
**担当**: Claude Code

---

## 目的

`amazon_orders_raw` / `amazon_order_items_raw` → `amazon_sales_lines` の整形を、
fee_events（Phase2）と同様にスクリプトから実行可能にする。

---

## 変更ファイル一覧

| 種類 | パス |
|------|------|
| 新規: 実行エントリポイント | `src/lib/amazon/run-sales-lines-transform.ts` |
| 新規: CLI スクリプト | `scripts/amazon-sales-lines-transform.ts` |
| 更新: npm scripts 追加 | `package.json` |
| 既存: API ルート（変更なし） | `src/app/api/amazon-sales-lines-transform/route.ts` |

---

## 使い方

```bash
# user-id を引数で指定
npm run amazon-sales-lines-transform -- --user-id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# 環境変数で指定
AMAZON_USER_ID=xxxxxxxx npm run amazon-sales-lines-transform

# tsx で直接実行
npx tsx scripts/amazon-sales-lines-transform.ts <UUID>
```

事前に `.env.local` に以下を設定してください：
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## アーキテクチャ

```
scripts/amazon-sales-lines-transform.ts
  └─ src/lib/amazon/run-sales-lines-transform.ts   ← 新規（薄いラッパー）
       └─ src/lib/amazon/transform-sales-lines.ts  ← 既存（変更なし）
            └─ Supabase: amazon_orders_raw → amazon_sales_lines
```

API ルート（`/api/amazon-sales-lines-transform`）も同じ `transformRawToSalesLines` を呼び出しており、
スクリプトとAPIの両方から整形を実行できる。

---

## Phase2 との対比

| 項目 | Phase2（fee_events） | Phase3（sales_lines） |
|------|---------------------|----------------------|
| 入力テーブル | `amazon_finance_raw` | `amazon_orders_raw` / `amazon_order_items_raw` |
| 出力テーブル | `amazon_fee_events` | `amazon_sales_lines` |
| 実行エントリ | `run-fee-events-transform.ts` | `run-sales-lines-transform.ts` |
| スクリプト | `amazon-fee-events-transform.ts` | `amazon-sales-lines-transform.ts` |
| npm コマンド | `amazon-fee-events-transform` | `amazon-sales-lines-transform` |

---

## 次フェーズ

- Orders / Finances / FBA 取得のバッチ化（取得処理の自動実行）
- mart テーブル（amazon_sales_summary_*）の導入検討
