/**
 * Amazon Orders API raw 同期（Phase 2）+ 整形（Phase 3）
 *
 * POST body:
 * - from: 取得開始日 (YYYY-MM-DD)
 * - to: 取得終了日 (YYYY-MM-DD)
 * - ordersOnly: true で注文のみ（商品行スキップ・デバッグ用）
 * - transform: true で raw 同期後に amazon_sales_lines へ整形（Phase 3）
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncOrdersToRaw } from '@/lib/amazon/orders-raw-sync';
import { transformRawToSalesLines } from '@/lib/amazon/transform-sales-lines';

export const maxDuration = 300;

function parseDate(val: unknown): Date | null {
  if (typeof val !== 'string') return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let fromDate: Date = new Date(Date.now() - 90 * 864e5);
    let toDate: Date | undefined;
    let ordersOnly = false;
    let runTransform = false;

    try {
      const body = await req.json().catch(() => ({}));
      const from = parseDate(body?.from);
      if (from) fromDate = from;
      const to = parseDate(body?.to);
      if (to) toDate = to;
      if (body?.ordersOnly === true) ordersOnly = true;
      if (body?.transform === true) runTransform = true;
    } catch {
      // body なし or 無効ならデフォルト
    }

    const result = await syncOrdersToRaw(supabase, user.id, {
      createdAfter: fromDate,
      createdBefore: toDate,
      ordersOnly,
    });

    let transformResult: { processed: number; saved: number; skipped: number; errors: string[] } | undefined;
    if (runTransform && !ordersOnly) {
      transformResult = await transformRawToSalesLines(supabase, user.id);
    }

    return NextResponse.json({
      ok: true,
      phase: runTransform ? 3 : 2,
      ...result,
      transform: transformResult,
      params: {
        from: fromDate.toISOString().slice(0, 10),
        to: toDate?.toISOString().slice(0, 10),
        ordersOnly,
        transform: runTransform,
      },
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error('[Amazon] amazon-orders-sync error:', msg);
    return NextResponse.json(
      {
        ok: false,
        phase: 2,
        error: msg,
      },
      { status: 500 }
    );
  }
}
