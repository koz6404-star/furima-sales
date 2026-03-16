# Amazon SP-API 統合の再構築プロンプト

このドキュメントは Claude Code（または Cursor Agent）で**フルオート実行**させるためのプロンプトです。

---

## 実行コマンド（フルオート）

Cursor のチャットで以下をコピー＆ペーストして実行してください：

```
@codebase 以下を実行してください。

【タスク】Amazon SP-API で取得できる在庫・注文・取引データを整理し、反映されていない項目をすべて取得するよう統合を再構築する。

【前提】docs/AMAZON_API_DATA_REFERENCE.md を参照し、APIで取得可能な全項目を把握した上で実装する。

【手順】
1. docs/AMAZON_API_DATA_REFERENCE.md の内容に基づき、現行の amazon-sync と amazon-diagnostic の取得ロジックを分析
2. 取得されていない・反映されていない項目を特定
3. 在庫・注文・手数料・送料の各データ取得を強化・修正
4. ビルドが通ることを確認
5. 変更内容をコミット（コミットメッセージは適切に）

【制約】
- 既存のアーキテクチャ（Services → Repositories → DTO）を維持する
- 既存の IExportService、DynamicDataService 等は再利用する
- 破壊的変更を避け、段階的に修正する
```

---

## 補足：手動で段階実行する場合

上記を一度に実行せず、段階的に進める場合は以下を順番に依頼してください。

### ステップ1: データ仕様の確認
「docs/AMAZON_API_DATA_REFERENCE.md を読んで、Amazon SP-API で取得できる在庫・注文・取引の全項目を教えてください。」

### ステップ2: ギャップ分析
「現行の src/app/api/amazon-sync/route.ts と比較し、取得されていない項目をリストアップしてください。」

### ステップ3: 実装
「ギャップ分析の結果に基づき、未取得項目を取得するよう修正してください。」

### ステップ4: 検証
「npm run build でビルドが通るか確認してください。」

---

## 関連ファイル

- `docs/AMAZON_API_DATA_REFERENCE.md` … APIデータ仕様（本プロンプト実行前に作成推奨）
- `src/app/api/amazon-sync/route.ts` … メイン同期処理
- `src/app/api/amazon-diagnostic/route.ts` … 診断API
- `src/lib/amazon-sp-api.ts` … SP-API クライアント
