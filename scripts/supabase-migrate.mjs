#!/usr/bin/env node
/**
 * Supabase マイグレーション自動実行スクリプト
 * supabase/migrations/ 内の全マイグレーションファイルを未適用分のみ順次実行します。
 *
 * 使い方:
 *   方法1: SUPABASE_DB_URL を .env.local に設定
 *   方法2: SUPABASE_DB_PASSWORD を設定 + supabase link 済み
 *     → pooler-url から正しいホストを自動取得して接続
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const migrationsDir = join(root, 'supabase/migrations');
const poolerUrlPath = join(root, 'supabase/.temp/pooler-url');

function getDbUrl() {
  let dbUrl = process.env.SUPABASE_DB_URL;
  if (dbUrl) return dbUrl;

  // SUPABASE_DB_PASSWORD + pooler-url から自動構築（supabase link 済みの場合）
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (password && existsSync(poolerUrlPath)) {
    const poolerTemplate = readFileSync(poolerUrlPath, 'utf-8').trim();
    // postgresql://postgres.PROJECT_REF@host:port/postgres → postgres.REF:PASSWORD@host
    const withPassword = poolerTemplate.replace(
      /(postgres\.[^:]+)@/,
      (_, user) => `${user}:${encodeURIComponent(password)}@`
    );
    if (withPassword !== poolerTemplate) {
      return withPassword;
    }
  }

  return null;
}

const dbUrl = getDbUrl();
if (!dbUrl) {
  console.error(`
[エラー] 接続情報が設定されていません。

以下のいずれかを設定してください。

■ 方法1: SUPABASE_DB_URL（推奨）
  .env.local に Connect モーダルでコピーした完全な URI を設定
  ※ホスト名はプロジェクトごとに異なります（aws-1-ap-southeast-1 等）。
   ダッシュボードの表示をそのままコピーし、[YOUR-PASSWORD] を置き換えてください。

■ 方法2: SUPABASE_DB_PASSWORD + supabase link
  .env.local に SUPABASE_DB_PASSWORD=あなたのDBパスワード を設定し、
  プロジェクトルートで「npx supabase link」を実行してください。
  接続先は supabase/.temp/pooler-url から自動取得します。
`);
  process.exit(1);
}

async function runSql(client, sql, label) {
  const filtered = sql.replace(/ALTER DATABASE postgres SET[^;]+;/g, '-- SKIPPED');
  try {
    await client.query(filtered);
  } catch (e) {
    if (
      e.message?.includes('already exists') ||
      e.message?.includes('duplicate') ||
      e.message?.includes('does not exist')
    ) {
      console.log(`  [SKIP] ${label}: ${e.message.split('\n')[0]}`);
    } else {
      throw e;
    }
  }
}

async function main() {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('適用するマイグレーションがありません。');
    return;
  }

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    console.log('Supabase へ接続しました。\n');

    // 適用履歴テーブル作成
    await client.query(`
      CREATE TABLE IF NOT EXISTS applied_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const { rows: applied } = await client.query(
      'SELECT filename FROM applied_migrations'
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    let runCount = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  [済] ${file}`);
        continue;
      }

      console.log(`  実行中: ${file}`);
      const sql = readFileSync(join(migrationsDir, file), 'utf-8');
      await runSql(client, sql, file);

      await client.query(
        'INSERT INTO applied_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
        [file]
      );
      appliedSet.add(file);
      runCount++;
    }

    if (runCount === 0) {
      console.log('\nすべてのマイグレーションは既に適用済みです。');
    } else {
      console.log(`\n${runCount} 件のマイグレーションを適用しました。`);
    }
  } catch (e) {
    console.error('エラー:', e.message);
    if (e.message?.includes('Tenant or user not found')) {
      console.error(`
[接続エラー対策]
このエラーは接続文字列の形式が誤っている場合に発生します。

1. ユーザー名は「postgres.プロジェクトID」形式であること
   例: postgres.ewxzsftkxkqrvhjavrfd （postgres のみは不可）

2. ホスト名はプロジェクトのリージョンに依存します
   ダッシュボードの Connect モーダルで「Session pooler」を選択し、
   表示された URI をそのままコピーしてください。
   例: aws-1-ap-southeast-1.pooler.supabase.com（リージョンにより異なる）

3. パスワードに特殊文字を含む場合は URL エンコードが必要な場合があります
   設定を忘れた場合は Settings > Database でリセットしてください。

代替手段: Supabase ダッシュボード > SQL Editor で SQL を直接実行
  scripts/run-migration-020-manual.md を参照
`);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
