# 更新履歴

このファイルには、プロジェクト内で行った更新作業の内容を記録しています。

---

## 2025-03-08

### 画像最適化を無効化（Vercel 制限対策）

- **理由**: Vercel の Image Optimization（画像の最適化）が無料枠の 75% を使用。制限超過を防ぐため。
- **変更内容**:
  - `src/components/products-table-with-actions.tsx` … 商品一覧の画像に `unoptimized` を追加（2箇所）
  - `src/app/products/[id]/page.tsx` … 商品詳細ページの画像に `unoptimized` を追加（1箇所）
- **影響**: 画像は Vercel 経由での最適化・変換を行わず、Supabase の元画像をそのまま表示。表示見た目はほぼ変わらず、Vercel の変換回数カウントが発生しなくなる。

---
