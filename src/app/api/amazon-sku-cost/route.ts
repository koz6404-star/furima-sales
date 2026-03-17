/**
 * Amazon SKU 別原価・送料 API
 * GET:  全 SKU の原価・送料マップを返す
 * POST: 1 SKU の原価 or 送料を upsert { sku, cost_yen?, shipping_yen? }
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: rows, error } = await supabase
    .from('amazon_sku_cost')
    .select('sku, cost_yen, shipping_yen')
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const costs: Record<string, { cost_yen: number; shipping_yen: number }> = {};
  for (const r of rows ?? []) {
    costs[r.sku] = { cost_yen: r.cost_yen, shipping_yen: r.shipping_yen ?? 0 };
  }

  return NextResponse.json({ ok: true, costs });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const sku = (body.sku ?? '').trim();
  if (!sku) return NextResponse.json({ error: 'sku is required' }, { status: 400 });

  const updates: Record<string, unknown> = {
    user_id: user.id,
    sku,
    updated_at: new Date().toISOString(),
  };

  if (body.cost_yen != null) {
    const v = parseInt(body.cost_yen, 10);
    if (isNaN(v) || v < 0) return NextResponse.json({ error: 'cost_yen must be a non-negative integer' }, { status: 400 });
    updates.cost_yen = v;
  }
  if (body.shipping_yen != null) {
    const v = parseInt(body.shipping_yen, 10);
    if (isNaN(v) || v < 0) return NextResponse.json({ error: 'shipping_yen must be a non-negative integer' }, { status: 400 });
    updates.shipping_yen = v;
  }

  const { error } = await supabase
    .from('amazon_sku_cost')
    .upsert(updates, { onConflict: 'user_id,sku' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, sku, ...updates });
}
