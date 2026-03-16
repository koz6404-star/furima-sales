# Amazon 売上管理機能 現状固定化（Phase7 時点）

**※ Phase10 に更新済み。`AMAZON_売上管理_現状固定化_Phase10.md` を参照してください。**

作成日: 2025-03-14

---

## 1. Phase0〜Phase7 実装完了内容まとめ

| Phase | 内容 | 主な成果物 |
|-------|------|------------|
| **Phase 0** | 現状調査・リセット方針 | 既存 Finances 依存の課題整理。Orders API 新設計への移行方針 |
| **Phase 1** | 接続基盤 | SP-API クライアント、Orders API 呼び出し基盤 |
| **Phase 2** | Orders raw 取得 | `amazon_orders_raw`, `amazon_order_items_raw`。getOrders / getOrderItems で取得・保存 |
| **Phase 3** | 売上明細整形 | `amazon_sales_lines`。raw から 1 注文 1 商品行へ変換 |
| **Phase 4** | 売上一覧表示 | sales_state（confirmed / pending_price / canceled / other_excluded）導入。売上金額の NULL 許容 |
| **Phase 5** | FBA 在庫 raw | `amazon_fba_inventory_raw`。getInventorySummaries で SKU 単位保存 |
| **Phase 6** | inventory_current | `amazon_inventory_current`。raw → 整形。channel_type=FBA、total_available_qty=fulfillable_qty |
| **Phase 7** | 売上在庫結合 | 売上一覧に `current_available` を LEFT JOIN で付与。在庫列の表示ルール実装 |

---

## 2. 現在の DB テーブル一覧と役割（Amazon 関連）

| テーブル | 役割 | Phase |
|----------|------|-------|
| `amazon_orders_raw` | Orders API getOrders のレスポンスをそのまま保存 | 2 |
| `amazon_order_items_raw` | Orders API getOrderItems の商品行をそのまま保存 | 2 |
| `amazon_sales_lines` | 1 注文 1 商品行の整形済み売上明細。sales_state, fulfillment_type を含む | 3,4 |
| `amazon_fba_inventory_raw` | FBA Inventory getInventorySummaries の SKU 単位 raw。1SKU1 行の上書き型 | 5 |
| `amazon_inventory_current` | raw から整形した SKU 単位最新在庫。total_available_qty = fulfillable_qty | 6 |

---

## 3. API 一覧と役割（Amazon 関連）

| API | メソッド | 役割 |
|-----|----------|------|
| `/api/amazon-orders-sync` | POST | Orders API 同期（raw 取得 + transform） |
| `/api/amazon-orders-raw` | GET | 注文 raw 一覧 |
| `/api/amazon-sales-lines` | GET | 売上明細一覧（Phase7: current_available 付与） |
| `/api/amazon-sales-lines/summary` | GET | sales_state 別件数集計 |
| `/api/amazon-sales-lines-transform` | POST | raw → amazon_sales_lines 変換 |
| `/api/amazon-fba-inventory-sync` | POST | FBA 在庫同期（raw + current 整形） |
| `/api/amazon-fba-inventory-raw` | GET | FBA 在庫 raw 一覧 |
| `/api/amazon-inventory-current` | GET | 整形済み在庫一覧 |
| `/api/amazon-inventory-current-transform` | POST | raw → current 変換 |
| `/api/amazon-phase4-verify` | GET/POST | Phase4 検証（sales_state, transform 再実行） |
| `/api/amazon-phase5-verify` | GET | Phase5 検証（raw 取得確認） |
| `/api/amazon-phase6-verify` | GET/POST | Phase6 検証（重複・再transform 安定性） |
| `/api/amazon-phase6-sku-match` | GET | **SKU 結合率分析**（confirmed 売上 vs inventory_current） |
| `/api/amazon-connect-check` | GET | 接続確認 |
| `/api/reset-amazon-data` | POST | Amazon データリセット（要確認: 対象テーブル） |

---

## 4. 画面一覧と役割（Amazon 関連）

| パス | 役割 |
|------|------|
| `/amazon-sales` | 売上明細一覧。フィルタ（sales_state, 日付, SKU, FBA/FBM）。在庫列（Phase7 追加） |
| `/amazon-sales/verify` | Phase4 検証用ページ |
| `/amazon-fba-inventory` | FBA 在庫一覧。Raw / Current 切替。同期ボタン |
| `/amazon-fba-inventory/verify` | Phase5 検証用ページ |

---

## 5. 現在の既知の未検証事項

| 項目 | 内容 |
|------|------|
| **SKU 結合率** | **Phase7 時点では FBA 在庫 0 件のため、SKU 結合率は未検証**。売上一覧と inventory_current の結合ロジック（`amazon_sales_lines.sku` = `amazon_inventory_current.seller_sku`）は実データでの検証ができていない |
| raw 履歴保存 | `amazon_fba_inventory_raw` は 1SKU1 行の上書き型。スナップショット履歴は保持していない |
| Finances 連携 | 手数料（fee_amount_yen）は Phase4 時点で pending 固定。Finances API 連携は未実装 |
| FBM 在庫 | FBM 在庫の取得・表示は未実装 |

---

## 6. 実 FBA 在庫流入後に再確認すべき項目

| 項目 | 確認方法 |
|------|----------|
| **SKU 結合率** | `GET /api/amazon-phase6-sku-match` で joined / notJoined / ratePercent / mismatchSamples を確認 |
| 数値表示 | 売上一覧で在庫数が数値で表示されることを確認 |
| 0 在庫ハイライト | 在庫 0 の行が薄赤背景で表示されることを確認 |
| 結合失敗時の表示 | FBM 行・該当無し SKU で「取得なし」と表示されることを確認 |
| 再 transform の安定性 | POST /api/amazon-phase6-verify で 2 回 transform し、件数が安定することを確認 |

---

## 7. 今後の次フェーズ候補

| 候補 | 内容 |
|------|------|
| **Finances 連携** | 手数料・送料を Finances API から取得し fee_amount_yen を更新 |
| **売上集計** | confirmed のみの売上合計・日別集計 API |
| **raw 履歴保存** | amazon_fba_inventory_raw のスナップショット履歴テーブル追加（必要になった場合） |
| **FBM 在庫** | Listings API 等で FBM 在庫取得・表示 |
| **SKU 結合率の可視化** | 売上画面に結合率サマリーを表示する UI |

---

## 付録：Phase7 における在庫表示の重要な前提

- **FBA 在庫 0 件のため SKU 結合率は未検証**
- 売上一覧の在庫表示は、結合できない場合すべて **「取得なし」でフォールバック**する
- 実データ流入後は **`/api/amazon-phase6-sku-match`** で再検証すること
