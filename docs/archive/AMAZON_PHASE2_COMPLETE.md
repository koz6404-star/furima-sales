# Amazon連携 Phase 2 完了報告

完了日: 2025-03-14

---

## 何を実装したか

### 1. raw テーブル（マイグレーション 021）
- **amazon_orders_raw**: 注文一覧をそのまま保存
- **amazon_order_items_raw**: 注文明細（商品行）をそのまま保存
- 共通列: id, user_id, fetched_at, source_api, source_key, payload_json
- 一意制約: (user_id, source_key) で upsert 可能

### 2. Orders raw 同期（`src/lib/amazon/orders-raw-sync.ts`）
- `syncOrdersToRaw()`: Orders API から取得し raw テーブルに保存
- 注文一覧のページネーション対応
- 各注文の商品行（getOrderItems）も取得・保存
- 再取得時は upsert で上書き（壊れない）

### 3. API エンドポイント
| エンドポイント | メソッド | 説明 |
|----------------|----------|------|
| `/api/amazon-orders-sync` | POST | 注文・商品行を取得して raw 保存 |
| `/api/amazon-orders-raw` | GET | raw 件数とサンプル確認（開発者用） |

### 4. 同期 API パラメータ（POST body）
- `from`: 取得開始日（YYYY-MM-DD）
- `to`: 取得終了日（YYYY-MM-DD）
- `ordersOnly`: true で注文のみ（商品行スキップ・デバッグ用）

---

## 変更ファイル一覧

| ファイル | 種別 |
|----------|------|
| `supabase/migrations/021_amazon_orders_raw.sql` | 新規 |
| `src/lib/amazon/orders-raw-sync.ts` | 新規 |
| `src/app/api/amazon-orders-sync/route.ts` | 新規 |
| `src/app/api/amazon-orders-raw/route.ts` | 新規 |
| `docs/AMAZON_PHASE2_COMPLETE.md` | 新規 |

---

## DB 変更点

- **amazon_orders_raw**: 新規作成
- **amazon_order_items_raw**: 新規作成
- RLS 有効、user_id で自データのみアクセス可

### マイグレーション実行
```bash
npm run supabase-migrate
```

---

## 動作確認方法

### 1. マイグレーション実行
```bash
npm run supabase-migrate
```

### 2. 同期実行（ローカル）
```bash
npm run dev
```
ログイン後:
```bash
curl -X POST http://localhost:3000/api/amazon-orders-sync \
  -H "Content-Type: application/json" \
  -H "Cookie: <セッションCookie>" \
  -d '{"from":"2025-01-01","to":"2025-03-14"}'
```

または ブラウザから fetch:
```js
fetch('/api/amazon-orders-sync', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ from: '2025-01-01', to: '2025-03-14' }),
});
```

### 3. raw 確認
```
GET /api/amazon-orders-raw
GET /api/amazon-orders-raw?full=1   # payload_json 全文
```

---

## 次 Phase でやること（Phase 3）

1. amazon_sales_lines テーブルの作成
2. raw から normalized への transform
3. 1注文1商品行への展開
4. 必須項目: 注文日, 注文ID, SKU, ASIN, 商品名, 数量, 売上金額, FBA/FBM, fetched_at

---

## 注意

- 初回同期は `npm run supabase-migrate` で 021 を適用してから実行すること
- 大量注文時は maxDuration=300 によりタイムアウトの可能性あり（Vercel 無料は 10秒のためローカル推奨）
