import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: all, error } = await supabase
    .from('products')
    .select('id, name, sku, platform, stock, created_at')
    .order('created_at', { ascending: false });

  if (error) { console.error('ERROR:', error); return; }

  const byPlatform: Record<string, number> = {};
  for (const p of all ?? []) {
    const plat = p.platform ?? 'フリマ(NULL)';
    byPlatform[plat] = (byPlatform[plat] ?? 0) + 1;
  }
  console.log('商品数 合計: ' + (all?.length ?? 0) + '件');
  console.log('プラットフォーム別:');
  for (const [k, v] of Object.entries(byPlatform)) {
    console.log('  ' + k + ': ' + v + '件');
  }

  const amazonProducts = (all ?? []).filter(p => p.platform === 'amazon');
  if (amazonProducts.length > 0) {
    console.log('\n--- Amazon商品 (' + amazonProducts.length + '件) ---');
    for (const p of amazonProducts.slice(0, 15)) {
      console.log((p.sku ?? '-') + ' | ' + (p.name?.slice(0, 50) ?? '?') + ' | 在庫' + p.stock);
    }
    if (amazonProducts.length > 15) console.log('... 他 ' + (amazonProducts.length - 15) + '件');
  }

  // salesで参照されているか確認
  const amazonIds = amazonProducts.map(p => p.id);
  if (amazonIds.length > 0) {
    const { count } = await supabase
      .from('sales')
      .select('*', { count: 'exact', head: true })
      .in('product_id', amazonIds);
    console.log('\nこれらを参照するsalesレコード: ' + (count ?? 0) + '件（0なら安全に削除可能）');
  }
}
main().catch(e => console.error(e));
