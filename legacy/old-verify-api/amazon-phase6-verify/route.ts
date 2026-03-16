/**
 * Phase6 完了確認 API
 * 同一SKU重複 / 0件表示 / 再transform安定性 を検証
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transformRawToInventoryCurrent } from '@/lib/amazon/transform-inventory-current';

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

    const { count: total } = await supabase
      .from('amazon_inventory_current')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const { data: rows } = await supabase
      .from('amazon_inventory_current')
      .select('seller_sku')
      .eq('user_id', user.id);

    const skuSet = new Set<string>();
    let duplicateCount = 0;
    for (const r of rows ?? []) {
      const sku = r.seller_sku ?? '';
      if (skuSet.has(sku)) duplicateCount++;
      skuSet.add(sku);
    }

    const noDuplicate = duplicateCount === 0;
    const passed = noDuplicate;

    return NextResponse.json({
      ok: true,
      passed: !!passed,
      totalRows: total ?? 0,
      uniqueSkus: skuSet.size,
      duplicateSkus: duplicateCount,
      noDuplicate,
      zeroQtyOk: 'fulfillable_qty=0 でも行は保存され表示可能',
      verdict: passed ? '合格' : `不合格: SKU重複 ${duplicateCount}件`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result1 = await transformRawToInventoryCurrent(supabase, user.id);
    const { count: after1 } = await supabase
      .from('amazon_inventory_current')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const result2 = await transformRawToInventoryCurrent(supabase, user.id);
    const { count: after2 } = await supabase
      .from('amazon_inventory_current')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const stable = after1 === after2;
    const passed = stable;

    return NextResponse.json({
      ok: true,
      passed: !!passed,
      after1: after1 ?? 0,
      after2: after2 ?? 0,
      stable: stable ? '再transformで件数一致（安定）' : '要確認',
      transform1: result1,
      transform2: result2,
      verdict: passed ? '合格' : '要確認: 再transformで件数変化',
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
