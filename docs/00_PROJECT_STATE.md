# プロジェクト状態（正本）

**更新日**: 2026-03-16
**参照**: `01_CURRENT_TASK.md`（作業指示）, `02_CHANGELOG.md`（変更履歴）, `03_ISSUES.md`（未解決論点）

---

## 1. どこまで完了しているか

### Amazon 売上管理（FBA のみ完成。FBM は未着手）

| 区分 | 内容 | 到達点 |
|------|------|--------|
| **Phase 0〜10** | Orders / Finances / FBA の raw 取得と整形、売上一覧・手数料・在庫結合 | `AMAZON_売上管理_現状固定化_Phase10.md` 参照 |
| **Phase 11** | RefundEventList を fee_events に追加（負値保存） | 実装済み |
| **Phase 12** | AdjustmentEventList を fee_events に追加（PostageBilling* / PostageRefund*） | 実装済み |
| **Phase 13** | confirmed 売上集計 API（日次・月次・SKU別・ASIN別） | 実装済み |
| **Phase 14** | 手数料符号・sales_after_fee_yen の整合修正 | 実装済み |

### 再設計フェーズ（進行中）

| 区分 | 内容 | 到達点 |
|------|------|--------|
| **再設計 Phase1** | 取得・整形の分離のための現状棚卸し・設計 | 完了。`Amazon再設計_*` 3本作成済み |
| **再設計 Phase2** | fee_events 整形のアプリ外実行化 | 完了。`再設計Phase2_fee_events外部実行化.md` 参照 |
| **再設計 Phase3** | sales_lines 整形のアプリ外実行化 | 完了。`再設計Phase3_sales_lines外部実行化.md` 参照 |
| **再設計 Phase4** | Orders / Finances / FBA 取得のアプリ外実行化 | 完了。`再設計Phase4_取得外部実行化.md` 参照 |
| **再設計 Phase5** | 取得→整形の連鎖スクリプト（`amazon-full-sync`） | 完了。`再設計Phase5_連鎖スクリプト.md` 参照 |
| **再設計 Phase6** | 検証API・開発導線の運用画面からの分離 | 完了。verify リンク削除、タイトル整理済み |
| **再設計 Phase7** | mart テーブル導入（amazon_sales_summary_*） | 完了・検証済み |
| **再設計 Phase8** | Amazon UI の一時非表示（nav 削除・redirect） | 完了。新 UI 作成まで非表示 |

### フリマ側（基盤改善）

| 区分 | 内容 | 到達点 |
|------|------|--------|
| **ダッシュボード強化** | 経費合計カード・売れ筋ランキング TOP10 追加 | 完了（2026-03-16） |

---

## 2. 現在のアーキテクチャ（要約）

### Amazon
- **取得**: `npm run amazon-full-sync`（または個別 `amazon-*-raw-sync`）で SP-API → `amazon_*_raw`
- **整形**: raw → `amazon_sales_lines` / `amazon_fee_events` / `amazon_inventory_current`
- **集計**: mart テーブル（`amazon_sales_summary_daily/monthly/sku/asin`）を事前集計。API は mart 優先
- **表示**: Amazon UI は現在非表示。新 UI 作成待ち

### フリマ（メルカリ・ラクマ）
- **売上入力**: 手動入力（売却価格・プラットフォーム・送料）
- **商品管理**: CKB Excel 取り込み・CRUD・在庫場所管理（自宅/倉庫/FBA）
- **ダッシュボード**: 売上・経費・利益・利益率・プラットフォーム別・売れ筋ランキング TOP10

---

## 3. 次にやること（優先順）

1. **Phase14: FBM 在庫取得** — Listings API / inventory availability で FBM 在庫 current 化
2. **Phase15: FBM 売上結合** — Orders の FBA/FBM 区分整理・在庫減算
3. **Phase16: Amazon 取り込み完成整理** — FBA/FBM 両対応・実運用検証
4. **Amazon 商品への原価入力 UI** — SKU ごとに仕入れ原価を手動登録（SP-API に原価情報なし）
5. **Amazon 新 UI 作成** — Phase14〜16 完了後に mart 読み取り専用画面を作成

---

## 4. 主要ドキュメントの所在

| 用途 | ファイル |
|------|----------|
| 作業指示テンプレート | `01_CURRENT_TASK.md` |
| 変更履歴 | `02_CHANGELOG.md` |
| 未解決論点 | `03_ISSUES.md` |
| 現状固定化（Phase10） | `AMAZON_売上管理_現状固定化_Phase10.md` |
| 再設計棚卸し | `Amazon再設計_現状棚卸しレポート.md` |
| 再設計分離候補 | `Amazon再設計_分離候補一覧.md` |
| 再設計データフロー | `Amazon再設計_データフロー.md` |
| fee_events 外部実行 | `再設計Phase2_fee_events外部実行化.md` |
| sales_lines 外部実行 | `再設計Phase3_sales_lines外部実行化.md` |
| 取得外部実行化 | `再設計Phase4_取得外部実行化.md` |
| 使い方ガイド | `AMAZON_SALES_使い方ガイド.md` |

---

## 5. 運用ルール

- **正本運用**: 上記 00〜03 を起点に、作業指示・変更・論点を追跡する
- **docs 再編**: 既存資料の棚卸し・分類・アーカイブ方針は `docs再編案.md` を参照
- **更新タイミング**: Phase 完了・再設計フェーズ完了時に 00_PROJECT_STATE と 02_CHANGELOG を更新
