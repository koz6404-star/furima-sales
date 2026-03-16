# 再設計 Phase2: fee_events 外部実行化

**作成日**: 2026年3月  
**目的**: `amazon_finance_raw → amazon_fee_events` 整形をアプリ外から実行可能にする

---

## 1. 概要

fee_events 整形を、画面ボタン前提から **CLI / script / 将来のバッチ** から実行できる形へ分離した。

- **lib**: 整形ロジック本体（`transform-fee-events.ts`）※変更なし
- **service**: アプリ外実行用エントリ（`run-fee-events-transform.ts`）
- **script**: CLI 実行（`scripts/amazon-fee-events-transform.ts`）
- **api**: 既存 API は薄いラッパーとして維持（認証済み user 向け）

---

## 2. 実行方法

### 2.1 npm script

```bash
# user_id を指定して実行
npm run amazon-fee-events-transform -- --user-id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# 環境変数で指定
AMAZON_USER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx npm run amazon-fee-events-transform
```

### 2.2 直接 tsx 実行

```bash
npx tsx scripts/amazon-fee-events-transform.ts xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 2.3 user_id の取得方法

- Supabase の auth.users から確認
- `amazon_finance_raw` または `amazon_sales_lines` の `user_id` 列を参照

例（Supabase SQL）:

```sql
SELECT DISTINCT user_id FROM amazon_finance_raw LIMIT 1;
```

---

## 3. 事前準備

`.env.local` に以下を設定:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

※ Service Role キーは Supabase Dashboard > Settings > API で確認

---

## 4. 読み書きの関係

| 処理 | 読む | 書く |
|------|------|------|
| fee_events 整形 | `amazon_finance_raw` | `amazon_fee_events` |

- 対象 transaction_type: `ShipmentEventList`, `ServiceFeeEventList`, `RefundEventList`, `AdjustmentEventList`
- 実行時: 当該 user の既存 `amazon_fee_events` を削除 → 再生成

---

## 5. 実行後の確認

### 5.1 スクリプト出力

成功時:

```json
{
  "user_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "started_at": "2026-03-14T...",
  "finished_at": "2026-03-14T...",
  "processed": 150,
  "saved": 420,
  "skipped": 3,
  "errors": [],
  "ok": true
}
```

- **processed**: finance_raw の処理件数
- **saved**: fee_events への保存件数
- **skipped**: order_id なし等でスキップした件数
- **errors**: エラーがあればメッセージ配列

### 5.2 DB で確認

```sql
SELECT COUNT(*) FROM amazon_fee_events WHERE user_id = 'xxx';
```

### 5.3 画面で確認

- `/amazon-finance` の fee_events 一覧
- `/amazon-sales` の手数料列

---

## 6. API との関係

| 実行方法 | 認証 | 用途 |
|----------|------|------|
| `POST /api/amazon-fee-events-transform` | ログイン user | 画面ボタンから実行 |
| `npm run amazon-fee-events-transform` | user_id 指定 | アプリ外（cron / 手動） |

両方とも同じ `transformRawToFeeEvents` を呼び、結果は一致する。

---

## 7. 既存仕様の維持（Phase11〜14）

以下は変更していない:

- Shipment / ServiceFee / Refund / Adjustment の扱い
- Refund の負値保存
- AdjustmentType の `startsWith('PostageBilling')` / `startsWith('PostageRefund')`
- order_id なし Adjustment は採用しない
- user 単位で削除 → 再挿入による重複防止

---

## 8. 変更ファイル一覧

| 種別 | パス |
|------|------|
| 新規 | `src/lib/supabase/service.ts` |
| 新規 | `src/lib/amazon/run-fee-events-transform.ts` |
| 新規 | `scripts/amazon-fee-events-transform.ts` |
| 変更 | `src/app/api/amazon-fee-events-transform/route.ts`（コメントのみ） |
| 変更 | `package.json`（tsx 追加、npm script 追加） |
| 新規 | `docs/再設計Phase2_fee_events外部実行化.md` |

---

## 9. 次フェーズ（sales_lines 整形分離）への準備

- lib の `transformRawToFeeEvents` はそのまま利用
- service 層・script の構成を `sales_lines` にも同様に適用可能
- `run-fee-events-transform` と同パターンで `run-sales-lines-transform` を追加すればよい
