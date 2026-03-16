# Claude Code 用：このファイルの内容をコピーして貼り付けてください

---

```
【プロジェクトの場所（必ず最初にここに移動すること）】
d:\カーサープロジェクト\フリマアプリ　売上管理アプリ作成

作業開始時に以下を実行すること：
cd "d:\カーサープロジェクト\フリマアプリ　売上管理アプリ作成"

---

【実行コマンド（ユーザーがターミナルで実行する）】
以下のコマンドで Claude Code をオートモードで起動する。貼り付ける前にバックアップを取ってから実行すること。

cd "d:\カーサープロジェクト\フリマアプリ　売上管理アプリ作成"
git checkout -b backup-before-claude-$(Get-Date -Format 'yyyyMMdd-HHmm')
git add -A
git commit -m "Backup: Claude Code 作業前の保存" --allow-empty
git checkout main
claude --ide --permission-mode acceptEdits

※ 完全オート（シェルも承認不要）にする場合、最後の行を以下に置き換え：
claude --ide --permission-mode bypassPermissions --dangerously-skip-permissions

---

【安全に関する指示】
作業前に git でバックアップが取られていること、問題があれば復元できる環境であることを確認すること。破壊的な変更は避け、必ず復元可能な形で作業すること。

---

【プロジェクト概要】
Next.js のフリマ売上・在庫管理アプリ。Vercel デプロイ。Supabase（auth, products, sales, product_location_stock）。

---

【現状と課題】
Amazon SP-API で売上・在庫を同期しているが、次の問題がある：
1. 手数料・送料が 0 円のままの売上が残る（Finances API の breakdowns が取れていない、またはマッチングに失敗）
2. 販売履歴が重複している（同じ注文が複数レコードになっている。例：キャンディで販売1件なのにレコード4件）

---

【Amazon SP-API データ構造（参照ドキュメントの要約）】

使用中API：
- Finances API: listTransactions → 売上・手数料・送料（0.5 req/sec）
- FBA Inventory: getInventorySummaries → FBA在庫
- Listings: getListingsItem / searchListingsItems → FBM在庫（AMAZON_SELLER_ID 必須）

Finances API（listTransactions）の Transaction 構造：
- transactionType: 売上は "Shipment"
- postedDate, totalAmount, transactionId
- relatedIdentifiers: ORDER_ID, SHIPMENT_ID 等
- items[]: totalAmount, breakdowns, contexts(asin, sku, quantityShipped)
- breakdowns: breakdownType + breakdownAmount で手数料・送料。ネスト構造あり。
  - 手数料: Commission, ReferralFee, AmazonFees, FBA, VariableClosingFee, VAT 等
  - 送料: Shipping, Postage, PostageBilling, Delivery 等
- 制約: postedAfter/postedBefore 最大180日、直近48時間は含まれない場合あり、breakdowns が null の場合あり

---

【主要ファイル（パスは上記プロジェクトルートからの相対パス）】
- src/app/api/amazon-sync/route.ts … 売上同期（Finances）＋在庫同期（FBA/FBM）
- src/app/api/amazon-diagnostic/route.ts … 診断API
- src/app/api/resolve-duplicates/route.ts … 重複解消API
- src/components/amazon-sync-button.tsx … 同期・重複チェックUI
- src/lib/amazon-sp-api.ts … SP-API クライアント
- AMAZON_SP_API_DATA_REFERENCE.md … 詳細なAPI仕様（プロジェクト内にある）

---

【依頼内容】
以下のいずれか（または組み合わせ）で改善案を出し、実装すること：

1. 手数料・送料の取得を確実にする
   - Finances API の breakdowns パースを強化（breakdownType のバリエーション対応）
   - マッチングロジックの見直し
   - 必要なら Orders API や Reports API の併用を検討

2. 売上レコードの重複を根本的に防ぐ
   - 注文ID + 商品（ASIN/SKU）を一意キーとする設計
   - 既存の重複解消機能は維持しつつ、新規 INSERT 時の重複防止を強化

3. 在庫・注文データの取得フロー整理
   - Orders API の利用可否と、売上登録との連携を検討

---

【技術制約】
- Finances API: 0.5 req/sec、postedAfter/postedBefore は最大180日
- FBM 在庫取得には AMAZON_SELLER_ID（商取引アカウントID）が必要
- Supabase sales スキーマ: product_id, quantity, unit_price_yen, fee_yen, shipping_yen, ad_spend_yen, sold_at, amazon_order_id, platform='amazon'

---

【期待する成果】
- 手数料・送料が正しく反映される売上登録
- 重複のない販売履歴
- 変更内容の説明と、必要に応じて AMAZON_SP_API_DATA_REFERENCE.md の更新
- npm run build でビルドが通ることを確認すること
```

---

## 使い方

1. 上記の ``` で囲まれた部分全体をコピーする
2. Claude Code を起動する（上記の実行コマンドを使用）
3. コピーした内容を Claude Code に貼り付けて送信する
4. Claude Code はプロジェクトパスに移動してから作業を開始する
