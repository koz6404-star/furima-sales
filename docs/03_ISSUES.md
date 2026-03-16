# 未解決論点（正本）

**用途**: 今後の検討事項・技術的論点を整理。解決したら本ファイルから削除し、02_CHANGELOG に結果を追記。

---

## 再設計・責務分離

| 論点 | 優先度 | 状態 | 備考 |
|------|--------|------|------|
| sales_lines 整形のアプリ外実行化 | - | 完了 | Phase3 で実装済み |
| Orders / Finances / FBA 取得のアプリ外実行化 | - | 完了 | Phase4 で実装済み |
| 取得→整形の連鎖スクリプト | - | 完了 | Phase5 で `amazon-full-sync` 実装済み |
| mart テーブル（amazon_sales_summary_*）の導入 | - | 完了 | Phase7 で実装・検証済み。日次32日・月次4ヶ月・SKU/ASIN各7件 |
| 取得・整形の cron / queue 基盤 | 中 | 未着手 | 本実装は将来フェーズ。着手条件: バッチ基盤方針確定後 |

---

## Amazon FBM 対応（Phase14〜16）

| 論点 | 優先度 | 状態 | 備考 |
|------|--------|------|------|
| Phase14: FBM 在庫取得 | - | 完了 | 検証済み。SKU5件取得確認 |
| Phase15: FBM 売上結合 | - | 実装済み | 統合在庫 VIEW + SKU mart に fulfillment_type/在庫数付与。検証待ち |
| Phase16: Amazon 取り込み完成 | - | 実装済み | 新 UI 作成・nav 復活・ビルド確認済み。デプロイ検証待ち |
| Amazon 商品原価入力 UI | 高 | 未着手 | SP-API に原価なし。SKU ごとに手動入力できる画面が必要 |

## 将来拡張候補

| 論点 | 優先度 | 状態 | 備考 |
|------|--------|------|------|
| 粗利対応（Amazon） | 中 | 将来候補 | 原価入力 UI 完成後に実装可能 |
| raw 履歴保存 | 低 | 将来候補 | amazon_fba_inventory_raw は上書き型 |

---

## 運用・UI

| 論点 | 優先度 | 状態 | 備考 |
|------|--------|------|------|
| 検証 API の運用画面からの分離 | - | 完了 | Phase6 で `/amazon-sales` / `/amazon-finance` から verify リンクを削除済み |
| Amazon UI 非表示 | - | 完了 | Phase8 で非表示化 → Phase16 で `/amazon-dashboard` に置換 |
| 同期・整形ボタンの段階的削除 | 低 | 将来 | バッチ化後に「最終更新日時」表示へ移行 |
| Amazon 新 UI 作成 | - | 完了 | Phase16 で `/amazon-dashboard` 作成済み |
| amazon-full-sync 定期実行 | 中 | 未着手 | Vercel Cron Jobs または GitHub Actions。TODO #7 |
| Amazon＋フリマ合算表示 | 高 | 未着手 | 全チャネル合計の利益を一画面で。TODO #2 |

---

## 範囲外

| 論点 | 備考 |
|------|------|
| DebtRecoveryEventList | Phase13 時点で未採用。現フェーズでは対象外 |

---

## 参照

- 分離候補の詳細: `Amazon再設計_分離候補一覧.md`
- データフロー: `Amazon再設計_データフロー.md`
