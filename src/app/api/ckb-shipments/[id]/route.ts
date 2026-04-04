import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET: 発送詳細 + 商品一覧
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 });

  const { data, error } = await supabase
    .from('ckb_shipments')
    .select('*, ckb_shipment_items(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

// PATCH: 発送情報更新
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 });

  // confirmed済みの場合は一部フィールドのみ更新可能
  const { data: shipment } = await supabase
    .from('ckb_shipments')
    .select('status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!shipment) return NextResponse.json({ error: '発送が見つかりません' }, { status: 404 });

  const body = await req.json();
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // draft時は全フィールド更新可能
  if (shipment.status === 'draft') {
    const allowed = ['shipped_at', 'arrived_at', 'exchange_rate', 'intl_shipping_jpy', 'memo'];
    for (const key of allowed) {
      if (key in body) updateData[key] = body[key];
    }
  } else {
    // confirmed以降はmemoのみ
    if ('memo' in body) updateData.memo = body.memo;
  }

  const { data, error } = await supabase
    .from('ckb_shipments')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE: 発送削除（draftのみ）
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 });

  const { data: shipment } = await supabase
    .from('ckb_shipments')
    .select('status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!shipment) return NextResponse.json({ error: '発送が見つかりません' }, { status: 404 });
  if (shipment.status !== 'draft') {
    return NextResponse.json({ error: '確定済みの発送は削除できません' }, { status: 400 });
  }

  const { error } = await supabase
    .from('ckb_shipments')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
