import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = 'b654d797-cae4-4af8-b22c-ffa91763698c';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const shipmentCode = process.argv[2] || 'GJFH2603172033838812074467328';

async function main() {
  // ckb_shipment_items から SKU一覧を取得
  const { data: shipment } = await supabase
    .from('ckb_shipments')
    .select('id')
    .eq('user_id', USER_ID)
    .eq('shipment_code', shipmentCode)
    .single();

  if (!shipment) { console.error('便が見つかりません'); process.exit(1); }

  const { data: items } = await supabase
    .from('ckb_shipment_items')
    .select('ckb_sku, product_id')
    .eq('shipment_id', shipment.id);

  // CKBの発送詳細から画像URLを再取得
  const { chromium } = await import('playwright');
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  } catch {
    console.error('❌ Chrome CDPに接続できません');
    process.exit(1);
  }

  const context = browser.contexts()[0];
  const page = await context.newPage();

  await page.goto(`https://s.theckb.com/ja/inshipping/ShippingInfo?deliveryTaskCode=${shipmentCode}`, {
    waitUntil: 'networkidle', timeout: 30000,
  });
  await page.waitForTimeout(2000);

  // SKU→画像URLマップを取得
  const imageMap = await page.evaluate(() => {
    const map = {};
    const trs = document.querySelectorAll('table tbody tr');
    for (const tr of trs) {
      const tds = Array.from(tr.querySelectorAll('td'));
      if (tds.length < 2) continue;
      const img = tds[0]?.querySelector('img');
      const skuCell = tds[1]?.innerText?.trim() || '';
      const skuMatch = skuCell.match(/^[0-9a-f]{32}/);
      if (img?.src && skuMatch) {
        map[skuMatch[0]] = img.src;
      }
    }
    return map;
  });

  await page.close();
  await browser.close();

  console.log(`📸 画像URL: ${Object.keys(imageMap).length}件`);

  // 各商品の画像をダウンロード→Storage→products更新
  let ok = 0, fail = 0;
  for (const item of items) {
    if (!item.product_id || !item.ckb_sku) continue;
    const imageUrl = imageMap[item.ckb_sku];
    if (!imageUrl) { fail++; continue; }

    try {
      const res = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) { fail++; continue; }

      const buffer = Buffer.from(await res.arrayBuffer());
      const ext = imageUrl.includes('.png') ? 'png' : 'jpg';
      const path = `${USER_ID}/${item.ckb_sku}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('product-images')
        .upload(path, buffer, {
          upsert: true,
          contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
        });

      if (uploadErr) { fail++; continue; }

      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);

      await supabase
        .from('products')
        .update({ image_url: urlData.publicUrl })
        .eq('id', item.product_id);

      ok++;
      process.stdout.write(`\r  ${ok}/${items.length} アップロード中...`);
    } catch {
      fail++;
    }
  }

  console.log(`\n✅ 完了: ${ok}件成功 / ${fail}件失敗`);
}

main();
