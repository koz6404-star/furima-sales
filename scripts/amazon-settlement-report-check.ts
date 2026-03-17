#!/usr/bin/env npx tsx
/**
 * 決済レポート構造確認スクリプト
 * Settlement Report のカラム名と PostageBilling の行を確認する
 *
 * 実行: npx tsx scripts/amazon-settlement-report-check.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { createSpApiClient, JAPAN_MARKETPLACE } from '../src/lib/amazon-sp-api';

async function main() {
  const client = createSpApiClient();

  // 1. 利用可能な決済レポート一覧を取得
  console.log('[settlement] 決済レポート一覧を取得中...');
  const reportsRes = await client.callAPI({
    operation: 'getReports',
    endpoint: 'reports',
    query: {
      reportTypes: ['GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2'],
      processingStatuses: ['DONE'],
      pageSize: 5,
      marketplaceIds: [JAPAN_MARKETPLACE],
    },
  });

  const reports = (reportsRes as { reports?: Array<{ reportId: string; reportDocumentId?: string; dataStartTime?: string; dataEndTime?: string }> })?.reports ?? [];
  console.log(`[settlement] ${reports.length} 件のレポートが見つかりました`);

  if (reports.length === 0) {
    // V2 がなければ V1 を試す
    console.log('[settlement] V2 が見つからないため V1 を試行...');
    const v1Res = await client.callAPI({
      operation: 'getReports',
      endpoint: 'reports',
      query: {
        reportTypes: ['GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE'],
        processingStatuses: ['DONE'],
        pageSize: 5,
        marketplaceIds: [JAPAN_MARKETPLACE],
      },
    });
    const v1Reports = (v1Res as { reports?: Array<{ reportId: string; reportDocumentId?: string; dataStartTime?: string; dataEndTime?: string }> })?.reports ?? [];
    console.log(`[settlement] V1: ${v1Reports.length} 件`);
    if (v1Reports.length === 0) {
      console.log('[settlement] 決済レポートが見つかりません');
      return;
    }
    reports.push(...v1Reports);
  }

  for (const r of reports) {
    console.log(`  - reportId: ${r.reportId}, docId: ${r.reportDocumentId}, period: ${r.dataStartTime} ~ ${r.dataEndTime}`);
  }

  // 2. 全レポートをダウンロードして配送ラベル行を探す
  for (const rpt of reports) {
    await checkOneReport(client, rpt);
  }
}

async function checkOneReport(
  client: ReturnType<typeof createSpApiClient>,
  latest: { reportId: string; reportDocumentId?: string; dataStartTime?: string; dataEndTime?: string }
) {
  if (!latest.reportDocumentId) {
    console.log('[settlement] reportDocumentId がありません');
    return;
  }

  console.log(`\n[settlement] レポート ${latest.reportId} をダウンロード中...`);

  const docRes = await client.callAPI({
    operation: 'getReportDocument',
    endpoint: 'reports',
    path: { reportDocumentId: latest.reportDocumentId },
  });

  const doc = docRes as { url?: string; compressionAlgorithm?: string };
  if (!doc.url) {
    console.log('[settlement] ダウンロード URL がありません');
    console.log(JSON.stringify(doc, null, 2));
    return;
  }

  // ダウンロード
  const res = await fetch(doc.url);
  const buffer = await res.arrayBuffer();

  // UTF-8 でデコード
  let text = new TextDecoder('utf-8').decode(buffer);
  // Shift_JIS の可能性もあるため、文字化けしていたら再試行
  if (text.includes('�')) {
    const { default: iconv } = await import('iconv-lite');
    text = iconv.decode(Buffer.from(buffer), 'Shift_JIS');
  }

  const lines = text.split('\n').filter(l => l.trim());
  console.log(`\n[settlement] ${lines.length} 行取得`);

  // 3. カラム名を表示
  if (lines.length > 0) {
    const headers = lines[0].split('\t');
    console.log(`\n[settlement] カラム名 (${headers.length} 列):`);
    headers.forEach((h, i) => console.log(`  [${i}] ${h}`));
  }

  // 4. PostageBilling / 配送 / Shipping 関連の行を検索
  console.log('\n[settlement] 配送ラベル関連の行を検索中...');
  const keywords = ['postage', 'shipping service', '配送', 'マーケットプレイス配送'];
  let found = 0;
  for (let i = 1; i < lines.length && found < 10; i++) {
    const lower = lines[i].toLowerCase();
    if (keywords.some(k => lower.includes(k))) {
      console.log(`\n  --- 行 ${i} ---`);
      const cols = lines[i].split('\t');
      const headers = lines[0].split('\t');
      for (let j = 0; j < cols.length; j++) {
        if (cols[j].trim()) {
          console.log(`  ${headers[j] ?? `col${j}`}: ${cols[j]}`);
        }
      }
      found++;
    }
  }

  // 全 transaction-type / amount-description を表示
  const headers2 = lines[0].split('\t');
  const ttIdx = headers2.indexOf('transaction-type');
  const descIdx = headers2.indexOf('amount-description');
  const amtIdx = headers2.indexOf('amount');
  const orderIdx = headers2.indexOf('order-id');
  const typeDescMap = new Map<string, Set<string>>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const tt = cols[ttIdx]?.trim() ?? '';
    const desc = cols[descIdx]?.trim() ?? '';
    if (!typeDescMap.has(tt)) typeDescMap.set(tt, new Set());
    typeDescMap.get(tt)!.add(desc);
  }
  console.log(`\n[settlement] transaction-type → amount-description 一覧:`);
  for (const [tt, descs] of typeDescMap) {
    console.log(`  ${tt || '(empty)'}: ${[...descs].join(', ')}`);
  }

  if (found === 0) {
    // Other-Transaction の全行を表示
    console.log(`\n[settlement] "Other" 系の全行:`);
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      const tt = cols[ttIdx]?.trim() ?? '';
      if (tt.toLowerCase().includes('other') || tt === '') {
        console.log(`  order=${cols[orderIdx]}, type=${tt}, desc=${cols[descIdx]}, amount=${cols[amtIdx]}`);
      }
    }
  }
}

main().catch((e) => {
  console.error('[settlement] Error:', (e as Error).message ?? e);
  process.exit(1);
});
