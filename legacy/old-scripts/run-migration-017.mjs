#!/usr/bin/env node
/**
 * 017_amazon_support を単体実行
 * SUPABASE_DB_URL が必要です。
 * ロールバック: supabase/migrations/ROLLBACK_017.md 参照
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '017_amazon_support.sql'), 'utf8');

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('SUPABASE_DB_URL が未設定です。.env.local に設定するか、APPLY_MIGRATION_017.md の手順でSupabase SQL Editorから実行してください。');
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl });
try {
  await client.connect();
  await client.query(sql);
  console.log('017_amazon_support を適用しました。');
} catch (e) {
  console.error(e.message);
  process.exit(1);
} finally {
  await client.end();
}
