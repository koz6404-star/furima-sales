import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET: 発送一覧
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 });

  const { data, error } = await supabase
    .from('ckb_shipments')
    .select('*, ckb_shipment_items(count)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST: 新規発送登録（手動）
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 });

  const body = await req.json();
  const { shipment_code, shipped_at, arrived_at, exchange_rate, intl_shipping_jpy, memo } = body;

  if (!shipment_code) {
    return NextResponse.json({ error: '国際配送依頼番号は必須です' }, { status: 400 });
  }

  // 重複チェック
  const { data: existing } = await supabase
    .from('ckb_shipments')
    .select('id')
    .eq('user_id', user.id)
    .eq('shipment_code', shipment_code)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: `便 ${shipment_code} は既に登録済みです`, existing_id: existing.id }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('ckb_shipments')
    .insert({
      user_id: user.id,
      shipment_code,
      shipped_at: shipped_at || null,
      arrived_at: arrived_at || null,
      exchange_rate: exchange_rate || null,
      intl_shipping_jpy: intl_shipping_jpy || 0,
      memo: memo || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
