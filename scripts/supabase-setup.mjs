#!/usr/bin/env node
/**
 * Supabase 初期セットアップスクリプト
 * マイグレーションとシードを実行します。
 *
 * 使い方:
 * 1. Supabase Dashboard > Settings > Database で「Connection string」の URI をコピー
 * 2. [YOUR-PASSWORD] を実際のデータベースパスワードに置き換え
 * 3. 環境変数に設定して実行:
 *    set SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
 *    node scripts/supabase-setup.mjs
 *
 * または .env に SUPABASE_DB_URL を書いて実行
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error(`
[エラー] 環境変数 SUPABASE_DB_URL が設定されていません。

手順:
1. Supabase Dashboard (https://supabase.com/dashboard) を開く
2. 対象プロジェクトを選択
3. 左メニュー Settings → Database
4. "Connection string" の "URI" をコピー
5. [YOUR-PASSWORD] を実際のDBパスワードに置き換え
6. 以下を実行:

   PowerShell:
   $env:SUPABASE_DB_URL="postgresql://postgres.ewxzsftkxkqrvhjavrfd:あなたのパスワード@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"
   node scripts/supabase-setup.mjs

   ※ リージョン(ap-northeast-1等)はDashboardのURIを確認してください
`);
  process.exit(1);
}

async function runSql(client, sql, label) {
  // ALTER DATABASE は権限で失敗する場合があるのでスキップ
  const filtered = sql.replace(/ALTER DATABASE postgres SET[^;]+;/g, '-- SKIPPED');
  try {
    await client.query(filtered);
    console.log(`  OK: ${label}`);
  } catch (e) {
    if (e.message?.includes('already exists') || e.message?.includes('duplicate')) {
      console.log(`  [SKIP] 既存のオブジェクトがあります: ${label}`);
    } else {
      throw e;
    }
  }
}

async function main() {
  const client = new pg.Client({ connectionString: dbUrl });
  try {
    await client.connect();
    console.log('Supabase へ接続しました。');

    // 001
    console.log('\n[1/3] スキーマ適用中...');
    const schema = readFileSync(join(root, 'supabase/migrations/001_initial_schema.sql'), 'utf-8');
    await runSql(client, schema, '001_initial_schema');

    // 002 Storage
    console.log('\n[2/3] Storage バケット作成中...');
    try {
      const storage = readFileSync(join(root, 'supabase/migrations/002_storage.sql'), 'utf-8');
      await client.query(storage);
      console.log('  OK: 002_storage');
    } catch (e) {
      console.log('  [SKIP] Storage: ' + e.message);
    }

    // seed
    console.log('\n[3/3] シード投入中...');
    const seed = readFileSync(join(root, 'supabase/seed.sql'), 'utf-8');
    await runSql(client, seed, 'seed');

    console.log('\nセットアップ完了しました。');
    console.log('※ Authentication > Providers で Email を有効にしてください。');
  } catch (e) {
    console.error('エラー:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
