/**
 * Finances API 診断
 * listFinancialEvents の生レスポンスを返し、データ有無・構造を確認
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listFinancialEvents } from '@/lib/amazon/finances';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const postedBefore = new Date(now.getTime() - 3 * 60 * 1000); // 3分前（API: 2分以内は不可）
    const postedAfter = new Date(postedBefore);
    postedAfter.setDate(postedAfter.getDate() - 90);

    const res = await listFinancialEvents({
      postedAfter,
      postedBefore,
      maxResultsPerPage: 10,
    });

    const payload = res.payload as Record<string, unknown> | undefined;
    const events = payload?.FinancialEvents ?? (res as Record<string, unknown>).FinancialEvents;
    const hasPayload = !!payload;
    const hasFinancialEvents = !!events && typeof events === 'object';
    const eventKeys = hasFinancialEvents ? Object.keys(events as object) : [];
    const eventCounts: Record<string, number> = {};
    if (hasFinancialEvents) {
      for (const k of eventKeys) {
        const arr = (events as Record<string, unknown>)[k];
        eventCounts[k] = Array.isArray(arr) ? arr.length : 0;
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'Finances API 呼び出し成功。レスポンス構造を確認',
      hasPayload,
      hasFinancialEvents,
      eventKeys,
      eventCounts,
      totalEvents: Object.values(eventCounts).reduce((a, b) => a + b, 0),
      nextToken: payload?.NextToken ?? (res as Record<string, unknown>).NextToken,
      sampleKeys: payload ? Object.keys(payload) : Object.keys(res as object),
      rawTopLevelKeys: Object.keys(res as object),
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error('[Amazon] Finances diagnostic error:', msg);
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        hint: 'Finance and Accounting ロールが承認されているか、認証情報を確認してください',
      },
      { status: 500 }
    );
  }
}
