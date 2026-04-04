/**
 * CKB自動データ取得 + 整形スクリプト
 *
 * CKBサイトの発送詳細ページから直接データを抽出し、
 * 整形済みExcelを生成する（Pythonパイプライン不要）
 *
 * 使い方:
 *   node scripts/ckb-auto-fetch.mjs                  # 全発送
 *   node scripts/ckb-auto-fetch.mjs --latest          # 最新1件のみ
 *   node scripts/ckb-auto-fetch.mjs --shipment GJFH.. # 指定便のみ
 */

import { chromium } from 'playwright';
import { mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

const DOWNLOAD_DIR = path.resolve('downloads/ckb');
const CKB_SHIPPING_URL = 'https://s.theckb.com/ja/inshipping/ShippingList';
const CKB_DETAIL_URL = 'https://s.theckb.com/ja/inshipping/ShippingInfo';

const args = process.argv.slice(2);
const targetShipment = args.find((_, i) => args[i - 1] === '--shipment') || null;
const latestOnly = args.includes('--latest');
const customsJpy = parseInt(args.find((_, i) => args[i - 1] === '--customs') || '0') || 0;

// 中国語→日本語の簡易翻訳マップ（CKB商品管理ツールから移植）
const PRODUCT_TRANSLATIONS = [
  // 今回の便（GJFH2603...）の商品
  [/防盗刷卡套.*屏蔽卡套/, 'RFIDスキミング防止カードスリーブ'],
  [/RFID卡套.*屏蔽卡套/, 'RFIDスキミング防止カードスリーブ'],
  [/钥匙包.*多功能卡包/, 'キーケース 多機能カードケース'],
  [/户外EDC.*登山扣/, 'アウトドアEDC カラビナセット'],
  [/黑色CPE.*自封袋/, 'CPE マット黒ジッパー袋'],
  [/户外求生.*求生哨/, 'サバイバルホイッスル アルミ合金'],
  [/批发野营.*急救毯/, 'サバイバル保温ブランケット'],
  [/加厚压缩毛巾.*洗脸巾/, '圧縮タオル 使い捨て'],
  [/户外便携折叠水袋/, '折りたたみウォーターバッグ'],
  [/瑜伽弹力带.*弹力圈/, 'ヨガ エラスティックバンド'],
  [/8字拉力器.*弹力绳/, '8字型フィットネスチューブ'],
  [/便携洗漱包.*收纳袋/, 'トラベルポーチ メッシュ 防水'],
  [/抗菌.*游泳.*速干浴巾/, '抗菌速乾バスタオル A類認証'],
  [/手机防水袋.*防水手机套/, 'スマホ防水ケース タッチ対応'],
  [/旅行可压缩.*整理袋/, 'トラベル圧縮収納バッグセット'],
  [/跨境.*狗.*垃圾袋.*拾便袋/, 'ペット用マナー袋ディスペンサー'],
  [/狗.*牵引绳.*反光.*防走丢/, '犬用リード 反射材付き'],
  [/背心式.*胸背带.*牵引绳/, '犬用ハーネス ベスト型 反射材付き'],
  [/PVC.*防水.*防水桶.*游泳包/, 'PVC防水バッグ 15L リュック型'],
  // 汎用パターン（過去・将来の便にも対応）
  [/防鸟网/, '防鳥ネット'],
  [/遮阳伞|防晒伞/, '日傘 折りたたみ UVカット'],
  [/手机壳/, 'スマホケース'],
  [/耳机套|耳机壳/, 'イヤホンケース'],
  [/钱包/, '財布'],
  [/手提包|斜挎包|单肩包/, 'バッグ'],
  [/项链.*吊坠|吊坠.*项链/, 'ネックレス ペンダント'],
  [/项链/, 'ネックレス'],
  [/戒指/, 'リング'],
  [/耳环|耳钉/, 'ピアス'],
  [/手链|手镯/, 'ブレスレット'],
  [/凉拖鞋|拖鞋/, 'サンダル'],
  [/防晒衣|防晒服/, 'UVカーディガン'],
  [/防晒面罩|防晒口罩/, 'UVフェイスマスク'],
  [/遮阳帽|防晒帽/, 'UVカット帽子'],
  [/冰丝.*袖套|防晒.*袖套/, 'UVアームカバー'],
  [/沙滩包.*网纱/, 'メッシュビーチバッグ 大容量'],
  [/遥控器.*保护套/, 'リモコンカバー シリコン'],
  [/拳.*手套/, 'ボクシンググローブ'],
  [/压缩袋.*收纳/, '衣類圧縮袋'],
  [/洗衣袋/, '洗濯ネット'],
  [/收纳盒/, '収納ボックス'],
  [/宠物.*胸背/, 'ペット用ハーネス'],
  [/狗.*玩具/, '犬用おもちゃ'],
  [/猫.*玩具/, '猫用おもちゃ'],
];

const SPEC_TRANSLATIONS = {
  // キー
  '颜色': '色', '尺码': 'サイズ', '尺寸': 'サイズ', '规格': '規格',
  '规格型号': '規格', '容量': '容量', '对应机种': '対応機種',
  '塑料品种': '素材',
  // 色
  '黑色': '黒', '白色': '白', '粉色': 'ピンク', '蓝色': 'ブルー',
  '红色': '赤', '绿色': '緑', '灰色': 'グレー', '金色': 'ゴールド',
  '银色': 'シルバー', '米白色': 'オフホワイト', '浅紫': 'ラベンダー',
  '浅蓝': 'ライトブルー', '浅粉': 'ライトピンク', '湖蓝': 'レイクブルー',
  '玫瑰金': 'ローズゴールド', '天空蓝': 'スカイブルー', '果绿': 'アップルグリーン',
  '中灰': 'ミディアムグレー', '桔色': 'オレンジ', '紫色': 'パープル',
  '藏青色': 'ネイビー', '经典黑': 'クラシックブラック', '珍珠白': 'パールホワイト',
  '远峰蓝': 'シエラブルー', '天青色': 'セルリアンブルー',
  // その他
  '一个装': '1個入り', '双肩': 'リュック', '四件套': '4点セット',
  '加鞋袋': 'シューズ袋付き', '长度': '長さ',
  '单胸背': 'ハーネス単品', '建议': '推奨',
  '资深训练': '上級トレーニング', '专业训练': 'プロトレーニング', '进阶训练': '中級トレーニング',
  '8级防水': 'IPX8防水', '触控灵敏': 'タッチ対応', '超清拍照': '高画質撮影可',
  '升级款': 'アップグレード版', '平滑款': 'スムースタイプ',
  '10A抗菌': '10A抗菌', '竖版': '縦型', '双层': '二重',
};

function translateProductName(name) {
  for (const [pattern, ja] of PRODUCT_TRANSLATIONS) {
    if (pattern.test(name)) return ja;
  }
  return name; // 翻訳なしならそのまま
}

function translateSpec(spec) {
  if (!spec) return '';
  let result = spec;
  for (const [cn, ja] of Object.entries(SPEC_TRANSLATIONS)) {
    result = result.replaceAll(cn, ja);
  }
  return result;
}

async function waitForDownload(page, action, filepath, timeout = 30000) {
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout }),
      action(),
    ]);
    await download.saveAs(filepath);
    return filepath;
  } catch {
    return null;
  }
}

async function main() {
  if (!existsSync(DOWNLOAD_DIR)) mkdirSync(DOWNLOAD_DIR, { recursive: true });

  console.log('Chrome CDPに接続中...');
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  } catch {
    console.error('❌ Chrome CDPに接続できません。');
    process.exit(1);
  }

  const context = browser.contexts()[0];
  const page = await context.newPage();

  try {
    // ===== 0. 注文一覧から清算後合計を取得 =====
    console.log('\n📦 注文一覧 → 清算後合計取得...');
    await page.goto('https://s.theckb.com/ja/order/OrderList', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 費用明細ダウンロード
    const dlButton = page.locator('button:has-text("ダウンロード")');
    if (await dlButton.count() > 0) {
      const p = await waitForDownload(page, () => dlButton.click(), path.join(DOWNLOAD_DIR, ''));
      if (p) console.log(`  ✅ 費用明細: ${path.basename(p)}`);
    }

    // 注文ごとの清算後合計を取得
    const orderSettlements = await page.evaluate(() => {
      const text = document.body.innerText;
      const orders = {};
      // "B2B26030205000115" → "合計額（清算後) : 2623.93 元" を対応付け
      const regex = /(B2B\d{14,})[^]*?合計額（清算後\)?[\s:：]*(\d[\d,.]+)\s*元/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        orders[match[1]] = parseFloat(match[2]);
      }
      return orders;
    });
    console.log(`  注文清算データ: ${Object.keys(orderSettlements).length}件`);
    for (const [id, amount] of Object.entries(orderSettlements)) {
      console.log(`    ${id}: ${amount}元`);
    }

    // 費用明細Excelから注文番号→SKU→商品単価×数量を読む
    const costBySku = {}; // SKU → { orderNo, unitPrice, qty, subtotal }
    const costByOrder = {}; // 注文番号 → 商品代金合計
    const dlFiles = existsSync(DOWNLOAD_DIR) ? readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.xls') || f.endsWith('.xlsx')) : [];
    for (const f of dlFiles) {
      try {
        const buf = readFileSync(path.join(DOWNLOAD_DIR, f));
        const wb = XLSX.read(buf, { type: 'buffer' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        for (const r of rows) {
          const sku = r['THE CKB SKU'];
          const orderNo = r['THE CKB 注文番号'] || r['THE CKB注文番号'];
          const unitPrice = parseFloat(r['商品単価(CNY)']) || 0;
          const qty = parseInt(r['数量']) || 0;
          const subtotal = parseFloat(r['合計額（CNY）']) || 0;
          if (sku) {
            costBySku[sku] = { orderNo, unitPrice, qty, subtotal };
          }
          if (orderNo) {
            if (!costByOrder[orderNo]) costByOrder[orderNo] = 0;
            costByOrder[orderNo] += subtotal;
          }
        }
      } catch {}
    }
    console.log(`  費用明細SKU: ${Object.keys(costBySku).length}件`);

    // 注文番号別: 清算後合計 vs 商品代金合計 → 国内オーバーヘッド率
    const overheadByOrder = {}; // 注文番号 → overhead率
    for (const [orderNo, productTotal] of Object.entries(costByOrder)) {
      const settlement = orderSettlements[orderNo];
      if (settlement && productTotal > 0) {
        const overhead = settlement - productTotal;
        overheadByOrder[orderNo] = overhead / productTotal; // 商品代金に対する比率
      }
    }
    console.log(`  国内オーバーヘッド率:`);
    for (const [orderNo, rate] of Object.entries(overheadByOrder)) {
      console.log(`    ${orderNo}: ${(rate * 100).toFixed(1)}% (${((orderSettlements[orderNo] || 0) - (costByOrder[orderNo] || 0)).toFixed(2)}元)`);
    }

    // 国際配送一覧から発送コード取得
    console.log('\n🚢 国際配送一覧...');
    await page.goto(CKB_SHIPPING_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const shipmentCodes = await page.evaluate(() => {
      const codes = [];
      const regex = /GJFH\d{25,}/g;
      let match;
      while ((match = regex.exec(document.body.innerText)) !== null) {
        if (!codes.includes(match[0])) codes.push(match[0]);
      }
      return codes;
    });

    console.log(`  発送: ${shipmentCodes.length}件`);

    let targets = shipmentCodes;
    if (targetShipment) targets = shipmentCodes.filter(c => c === targetShipment);
    else if (latestOnly) targets = shipmentCodes.slice(0, 1);

    // 各発送の詳細からデータ抽出
    for (const code of targets) {
      console.log(`\n📋 ${code}`);
      const shipmentDir = path.join(DOWNLOAD_DIR, code);
      if (!existsSync(shipmentDir)) mkdirSync(shipmentDir, { recursive: true });

      await page.goto(`${CKB_DETAIL_URL}?deliveryTaskCode=${code}`, {
        waitUntil: 'networkidle', timeout: 30000,
      });
      await page.waitForTimeout(2000);

      // 納品書DL
      const packingBtn = page.locator('button:has-text("ダウンロード")').first();
      if (await packingBtn.count() > 0) {
        const p = await waitForDownload(page, () => packingBtn.click(), path.join(shipmentDir, `納品書_${code}.xls`));
        if (p) console.log(`  ✅ 納品書DL`);
      }
      await page.waitForTimeout(1000);

      // 領収書DL
      const receiptBtn = page.locator('button:has-text("領収書ダウンロード")');
      if (await receiptBtn.count() > 0) {
        const p = await waitForDownload(page, () => receiptBtn.click(), path.join(shipmentDir, `領収書_${code}.pdf`));
        if (p) console.log(`  ✅ 領収書DL`);
      }

      // 配送情報抽出
      const shipmentInfo = await page.evaluate(() => {
        const text = document.body.innerText;
        const get = (re) => re.exec(text)?.[1]?.trim() || '';
        return {
          weight: get(/THE CKB請求重量[：:]\s*([\d.]+)/),
          totalItems: get(/配送件数[：:]\s*(\d+)/),
          shippingCostLine: get(/国際配送合計金額\s*\n?\s*([\d,.]+)\s*元/),
          status: get(/配送状況[：:]\s*(\S+)/),
        };
      });

      // 商品テーブルからデータ抽出
      const products = await page.evaluate(() => {
        const rows = [];
        const trs = document.querySelectorAll('table tbody tr');
        for (const tr of trs) {
          const tds = Array.from(tr.querySelectorAll('td'));
          if (tds.length < 7) continue;

          // 画像
          const img = tds[0]?.querySelector('img');
          const imageUrl = img?.src || '';

          // SKU + 商品名（CKBはSKUと商品名が同セル内、改行で分離）
          const skuCell = tds[1]?.innerText?.trim() || '';
          const lines = skuCell.split('\n').map(l => l.trim()).filter(Boolean);
          // SKUは32文字のハッシュ値（英数字のみ）
          let sku = '';
          let name = '';
          for (const line of lines) {
            if (/^[0-9a-f]{32}$/.test(line)) {
              sku = line;
            } else if (!sku && /^[0-9a-f]{32}/.test(line)) {
              // SKUが商品名と繋がっている場合
              sku = line.slice(0, 32);
              name = line.slice(32);
            } else {
              name = name ? name + ' ' + line : line;
            }
          }

          // お客様SKU
          const customerSku = tds[2]?.textContent?.trim() || '-';

          // 規格
          const spec = tds[3]?.textContent?.trim() || '';

          // 単価
          const unitPrice = parseFloat(tds[4]?.textContent?.replace(/[^\d.]/g, '') || '0');

          // 配送予定数
          const planQty = parseInt(tds[5]?.textContent?.trim() || '0');

          // 実際配送数
          const actualQty = parseInt(tds[6]?.textContent?.trim() || '0');

          // 小計
          const subtotal = parseFloat(tds[7]?.textContent?.replace(/[^\d.]/g, '') || '0');

          if (sku || name) {
            rows.push({ imageUrl, sku, name, customerSku, spec, unitPrice, planQty, actualQty, subtotal });
          }
        }
        return rows;
      });

      console.log(`  商品: ${products.length}種類`);
      console.log(`  配送: ${shipmentInfo.status} | 重量:${shipmentInfo.weight}KG | 件数:${shipmentInfo.totalItems}`);

      // 国際送料を取得
      const intlShippingCny = await page.evaluate(() => {
        const text = document.body.innerText;
        const match = text.match(/(\d[\d,.]+)\s*元\s*詳細/);
        return match ? parseFloat(match[1]) : 0;
      });
      console.log(`  国際送料: ${intlShippingCny}元`);

      // === コスト計算 ===
      const FX_RATE = 24.48; // CKBサイト表示レート
      const deliveredProducts = products.filter(p => p.actualQty > 0);
      const totalQty = deliveredProducts.reduce((s, p) => s + p.actualQty, 0);
      const totalProductCny = deliveredProducts.reduce((s, p) => s + p.subtotal, 0);

      // SKU→注文番号→オーバーヘッド率で国内送料+手数料を計算
      let domesticOverheadCny = 0;
      let overheadMethod = '';

      // 方法1: 費用明細のSKUから注文番号を特定→オーバーヘッド率を適用
      const skuOrderMap = {};
      for (const p of deliveredProducts) {
        const costData = costBySku[p.sku];
        if (costData?.orderNo) {
          skuOrderMap[p.sku] = costData.orderNo;
        }
      }
      const relatedOrders = [...new Set(Object.values(skuOrderMap))];

      if (relatedOrders.length > 0) {
        // 関連注文の清算後合計と商品代金合計から国内オーバーヘッドを計算
        let relSettlement = 0;
        let relProductTotal = 0;
        for (const orderNo of relatedOrders) {
          relSettlement += orderSettlements[orderNo] || 0;
          relProductTotal += costByOrder[orderNo] || 0;
        }
        if (relSettlement > relProductTotal) {
          domesticOverheadCny = relSettlement - relProductTotal;
          // この便に含まれる商品分だけを按分
          const thisShipmentProductTotal = deliveredProducts.reduce((s, p) => s + p.subtotal, 0);
          const ratio = relProductTotal > 0 ? thisShipmentProductTotal / relProductTotal : 1;
          domesticOverheadCny = domesticOverheadCny * ratio;
          overheadMethod = `清算後合計から算出（注文${relatedOrders.join(',')}）`;
          console.log(`  清算後合計: ${relSettlement.toFixed(2)}元 | 商品代金: ${relProductTotal.toFixed(2)}元`);
          console.log(`  国内送料+手数料(この便分): ${domesticOverheadCny.toFixed(2)}元`);
        }
      }

      if (domesticOverheadCny <= 0) {
        // フォールバック: ブレインの実績値（CKB実コスト分析_2026-04.md: 中央値0.55元/個）
        domesticOverheadCny = totalQty * 0.55;
        overheadMethod = '実績推定値0.55元/個';
        console.log(`  ⚠️ 清算後合計と突合不可。${overheadMethod}: ${domesticOverheadCny.toFixed(2)}元`);
      }

      const domesticPerItemCny = totalQty > 0 ? domesticOverheadCny / totalQty : 0;
      console.log(`  1個あたり国内オーバーヘッド: ${domesticPerItemCny.toFixed(2)}元 (¥${Math.round(domesticPerItemCny * FX_RATE)}) [${overheadMethod}]`);
      const intlPerItemCny = totalQty > 0 ? intlShippingCny / totalQty : 0;

      // 整形済みExcel生成
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('商品管理シート');

      ws.columns = [
        { header: '画像', key: 'image', width: 12 },
        { header: '商品名', key: 'name', width: 30 },
        { header: '商品名（原文）', key: 'nameOriginal', width: 30 },
        { header: 'THE CKB SKU', key: 'sku', width: 36 },
        { header: '規格', key: 'spec', width: 25 },
        { header: '商品数', key: 'qty', width: 8 },
        { header: '商品原価（元）', key: 'unitPriceCny', width: 12 },
        { header: '国内送料+手数料（元）', key: 'domesticCny', width: 18 },
        { header: '小計（元）', key: 'subtotalCny', width: 12 },
        { header: '為替レート', key: 'fxRate', width: 10 },
        { header: '商品コスト（円）', key: 'productCostJpy', width: 14 },
        { header: '国際送料_1個（円）', key: 'intlShipPerItemJpy', width: 16 },
        { header: '関税_1個（円）', key: 'customsPerItemJpy', width: 14 },
        { header: '総コスト_1個（円）', key: 'totalCostPerItemJpy', width: 16 },
        { header: '国際配送依頼番号', key: 'shipmentCode', width: 32 },
      ];

      const intlPerItemJpy = Math.round(intlPerItemCny * FX_RATE);
      const customsPerItemJpy = totalQty > 0 ? Math.round(customsJpy / totalQty) : 0;
      if (customsJpy > 0) {
        console.log(`  関税: ¥${customsJpy.toLocaleString()} → 1個あたり ¥${customsPerItemJpy}`);
      }

      for (const p of deliveredProducts) {
        const domesticAllocCny = domesticPerItemCny * p.actualQty;
        const unitCostWithDomestic = p.unitPrice + domesticPerItemCny;
        const productCostJpy = Math.round(unitCostWithDomestic * FX_RATE);
        const totalPerItemJpy = productCostJpy + intlPerItemJpy + customsPerItemJpy;

        ws.addRow({
          image: p.imageUrl,
          name: translateProductName(p.name),
          nameOriginal: p.name,
          sku: p.sku,
          spec: translateSpec(p.spec),
          qty: p.actualQty,
          unitPriceCny: p.unitPrice,
          domesticCny: Math.round(domesticAllocCny * 100) / 100,
          subtotalCny: p.subtotal,
          fxRate: FX_RATE,
          productCostJpy,
          intlShipPerItemJpy: intlPerItemJpy,
          customsPerItemJpy,
          totalCostPerItemJpy: totalPerItemJpy,
          shipmentCode: code,
        });
      }

      // サマリー行
      ws.addRow({});
      ws.addRow({ name: '【配送サマリー】' });
      ws.addRow({ name: `発送コード: ${code}`, sku: `重量: ${shipmentInfo.weight}KG` });
      ws.addRow({ name: `商品原価合計: ${totalProductCny.toFixed(1)}元 (¥${Math.round(totalProductCny * FX_RATE).toLocaleString()})` });
      ws.addRow({ name: `国内送料+手数料: ${domesticOverheadCny.toFixed(1)}元 (¥${Math.round(domesticOverheadCny * FX_RATE).toLocaleString()})` });
      ws.addRow({ name: `国際送料: ${intlShippingCny}元 (¥${Math.round(intlShippingCny * FX_RATE).toLocaleString()}) → 1個¥${intlPerItemJpy}` });
      ws.addRow({ name: customsJpy > 0 ? `関税: ¥${customsJpy.toLocaleString()} → 1個¥${customsPerItemJpy}` : `関税: 後日確定（--customs オプションで指定）` });
      ws.addRow({ name: `商品数: ${deliveredProducts.length}種類 / ${totalQty}個` });

      const excelPath = path.join(shipmentDir, `商品管理シート_${code}.xlsx`);
      await wb.xlsx.writeFile(excelPath);
      console.log(`  ✅ 整形Excel: ${path.basename(excelPath)}`);
    }

    console.log('\n✅ 完了！');
    console.log(`📁 ${DOWNLOAD_DIR}`);

  } catch (err) {
    console.error('❌ エラー:', err.message);
  } finally {
    await page.close();
    await browser.close();
  }
}

main();
