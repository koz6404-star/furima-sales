/**
 * 整形済みExcelをfurima-salesのSupabaseに直接取り込むスクリプト
 * ckb_shipments → ckb_shipment_items → products（確定まで一括実行）
 */

import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = 'b654d797-cae4-4af8-b22c-ffa91763698c';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const args = process.argv.slice(2);
const excelPath = args[0];
if (!excelPath) {
  console.error('Usage: node scripts/ckb-import-to-app.mjs <path-to-excel>');
  process.exit(1);
}

async function main() {
  console.log(`📥 取込: ${excelPath}`);

  // Excel読み込み
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(excelPath);
  const ws = wb.worksheets[0];

  // ヘッダー取得
  const headers = [];
  ws.getRow(1).eachCell((cell, col) => headers.push({ col, key: String(cell.value) }));
  const getCol = (name) => headers.find(h => h.key.includes(name))?.col;

  // データ行読み取り
  const items = [];
  let shipmentCode = '';
  let fxRate = 24.48;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = row.getCell(getCol('商品名')).value;
    if (!name || String(name).startsWith('【') || String(name).startsWith('国際') || String(name).startsWith('関税')) continue;

    const sku = row.getCell(getCol('THE CKB SKU')).value;
    if (!sku || String(sku).includes('発送コード') || String(sku).includes('重量') || !/^[0-9a-f]{32}$/.test(String(sku))) continue;

    const code = row.getCell(getCol('国際配送依頼番号'))?.value;
    if (code) shipmentCode = String(code);

    const rate = row.getCell(getCol('為替レート'))?.value;
    if (rate) fxRate = parseFloat(rate) || 24.48;

    items.push({
      ckb_sku: String(sku),
      product_name: String(name),
      quantity: parseInt(row.getCell(getCol('商品数')).value) || 1,
      unit_cost_cny: parseFloat(row.getCell(getCol('商品原価')).value) || 0,
      unit_cost_jpy: parseInt(row.getCell(getCol('商品コスト')).value) || 0,
      allocated_intl_shipping_jpy: parseInt(row.getCell(getCol('国際送料')).value) || 0,
      allocated_customs_jpy: parseInt(row.getCell(getCol('関税')).value) || 0,
      total_cost_jpy: null, // 後で計算
      unit_total_cost_jpy: parseInt(row.getCell(getCol('総コスト')).value) || 0,
      spec_raw: String(row.getCell(getCol('規格')).value || ''),
      size: null,
      color: null,
      image_url: null, // 画像はExcel埋込のため別途処理
      source_file: excelPath.split('/').pop(),
    });
  }

  if (!shipmentCode || items.length === 0) {
    console.error('❌ 発送コードまたは商品データが見つかりません');
    process.exit(1);
  }

  console.log(`  便: ${shipmentCode}`);
  console.log(`  商品: ${items.length}種類`);
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  console.log(`  合計: ${totalQty}個`);

  // 重複チェック
  const { data: existing } = await supabase
    .from('ckb_shipments')
    .select('id, status')
    .eq('user_id', USER_ID)
    .eq('shipment_code', shipmentCode)
    .maybeSingle();

  if (existing) {
    console.error(`❌ 便 ${shipmentCode} は既に登録済み（status: ${existing.status}）`);
    process.exit(1);
  }

  // 国際送料・関税はアイテムから逆算
  const intlShippingJpy = items[0]?.allocated_intl_shipping_jpy * totalQty / items[0]?.quantity || 0;
  const customsJpy = items[0]?.allocated_customs_jpy * totalQty / items[0]?.quantity || 0;

  // 1. ckb_shipments INSERT
  const { data: shipment, error: shipErr } = await supabase
    .from('ckb_shipments')
    .insert({
      user_id: USER_ID,
      shipment_code: shipmentCode,
      arrived_at: new Date().toISOString().slice(0, 10),
      exchange_rate: fxRate,
      intl_shipping_jpy: Math.round(intlShippingJpy),
      customs_duty_jpy: Math.round(customsJpy),
      total_items: totalQty,
      status: 'draft',
      source_file_name: excelPath.split('/').pop(),
    })
    .select()
    .single();

  if (shipErr) { console.error('❌ shipment INSERT失敗:', shipErr.message); process.exit(1); }
  console.log(`  ✅ ckb_shipments INSERT: ${shipment.id}`);

  // 2. ckb_shipment_items INSERT
  const itemRows = items.map(item => ({
    shipment_id: shipment.id,
    ...item,
    total_cost_jpy: item.unit_total_cost_jpy * item.quantity,
  }));

  const { error: itemErr } = await supabase
    .from('ckb_shipment_items')
    .insert(itemRows);

  if (itemErr) {
    console.error('❌ items INSERT失敗:', itemErr.message);
    await supabase.from('ckb_shipments').delete().eq('id', shipment.id);
    process.exit(1);
  }
  console.log(`  ✅ ckb_shipment_items INSERT: ${items.length}件`);

  // 3. 確定処理（products に反映）
  console.log('  🔄 商品マスタに反映中...');
  let created = 0, updated = 0;

  for (const item of items) {
    // 既存商品を検索
    const { data: existingProduct } = await supabase
      .from('products')
      .select('id, cost_yen, stock')
      .eq('user_id', USER_ID)
      .eq('sku', item.ckb_sku)
      .maybeSingle();

    if (existingProduct) {
      // 加重平均原価 + 在庫追加
      const oldStock = existingProduct.stock;
      const oldCost = existingProduct.cost_yen;
      const newStock = oldStock + item.quantity;
      const newCost = newStock > 0
        ? Math.round((oldStock * oldCost + item.quantity * item.unit_total_cost_jpy) / newStock)
        : item.unit_total_cost_jpy;

      await supabase
        .from('products')
        .update({ cost_yen: newCost, stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', existingProduct.id);

      // ロケーション更新
      const { data: loc } = await supabase
        .from('product_location_stock')
        .select('quantity')
        .eq('product_id', existingProduct.id)
        .eq('location', 'home')
        .maybeSingle();

      if (loc) {
        await supabase
          .from('product_location_stock')
          .update({ quantity: loc.quantity + item.quantity })
          .eq('product_id', existingProduct.id)
          .eq('location', 'home');
      } else {
        await supabase
          .from('product_location_stock')
          .insert({ product_id: existingProduct.id, location: 'home', quantity: item.quantity });
      }

      // product_id紐付け
      await supabase
        .from('ckb_shipment_items')
        .update({ product_id: existingProduct.id })
        .eq('shipment_id', shipment.id)
        .eq('ckb_sku', item.ckb_sku);

      updated++;
    } else {
      // 新規商品作成
      const { data: newProduct } = await supabase
        .from('products')
        .insert({
          user_id: USER_ID,
          sku: item.ckb_sku,
          sku_locked: true,
          name: item.product_name,
          cost_yen: item.unit_total_cost_jpy,
          stock: item.quantity,
          stock_received_at: new Date().toISOString().slice(0, 10),
          oldest_received_at: new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single();

      if (newProduct) {
        await supabase
          .from('product_location_stock')
          .insert({ product_id: newProduct.id, location: 'home', quantity: item.quantity });

        await supabase
          .from('ckb_shipment_items')
          .update({ product_id: newProduct.id })
          .eq('shipment_id', shipment.id)
          .eq('ckb_sku', item.ckb_sku);
      }
      created++;
    }
  }

  // 4. ステータスを confirmed に
  await supabase
    .from('ckb_shipments')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', shipment.id);

  console.log(`\n✅ 取込完了！`);
  console.log(`  新規: ${created}件 | 更新: ${updated}件`);
  console.log(`  ステータス: confirmed`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
