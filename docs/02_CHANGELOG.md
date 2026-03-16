# 変更履歴（主要イベント）

**用途**: プロジェクトの主要変更を時系列で追跡。詳細は各 Phase ドキュメントを参照。

---

## 2026年3月

### フリマ基盤改善: ダッシュボード強化（2026-03-16）
- `src/app/dashboard/page.tsx` を更新
- 経費合計カード（手数料＋送料＋資材の合算、赤色）を追加
- 売れ筋ランキング TOP10（利益順）テーブルを追加
- sales クエリに `products(name, sku)` JOIN を追加して商品名・SKU を表示

### 再設計 Phase8: Amazon UI の一時非表示
- `nav.tsx` から Amazon売上・FBA在庫・Finances の3項目を削除
- 各 page.tsx を `redirect('/')` のみに簡略化（直接URLアクセスもホームへ）
- API・スクリプト・DBは全て維持。`npm run amazon-full-sync` での運用は継続可能
- 将来: データパイプライン完成後に mart 読み取り専用の新 UI を作成予定

### 再設計 Phase7: mart テーブル導入（amazon_sales_summary_*）
- `supabase/migrations/028_amazon_sales_mart.sql` 追加（daily / monthly / sku / asin）
- `build-sales-mart.ts` / `run-build-sales-mart.ts` / `scripts/amazon-build-sales-mart.ts` 追加
- `amazon-sales-summary` API を mart 優先読み取りに更新（mart 空の場合は都度計算にフォールバック）
- `amazon-full-sync.ts` に mart 構築ステップ（7/7）を追加
- **検証必要**: migration 適用後に `npm run amazon-build-sales-mart -- --user-id=xxx` を実行して確認

### 再設計 Phase6: 検証API・開発導線の運用画面からの分離
- `/amazon-sales`: Phase13/14検証リンク・集計APIリンクを削除
- `/amazon-finance`: Phase8/9/11/12/14検証リンク・rawAPI・分析リンクを削除、タイトルを運用向けに変更
- `amazon-finance-client.tsx`: Phase12確認ボタン・state・関数を削除

### 再設計 Phase5: 取得→整形の連鎖スクリプト
- `npm run amazon-full-sync` で全6ステップ（取得×3 + 整形×3）を1コマンド実行可能に
- `run-inventory-current-transform.ts` を追加（Phase3 で漏れていた分）
- `scripts/amazon-full-sync.ts` 追加（`--skip-*` オプションで部分実行も可）
- 参照: `再設計Phase5_連鎖スクリプト.md`

### 再設計 Phase4: Orders / Finances / FBA 取得の外部実行化
- Orders / Finances / FBA Inventory の raw 取得をアプリ外実行可能に
- `run-orders-raw-sync.ts` / `run-finance-raw-sync.ts` / `run-fba-inventory-raw-sync.ts` 追加
- 各 CLI スクリプト追加（`amazon-orders-raw-sync` / `amazon-finance-raw-sync` / `amazon-fba-inventory-raw-sync`）
- Orders は `--from` / `--to` で取得期間指定可能（省略時: 直近30日）
- 参照: `再設計Phase4_取得外部実行化.md`

### 再設計 Phase3: sales_lines 外部実行化
- sales_lines 整形をアプリ外実行可能に
- `runSalesLinesTransform` サービス層追加（`src/lib/amazon/run-sales-lines-transform.ts`）
- `scripts/amazon-sales-lines-transform.ts` 追加
- `npm run amazon-sales-lines-transform` で user_id 指定実行
- 参照: `再設計Phase3_sales_lines外部実行化.md`
- 担当: Claude Code

### 再設計 Phase2: fee_events 外部実行化
- fee_events 整形をアプリ外実行可能に
- `runFeeEventsTransform` サービス層追加
- `scripts/amazon-fee-events-transform.ts` 追加
- `npm run amazon-fee-events-transform` で user_id 指定実行
- 参照: `再設計Phase2_fee_events外部実行化.md`

### 再設計 Phase1: 現状棚卸し・分離設計
- `Amazon再設計_現状棚卸しレポート.md` 作成
- `Amazon再設計_分離候補一覧.md` 作成
- `Amazon再設計_データフロー.md` 作成
- 取得・整形・集計・表示の責務分離方針を整理

### docs 正本運用の整備
- `00_PROJECT_STATE.md` 作成
- `01_CURRENT_TASK.md` 作成
- `02_CHANGELOG.md` 作成
- `03_ISSUES.md` 作成
- docs 棚卸し・再編案の作成

---

## 2026年3月（Phase11〜14）

### Phase14: 整合修正
- 手数料符号・sales_after_fee_yen の整合修正
- 参照: `Phase14_整合修正_実装概要.md`

### Phase13: 売上集計 API
- confirmed 売上を日次・月次・SKU別・ASIN別に集計
- `/api/amazon-sales-summary` 追加
- 参照: `Phase13_売上集計API_実装概要.md`

### Phase12: AdjustmentEventList
- PostageBilling* / PostageRefund* を fee_events に追加
- 参照: `Phase12_AdjustmentEventList_実装概要.md`

### Phase11: RefundEventList
- RefundEventList を fee_events に追加（負値で保存）
- 参照: `Phase11_RefundEventList_実装概要.md`

---

## 2025年3月（Phase0〜10）

### Phase10: 売上への手数料反映
- order_id 単位で fee 集約、売上一覧に手数料列追加

### Phase9: fee_events 整形
- ShipmentEvent / ServiceFeeEvent から手数料抽出

### Phase8: Finances raw
- `amazon_finance_raw`。listFinancialEvents で財務イベント保存

### Phase7: 売上在庫結合
- 売上一覧に `current_available` 付与

### Phase6: inventory_current
- `amazon_inventory_current` 整形

### Phase5: FBA 在庫 raw
- `amazon_fba_inventory_raw`

### Phase4: 売上一覧表示
- sales_state 導入。売上金額の NULL 許容

### Phase3: 売上明細整形
- `amazon_sales_lines`

### Phase2: Orders raw 取得
- `amazon_orders_raw`, `amazon_order_items_raw`

### Phase1: 接続基盤
- SP-API クライアント、Orders API 呼び出し基盤

### Phase0: 現状調査
- Finances 依存の課題整理。Orders API 新設計への移行方針

---

## 更新ルール

- Phase 完了・再設計フェーズ完了・重要リリース時に追記
- 日付・要約・参照ドキュメントを明記
