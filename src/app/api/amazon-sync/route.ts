/**
 * Amazon SP-API 同期
 * Finances API から売上・手数料を取得し、products/sales に反映
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createSpApiClient, JAPAN_MARKETPLACE } from '@/lib/amazon-sp-api';

// 通常の増分同期：過去何日分
const SYNC_DAYS = 90;
// APIは1リクエスト最大180日。これより長い期間はチャンク分割する
const MAX_DAYS_PER_REQUEST = 180;
// API仕様: postedAfter/postedBefore はリクエスト時刻の2分以上前である必要がある
const API_TIME_OFFSET_MS = 3 * 60 * 1000;

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toISO(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** 開始日から今日までを MAX_DAYS_PER_REQUEST 日ずつのチャンクに分割 */
function buildChunks(fromDate: Date): Array<{ postedAfter: Date; postedBefore: Date }> {
  const chunks: Array<{ postedAfter: Date; postedBefore: Date }> = [];
  const now = new Date(Date.now() - API_TIME_OFFSET_MS);
  let cur = new Date(fromDate);
  while (cur < now) {
    const end = new Date(cur);
    end.setDate(end.getDate() + MAX_DAYS_PER_REQUEST);
    const postedBefore = end > now ? new Date(now) : end;
    chunks.push({ postedAfter: new Date(cur), postedBefore });
    cur = postedBefore;
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseAmount(val: { currencyAmount?: number } | undefined): number {
  if (!val || val.currencyAmount == null) return 0;
  return Math.round(val.currencyAmount);
}

function findOrderId(related?: Array<{ relatedIdentifierName?: string; relatedIdentifierValue?: string }>): string | null {
  if (!related) return null;
  const o = related.find((r) => r.relatedIdentifierName === 'ORDER_ID');
  return o?.relatedIdentifierValue ?? null;
}

function findAsin(contexts?: Array<{ asin?: string }>): string | null {
  if (!contexts) return null;
  for (const c of contexts) {
    if (c.asin) return c.asin;
  }
  return null;
}

function findSku(contexts?: Array<{ sku?: string }>): string | null {
  if (!contexts) return null;
  for (const c of contexts) {
    if (c.sku) return c.sku;
  }
  return null;
}

function getFeeBreakdown(breakdowns?: Array<{ breakdownType?: string; breakdownAmount?: { currencyAmount?: number } }>): {
  feeYen: number;
  adSpendYen: number;
} {
  let feeYen = 0;
  let adSpendYen = 0;
  if (!breakdowns) return { feeYen, adSpendYen };
  for (const b of breakdowns) {
    const amt = parseAmount(b.breakdownAmount);
    const type = (b.breakdownType || '').toLowerCase();
    if (type.includes('commission') || type.includes('referral') || type.includes('fba') || type.includes('variable')) {
      feeYen += amt;
    }
    if (type.includes('ad') || type.includes('advertising') || type.includes('sponsored')) {
      adSpendYen += amt;
    }
  }
  return { feeYen, adSpendYen };
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let fromDate: Date | null = null;
    try {
      const body = await req.json().catch(() => ({}));
      if (body?.from && typeof body.from === 'string') {
        const parsed = new Date(body.from);
        if (!isNaN(parsed.getTime())) fromDate = parsed;
      }
    } catch {
      // body なし or 無効なら fromDate は null
    }

    const spClient = createSpApiClient();

    const apiNow = new Date(Date.now() - API_TIME_OFFSET_MS);
    const chunks =
      fromDate != null
        ? buildChunks(fromDate)
        : [{ postedAfter: new Date(apiNow.getTime() - SYNC_DAYS * 864e5), postedBefore: apiNow }];

    const results: Array<{
      orderId: string | null;
      asin: string | null;
      sku: string | null;
      unitPrice: number;
      feeYen: number;
      adSpendYen: number;
      quantity: number;
      postedDate: string;
      description: string;
    }> = [];

    for (let c = 0; c < chunks.length; c++) {
      if (c > 0) await sleep(2500); // レート制限対策（0.5 req/sec）

      const { postedAfter, postedBefore } = chunks[c];
      const PostedAfter = toISO(postedAfter);
      const PostedBefore = toISO(postedBefore);
      let nextToken: string | undefined;

      do {
        const res = await spClient.callAPI({
          operation: 'listTransactions',
          endpoint: 'finances',
          query: {
            postedAfter: PostedAfter,
            postedBefore: PostedBefore,
            marketplaceId: JAPAN_MARKETPLACE,
            ...(nextToken && { nextToken }),
          },
          options: { version: '2024-06-19' as const },
        });

        const payload = res?.payload as { transactions?: unknown[]; nextToken?: string } | undefined;
        const transactions = payload?.transactions ?? [];
        nextToken = payload?.nextToken;

        for (const tx of transactions as Array<{
        transactionType?: string;
        relatedIdentifiers?: Array<{ relatedIdentifierName?: string; relatedIdentifierValue?: string }>;
        totalAmount?: { currencyAmount?: number };
        items?: Array<{
          description?: string;
          totalAmount?: { currencyAmount?: number };
          breakdowns?: Array<{ breakdownType?: string; breakdownAmount?: { currencyAmount?: number } }>;
          contexts?: Array<{ asin?: string; sku?: string; quantityShipped?: number }>;
        }>;
        postedDate?: string;
        breakdowns?: Array<{ breakdownType?: string; breakdownAmount?: { currencyAmount?: number } }>;
      }>) {
        if (tx.transactionType !== 'Shipment') continue;
        const orderId = findOrderId(tx.relatedIdentifiers);
        const postedDate = tx.postedDate ? toYMD(new Date(tx.postedDate)) : toYMD(new Date());

        const items = tx.items ?? [];
        if (items.length === 0) {
          const totalAmount = parseAmount(tx.totalAmount);
          const { feeYen, adSpendYen } = getFeeBreakdown(tx.breakdowns);
          const unitPrice = totalAmount + feeYen + adSpendYen;
          results.push({
            orderId,
            asin: findAsin(tx.items?.flatMap((i) => i.contexts ?? []) as Array<{ asin?: string }>),
            sku: findSku(tx.items?.flatMap((i) => i.contexts ?? []) as Array<{ sku?: string }>),
            unitPrice,
            feeYen,
            adSpendYen,
            quantity: 1,
            postedDate,
            description: (tx as { description?: string }).description || 'Order Payment',
          });
        } else {
          for (const item of items) {
            const totalAmount = parseAmount(item.totalAmount);
            const { feeYen, adSpendYen } = getFeeBreakdown(item.breakdowns);
            const quantity = item.contexts?.[0]?.quantityShipped ?? 1;
            const unitPrice = quantity > 0 ? Math.round((totalAmount + feeYen + adSpendYen) / quantity) : totalAmount;
            results.push({
              orderId,
              asin: item.contexts?.find((c) => c.asin)?.asin ?? null,
              sku: item.contexts?.find((c) => c.sku)?.sku ?? null,
              unitPrice,
              feeYen: Math.round(feeYen / quantity) || 0,
              adSpendYen: Math.round(adSpendYen / quantity) || 0,
              quantity,
              postedDate,
              description: item.description || 'Order Payment',
            });
          }
        }
      }
      } while (nextToken);
    }

    const synced: string[] = [];
    const orderIds = new Set<string>();

    for (const r of results) {
      const saleKey = `${r.orderId ?? 'unk'}-${r.postedDate}-${r.unitPrice}`;
      if (r.orderId && orderIds.has(r.orderId)) continue;
      if (r.orderId) orderIds.add(r.orderId);

      if (r.orderId) {
        const { data: dupCheck } = await supabase
          .from('sales')
          .select('id')
          .eq('user_id', user.id)
          .eq('amazon_order_id', r.orderId)
          .limit(1);
        if (dupCheck && dupCheck.length > 0) continue;
      } else {
        const { data: dupCheck } = await supabase
          .from('sales')
          .select('id')
          .eq('user_id', user.id)
          .eq('platform', 'amazon')
          .eq('sold_at', r.postedDate)
          .eq('unit_price_yen', r.unitPrice)
          .limit(1);
        if (dupCheck && dupCheck.length > 0) continue;
      }

      let productId: string;
      const orFilters: string[] = [];
      if (r.asin) orFilters.push(`asin.eq.${r.asin}`);
      if (r.sku) orFilters.push(`sku.eq.${r.sku}`);
      const orClause = orFilters.length ? orFilters.join(',') : null;

      const { data: existingProduct } =
        orClause
          ? await supabase
              .from('products')
              .select('id')
              .eq('user_id', user.id)
              .eq('platform', 'amazon')
              .or(orClause)
              .limit(1)
              .maybeSingle()
          : { data: null };

      if (existingProduct) {
        productId = existingProduct.id;
      } else {
        const { data: newProduct, error: insErr } = await supabase
          .from('products')
          .insert({
            user_id: user.id,
            name: r.description || `Amazon ${r.postedDate}`,
            cost_yen: 0,
            stock: 0,
            platform: 'amazon',
            asin: r.asin,
            sku: r.sku,
          })
          .select('id')
          .single();
        if (insErr) {
          const { data: fallback } = await supabase
            .from('products')
            .select('id')
            .eq('user_id', user.id)
            .eq('platform', 'amazon')
            .limit(1)
            .maybeSingle();
          if (!fallback) continue;
          productId = fallback.id;
        } else {
          productId = newProduct!.id;
        }
      }

      const grossProfit = r.unitPrice - r.feeYen - r.adSpendYen;
      const { error: saleErr } = await supabase.from('sales').insert({
        user_id: user.id,
        product_id: productId,
        quantity: r.quantity,
        unit_price_yen: r.unitPrice,
        platform: 'amazon',
        fee_rate_percent: 0,
        fee_yen: r.feeYen,
        shipping_yen: 0,
        gross_profit_yen: grossProfit,
        sold_at: r.postedDate,
        ad_spend_yen: r.adSpendYen,
        amazon_order_id: r.orderId ?? undefined,
      });

      if (!saleErr) synced.push(saleKey);
    }

    return NextResponse.json({
      ok: true,
      transactionsFound: results.length,
      synced: synced.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Amazon sync error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
