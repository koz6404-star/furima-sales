#!/usr/bin/env node
/**
 * Supabase の Site URL を API で自動設定
 *
 * 事前準備:
 * 1. https://supabase.com/dashboard/account/tokens で「Generate new token」をクリック
 * 2. トークンを作成し、.env.local に SUPABASE_ACCESS_TOKEN=xxx を追加
 * 3. APP_URL に Vercel のアプリURLを設定（例: https://furima-sales-xxx.vercel.app）
 *
 * 実行: node scripts/set-supabase-auth-url.mjs
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const PROJECT_REF = 'ewxzsftkxkqrvhjavrfd';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const appUrl = process.env.APP_URL || process.argv[2];

if (!token) {
  console.error(`
[エラー] SUPABASE_ACCESS_TOKEN が設定されていません。

手順:
1. https://supabase.com/dashboard/account/tokens を開く
2. 「Generate new token」でトークンを作成
3. .env.local に以下を追加:
   SUPABASE_ACCESS_TOKEN=あなたのトークン
`);
  process.exit(1);
}

if (!appUrl) {
  console.error(`
[エラー] APP_URL が設定されていません。

.env.local に追加するか、引数で指定してください:
   APP_URL=https://furima-sales-xxx.vercel.app
   または
   node scripts/set-supabase-auth-url.mjs https://furima-sales-xxx.vercel.app
`);
  process.exit(1);
}

const url = appUrl.replace(/\/$/, '');
const siteUrl = url;

async function main() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ site_url: siteUrl }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('API エラー:', res.status, err);
    process.exit(1);
  }

  console.log('設定完了: Site URL =', siteUrl);
  console.log('Redirect URLs は Supabase ダッシュボードで手動追加してください:');
  console.log('  ', siteUrl + '/**');
  console.log('  ', siteUrl + '/auth/callback');
}

main();
