# docs 再編案

**作成日**: 2026年3月  
**目的**: 正本運用のための docs 棚卸し・分類・アーカイブ方針

---

## 1. 既存 Markdown 一覧と分類

### 分類凡例
- **phase**: Phase 実装の完了報告・実装概要
- **reports**: 検証レポート・調査レポート・確認レポート
- **design**: 設計・方針・再設計
- **references**: API 仕様・データ仕様・技術リファレンス
- **guides**: 使い方・セットアップ・手順
- **other**: その他

### 判定凡例（重複・古い・現行）
- **重複**: 他ファイルと内容が重なる
- **古いが参考価値あり**: 過去時点のスナップショット。背景理解に有用
- **現行参照中**: 今の作業で参照すべき

---

### 一覧表

| ファイル | 分類 | 重複 | 古いが参考 | 現行参照 | 備考 |
|----------|------|------|-------------|----------|------|
| Amazon再設計_現状棚卸しレポート.md | design | - | - | ◎ | 再設計の基盤資料 |
| Amazon再設計_分離候補一覧.md | design | - | - | ◎ | 分離方針 |
| Amazon再設計_データフロー.md | design | - | - | ◎ | フロー図 |
| 再設計Phase2_fee_events外部実行化.md | design | - | - | ◎ | Phase2 実行ガイド |
| AMAZON_売上管理_現状固定化_Phase10.md | phase | - | - | ◎ | Phase0〜10 の正本 |
| AMAZON_売上管理_現状固定化_Phase7.md | phase | ○ | ○ | - | Phase10 で置換済み |
| Phase4_集計単位の説明.md | phase | - | ○ | ○ | sales_state 集計の補足 |
| Phase4_最終確認レポート.md | reports | - | ○ | △ | Phase4 検証手順 |
| Phase5_完了確認レポート.md | reports | - | ○ | △ | Phase5 検証 |
| Phase5_FBA在庫raw_実装概要.md | phase | - | ○ | ○ | Phase5 実装詳細 |
| Phase6_完了確認レポート.md | reports | - | ○ | △ | Phase6 検証 |
| Phase6_次フェーズ前確認レポート.md | reports | - | ○ | △ | Phase6 次フェーズ前 |
| Phase6_inventory_current_実装概要.md | phase | - | ○ | ○ | Phase6 実装詳細 |
| Phase7_売上在庫結合_実装概要.md | phase | - | ○ | ○ | Phase7 実装詳細 |
| Phase8_次フェーズ前確認レポート.md | reports | - | ○ | △ | Phase8 前確認 |
| Phase8_Finances_raw_実装概要.md | phase | - | ○ | ○ | Phase8 実装詳細 |
| Phase9_fee_events_実装概要.md | phase | - | ○ | ○ | Phase9 実装詳細 |
| Phase10_売上への手数料反映_実装概要.md | phase | - | ○ | ○ | Phase10 実装詳細 |
| Phase11_RefundEventList_実装概要.md | phase | - | ○ | ○ | Phase11 実装詳細 |
| Phase12_AdjustmentEventList_実装概要.md | phase | - | ○ | ○ | Phase12 実装詳細 |
| Phase13_売上集計API_実装概要.md | phase | - | ○ | ◎ | Phase13 集計仕様 |
| Phase14_整合修正_実装概要.md | phase | - | ○ | ○ | Phase14 実装詳細 |
| Phase11-12-13_検証レポート.md | reports | - | ○ | ○ | 統合検証レポート |
| AMAZON_PHASE0_REPORT.md | phase | - | ○ | ○ | Phase0 現状調査 |
| AMAZON_PHASE1_COMPLETE.md | phase | - | ○ | △ | Phase1 完了報告 |
| AMAZON_PHASE2_COMPLETE.md | phase | - | ○ | △ | Phase2 完了報告 |
| AMAZON_PHASE3_COMPLETE.md | phase | - | ○ | △ | Phase3 完了報告 |
| AMAZON_PHASE4_COMPLETE.md | phase | - | ○ | △ | Phase4 完了報告 |
| sales_state_設計.md | design | - | ○ | ○ | sales_state 仕様 |
| sales_amount_zero_調査レポート.md | reports | - | ○ | △ | Phase4 関連調査 |
| AMAZON_SALES_使い方ガイド.md | guides | - | - | ◎ | 初心者向け手順 |
| Amazon_クライアントIDとシークレットの取得手順.md | guides | - | - | ○ | 設定手順 |
| SUPABASE_MIGRATE_SETUP.md | guides | - | - | ○ | マイグレーション接続 |
| AMAZON_API_DATA_REFERENCE.md | references | - | ○ | △ | 古い API 仕様（listTransactions 等） |
| AMAZON_API_REBUILD_PROMPT.md | other | - | ○ | △ | 再構築用プロンプト。旧方針 |
| AMAZON_SYSTEM_OVERVIEW.md | references | - | ○ | △ | 旧 Finances 中心の概要 |
| 00_PROJECT_STATE.md | 管理 | - | - | ◎ | **正本** |
| 01_CURRENT_TASK.md | 管理 | - | - | ◎ | **正本** |
| 02_CHANGELOG.md | 管理 | - | - | ◎ | **正本** |
| 03_ISSUES.md | 管理 | - | - | ◎ | **正本** |

---

## 2. プロジェクトルートの関連ドキュメント

| ファイル | 分類 | 備考 |
|----------|------|------|
| AMAZON_SP_API_DATA_REFERENCE.md | references | SP-API 取得可能データ一覧。再設計・実装の参照に有用 |

※ docs に移動するか、現状のまま docs から参照するかは要検討。

---

## 3. アーカイブ再配置案

### 方針
- **既存資料は削除しない**
- 役割別に `docs/archive/` 配下へ整理
- 正本（00〜03）と現行参照の重要ドキュメントは `docs/` 直下に維持

### 提案ディレクトリ構成

```
docs/
├── 00_PROJECT_STATE.md      # 正本
├── 01_CURRENT_TASK.md       # 正本
├── 02_CHANGELOG.md          # 正本
├── 03_ISSUES.md             # 正本
├── docs再編案.md            # 本ファイル
├── AMAZON_SALES_使い方ガイド.md
├── Amazon_クライアントIDとシークレットの取得手順.md
├── SUPABASE_MIGRATE_SETUP.md
├── Amazon再設計_現状棚卸しレポート.md
├── Amazon再設計_分離候補一覧.md
├── Amazon再設計_データフロー.md
├── 再設計Phase2_fee_events外部実行化.md
├── AMAZON_売上管理_現状固定化_Phase10.md
├── sales_state_設計.md
├── Phase4_集計単位の説明.md
├── Phase13_売上集計API_実装概要.md
│
└── archive/
    ├── phase/               # Phase 実装・完了報告
    │   ├── Phase5_FBA在庫raw_実装概要.md
    │   ├── Phase6_inventory_current_実装概要.md
    │   ├── Phase7_売上在庫結合_実装概要.md
    │   ├── Phase8_Finances_raw_実装概要.md
    │   ├── Phase9_fee_events_実装概要.md
    │   ├── Phase10_売上への手数料反映_実装概要.md
    │   ├── Phase11_RefundEventList_実装概要.md
    │   ├── Phase12_AdjustmentEventList_実装概要.md
    │   ├── Phase14_整合修正_実装概要.md
    │   ├── AMAZON_PHASE0_REPORT.md
    │   ├── AMAZON_PHASE1_COMPLETE.md
    │   ├── AMAZON_PHASE2_COMPLETE.md
    │   ├── AMAZON_PHASE3_COMPLETE.md
    │   └── AMAZON_PHASE4_COMPLETE.md
    │
    ├── reports/              # 検証・調査・確認レポート
    │   ├── Phase4_最終確認レポート.md
    │   ├── Phase5_完了確認レポート.md
    │   ├── Phase6_完了確認レポート.md
    │   ├── Phase6_次フェーズ前確認レポート.md
    │   ├── Phase8_次フェーズ前確認レポート.md
    │   ├── Phase11-12-13_検証レポート.md
    │   └── sales_amount_zero_調査レポート.md
    │
    ├── references/           # 旧仕様・旧リファレンス
    │   ├── AMAZON_API_DATA_REFERENCE.md
    │   ├── AMAZON_API_REBUILD_PROMPT.md
    │   └── AMAZON_SYSTEM_OVERVIEW.md
    │
    └── obsolete/             # 置換済み・重複
        └── AMAZON_売上管理_現状固定化_Phase7.md
```

---

## 4. 移動対象一覧（アーカイブ候補）

**注意**: 以下は「移動を提案する」一覧。**即座に移動は行わない**。方針承認後に実施。

| 現パス | 移動先 |
|--------|--------|
| AMAZON_売上管理_現状固定化_Phase7.md | archive/obsolete/ |
| Phase4_最終確認レポート.md | archive/reports/ |
| Phase5_完了確認レポート.md | archive/reports/ |
| Phase5_FBA在庫raw_実装概要.md | archive/phase/ |
| Phase6_完了確認レポート.md | archive/reports/ |
| Phase6_次フェーズ前確認レポート.md | archive/reports/ |
| Phase6_inventory_current_実装概要.md | archive/phase/ |
| Phase7_売上在庫結合_実装概要.md | archive/phase/ |
| Phase8_次フェーズ前確認レポート.md | archive/reports/ |
| Phase8_Finances_raw_実装概要.md | archive/phase/ |
| Phase9_fee_events_実装概要.md | archive/phase/ |
| Phase10_売上への手数料反映_実装概要.md | archive/phase/ |
| Phase11_RefundEventList_実装概要.md | archive/phase/ |
| Phase12_AdjustmentEventList_実装概要.md | archive/phase/ |
| Phase14_整合修正_実装概要.md | archive/phase/ |
| Phase11-12-13_検証レポート.md | archive/reports/ |
| AMAZON_PHASE0_REPORT.md | archive/phase/ |
| AMAZON_PHASE1_COMPLETE.md | archive/phase/ |
| AMAZON_PHASE2_COMPLETE.md | archive/phase/ |
| AMAZON_PHASE3_COMPLETE.md | archive/phase/ |
| AMAZON_PHASE4_COMPLETE.md | archive/phase/ |
| sales_amount_zero_調査レポート.md | archive/reports/ |
| AMAZON_API_DATA_REFERENCE.md | archive/references/ |
| AMAZON_API_REBUILD_PROMPT.md | archive/references/ |
| AMAZON_SYSTEM_OVERVIEW.md | archive/references/ |

---

## 5. docs 直下に残すもの（現行参照用）

| ファイル | 理由 |
|----------|------|
| 00_PROJECT_STATE.md | 正本。プロジェクト状態の入口 |
| 01_CURRENT_TASK.md | 正本。作業指示テンプレート |
| 02_CHANGELOG.md | 正本。変更履歴 |
| 03_ISSUES.md | 正本。未解決論点 |
| docs再編案.md | 再編方針・棚卸し一覧 |
| AMAZON_SALES_使い方ガイド.md | 運用で頻繁に参照 |
| Amazon_クライアントIDとシークレットの取得手順.md | 設定時に参照 |
| SUPABASE_MIGRATE_SETUP.md | マイグレーション時に参照 |
| Amazon再設計_*.md（3本） | 再設計の基盤資料 |
| 再設計Phase2_fee_events外部実行化.md | fee_events 実行ガイド |
| AMAZON_売上管理_現状固定化_Phase10.md | Phase0〜10 の統合サマリ |
| sales_state_設計.md | sales_state 仕様 |
| Phase4_集計単位の説明.md | 集計単位の補足 |
| Phase13_売上集計API_実装概要.md | 集計 API の現行仕様 |

---

## 6. 今後の運用ルール

### 6.1 正本運用
1. **00_PROJECT_STATE.md**: 「今どこまで終わっていて、次に何をやるか」を常に最新に保つ
2. **01_CURRENT_TASK.md**: 新規作業の指示はこのテンプレートをベースにする
3. **02_CHANGELOG.md**: Phase 完了・再設計フェーズ完了・重要リリース時に追記
4. **03_ISSUES.md**: 未解決の論点を集約。解決したら削除し、02_CHANGELOG に結果を記録

### 6.2 新規ドキュメント作成
- Phase 実装概要: `PhaseXX_〇〇_実装概要.md`。完了後は archive/phase へ移動候補
- 検証レポート: `PhaseXX_検証レポート.md`。完了後は archive/reports へ移動候補
- 設計・再設計: 現行参照するものは docs 直下。過去分は archive/ へ

### 6.3 アーカイブ移動のタイミング
- 再編方針の承認後、一括移動を実施
- 移動後は 00_PROJECT_STATE の「主要ドキュメントの所在」に archive パスを追記

### 6.4 削除禁止
- 既存 Markdown の中身は削除しない
- 重複・古いものでも、参照用に archive で保持
