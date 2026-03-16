# Claude Code 用 プロンプト：Amazon SP-API 同期の再設計

以下のプロンプトを Claude Code（または同様のAIアシスタント）に貼り付けて、タスクを依頼してください。

---

## プロンプト本文（ここからコピー）

```
【安全に関する指示】
作業前に git でバックアップが取られていること、問題があれば復元できる環境であることを確認すること。破壊的な変更は避け、必ず復元可能な形で作業すること。

【プロジェクト】
Next.js のフリマ売上・在庫管理アプリ。Vercel デプロイ。Supabase（auth, products, sales, product_location_stock）。

【現状と課題】
Amazon SP-API で売上・在庫を同期しているが、次の問題がある：
1. 手数料・送料が 0 円のままの売上が残る（Finances API の breakdowns が取れていない、またはマッチングに失敗）
2. 販売履歴が重複している（同じ注文が複数レコードになっている。例：キャンディで販売1件なのにレコード4件）

【参照ドキュメント】
プロジェクト内に AMAZON_SP_API_DATA_REFERENCE.md がある。これを読んで、Amazon SP-API で取得できる在庫・注文・取引データの構造を把握すること。

【主要ファイル】
- src/app/api/amazon-sync/route.ts … 売上同期（Finances）＋在庫同期（FBA/FBM）
- src/app/api/amazon-diagnostic/route.ts … 診断API
- src/app/api/resolve-duplicates/route.ts … 重複解消API
- src/components/amazon-sync-button.tsx … 同期・重複チェックUI
- src/lib/amazon-sp-api.ts … SP-API クライアント

【依頼内容】
AMAZON_SP_API_DATA_REFERENCE.md を前提に、以下のいずれか（または組み合わせ）で改善案を出し、実装してほしい：

1. 手数料・送料の取得を確実にする
   - Finances API の breakdowns パースを強化（breakdownType のバリエーション対応）
   - マッチングロジックの見直し
   - 必要なら Orders API や Reports API の併用を検討

2. 売上レコードの重複を根本的に防ぐ
   - 注文ID + 商品（ASIN/SKU）を一意キーとする設計
   - 既存の重複解消機能は維持しつつ、新規 INSERT 時の重複防止を強化

3. 在庫・注文データの取得フロー整理
   - 現状：Finances（売上）、FBA Inventory、Listings（FBM在庫）
   - Orders API の利用可否と、売上登録との連携を検討

【技術制約】
- Finances API: 0.5 req/sec、postedAfter/postedBefore は最大180日
- FBM 在庫取得には AMAZON_SELLER_ID（商取引アカウントID）が必要
- Supabase の sales スキーマ: product_id, quantity, unit_price_yen, fee_yen, shipping_yen, ad_spend_yen, sold_at, amazon_order_id, platform='amazon'

【期待する成果】
- 手数料・送料が正しく反映される売上登録
- 重複のない販売履歴
- 変更内容の説明と、必要に応じて AMAZON_SP_API_DATA_REFERENCE.md の更新
```

---

## プロンプト本文（ここまで）

---

## オート実行コマンド（承認不要で作業させる）

Claude Code を**各作業の承認なし**で動かすには、`--permission-mode` を使います。

### 推奨：バックアップを取ってから実行

```powershell
# 1. プロジェクトフォルダへ移動
cd "d:\カーサープロジェクト\フリマアプリ　売上管理アプリ作成"

# 2. バックアップ用のブランチを作成（作業を復元できるように）
git checkout -b backup-before-claude-$(Get-Date -Format 'yyyyMMdd-HHmm')

# 3. 現在の状態をコミットして記録
git add -A
git commit -m "Backup: Claude Code 作業前の保存" --allow-empty

# 4. main に戻って作業開始
git checkout main

# 5. Claude Code をオートモードで起動（ファイル編集は自動承認、シェルコマンドも自動承認）
claude --ide --permission-mode acceptEdits
```

- **`acceptEdits`**: ファイル編集は自動承認。シェルコマンドは初回のみ確認あり。
- **完全オート**（編集・コマンドともに承認不要）にする場合:
  ```powershell
  claude --ide --permission-mode bypassPermissions --dangerously-skip-permissions
  ```
  ※ 信頼できる環境でのみ使用してください。

### 復元方法

問題があれば以下で戻せます：
```powershell
git checkout backup-before-claude-YYYYMMDD-HHMM
# または
git reset --hard HEAD~1
```

※ 上記のプロンプト本文には、すでに【安全に関する指示】を冒頭に含めています。復元可能であることを Claude Code に伝えるため、そのままコピーして使用してください。

---

## 補足

- 依頼前に `AMAZON_SP_API_DATA_REFERENCE.md` の内容を確認しておくことを推奨
- 実装時は `npm run build` でビルドが通ることを確認すること
- 既存の「手数料・送料を再取得」「重複チェック」「重複解消」ボタンは残す方針で検討
