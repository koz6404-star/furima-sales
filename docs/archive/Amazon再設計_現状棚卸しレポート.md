# Amazon 売上管理 現状棚卸しレポート

**作成日**: 2026年3月  
**対象**: Phase11〜14 完了時点  
**目的**: 取得・整形をアプリ表示責務から分離するための現状把握

---

## A. 全体概要

### 処理の流れ（現状）

1. **取得**: Amazon SP-API（Orders / Finances / FBA Inventory）をアプリ内 API 経由で呼び出し
2. **raw 保存**: 取得結果を `amazon_*_raw` テーブルに upsert
3. **整形**: raw を読み、`amazon_sales_lines` / `amazon_fee_events` / `amazon_inventory_current` を生成
4. **集計**: 整形済みデータを order_id 単位で fee 集約し、日次・月次・SKU別・ASIN別に集計
5. **表示**: 売上明細一覧、Finances 一覧、FBA 在庫一覧、集計サマリを表示

### どこまでアプリ内でやっているか

| 処理 | 場所 | トリガー |
|------|------|----------|
| 取得 | アプリ内 API | ボタン押下 |
| raw 保存 | アプリ内 API | 同上（取得と同梱） |
| 整形 | アプリ内 API + lib | ボタン押下 または 取得 API 内 |
| 集計 | アプリ内 API | 画面表示時に GET |
| 検証 | アプリ内 API + npm script | 手動 API 呼び出し / npm run |
| 表示 | アプリ内コンポーネント | ページアクセス |

**結論**: 取得・raw 保存・整形・集計・検証・表示がすべてアプリ内に混在している。

### Phase11〜14 到達点

- **Phase11**: RefundEventList を fee_events に追加（負値で保存）
- **Phase12**: AdjustmentEventList を候補に追加（startsWith 判定、order_id なしは未採用）
- **Phase13**: confirmed 売上集計 API（日次・月次・SKU別・ASIN別）
- **Phase14**: 手数料符号・sales_after_fee_yen の整合修正

---

## B. DB テーブル一覧

### amazon_orders_raw

| 項目 | 内容 |
|------|------|
| 役割 | Orders API getOrders のレスポンスをそのまま保存 |
| 主キー | user_id, source_key（想定） |
| 主なカラム | user_id, fetched_at, payload_json, order_id 等 |
| 分類 | **raw** |
| 書き込み元 | `orders-raw-sync`（lib/amazon/orders-raw-sync.ts） |
| 読み取り元 | amazon-sales-lines-transform, amazon-orders-raw API |

### amazon_order_items_raw

| 項目 | 内容 |
|------|------|
| 役割 | Orders API getOrderItems の商品行をそのまま保存 |
| 主キー | user_id, source_key（想定） |
| 主なカラム | user_id, source_key, payload_json, fetched_at 等 |
| 分類 | **raw** |
| 書き込み元 | orders-raw-sync |
| 読み取り元 | transform-sales-lines, amazon-orders-raw API |

### amazon_sales_lines

| 項目 | 内容 |
|------|------|
| 役割 | 1注文1商品行の整形済み売上明細。sales_state, fulfillment_type 含む |
| 主キー | id（uuid） |
| 主なカラム | user_id, order_id, order_item_id, order_date, sku, asin, product_name, quantity, sales_amount_yen, sales_state, fulfillment_type, fee_status |
| 分類 | **staging / mart に近い**（整形済み、表示の主データソース） |
| 書き込み元 | transform-sales-lines（lib/amazon/transform-sales-lines.ts） |
| 読み取り元 | amazon-sales-lines API, amazon-sales-summary API, amazon-phase4/6/13/14-verify |

### amazon_fba_inventory_raw

| 項目 | 内容 |
|------|------|
| 役割 | FBA Inventory getInventorySummaries の SKU 単位 raw。1SKU1行の上書き型 |
| 主キー | user_id, seller_sku（想定） |
| 主なカラム | user_id, seller_sku, payload_json, snapshot_at 等 |
| 分類 | **raw** |
| 書き込み元 | fba-inventory-raw-sync |
| 読み取り元 | transform-inventory-current, amazon-fba-inventory-raw API |

### amazon_inventory_current

| 項目 | 内容 |
|------|------|
| 役割 | raw から整形した SKU 単位最新在庫。total_available_qty = fulfillable_qty |
| 主キー | user_id, seller_sku（想定） |
| 主なカラム | user_id, seller_sku, total_available_qty, channel_type, fulfillable_qty 等 |
| 分類 | **staging / mart に近い** |
| 書き込み元 | transform-inventory-current |
| 読み取り元 | amazon-sales-lines API（在庫結合用）, amazon-inventory-current API, amazon-phase6-verify |

### amazon_finance_raw

| 項目 | 内容 |
|------|------|
| 役割 | Finances API listFinancialEvents の財務イベント raw。order_id, posted_date, transaction_type |
| 主キー | user_id, source_key |
| 主なカラム | user_id, source_key, posted_date, order_id, transaction_id, transaction_type, payload_json, fetched_at |
| 分類 | **raw** |
| 書き込み元 | finance-raw-sync |
| 読み取り元 | transform-fee-events, amazon-finance-raw API, amazon-phase8/11/12/14-verify |

### amazon_fee_events

| 項目 | 内容 |
|------|------|
| 役割 | raw から整形した手数料イベント。order_id, fee_type, fee_amount_yen |
| 主キー | id（uuid） |
| 主なカラム | user_id, order_id, transaction_type, fee_type, fee_amount_yen, posted_date, raw_source |
| 分類 | **staging / mart に近い** |
| 書き込み元 | transform-fee-events |
| 読み取り元 | amazon-sales-lines API, amazon-sales-summary API, amazon-fee-events API, amazon-phase9/11/12/13/14-verify |

---

## C. API 一覧

### 取得系

| API | メソッド | 役割 | DB 更新 | アプリ外候補 |
|-----|----------|------|---------|-------------|
| /api/amazon-orders-sync | POST | Orders API 取得 → raw 保存（+ transform オプション） | あり | ◎ 高 |
| /api/amazon-finance-sync | POST | Finances API 取得 → raw 保存 | あり | ◎ 高 |
| /api/amazon-fba-inventory-sync | POST | FBA Inventory API 取得 → raw 保存 + current 整形 | あり | ◎ 高 |

### 整形系

| API | メソッド | 役割 | DB 更新 | アプリ外候補 |
|-----|----------|------|---------|-------------|
| /api/amazon-sales-lines-transform | POST | raw → amazon_sales_lines | あり | ◎ 高 |
| /api/amazon-fee-events-transform | POST | raw → amazon_fee_events | あり | ◎ 高 |
| /api/amazon-inventory-current-transform | POST | raw → amazon_inventory_current | あり | ◎ 中（fba-sync に同梱） |

### 集計系

| API | メソッド | 役割 | DB 更新 | アプリ外候補 |
|-----|----------|------|---------|-------------|
| /api/amazon-sales-lines | GET | 売上明細一覧（current_available, fee_amount_aggregated 付与） | なし | △ 集約ロジック分離 |
| /api/amazon-sales-lines/summary | GET | sales_state 別件数 | なし | × 表示用 |
| /api/amazon-sales-summary | GET | 日次・月次・SKU別・ASIN別集計 | なし | △ mart 化時は事前集計 |

### 検証系

| API | メソッド | 役割 | DB 更新 | アプリ外候補 |
|-----|----------|------|---------|-------------|
| /api/amazon-phase4-verify | GET | Phase4 検証 | なし | ○ 開発用 |
| /api/amazon-phase5-verify | GET | Phase5 検証 | なし | ○ 開発用 |
| /api/amazon-phase6-verify | GET | Phase6 検証 | なし | ○ 開発用 |
| /api/amazon-phase6-sku-match | GET | SKU 結合率分析 | なし | ○ 開発用 |
| /api/amazon-phase8-verify | GET | Phase8 検証 | なし | ○ 開発用 |
| /api/amazon-phase8-analyze | GET | Finances raw 分析 | なし | ○ 開発用 |
| /api/amazon-phase9-verify | GET | Phase9 検証 | なし | ○ 開発用 |
| /api/amazon-phase11-verify | GET | Phase11 検証 | なし | ○ 開発用 |
| /api/amazon-phase12-verify | GET | Phase12 検証 | なし | ○ 開発用 |
| /api/amazon-phase13-verify | GET | Phase13 検証 | なし | ○ 開発用 |
| /api/amazon-phase14-verify | GET | Phase14 検証 | なし | ○ 開発用 |

### 表示系（raw / 一覧取得）

| API | メソッド | 役割 | DB 更新 | アプリ外候補 |
|-----|----------|------|---------|-------------|
| /api/amazon-orders-raw | GET | 注文 raw 一覧 | なし | △ 開発用 |
| /api/amazon-finance-raw | GET | Finances raw 一覧 | なし | △ 開発用 |
| /api/amazon-fee-events | GET | fee_events 一覧 | なし | △ 開発用 |
| /api/amazon-fba-inventory-raw | GET | FBA 在庫 raw 一覧 | なし | △ 開発用 |
| /api/amazon-inventory-current | GET | 整形済み在庫一覧 | なし | × 表示用 |

### その他

| API | メソッド | 役割 | DB 更新 | アプリ外候補 |
|-----|----------|------|---------|-------------|
| /api/amazon-connect-check | GET | 接続確認 | なし | × |
| /api/amazon-finance-diagnostic | GET | Finances API 診断 | なし | ○ 開発用 |
| /api/amazon-sales-lines-validate | GET | sales_state 検証 | なし | ○ 開発用 |
| /api/amazon-sales-zero-diagnostic | GET | 売上0の診断 | なし | ○ 開発用 |
| /api/amazon-sync | POST | 旧 Amazon 同期（Phase0 で停止） | なし | × |
| /api/reset-amazon-data | POST | データリセット | あり | × |

---

## D. 画面一覧

### /amazon-sales

| 項目 | 内容 |
|------|------|
| 役割 | 売上明細一覧。フィルタ（sales_state, 日付, SKU, FBA/FBM）。在庫・手数料・集計サマリ |
| 依存 API | amazon-sales-lines, amazon-sales-lines/summary, amazon-sales-summary, amazon-orders-sync |
| 依存テーブル | amazon_sales_lines, amazon_inventory_current, amazon_fee_events |
| 種別 | **運用用**（開発用リンク Phase13/14 検証あり） |
| 備考 | AmazonSalesSyncButton で「同期」→ orders-sync + transform。集計サマリは手動「表示」ボタン |

### /amazon-sales/verify

| 項目 | 内容 |
|------|------|
| 役割 | Phase4 検証用ページ |
| 依存 API | amazon-phase4-verify |
| 依存テーブル | amazon_sales_lines |
| 種別 | **開発用** |

### /amazon-finance

| 項目 | 内容 |
|------|------|
| 役割 | Finances raw / fee_events 一覧。同期・整形ボタン。Phase8/9/11/12/14 検証リンク |
| 依存 API | amazon-finance-raw, amazon-fee-events, amazon-finance-sync, amazon-fee-events-transform |
| 依存テーブル | amazon_finance_raw, amazon_fee_events |
| 種別 | **運用・開発混在**（raw 確認は開発寄り、同期・整形は運用） |
| 備考 | ボタンで「Finances 同期」「fee_events 整形」を実行 |

### /amazon-fba-inventory

| 項目 | 内容 |
|------|------|
| 役割 | FBA 在庫一覧。Raw / Current 切替。同期ボタン |
| 依存 API | amazon-fba-inventory-raw, amazon-inventory-current, amazon-fba-inventory-sync |
| 依存テーブル | amazon_fba_inventory_raw, amazon_inventory_current |
| 種別 | **運用用** |

### /amazon-fba-inventory/verify

| 項目 | 内容 |
|------|------|
| 役割 | Phase5 検証用ページ |
| 依存 API | amazon-phase5-verify |
| 依存テーブル | amazon_fba_inventory_raw |
| 種別 | **開発用** |

---

## E. 実行トリガー一覧

### ボタン押下で実行

| 処理 | 画面 | 呼び出し API |
|------|------|-------------|
| Amazon 同期（過去3ヶ月） | /amazon-sales | POST /api/amazon-orders-sync（transform: true） |
| Finances 同期 | /amazon-finance | POST /api/amazon-finance-sync |
| fee_events 整形 | /amazon-finance | POST /api/amazon-fee-events-transform |
| FBA 在庫同期 | /amazon-fba-inventory | POST /api/amazon-fba-inventory-sync |

### 手動 API 実行（ブラウザ / curl）

- GET 系: 各 verify API, raw API, sales-lines, sales-summary 等
- POST 系: orders-sync, finance-sync, fee-events-transform, sales-lines-transform 等
- **いずれも人力で URL を開くかツールで呼び出す必要あり**

### npm script

| スクリプト | 役割 | 備考 |
|------------|------|------|
| amazon-phase111213-verify | Phase11/12/13 検証（Supabase 直接クエリ） | Service Role 必要 |
| amazon-sales-zero-diagnostic | 売上0の診断 | スクリプト実行 |
| amazon-sales-state-validate | sales_state 検証 | スクリプト実行 |

### 自動化されていない処理

- **Orders 取得**: ボタン押下のみ。cron 等なし
- **Finances 取得**: 同上
- **FBA 在庫取得**: 同上
- **sales_lines 整形**: orders-sync に transform オプションで同梱、または手動 POST
- **fee_events 整形**: 手動「整形」ボタンのみ
- **inventory_current 整形**: fba-inventory-sync に同梱
- **集計**: GET で都度計算。事前集計テーブルなし

---

## F. 現在の問題点

### 取得・整形・表示の混在

1. **/amazon-sales**: 売上表示画面に「Amazon同期」ボタンがあり、取得・整形がUIに直結
2. **/amazon-finance**: 表示画面に「Finances 同期」「fee_events 整形」ボタン。開発用 verify リンクも同居
3. **/amazon-fba-inventory**: 同上。同期ボタンが表示画面に混在

### UI に開発用責務が混ざっている箇所

1. Phase8/9/11/12/14 などの verify API へのリンクが運用画面に並列表示
2. raw / fee_events の切替表示は Finances のデバッグ向き
3. 集計サマリの「Phase13 検証」「Phase14 検証」リンクが運用画面に表示

### 運用上見づらくなる原因

1. 同期・整形がボタン押下前提で、忘れるとデータが古いまま
2. 取得 → 整形 の順序をユーザーが意識する必要あり（Finances は sync → transform の2段階）
3. 検証用リンクが多すぎて、運用者には不要な情報が目立つ

### アプリ内実装のままだと辛い箇所

1. **Amazon API レート制限**: ボタン連打で制限に達する可能性。バッチで制御したい
2. **長時間処理**: orders-sync, finance-sync は maxDuration 300 秒。ユーザーが画面を開いたまま待つ前提
3. **取得・整形の分離**: 現状 orders-sync は「取得+transform」を1回で実行。取得だけ・整形だけを独立実行する入口が分かりにくい
4. **集計の都度計算**: sales-summary は都度 amazon_sales_lines + amazon_fee_events を読み集計。データ増で遅くなる可能性
