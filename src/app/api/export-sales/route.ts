import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const period = searchParams.get('period') || 'month';
  const year = parseInt(searchParams.get('year') ?? '0', 10);
  const month = parseInt(searchParams.get('month') ?? '1', 10);

  let startDate: string;
  let endDate: string;

  if (period === 'year') {
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
  } else {
    const lastDay = new Date(year, month, 0).getDate();
    startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  const { data: sales } = await supabase
    .from('sales')
    .select('*')
    .eq('user_id', user.id)
    .gte('sold_at', startDate)
    .lte('sold_at', endDate)
    .order('sold_at', { ascending: true });

  if (!sales || sales.length === 0) {
    const headers = new Headers();
    headers.set('Content-Type', 'text/csv; charset=utf-8');
    headers.set('Content-Disposition', `attachment; filename="sales_${year}${period === 'year' ? '' : String(month).padStart(2, '0')}.csv"`);
    return new NextResponse('販売日,商品名,SKU,個数,単価,売上,手数料,送料,資材代,粗利,プラットフォーム\n（データなし）', {
      headers,
    });
  }

  const productIds = [...new Set(sales.map((s) => s.product_id))];
  const { data: products } = await supabase
    .from('products')
    .select('id, name, sku')
    .in('id', productIds);
  const productMap = new Map((products ?? []).map((p) => [p.id, p]));

  const rows: string[][] = [
    ['販売日', '商品名', 'SKU', '個数', '単価', '売上', '手数料', '送料', '資材代', '粗利', 'プラットフォーム'],
  ];

  for (const s of sales) {
    const product = productMap.get(s.product_id);
    const name = product?.name ?? '(不明)';
    const sku = product?.sku ?? '';
    const revenue = s.unit_price_yen * s.quantity;
    const platform = s.platform === 'mercari' ? 'メルカリ' : 'ラクマ';
    rows.push([
      s.sold_at,
      name,
      sku,
      String(s.quantity),
      String(s.unit_price_yen),
      String(revenue),
      String(s.fee_yen),
      String(s.shipping_yen),
      String(s.material_yen ?? 0),
      String(s.gross_profit_yen),
      platform,
    ]);
  }

  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
  const bom = '\uFEFF';

  const filename = period === 'year'
    ? `sales_${year}.csv`
    : `sales_${year}${String(month).padStart(2, '0')}.csv`;

  return new NextResponse(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
