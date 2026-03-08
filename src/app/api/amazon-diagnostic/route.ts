/**
 * Amazon API 診断用（原因調査）
 * 実際のレスポンス構造を返して確認する
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createSpApiClient, JAPAN_MARKETPLACE } from '@/lib/amazon-sp-api';

const API_TIME_OFFSET_MS = 10 * 60 * 1000;

function toISO(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const spClient = createSpApiClient();
    const apiNow = new Date(Date.now() - API_TIME_OFFSET_MS);
    const postedAfter = new Date(apiNow.getTime() - 7 * 864e5); // 直近7日

    const result: Record<string, unknown> = {};

    // 1. Finances API: 1件のトランザクション構造を取得
    try {
      const financeRes = await spClient.callAPI({
        operation: 'listTransactions',
        endpoint: 'finances',
        query: {
          postedAfter: toISO(postedAfter),
          marketplaceId: JAPAN_MARKETPLACE,
        },
        options: { version: '2024-06-19' as const },
      }) as { transactions?: unknown[]; Transactions?: unknown[] };
      const txs = financeRes.transactions ?? financeRes.Transactions ?? [];
      const tx = Array.isArray(txs) && txs.length > 0 ? txs[0] : null;
      if (tx) {
        const t = tx as Record<string, unknown>;
        result.finances = {
          transactionsCount: txs.length,
          sample: {
            transactionType: t.transactionType ?? t.TransactionType,
            description: t.description ?? t.Description,
            totalAmount: t.totalAmount ?? t.TotalAmount,
            itemsCount: (t.items ?? t.Items) ? (t.items as unknown[] ?? t.Items as unknown[])?.length : 0,
            hasBreakdowns: !!(t.breakdowns ?? t.Breakdowns),
            breakdownsStructure: JSON.stringify(t.breakdowns ?? t.Breakdowns, null, 2).slice(0, 2000),
            firstItem: (() => {
              const items = (t.items ?? t.Items) as Array<Record<string, unknown>> | undefined;
              const it = items?.[0];
              if (!it) return null;
              return {
                totalAmount: it.totalAmount ?? it.TotalAmount,
                hasBreakdowns: !!(it.breakdowns ?? it.Breakdowns),
                breakdownsStructure: JSON.stringify(it.breakdowns ?? it.Breakdowns, null, 2).slice(0, 1500),
              };
            })(),
          },
        };
      } else {
        result.finances = { transactionsCount: 0, message: '取引がありません（直近7日）' };
      }
    } catch (fe: unknown) {
      result.finances = { error: (fe as Error)?.message ?? String(fe) };
    }

    // 2. FBA Inventory API: レスポンス構造を取得
    try {
      const fbaRes = await spClient.callAPI({
        operation: 'getInventorySummaries',
        endpoint: 'fbaInventory',
        query: {
          granularityType: 'Marketplace',
          granularityId: JAPAN_MARKETPLACE,
          marketplaceIds: [JAPAN_MARKETPLACE],
          details: true,
        },
      }) as Record<string, unknown>;
      const summaries = fbaRes?.inventorySummaries ?? fbaRes?.InventorySummaries ?? fbaRes?.payload;
      const arr = Array.isArray(summaries) ? summaries : (summaries as Record<string, unknown>)?.inventorySummaries ?? (summaries as Record<string, unknown>)?.InventorySummaries;
      const list = Array.isArray(arr) ? arr : [];
      result.fbaInventory = {
        topLevelKeys: Object.keys(fbaRes),
        summariesCount: list.length,
        sampleItem: list[0] ? {
          keys: Object.keys(list[0] as object),
          ...(list[0] as Record<string, unknown>),
        } : null,
      };
    } catch (fb: unknown) {
      result.fbaInventory = { error: (fb as Error)?.message ?? String(fb) };
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({
      error: (e as Error)?.message ?? String(e),
    }, { status: 500 });
  }
}
