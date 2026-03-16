# Amazon 再設計 データフロー

**作成日**: 2026年3月  
**目的**: 取得 → raw → 整形 → 集計 → 表示 の流れを整理し、再設計後の目標フローと比較する

---

## 現在のデータフロー

### 1. Orders（売上明細）

```
Amazon Orders API (getOrders / getOrderItems)
  ↓ [POST /api/amazon-orders-sync]（ボタン押下）
amazon_orders_raw
amazon_order_items_raw
  ↓ [POST /api/amazon-sales-lines-transform]（sync 内で transform:true または手動）
amazon_sales_lines
  ↓ [GET /api/amazon-sales-lines]（current_available 結合: amazon_inventory_current）
  ↓ [GET /api/amazon-sales-lines/summary]
  ↓ [GET /api/amazon-sales-summary]（fee_amount_aggregated: amazon_fee_events から集約）
/amazon-sales
```

**ポイント**:
- 取得と raw 保存は orders-sync で一括
- 整形は sync のオプションまたは別 API で実行
- 表示時は sales_lines + inventory_current + fee_events を都度読み結合・集計

---

### 2. Finances（手数料）

```
Amazon Finances API (listFinancialEvents)
  ↓ [POST /api/amazon-finance-sync]（ボタン押下）
amazon_finance_raw
  ↓ [POST /api/amazon-fee-events-transform]（ボタン押下）
amazon_fee_events
  ↓ [GET /api/amazon-fee-events]
  ↓ [GET /api/amazon-sales-lines]（fee_amount_aggregated 計算に利用）
  ↓ [GET /api/amazon-sales-summary]（集計に利用）
/amazon-finance
/amazon-sales
```

**ポイント**:
- 取得と整形が 2 段階（sync → transform）。ユーザーが両方実行する必要あり
- fee_events は sales_lines 表示・集計の両方で参照

---

### 3. FBA Inventory（在庫）

```
Amazon FBA Inventory API (getInventorySummaries)
  ↓ [POST /api/amazon-fba-inventory-sync]（ボタン押下）
amazon_fba_inventory_raw
  ↓ [sync 内で transform-inventory-current 実行]
amazon_inventory_current
  ↓ [GET /api/amazon-inventory-current]
  ↓ [GET /api/amazon-sales-lines]（current_available 結合に利用）
/amazon-fba-inventory
/amazon-sales
```

**ポイント**:
- 取得・raw 保存・整形が 1 回の sync で完結
- inventory_current は sales 画面の在庫列に利用

---

### 4. 集計（売上サマリ）

```
amazon_sales_lines（confirmed に絞り込み）
  +
amazon_fee_events（order_id 単位で集約 → fee_amount_aggregated）
  ↓ [GET /api/amazon-sales-summary]（都度計算）
  日次 / 月次 / SKU別 / ASIN別 集計
  ↓
/amazon-sales（集計サマリ表示）
```

**ポイント**:
- mart テーブルなし。都度 sales_lines + fee_events を読み集計
- データ量増加でレスポンス遅延の可能性

---

### 5. 検証（開発用）

```
amazon_*_raw / amazon_sales_lines / amazon_fee_events / amazon_inventory_current
  ↓ [GET /api/amazon-phase*-verify, amazon-*-diagnostic]
/amazon-sales/verify, /amazon-finance（検証リンク）, npm script
```

**ポイント**:
- 運用画面に検証リンクが混在
- Supabase 直接クエリの npm script あり（amazon-phase111213-verify）

---

## 再設計後に目指すデータフロー案

### 1. Orders

```
[アプリ外: バッチ / worker]
Amazon Orders API
  → amazon_orders_raw, amazon_order_items_raw
  → transform-sales-lines
  → amazon_sales_lines

[アプリ]
GET /api/amazon-sales-lines（staging を読むだけ）
GET /api/amazon-sales-summary（mart を読む。または staging からの軽量集計）
  → /amazon-sales
```

- 取得・raw 保存・整形はすべてアプリ外
- アプリは staging（sales_lines）を GET するのみ

---

### 2. Finances

```
[アプリ外]
Amazon Finances API
  → amazon_finance_raw
  → transform-fee-events
  → amazon_fee_events

[アプリ]
GET /api/amazon-fee-events
GET /api/amazon-sales-lines（fee は mart または staging に事前結合済み想定）
  → /amazon-finance, /amazon-sales
```

- 取得・整形はアプリ外
- アプリは staging（fee_events）を GET

---

### 3. FBA Inventory

```
[アプリ外]
Amazon FBA Inventory API
  → amazon_fba_inventory_raw
  → transform-inventory-current
  → amazon_inventory_current

[アプリ]
GET /api/amazon-inventory-current
GET /api/amazon-sales-lines（current_available は mart に事前結合 or staging の GET）
  → /amazon-fba-inventory, /amazon-sales
```

---

### 4. 集計（mart 化後）

```
[アプリ外]
amazon_sales_lines + amazon_fee_events
  → 集計バッチ
  → amazon_sales_summary_daily
  → amazon_sales_summary_monthly
  → amazon_sales_summary_by_sku
  → amazon_sales_summary_by_asin

[アプリ]
GET /api/amazon-sales-summary（mart テーブルを読むだけ）
  → /amazon-sales（サマリ表示）
```

- 都度計算を廃止し、mart を事前更新
- アプリは mart の GET のみ

---

### 5. 検証

```
[アプリ外 or 開発専用]
verify / diagnostic は CI、npm script、管理画面のみ
運用画面からは検証リンクを削除
```

---

## フロー比較サマリ

| 処理 | 現在 | 再設計後 |
|------|------|----------|
| Orders 取得 | アプリ内（ボタン） | アプリ外（バッチ） |
| Finances 取得 | アプリ内（ボタン） | アプリ外（バッチ） |
| FBA 取得 | アプリ内（ボタン） | アプリ外（バッチ） |
| raw 保存 | アプリ内 | アプリ外 |
| sales_lines 整形 | アプリ内 | アプリ外 |
| fee_events 整形 | アプリ内 | アプリ外 |
| inventory_current 整形 | アプリ内 | アプリ外 |
| 集計計算 | アプリ内（都度） | アプリ外（mart 事前集計） |
| 表示（一覧・サマリ） | アプリ内 | アプリ内（GET のみ） |
| 検証 | 運用画面に混在 | 開発専用に分離 |

---

## 移行時の接続点

- **raw → staging**: 整形バッチが raw を読んで staging に書く。取得バッチ完了後にキック
- **staging → mart**: 集計バッチが staging を読んで mart に書く。整形バッチ完了後にキック
- **app → staging / mart**: GET のみ。認証・フィルタ・ページネーションはアプリ側で実施
