# Amazon 売上管理機能 現状固定化（Phase10 時点）

作成日: 2025-03-14  
更新: Phase10 完了時

---

## 1. Phase0〜Phase10 実装完了内容まとめ

| Phase | 内容 | 主な成果物 |
|-------|------|------------|
| **Phase 0** | 現状調査・リセット方針 | 既存 Finances 依存の課題整理。Orders API 新設計への移行方針 |
| **Phase 1** | 接続基盤 | SP-API クライアント、Orders API 呼び出し基盤 |
| **Phase 2** | Orders raw 取得 | `amazon_orders_raw`, `amazon_order_items_raw` |
| **Phase 3** | 売上明細整形 | `amazon_sales_lines` |
| **Phase 4** | 売上一覧表示 | sales_state 導入。売上金額の NULL 許容 |
| **Phase 5** | FBA 在庫 raw | `amazon_fba_inventory_raw` |
| **Phase 6** | inventory_current | `amazon_inventory_current` |
| **Phase 7** | 売上在庫結合 | 売上一覧に `current_available` 付与 |
| **Phase 8** | Finances raw | `amazon_finance_raw`。listFinancialEvents で財務イベント保存 |
| **Phase 9** | fee_events 整形 | `amazon_fee_events`。ShipmentEvent / ServiceFeeEvent から手数料抽出 |
| **Phase 10** | 売上への手数料反映 | order_id 単位で fee 集約し、売上一覧に「手数料」列追加 |

---

## 2. 現在の DB テーブル一覧と役割（Amazon 関連）

| テーブル | 役割 | Phase |
|----------|------|-------|
| `amazon_orders_raw` | Orders API getOrders のレスポンスをそのまま保存 | 2 |
| `amazon_order_items_raw` | Orders API getOrderItems の商品行をそのまま保存 | 2 |
| `amazon_sales_lines` | 1 注文 1 商品行の整形済み売上明細。sales_state, fulfillment_type, fee_amount_yen を含む | 3,4 |
| `amazon_fba_inventory_raw` | FBA Inventory getInventorySummaries の SKU 単位 raw。1SKU1 行の上書き型 | 5 |
| `amazon_inventory_current` | raw から整形した SKU 単位最新在庫。total_available_qty = fulfillable_qty | 6 |
| `amazon_finance_raw` | Finances API listFinancialEvents の財務イベント raw。order_id, posted_date, transaction_type 等 | 8 |
| `amazon_fee_events` | raw から整形した手数料イベント。order_id, fee_type, fee_amount_yen | 9 |

---

## 3. API 一覧と役割（Amazon 関連）

| API | メソッド | 役割 |
|-----|----------|------|
| `/api/amazon-orders-sync` | POST | Orders API 同期（raw 取得 + transform） |
| `/api/amazon-orders-raw` | GET | 注文 raw 一覧 |
| `/api/amazon-sales-lines` | GET | 売上明細一覧（current_available, fee_amount_aggregated 付与） |
| `/api/amazon-sales-lines/summary` | GET | sales_state 別件数集計 |
| `/api/amazon-sales-lines-transform` | POST | raw → amazon_sales_lines 変換 |
| `/api/amazon-fba-inventory-sync` | POST | FBA 在庫同期（raw + current 整形） |
| `/api/amazon-fba-inventory-raw` | GET | FBA 在庫 raw 一覧 |
| `/api/amazon-inventory-current` | GET | 整形済み在庫一覧 |
| `/api/amazon-inventory-current-transform` | POST | raw → current 変換 |
| `/api/amazon-finance-sync` | POST | Finances API 同期（raw 保存） |
| `/api/amazon-finance-raw` | GET | Finances raw 一覧 |
| `/api/amazon-finance-diagnostic` | GET | Finances API 診断（レスポンス構造確認） |
| `/api/amazon-fee-events` | GET | fee_events 一覧 |
| `/api/amazon-fee-events-transform` | POST | raw → fee_events 変換 |
| `/api/amazon-phase4-verify` | GET/POST | Phase4 検証 |
| `/api/amazon-phase5-verify` | GET | Phase5 検証 |
| `/api/amazon-phase6-verify` | GET/POST | Phase6 検証 |
| `/api/amazon-phase6-sku-match` | GET | SKU 結合率分析 |
| `/api/amazon-phase8-verify` | GET/POST | Phase8 検証 |
| `/api/amazon-phase8-analyze` | GET | Phase8 Finances raw 分析 |
| `/api/amazon-phase9-verify` | GET/POST | Phase9 検証 |
| `/api/amazon-connect-check` | GET | 接続確認 |
| `/api/reset-amazon-data` | POST | Amazon データリセット |

---

## 4. 画面一覧と役割（Amazon 関連）

| パス | 役割 |
|------|------|
| `/amazon-sales` | 売上明細一覧。フィルタ（sales_state, 日付, SKU, FBA/FBM）。在庫列・手数料列 |
| `/amazon-sales/verify` | Phase4 検証用ページ |
| `/amazon-fba-inventory` | FBA 在庫一覧。Raw / Current 切替。同期ボタン |
| `/amazon-fba-inventory/verify` | Phase5 検証用ページ |
| `/amazon-finance` | Finances raw / fee_events 一覧。同期・整形ボタン |

---

## 5. 売上一覧に現在表示される列

| 列 | 内容 | Phase |
|----|------|-------|
| 注文日 | order_date | 3 |
| 注文ID | order_id | 3 |
| 状態 | sales_state（全件表示時のみ） | 4 |
| SKU | sku | 3 |
| 商品名 | product_name | 3 |
| FBA/FBM | fulfillment_type | 3 |
| 数量 | quantity | 3 |
| 売上金額 | sales_amount_yen | 3,4 |
| 在庫 | current_available（FBA 在庫。結合失敗時「取得なし」） | 7 |
| 手数料 | fee_amount_aggregated（order_id 単位集約。未取得時「未取得」） | 10 |
| 手数料状態 | fee_status（未取得/取得済/不明） | 3 |

---

## 6. 手数料の現在の対象範囲

| transaction_type | 対象 | 備考 |
|------------------|------|------|
| **ShipmentEventList** | ◎ 採用 | OrderFeeList, ShipmentFeeList, ShipmentItemList[].ItemFeeList |
| **ServiceFeeEventList** | ◎ 採用 | FeeList |

---

## 7. まだ未対応のもの

| 項目 | 内容 |
|------|------|
| **RefundEventList** | 返金時の手数料調整。Phase10 では未採用 |
| **AdjustmentEventList** | 調整イベント。Phase10 では未採用 |
| **DebtRecoveryEventList** | 債権回収イベント。Phase10 では未採用 |
| **FBA 実在庫での SKU 結合本検証** | Phase7 時点で FBA 在庫 0 件のため未検証。実データ流入後に `/api/amazon-phase6-sku-match` で再検証が必要 |
| **raw 履歴保存** | amazon_fba_inventory_raw は 1SKU1 行の上書き型。スナップショット履歴は未保持 |
| **FBM 在庫** | FBM 在庫の取得・表示は未実装 |

---

## 8. 次フェーズ候補の優先順位

| 優先度 | 候補 | 内容 |
|--------|------|------|
| **1** | RefundEventList の fee_events 追加 | 返金時の手数料調整を反映。fee_amount_yen が負で相殺 |
| **2** | FBA 実在庫での SKU 結合本検証 | データ流入後に結合率・表示確認 |
| **3** | 売上集計 API | confirmed のみの売上合計・日別集計 |
| **4** | AdjustmentEventList / DebtRecoveryEventList | 必要に応じて fee_events に追加 |
| **5** | raw 履歴保存 | スナップショット履歴テーブル（必要時） |
| **6** | FBM 在庫 | Listings API 等で FBM 在庫取得 |
| **7** | SKU 結合率の可視化 | 売上画面に結合率サマリー表示 |

---

## 付録：重要な前提

- **FBA 在庫 0 件のため SKU 結合率は未検証**。在庫列は結合できない場合「取得なし」でフォールバック
- **手数料**は ShipmentEventList / ServiceFeeEventList のみ。Refund 未反映
- 実データ流入後は `/api/amazon-phase6-sku-match` で SKU 結合率を再検証すること
