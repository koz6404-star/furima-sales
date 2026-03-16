/**
 * Finances API 同期（Phase 8）
 * POST: listFinancialEvents で財務情報取得し amazon_finance_raw に保存
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncFinanceToRaw } from '@/lib/amazon/finance-raw-sync';

export const maxDuration = 300;

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await syncFinanceToRaw(supabase, user.id);

    return NextResponse.json({
      ok: true,
      phase: 8,
      sync: result,
      message: `Finances: ${result.fetched}件取得、${result.saved}件保存${result.errors.length > 0 ? ` （エラー${result.errors.length}件）` : ''}`,
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error('[Amazon] Finances sync error:', msg);
    return NextResponse.json(
      {
        ok: false,
        phase: 8,
        error: msg,
      },
      { status: 500 }
    );
  }
}
