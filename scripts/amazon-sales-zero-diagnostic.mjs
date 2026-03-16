#!/usr/bin/env node
/**
 * sales_amount_yen = 0 の診断
 * raw データを直接確認し、原因を分類する
 *
 * 実行: node scripts/amazon-sales-zero-diagnostic.mjs
 * 事前: .env.local に SUPABASE_DB_URL を設定
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

    const { rows: zeroRows } = await client.query(`
      SELECT order_id, order_item_id, order_date, sku, product_name, quantity,
             fulfillment_type, sales_amount_yen, user_id
      FROM amazon_sales_lines
      WHERE sales_amount_yen = 0
      ORDER BY order_date DESC
    `);

    if (zeroRows.length === 0) {
      console.log('sales_amount_yen = 0 のレコードはありません。');
      return;
    }

    const orderIds = [...new Set(zeroRows.map((r) => r.order_id))];
    const sourceKeys = zeroRows.map((r) => `${r.order_id}|${r.order_item_id}`);

    const { rows: orders } = await client.query(
      `SELECT user_id, source_key, payload_json FROM amazon_orders_raw
       WHERE user_id IN (SELECT DISTINCT user_id FROM amazon_sales_lines WHERE sales_amount_yen = 0)
         AND source_key = ANY($1)`,
      [orderIds]
    );
    const { rows: items } = await client.query(
      `SELECT user_id, source_key, payload_json FROM amazon_order_items_raw
       WHERE user_id IN (SELECT DISTINCT user_id FROM amazon_sales_lines WHERE sales_amount_yen = 0)
         AND source_key = ANY($1)`,
      [sourceKeys]
    );

    const orderMap = new Map(orders.map((o) => [`${o.user_id}|${o.source_key}`, o.payload_json]));
    const itemMap = new Map(items.map((i) => [`${i.user_id}|${i.source_key}`, i.payload_json])); // source_key = orderId|orderItemId

    const details = [];
    for (const row of zeroRows) {
      const orderKey = `${row.user_id}|${row.order_id}`;
      const itemKey = `${row.user_id}|${row.order_id}|${row.order_item_id}`;
      const orderPayload = orderMap.get(orderKey) || {};
      const itemPayload = itemMap.get(itemKey) || {};

      const itemPrice = itemPayload.ItemPrice ?? itemPayload.itemPrice;
      const amountStr = itemPrice?.Amount ?? itemPrice?.amount;
      const hasItemPrice = itemPrice != null;
      const hasAmount = amountStr != null && String(amountStr).trim() !== '';
      const amountValue = amountStr;

      const orderStatus = orderPayload.OrderStatus ?? orderPayload.orderStatus;

      const classification = [];
      if (!hasItemPrice) classification.push('ItemPriceがnull/未定義');
      else if (!hasAmount) classification.push('ItemPrice.Amountがnull/空');
      else if (String(amountValue) === '0' || String(amountValue) === '0.00')
        classification.push('APIでAmountが0または0.00');
      if (orderStatus === 'Pending' || orderStatus === 'PendingAvailability')
        classification.push('注文ステータスPending（価格非返却）');
      if (itemPayload.PromotionDiscount != null || itemPayload.promotionDiscount != null)
        classification.push('PromotionDiscountあり');
      if (itemPayload.IsGift === true || itemPayload.isGift === true) classification.push('ギフト品');
      if (Object.keys(itemPayload).length === 0) classification.push('raw欠損');

      details.push({
        order_id: row.order_id,
        order_item_id: row.order_item_id,
        order_date: row.order_date,
        sku: row.sku,
        product_name: row.product_name,
        fulfillment_type: row.fulfillment_type,
        order_status: orderStatus,
        has_item_price: hasItemPrice,
        has_amount: hasAmount,
        amount_raw: amountValue,
        classification,
        payload_keys: Object.keys(itemPayload),
        itemPayload,
      });
    }

    const byClass = {};
    for (const d of details) {
      const key = d.classification.length > 0 ? d.classification.join(' | ') : '不明';
      byClass[key] = (byClass[key] || 0) + 1;
    }
    const byFulfillment = {};
    for (const d of details) {
      const key = d.fulfillment_type ?? 'null';
      byFulfillment[key] = (byFulfillment[key] || 0) + 1;
    }
    const byOrderStatus = {};
    for (const d of details) {
      const key = d.order_status ?? 'null';
      byOrderStatus[key] = (byOrderStatus[key] || 0) + 1;
    }

    console.log('\n========== sales_amount_yen = 0 診断結果 ==========\n');
    console.log(`件数: ${zeroRows.length} 行 (注文 ${orderIds.length} 件)\n`);

    console.log('【原因分類】');
    Object.entries(byClass)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${v}件: ${k}`));

    console.log('\n【Fulfillment別】');
    Object.entries(byFulfillment).forEach(([k, v]) => console.log(`  ${k}: ${v}件`));

    console.log('\n【注文ステータス別】');
    Object.entries(byOrderStatus).forEach(([k, v]) => console.log(`  ${k}: ${v}件`));

    console.log('\n【先頭3件の詳細】');
    for (let i = 0; i < Math.min(3, details.length); i++) {
      const d = details[i];
      console.log(`\n--- ${i + 1}. ${d.order_id} / ${d.order_item_id} ---`);
      console.log(JSON.stringify(d, null, 2));
    }

    const hasRaw = details.filter((d) => d.payload_keys.length > 0);
    const missingRaw = details.filter((d) => d.payload_keys.length === 0);
    const hasItemPriceNull = details.filter((d) => !d.has_item_price);
    const pendingStatus = details.filter(
      (d) => d.order_status === 'Pending' || d.order_status === 'PendingAvailability'
    );

    console.log('\n【サマリー】');
    console.log(`  raw あり: ${hasRaw.length}件, raw 欠損: ${missingRaw.length}件`);
    console.log(`  ItemPrice null: ${hasItemPriceNull.length}件`);
    console.log(`  Pending系ステータス: ${pendingStatus.length}件`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
