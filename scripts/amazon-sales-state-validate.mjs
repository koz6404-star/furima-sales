#!/usr/bin/env node
/**
 * 再 transform 後の検証スクリプト
 * sales_state 別件数、confirmed なのに sales_amount_yen is null の件数
 *
 * 実行: npm run amazon-sales-state-validate
 * 事前: .env.local に SUPABASE_DB_URL
 *
 * 使用法（state変更前後の差分）:
 *   1. 再 transform 前に実行し、出力を before.json に保存
 *   2. 再 transform 実行
 *   3. 再実行し、出力と before.json を比較
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import pg from 'pg';

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('SUPABASE_DB_URL を設定してください。');
  process.exit(1);
}

async function main() {
  const client = new pg.Client({ connectionString: dbUrl });
  try {
    await client.connect();

    const { rows } = await client.query(`
      SELECT sales_state, COUNT(*) as cnt,
             COUNT(sales_amount_yen) as with_amount,
             COUNT(*) FILTER (WHERE sales_amount_yen IS NULL) as null_amount
      FROM amazon_sales_lines
      GROUP BY sales_state
    `);

    const { rows: invalid } = await client.query(`
      SELECT COUNT(*) as cnt
      FROM amazon_sales_lines
      WHERE sales_state = 'confirmed' AND sales_amount_yen IS NULL
    `);

    const byState = {};
    for (const r of rows) {
      byState[r.sales_state] = {
        count: parseInt(r.cnt, 10),
        withAmount: parseInt(r.with_amount, 10),
        nullAmount: parseInt(r.null_amount, 10),
      };
    }

    const confirmedNullCount = parseInt(invalid[0]?.cnt ?? '0', 10);
    const summary = {
      byState,
      confirmed: byState.confirmed?.count ?? 0,
      pending_price: byState.pending_price?.count ?? 0,
      canceled: byState.canceled?.count ?? 0,
      other_excluded: byState.other_excluded?.count ?? 0,
      confirmedButNullAmount: confirmedNullCount,
      isValid: confirmedNullCount === 0,
      timestamp: new Date().toISOString(),
    };

    console.log('\n========== sales_state 検証結果 ==========\n');
    console.log(JSON.stringify(summary, null, 2));
    console.log('\n【件数サマリー】');
    console.log(`  confirmed:      ${summary.confirmed}件`);
    console.log(`  pending_price:  ${summary.pending_price}件（価格未確定）`);
    console.log(`  canceled:       ${summary.canceled}件（キャンセル）`);
    console.log(`  other_excluded:  ${summary.other_excluded}件（対象外）`);
    console.log(`\n  confirmed なのに sales_amount_yen is null: ${confirmedNullCount}件`);
    if (confirmedNullCount > 0) {
      console.log('  ※ 不正です。transform ロジックを確認してください。');
    } else {
      console.log('  ※ 検証OK');
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
