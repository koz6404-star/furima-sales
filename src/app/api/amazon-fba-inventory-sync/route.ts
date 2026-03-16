/**
 * FBA Inventory API → raw 同期（Phase 5）+ current 整形（Phase 6）
 * POST: getInventorySummaries で在庫取得し raw に保存、続けて amazon_inventory_current へ整形
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncFbaInventoryToRaw } from '@/lib/amazon/fba-inventory-raw-sync';
import { transformRawToInventoryCurrent } from '@/lib/amazon/transform-inventory-current';

export const maxDuration = 120;

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const syncResult = await syncFbaInventoryToRaw(supabase, user.id);
    const transformResult = await transformRawToInventoryCurrent(supabase, user.id);

    return NextResponse.json({
      ok: true,
      phase: 6,
      sync: syncResult,
      transform: transformResult,
      message: `FBA在庫: ${syncResult.fetched}件取得、${syncResult.saved}件保存 → current: ${transformResult.saved}件`,
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error('[Amazon] FBA inventory sync error:', msg);
    return NextResponse.json(
      {
        ok: false,
        phase: 6,
        error: msg,
      },
      { status: 500 }
    );
  }
}
