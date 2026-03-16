/**
 * Amazon SKU 別原価 API
 * GET:  全 SKU の原価マップを返す { costs: { "SKU-001": 1500, ... } }
 * POST: 1 SKU の原価を upsert { sku, cost_yen }
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
    .select('sku, cost_yen')
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const costs: Record<string, number> = {};
  for (const r of rows ?? []) {
    costs[r.sku] = r.cost_yen;
  }

  return NextResponse.json({ ok: true, costs });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const sku = (body.sku ?? '').trim();
  const costYen = parseInt(body.cost_yen, 10);

  if (!sku) return NextResponse.json({ error: 'sku is required' }, { status: 400 });
  if (isNaN(costYen) || costYen < 0) return NextResponse.json({ error: 'cost_yen must be a non-negative integer' }, { status: 400 });

  const { error } = await supabase
    .from('amazon_sku_cost')
    .upsert(
      { user_id: user.id, sku, cost_yen: costYen, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,sku' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, sku, cost_yen: costYen });
}
