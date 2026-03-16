# Amazon 再設計 分離候補一覧

**作成日**: 2026年3月  
**目的**: 取得・整形をアプリ外へ出し、アプリは表示責務に寄せるための分離候補と推奨順序

---

## A. アプリ外へ出すべき処理

| 処理名 | 現在の場所 | 役割 | アプリ外に出すべき理由 | 優先度 |
|--------|-----------|------|------------------------|--------|
| Amazon Orders API 取得 | POST /api/amazon-orders-sync | getOrders / getOrderItems 呼び出し | API レート制限管理、長時間実行に適さない。表示と無関係 | **高** |
| Amazon Finances API 取得 | POST /api/amazon-finance-sync | listFinancialEvents 呼び出し | 同上。ページング・長時間処理 | **高** |
| Amazon FBA Inventory API 取得 | POST /api/amazon-fba-inventory-sync | getInventorySummaries 呼び出し | 同上 | **高** |
| raw 保存（orders） | orders-raw-sync | amazon_orders_raw, amazon_order_items_raw 書き込み | 取得の副産物。取得と一体でバッチ化 | **高** |
| raw 保存（finance） | finance-raw-sync | amazon_finance_raw 書き込み | 同上 | **高** |
| raw 保存（FBA） | fba-inventory-raw-sync | amazon_fba_inventory_raw 書き込み | 同上 | **高** |
| fee_events 整形 | POST /api/amazon-fee-events-transform | amazon_fee_events 生成 | 表示責務と無関係。raw に依存する純粋な ETL | **高** |
| sales_lines 整形 | lib/transform-sales-lines（orders-sync 経由） | amazon_sales_lines 生成 | 同上 | **高** |
| inventory_current 整形 | fba-inventory-sync 内 | amazon_inventory_current 生成 | 同上。FBA sync に同梱されているが分離可能 | **中** |
| confirmed 判定 | transform-sales-lines, sales-summary | sales_state 判定、集計時の confirmed フィルタ | ロジックはアプリ外の整形・集計で持つべき | **中** |
| order_id 単位 fee 集約 | amazon-sales-lines API, amazon-sales-summary API | fee_amount_aggregated 計算 | 集計ロジック。mart 化時は事前計算 | **中** |
| 日次 / 月次 / SKU / ASIN 集計 | GET /api/amazon-sales-summary | 集計サマリ返却 | 都度計算だとデータ増で重くなる。mart テーブルで事前集計 | **中** |
| Phase11〜14 検証 | 各 verify API | ロジック検証 | 開発用。運用画面と分離し、CI や手動スクリプトへ | **低** |
| finance-diagnostic, sales-zero-diagnostic | 診断 API | デバッグ | 同上 | **低** |

---

## B. アプリ内に残すべき処理

| 処理名 | 内容 | 備考 |
|--------|------|------|
| 売上明細一覧表示 | amazon_sales_lines をページネーション・フィルタ付きで表示 | 主な運用画面 |
| フィルタ（sales_state, 日付, SKU, FBA/FBM） | GET パラメータで絞り込み | 表示責務 |
| 在庫・手数料の結合表示 | current_available, fee_amount_aggregated を付与して表示 | 結合ロジックは mart 化で簡略化可能 |
| 集計サマリ表示 | 日次・月次・SKU別・ASIN別の集計結果表示 | データソースは mart テーブル化を推奨 |
| Finances 一覧表示 | raw / fee_events 一覧（運用者が確認用） | 開発用要素は分離 |
| FBA 在庫一覧表示 | raw / current 一覧 | 同上 |
| 検索 | SKU, ASIN, 注文 ID 等での検索 | 表示責務 |
| sales_state 別件数サマリ | amazon-sales-lines/summary | 軽量。表示用 |

### 画面上の軽微な表示補助

- 接続確認（amazon-connect-check）
- サマリ「表示」ボタンで集計結果を表示
- フィルタのクリア・リセット

---

## C. 分離時のリスク

### UI が壊れそうな箇所

1. **同期・整形ボタンの削除・非表示**: ボタンを外すと運用者が「同期」できなくなる。代替として「最終同期日時」表示とバッチ実行状況の確認手段が必要
2. **raw / fee_events 切替**: 開発用として残すか、別画面（例: /amazon-finance/debug）へ移すか検討

### 依存が強い箇所

1. **amazon_sales_lines** ← amazon_orders_raw, amazon_order_items_raw
2. **amazon_fee_events** ← amazon_finance_raw
3. **amazon_inventory_current** ← amazon_fba_inventory_raw
4. **sales_summary 集計** ← amazon_sales_lines + amazon_fee_events
5. **amazon-sales-lines API** ← amazon_inventory_current（current_available 結合）

→ raw が更新されないと整形が動かない。整形が動かないと表示データが古い。取得・整形を外す場合は「いつデータが更新されるか」を運用に明示する必要あり

### 先に切り離すと危険な箇所

1. **sales_lines 整形を外す前に orders 取得を外す**: orders-sync は「取得+transform」一体。取得だけ外すと transform のトリガーがなくなる。→ 取得・raw 保存を外す際は、transform のトリガー（バッチ完了後の webhook / queue 等）を同時に設計する必要
2. **集計ロジックを mart 化する前に整形を外す**: 現状は sales_summary が都度 sales_lines + fee_events を読む。mart 化しないまま整形を外すと、集計だけアプリに残り負荷が偏る

### 先に切り離すと効果が大きい箇所

1. **Amazon API 取得 3 種（Orders / Finances / FBA）**: 長時間・レート制限の影響をアプリから排除できる
2. **fee_events 整形**: 独立した POST であり、バッチ化しやすい。Finances 取得バッチの直後に実行するフローにしやすい
3. **sales_lines 整形**: orders 取得バッチの直後に実行。既に lib 化されているので移設しやすい

### 段階移行しないと危ない箇所

1. **一気に全取得を外す**: バッチ基盤が未整備の状態で外すと、データ更新が止まる。まずは「取得だけバッチ化、アプリは従来どおりボタンも残す」など段階を踏む
2. **mart テーブルを一気に導入**: 既存 API を mart 前提に書き換えると、移行期間中に表示が壊れる。mart は「新規テーブル + 新 API」で並行し、徐々に切り替え

---

## D. 推奨再設計順序

### 短期（取得・整形の分離準備）

1. **取得処理の分離**
   - Orders / Finances / FBA の API 取得 + raw 保存をバッチ or worker へ移す
   - アプリの同期ボタンは「手動トリガー」として残すか、バッチキック用に簡素化
   - トリガー: cron（日次） or queue（手動キック）

2. **整形処理の分離**
   - fee_events 整形: 取得バッチ完了後に自動実行
   - sales_lines 整形: orders 取得バッチ完了後に自動実行
   - inventory_current: FBA 取得バッチ内で継続 or 独立バッチに

3. **検証処理の整理**
   - verify API を運用画面から非表示（開発者向けルートへ）
   - 診断系は npm script または管理画面専用に

### 中期（集計・表示の純化）

4. **集計処理の mart 化**
   - `amazon_sales_summary` 相当の mart テーブルを新規作成
   - 日次・月次・SKU別・ASIN別を事前集計して保存
   - 集計バッチ: sales_lines + fee_events 更新後に実行

5. **表示責務の純化**
   - アプリは mart / staging の GET のみに依存
   - 取得・整形・集計のボタンを削除し、「最終更新日時」「次回更新予定」等の表示に置き換え

---

## E. 推奨アーキテクチャ案

### raw レイヤー

| テーブル | 内容 |
|---------|------|
| amazon_orders_raw | 現行のまま |
| amazon_order_items_raw | 現行のまま |
| amazon_finance_raw | 現行のまま |
| amazon_fba_inventory_raw | 現行のまま |

**責務**: 外部 API のレスポンスをそのまま保存。取得バッチのみが書き込む。

### staging レイヤー

| テーブル | 内容 |
|---------|------|
| amazon_sales_lines | 現行のまま。1注文1商品行の整形済み売上 |
| amazon_fee_events | 現行のまま。手数料イベント整形済み |
| amazon_inventory_current | 現行のまま。SKU 単位最新在庫 |

**責務**: raw から整形した明細データ。整形バッチが書き込む。表示・集計の元データ。

### mart レイヤー（新規推奨）

| テーブル | 内容 |
|---------|------|
| amazon_sales_summary_daily | 日次集計（order_date, user_id, confirmed 別） |
| amazon_sales_summary_monthly | 月次集計 |
| amazon_sales_summary_by_sku | SKU 別集計 |
| amazon_sales_summary_by_asin | ASIN 別集計 |

**責務**: staging から集計したサマリ。集計バッチが書き込む。アプリの集計画面はここを読む。

### app レイヤー

- **読むだけ**: staging（明細表示）, mart（集計サマリ）
- **書かない**: 取得・整形・集計の書き込みは行わない
- **表示のみ**: 一覧、フィルタ、検索、サマリ表示、ダッシュボード

---

## 現行テーブルの仮分類（raw / staging / mart）

| テーブル | 分類 | 備考 |
|---------|------|------|
| amazon_orders_raw | raw | 変更なし |
| amazon_order_items_raw | raw | 変更なし |
| amazon_finance_raw | raw | 変更なし |
| amazon_fba_inventory_raw | raw | 変更なし |
| amazon_sales_lines | staging | 変更なし。mart の元データ |
| amazon_fee_events | staging | 変更なし。mart の元データ |
| amazon_inventory_current | staging | 変更なし |
| amazon_sales_summary_* | mart | **未実装。新規作成推奨** |

現状、mart テーブルは存在しない。集計は都度 `amazon_sales_lines` + `amazon_fee_events` を読み計算している。
