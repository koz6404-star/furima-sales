# Amazon連携 Phase 4 完了報告

完了日: 2025-03-14

---

## 何を実装したか

### 1. 売上一覧画面（`/amazon-sales`）
- amazon_sales_lines を一覧表示
- 並び順: 注文日 desc、注文ID desc
- UI は raw に依存せず normalized のみ参照

### 2. 表示項目
| 列 | 説明 |
|-----|------|
| 注文日 | order_date |
| 注文ID | order_id |
| SKU | sku |
| 商品名 | product_name |
| FBA/FBM | fulfillment_type |
| 数量 | quantity |
| 売上金額 | sales_amount_yen |
| 手数料状態 | fee_status（未取得/取得済/不明）|

### 3. 検索・フィルター
- 注文日 From / To（日付範囲）
- SKU（部分一致・検索ボタンで適用）
- 商品名（部分一致・検索ボタンで適用）
- FBA/FBM（すべて/FBA/FBM）

### 4. 同期ボタン
- 「Amazon同期（過去3ヶ月）」: 過去3ヶ月分を取得して raw 保存し、transform で amazon_sales_lines へ反映

### 5. ナビゲーション
- ナビに「Amazon売上」リンクを追加

---

## 変更ファイル一覧

| ファイル | 種別 |
|----------|------|
| `src/app/amazon-sales/page.tsx` | 新規 |
| `src/components/amazon-sales-list-client.tsx` | 新規 |
| `src/components/amazon-sales-sync-button.tsx` | 新規 |
| `src/components/nav.tsx` | 更新（Amazon売上リンク追加） |
| `docs/AMAZON_PHASE4_COMPLETE.md` | 新規 |

---

## DB 変更点

なし（Phase 3 で作成した amazon_sales_lines を使用）

---

## 動作確認方法

1. `npm run supabase-migrate` で 021, 022 を適用済みであること
2. ログイン後、ナビの「Amazon売上」をクリック
3. 「Amazon同期（過去3ヶ月）」でデータ取得
4. 一覧表示・フィルター・ページネーションを確認

---

## 優先 Phase 完了

指示書の最優先 Phase 0〜4 が完了しました。

- Phase 0: リセット・認証情報保全 ✓
- Phase 1: 接続基盤 ✓
- Phase 2: Orders raw 取得 ✓
- Phase 3: 売上明細整形 ✓
- Phase 4: 売上一覧表示 ✓

FBA在庫、手数料（Finances）、FBM在庫は Phase 5 以降で実装します。
