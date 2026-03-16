#!/usr/bin/env node
/**
 * 015_fix_delete_product_stock_restore を単体実行
 * SUPABASE_DB_URL が必要です。
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '015_fix_delete_product_stock_restore.sql'), 'utf8');

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('SUPABASE_DB_URL が未設定です。.env.local に設定してください。');
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl });
try {
  await client.connect();
  await client.query(sql);
  console.log('015_fix_delete_product_stock_restore を適用しました。');
} catch (e) {
  console.error(e.message);
  process.exit(1);
} finally {
  await client.end();
}
