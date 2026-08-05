/**
 * 決済レポートから配送ラベル代（Buy Shipping）を注文番号付きで取得し、
 * amazon_fee_events に保存する。
 *
 * Financial Events の PostageBilling には order_id がないが、
 * Settlement Report の "Shipping label purchase" には order_id がある。
 * この関数で正確な注文別配送ラベル代を fee_events に反映する。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSpApiClient, JAPAN_MARKETPLACE } from '@/lib/amazon-sp-api';
import { fetchAllPages } from '@/lib/supabase/fetch-all';

// 決済レポートのカラム名
const COL_TRANSACTION_TYPE = 'transaction-type';
const COL_AMOUNT_DESC = 'amount-description';
const COL_ORDER_ID = 'order-id';
const COL_AMOUNT = 'amount';
const COL_POSTED_DATE = 'posted-date';

const SHIPPING_LABEL_DESC = 'Shipping label purchase';

export interface SettlementPostageResult {
  reports_checked: number;
  postage_rows_found: number;
  saved: number;
  old_postage_deleted: number;
  errors: string[];
}

/**
 * 全決済レポートをダウンロードし、Shipping label purchase の行を
 * amazon_fee_events に保存する。
 * 既存の __POSTAGE__ 行と PostageBilling 行を削除してから注文別に再保存。
 */
export async function syncSettlementPostage(
  supabase: SupabaseClient,
  userId: string
): Promise<SettlementPostageResult> {
  const result: SettlementPostageResult = {
    reports_checked: 0,
    postage_rows_found: 0,
    saved: 0,
    old_postage_deleted: 0,
    errors: [],
  };

  const client = createSpApiClient();

  // 1. 決済レポート一覧を取得（V2 → V1 フォールバック）
  let reportType = 'GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2';
  let reports = await listSettlementReports(client, reportType);
  if (reports.length === 0) {
    reportType = 'GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE';
    reports = await listSettlementReports(client, reportType);
  }

  if (reports.length === 0) {
    result.errors.push('決済レポートが見つかりません');
    return result;
  }

  console.log(`[settlement-postage] ${reports.length} 件のレポートを処理`);

  // 2. 各レポートをダウンロードし、配送ラベル行を抽出
  const allPostageRows: Array<{
    order_id: string;
    fee_amount_yen: number;
    posted_date: string | null;
  }> = [];

  for (const rpt of reports) {
    result.reports_checked++;
    if (!rpt.reportDocumentId) continue;

    try {
      const rows = await downloadAndParseReport(client, rpt.reportDocumentId);
      for (const row of rows) {
        const tt = (row[COL_TRANSACTION_TYPE] ?? '').trim();
        const desc = (row[COL_AMOUNT_DESC] ?? '').trim();
        const orderId = (row[COL_ORDER_ID] ?? '').trim();
        const amount = parseFloat(row[COL_AMOUNT] ?? '0');

        if (tt === 'other-transaction' && desc === SHIPPING_LABEL_DESC && orderId) {
          allPostageRows.push({
            order_id: orderId,
            fee_amount_yen: Math.round(amount),
            posted_date: row[COL_POSTED_DATE]?.trim() || null,
          });
        }
      }
    } catch (e) {
      result.errors.push(`Report ${rpt.reportId}: ${(e as Error).message}`);
    }
  }

  result.postage_rows_found = allPostageRows.length;
  console.log(`[settlement-postage] 配送ラベル行: ${allPostageRows.length} 件`);

  if (allPostageRows.length === 0) {
    return result;
  }

  // 3. 既存の __POSTAGE__ 行と PostageBilling 行を削除
  const { data: oldRows } = await fetchAllPages<{ id: string }>((pFrom, pTo) =>
    supabase
      .from('amazon_fee_events')
      .select('id')
      .eq('user_id', userId)
      .or('order_id.eq.__POSTAGE__,fee_type.like.PostageBilling%')
      .range(pFrom, pTo),
  );

  if (oldRows && oldRows.length > 0) {
    const { error: delErr } = await supabase
      .from('amazon_fee_events')
      .delete()
      .eq('user_id', userId)
      .or('order_id.eq.__POSTAGE__,fee_type.like.PostageBilling%');

    if (delErr) {
      result.errors.push(`Delete old postage: ${delErr.message}`);
    } else {
      result.old_postage_deleted = oldRows.length;
    }
  }

  // 4. 注文別の配送ラベル代を挿入（重複排除: 同じ order_id は合算）
  const orderMap = new Map<string, { fee_amount_yen: number; posted_date: string | null }>();
  for (const r of allPostageRows) {
    const existing = orderMap.get(r.order_id);
    if (existing) {
      existing.fee_amount_yen += r.fee_amount_yen;
    } else {
      orderMap.set(r.order_id, { fee_amount_yen: r.fee_amount_yen, posted_date: r.posted_date });
    }
  }

  const insertRows = [...orderMap.entries()].map(([orderId, data]) => ({
    user_id: userId,
    order_id: orderId,
    transaction_type: 'SettlementPostage',
    fee_type: 'ShippingLabelPurchase',
    fee_amount_yen: data.fee_amount_yen,
    posted_date: data.posted_date,
    raw_source: null,
    fetched_at: new Date().toISOString(),
  }));

  const BATCH = 100;
  for (let i = 0; i < insertRows.length; i += BATCH) {
    const chunk = insertRows.slice(i, i + BATCH);
    const { error: insErr } = await supabase.from('amazon_fee_events').insert(chunk);
    if (insErr) {
      result.errors.push(`Insert batch ${i / BATCH + 1}: ${insErr.message}`);
    } else {
      result.saved += chunk.length;
    }
  }

  return result;
}

/** 決済レポート一覧を取得 */
async function listSettlementReports(
  client: ReturnType<typeof createSpApiClient>,
  reportType: string
) {
  const res = await client.callAPI({
    operation: 'getReports',
    endpoint: 'reports',
    query: {
      reportTypes: [reportType],
      processingStatuses: ['DONE'],
      pageSize: 10,
      marketplaceIds: [JAPAN_MARKETPLACE],
    },
  });
  return (
    (res as { reports?: Array<{ reportId: string; reportDocumentId?: string; dataStartTime?: string; dataEndTime?: string }> })
      ?.reports ?? []
  );
}

/** レポートドキュメントをダウンロードしてパース */
async function downloadAndParseReport(
  client: ReturnType<typeof createSpApiClient>,
  reportDocumentId: string
): Promise<Array<Record<string, string>>> {
  const docRes = await client.callAPI({
    operation: 'getReportDocument',
    endpoint: 'reports',
    path: { reportDocumentId },
  });

  const doc = docRes as { url?: string };
  if (!doc.url) throw new Error('Download URL not found');

  const res = await fetch(doc.url);
  const buffer = await res.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buffer);

  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t');
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cols[j] ?? '';
    }
    rows.push(row);
  }

  return rows;
}
