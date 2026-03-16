/**
 * FBM 在庫同期 API（Phase14）
 * POST /api/amazon-fbm-inventory-sync
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncFbmInventory } from '@/lib/amazon/fbm-inventory-sync';

export const maxDuration = 120;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncFbmInventory(supabase, user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
