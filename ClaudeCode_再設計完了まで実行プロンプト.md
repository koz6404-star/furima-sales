# Claude Code 実行用プロンプト（Amazon売上管理アプリ 再設計 完了まで）

以下を **Claude Code** にそのまま渡してください。  
このプロジェクトはすでに途中まで進んでいます。**最初から作り直さず、現状の正本ドキュメントを読み、続きから安全に進めてください。**

---

## Claude Code への指示

あなたはこのプロジェクトの実装担当です。  
目的は、**Amazon売上管理アプリの再設計を完了まで進めること**です。

ただし、勝手に全体を作り直したり、大規模破壊的変更をしてはいけません。  
**既存実装を尊重し、正本ドキュメントを起点に、段階的に安全に進めてください。**

---

## 最初に必ず読むファイル

まず以下を優先順で読んで、現状を把握してください。

### 正本
1. `docs/00_PROJECT_STATE.md`
2. `docs/01_CURRENT_TASK.md`
3. `docs/02_CHANGELOG.md`
4. `docs/03_ISSUES.md`

### 基準・実装概要
5. `docs/AMAZON_売上管理_現状固定化_Phase10.md`
6. `docs/Phase11_RefundEventList_実装概要.md`
7. `docs/Phase12_AdjustmentEventList_実装概要.md`
8. `docs/Phase13_売上集計API_実装概要.md`
9. `docs/Phase14_整合修正_実装概要.md`

### 再設計ドキュメント
10. `docs/Amazon再設計_現状棚卸しレポート.md`
11. `docs/Amazon再設計_分離候補一覧.md`
12. `docs/Amazon再設計_データフロー.md`
13. `docs/再設計Phase2_fee_events外部実行化.md`
14. `docs/再設計Phase3_sales_lines外部実行化.md`

---

## 現在の到達点（前提）

現状、以下までは完了済みとして扱ってください。

### 基盤実装
- Phase0〜14 完了
- Orders / Finances / FBA の raw取得
- sales_lines / fee_events / inventory_current の整形
- Refund / Adjustment / 売上集計 / 手数料符号整合 修正済み

### 再設計
- 再設計 Phase1 完了（現状棚卸し）
- 再設計 Phase2 完了（fee_events 外部実行化）
- 再設計 Phase3 完了（sales_lines 外部実行化）

### 現在の課題
- Orders / Finances / FBA の取得処理はまだアプリ内 API + ボタン押下に依存
- mart テーブル（`amazon_sales_summary_*`）は未実装
- 取得・整形・集計・表示の責務分離がまだ途中
- 運用画面に開発用導線が一部混在している

---

## このプロジェクトで守るルール

### 実装方針
- 画面から先に作らない
- raw保存 → 整形 → 集計 → 表示 の順で進める
- 売上と手数料は分ける
- 直接JOINで売上行を増やさない
- `order_id` 単位集約を維持する
- FBAとFBMは分ける
- 既存の Phase11〜14 の仕様を壊さない

### 再設計方針
- 取得・整形はアプリ外へ寄せる
- アプリは staging / mart を読む表示責務中心へ寄せる
- いきなり全部やらず、段階的に移行する
- 手動ボタンはすぐ消さず、バッチ化と並走しながら最後に削除する
- 既存画面を壊さない

### 運用ルール
- 新しい作業に入る前に `01_CURRENT_TASK.md` を更新
- 完了時は `02_CHANGELOG.md` を更新
- 未解決論点が出たら `03_ISSUES.md` に追記
- 大きな到達点が進んだら `00_PROJECT_STATE.md` を更新

---

## あなたにやってほしいこと

この先は、**再設計完了まで自走して進めてください。**  
ただし、毎回以下の順で進めてください。

### 手順
1. まず正本（00〜03）を確認
2. 現在タスクを定義または更新
3. そのタスクだけを安全に実装
4. 検証
5. docs 更新
6. 変更内容を簡潔に報告
7. 次タスクを `01_CURRENT_TASK.md` に反映

---

## 今後の優先順位

優先順位は以下です。

### 高
1. **Orders / Finances / FBA 取得処理のバッチ化**
2. **取得後に整形を自動実行する流れの整備**
3. **検証APIや開発導線を運用画面から分離**

### 中
4. **mart テーブル（`amazon_sales_summary_*`）導入**
5. **アプリを staging / mart の GET 専用に寄せる**
6. **同期・整形ボタンの段階的削除**

### 低 / 将来
7. 粗利対応
8. FBM 完全対応
9. DebtRecoveryEventList
10. raw履歴保存強化

---

## まず最初にやるべきこと

最初に、以下を実施してください。

1. `docs/01_CURRENT_TASK.md` を次タスクに差し替える
2. 次タスク候補を 2〜3 個出す
3. その中で **最も安全で効果が大きいもの** を1つ選ぶ
4. そのタスクを実装する

### 次タスク候補の判断基準
- 既存画面を壊しにくい
- 依存が明確
- 再設計を前に進める
- バッチ化 / 責務分離に直接効く

---

## 実装時の注意

- 推測で進めない。コードと docs を読んで判断する
- 不明なら docs に「不明」と明記する
- 勝手に大規模リネームしない
- 勝手にルーティングを壊さない
- 既存APIは必要なら「薄いラッパー」として残す
- script / service / lib に本体処理を寄せる
- 実装後は必ず実行方法を書く

---

## 出力ルール

各タスク完了後、必ず以下を出してください。

1. 実装概要
2. 変更ファイル一覧
3. 実行方法
4. 検証結果
5. docs 更新内容
6. 未解決事項
7. 次タスク案

また、以下の docs 更新を忘れないでください。

- `docs/01_CURRENT_TASK.md`
- `docs/02_CHANGELOG.md`
- 必要なら `docs/03_ISSUES.md`
- 必要なら `docs/00_PROJECT_STATE.md`

---

## 最終ゴール

最終的には以下を目指してください。

### アーキテクチャ
- raw
  - `amazon_orders_raw`
  - `amazon_order_items_raw`
  - `amazon_finance_raw`
  - `amazon_fba_inventory_raw`

- staging
  - `amazon_sales_lines`
  - `amazon_fee_events`
  - `amazon_inventory_current`

- mart
  - `amazon_sales_summary_daily`
  - `amazon_sales_summary_monthly`
  - `amazon_sales_summary_sku`
  - `amazon_sales_summary_asin`
  - 必要なら他

- app
  - `/amazon-sales`
  - `/amazon-finance`
  - `/amazon-fba-inventory`
  - 将来の横断表示画面

### 状態目標
- 取得はバッチまたは外部実行中心
- 整形は script / service で外部実行可能
- 集計は mart 事前計算または責務分離済み
- アプリは表示中心
- 運用画面に開発用導線が混ざらない

---

## 最後に
大事なのは、**今あるものを壊さずに、段階的に完成形へ寄せること**です。  
派手な全面改修ではなく、正本 docs を更新しながら、安全に一歩ずつ進めてください。
