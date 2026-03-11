/**
 * Amazon SP-API 同期
 * - Finances API: 売上・手数料を取得し products/sales に反映
 * - FBA Inventory API: FBA在庫をSKUベースで取得
 * - Listings API: FBM在庫を fulfillmentAvailability で取得
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createSpApiClient, JAPAN_MARKETPLACE } from '@/lib/amazon-sp-api';

export const maxDuration = 300;

// 通常の増分同期：過去何日分
const SYNC_DAYS = 90;
// APIは1リクエスト最大180日。これより長い期間はチャンク分割する
const MAX_DAYS_PER_REQUEST = 180;
// API仕様: postedAfter/postedBefore はリクエスト時刻の2分以上前である必要がある（余裕を持って10分）
const API_TIME_OFFSET_MS = 10 * 60 * 1000;

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

function parseAmount(val: Record<string, unknown> | undefined): number {
  if (!val || typeof val !== 'object') return 0;
  const amt =
    (val.currencyAmount as number | undefined) ??
    (val.CurrencyAmount as number | undefined) ??
    (val.amount as number | undefined) ??
    (val.Amount as number | undefined) ??
    (val.value as number | undefined) ??
    (val.Value as number | undefined);
  if (amt == null || typeof amt !== 'number') return 0;
  return Math.round(amt);
}

function findOrderId(related?: Array<{ relatedIdentifierName?: string; relatedIdentifierValue?: string; RelatedIdentifierName?: string; RelatedIdentifierValue?: string }>): string | null {
  if (!related) return null;
  const o = related.find((r) => (r.relatedIdentifierName ?? r.RelatedIdentifierName) === 'ORDER_ID');
  return (o?.relatedIdentifierValue ?? o?.RelatedIdentifierValue) ?? null;
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

type BreakdownItem = {
  breakdownType?: string;
  BreakdownType?: string;
  breakdownAmount?: unknown;
  BreakdownAmount?: unknown;
  breakdowns?: unknown;
  Breakdowns?: unknown;
};

/** ネストした breakdowns を再帰的に走査。葉ノード（明細）のみ手数料・広告・送料を集計（二重計上防止） */
function getFeeBreakdown(breakdowns: unknown): {
  feeYen: number;
  adSpendYen: number;
  shippingYen: number;
} {
  let feeYen = 0;
  let adSpendYen = 0;
  let shippingYen = 0;
  const arr: BreakdownItem[] = [];
  if (Array.isArray(breakdowns)) {
    arr.push(...(breakdowns as BreakdownItem[]));
  } else if (breakdowns && typeof breakdowns === 'object') {
    const o = breakdowns as { breakdowns?: unknown; Breakdowns?: unknown };
    const inner = o.breakdowns ?? o.Breakdowns;
    if (Array.isArray(inner)) arr.push(...(inner as BreakdownItem[]));
  }
  function process(list: BreakdownItem[]) {
    for (const b of list) {
      const children = (b.breakdowns ?? b.Breakdowns) as BreakdownItem[] | undefined;
      const hasNonEmptyChildren = Array.isArray(children) && children.length > 0;
      if (hasNonEmptyChildren) {
        process(children);
        continue; // 親は集計せず子のみ
      }
      const amt = parseAmount((b.breakdownAmount ?? b.BreakdownAmount) as { currencyAmount?: number; CurrencyAmount?: number });
      const absAmt = Math.abs(amt);
      const type = ((b.breakdownType ?? b.BreakdownType) || '').toLowerCase();
      // 売上本体・税（OurPricePrincipal等）はスキップ
      if (type.includes('ourpriceprincipal') || (type.includes('principal') && type.includes('ourprice')) || type.includes('principle')) continue;
      if (type.includes('ourpricetax') || (type === 'tax' && amt > 0)) continue; // 売上税はスキップ
      if (type === 'sales' || type.includes('productcharges') || type.includes('product charges')) continue;
      if (type === 'expenses') continue; // 親カテゴリのみスキップ、子は処理される
      // 送料・配送関連（ShippingServiceCharges, PostageBilling_Postage等。VATは手数料扱い）
      if (
        (type.includes('shipping') || (type.includes('postage') && !type.includes('vat')) || type.includes('delivery') || type.includes('配送'))
      ) {
        shippingYen += absAmt;
      } else if (type.includes('ad') || type.includes('advertising') || type.includes('sponsored') || type.includes('ppc')) {
        adSpendYen += absAmt;
      } else if (
        type.includes('commission') ||
        type.includes('referral') ||
        type.includes('amazonfees') ||
        type.includes('amazon fee') ||
        type.includes('fba') && (type.includes('fee') || type.includes('fulfillment') || type.includes('storage')) ||
        (type.includes('fee') && !type.includes('ad')) ||
        type.includes('variableclosingfee') ||
        type.includes('base') ||
        (type === 'tax' && amt < 0) ||
        type.includes('vat') && amt < 0
      ) {
        feeYen += absAmt;
      } else if (type.length > 0 && absAmt > 0 && !type.includes('ourprice')) {
        // その他の費用（Other, PostageBilling_VAT等）は手数料扱い
        feeYen += absAmt;
      }
    }
  }
  process(arr);
  return { feeYen, adSpendYen, shippingYen };
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
      shippingYen: number;
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
        // 最終チャンクは postedBefore を省略→API がリクエスト受信時の2分前を自動設定（日時制約エラー回避）
        const isLastChunk = c === chunks.length - 1;
        const query: Record<string, string> = {
          postedAfter: PostedAfter,
          marketplaceId: JAPAN_MARKETPLACE,
          ...(nextToken && { nextToken }),
          ...(!isLastChunk && { postedBefore: PostedBefore }),
        };
        const res = await spClient.callAPI({
          operation: 'listTransactions',
          endpoint: 'finances',
          query,
          options: { version: '2024-06-19' as const },
        });

        // amazon-sp-api は json_res.payload を返す → res = { transactions, nextToken }
        const data = res as { transactions?: unknown[]; Transactions?: unknown[]; nextToken?: string; NextToken?: string };
        const txs = data.transactions ?? data.Transactions;
        const transactions = Array.isArray(txs) ? txs : [];
        nextToken = data.nextToken ?? data.NextToken;

        for (const tx of transactions as Array<{
        transactionType?: string;
        TransactionType?: string;
        relatedIdentifiers?: Array<{ relatedIdentifierName?: string; relatedIdentifierValue?: string }>;
        RelatedIdentifiers?: Array<{ RelatedIdentifierName?: string; RelatedIdentifierValue?: string }>;
        totalAmount?: { currencyAmount?: number; CurrencyAmount?: number };
        items?: Array<{
          description?: string;
          totalAmount?: { currencyAmount?: number };
          breakdowns?: Array<{ breakdownType?: string; breakdownAmount?: { currencyAmount?: number } }>;
          contexts?: Array<{ asin?: string; sku?: string; quantityShipped?: number }>;
        }>;
        postedDate?: string;
        PostedDate?: string;
        breakdowns?: Array<{ breakdownType?: string; breakdownAmount?: { currencyAmount?: number } }>;
      }>) {
        const txType = tx.transactionType ?? tx.TransactionType ?? '';
        if (txType !== 'Shipment' && txType !== 'shipment') continue;
        const related = (tx as { relatedIdentifiers?: unknown[]; RelatedIdentifiers?: unknown[] }).relatedIdentifiers ?? (tx as { RelatedIdentifiers?: unknown[] }).RelatedIdentifiers;
        const orderId = findOrderId(related as Array<{ relatedIdentifierName?: string; relatedIdentifierValue?: string; RelatedIdentifierName?: string; RelatedIdentifierValue?: string }>);
        const postDate = tx.postedDate ?? (tx as { PostedDate?: string }).PostedDate;
        const postedDate = postDate ? toYMD(new Date(postDate)) : toYMD(new Date());

        const items = tx.items ?? [];
        if (items.length === 0) {
          const totalAmount = parseAmount(tx.totalAmount);
          const { feeYen, adSpendYen, shippingYen } = getFeeBreakdown(tx.breakdowns);
          const unitPrice = totalAmount + feeYen + adSpendYen + shippingYen;
          results.push({
            orderId,
            asin: findAsin(tx.items?.flatMap((i) => i.contexts ?? []) as Array<{ asin?: string }>),
            sku: findSku(tx.items?.flatMap((i) => i.contexts ?? []) as Array<{ sku?: string }>),
            unitPrice,
            feeYen,
            adSpendYen,
            shippingYen,
            quantity: 1,
            postedDate,
            description: (tx as { description?: string }).description || 'Order Payment',
          });
        } else {
          // item.breakdowns が null の場合がある（GitHub #4993）。トランザクション階層の breakdowns をフォールバック
          const txBreakdowns = (tx as { breakdowns?: unknown }).breakdowns;
          for (const item of items) {
            const totalAmount = parseAmount(item.totalAmount);
            const itemBd = item.breakdowns ?? (items.length === 1 ? txBreakdowns : null);
            let { feeYen, adSpendYen, shippingYen } = getFeeBreakdown(itemBd);
            // トランザクション階層のみで複数itemの場合は按分
            if (items.length > 1 && (feeYen === 0 && adSpendYen === 0 && shippingYen === 0) && txBreakdowns) {
              const txFee = getFeeBreakdown(txBreakdowns);
              feeYen = Math.round(txFee.feeYen / items.length);
              adSpendYen = Math.round(txFee.adSpendYen / items.length);
              shippingYen = Math.round(txFee.shippingYen / items.length);
            }
            const quantity = (item.contexts as Array<{ quantityShipped?: number }> | undefined)?.find((c) => c.quantityShipped != null)?.quantityShipped ?? item.contexts?.[0]?.quantityShipped ?? 1;
            const unitPrice = quantity > 0 ? Math.round((totalAmount + feeYen + adSpendYen + shippingYen) / quantity) : totalAmount;
            results.push({
              orderId,
              asin: item.contexts?.find((c) => c.asin)?.asin ?? null,
              sku: item.contexts?.find((c) => c.sku)?.sku ?? null,
              unitPrice,
              feeYen: Math.round(feeYen / quantity) || 0,
              adSpendYen: Math.round(adSpendYen / quantity) || 0,
              shippingYen: Math.round(shippingYen / quantity) || 0,
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
    const updatedSaleIds = new Set<string>();

    const tryUpdateSale = async (
      candidates: Array<{ id: string; product_id: string; quantity: number }>,
      r: { unitPrice: number; feeYen: number; adSpendYen: number; shippingYen: number; quantity: number },
      orderIdToSet?: string | null
    ): Promise<boolean> => {
      const avail = candidates.filter((c) => !updatedSaleIds.has(c.id));
      if (avail.length === 0) return false;
      const target = avail.sort((a, b) => 0)[0];
      const { data: prod } = await supabase.from('products').select('cost_yen').eq('id', target.product_id).single();
      const costYen = prod?.cost_yen ?? 0;
      const grossProfit = (r.unitPrice - r.feeYen - r.adSpendYen - r.shippingYen - costYen) * r.quantity;
      const updatePayload: Record<string, unknown> = {
        fee_yen: r.feeYen * r.quantity,
        shipping_yen: r.shippingYen * r.quantity,
        ad_spend_yen: r.adSpendYen * r.quantity,
        gross_profit_yen: grossProfit,
        unit_price_yen: r.unitPrice,
        quantity: r.quantity,
        updated_at: new Date().toISOString(),
      };
      if (orderIdToSet) updatePayload.amazon_order_id = orderIdToSet;
      const { error } = await supabase.from('sales').update(updatePayload).eq('id', target.id);
      if (!error) {
        updatedSaleIds.add(target.id);
        synced.push(`${target.id}`);
        return true;
      }
      return false;
    };

    for (const r of results) {
      const saleKey = `${r.orderId ?? 'unk'}-${r.postedDate}-${r.unitPrice}-${r.quantity}`;

      const tryMatchAndUpdate = async (
        candidates: Array<{ id: string; product_id: string; quantity: number }> | null,
        orderIdToSet?: string | null
      ): Promise<boolean> => {
        if (!candidates || candidates.length === 0) return false;
        return tryUpdateSale(candidates, r, orderIdToSet);
      };

      if (r.orderId) {
        let { data: dupList } = await supabase
          .from('sales')
          .select('id, product_id, quantity')
          .eq('user_id', user.id)
          .eq('amazon_order_id', r.orderId)
          .eq('sold_at', r.postedDate)
          .eq('unit_price_yen', r.unitPrice)
          .eq('quantity', r.quantity);
        if (!dupList || dupList.length === 0) {
          const res = await supabase
            .from('sales')
            .select('id, product_id, quantity')
            .eq('user_id', user.id)
            .eq('amazon_order_id', r.orderId)
            .eq('sold_at', r.postedDate)
            .eq('quantity', r.quantity)
            .gte('unit_price_yen', r.unitPrice - 3)
            .lte('unit_price_yen', r.unitPrice + 3);
          dupList = res.data ?? [];
        }
        if (await tryMatchAndUpdate(dupList ?? null)) continue;
        // フォールバック: amazon_order_id 未設定の売上を日付・単価・数量で検索（既存売上の orderId 欠落を補う）
        let { data: fallbackList } = await supabase
          .from('sales')
          .select('id, product_id, quantity')
          .eq('user_id', user.id)
          .eq('platform', 'amazon')
          .eq('sold_at', r.postedDate)
          .eq('unit_price_yen', r.unitPrice)
          .eq('quantity', r.quantity)
          .is('amazon_order_id', null);
        if (!fallbackList || fallbackList.length === 0) {
          const res = await supabase
            .from('sales')
            .select('id, product_id, quantity')
            .eq('user_id', user.id)
            .eq('platform', 'amazon')
            .eq('sold_at', r.postedDate)
            .eq('quantity', r.quantity)
            .gte('unit_price_yen', r.unitPrice - 3)
            .lte('unit_price_yen', r.unitPrice + 3)
            .is('amazon_order_id', null);
          fallbackList = res.data ?? [];
        }
        if (await tryMatchAndUpdate(fallbackList ?? null, r.orderId)) continue;
      } else {
        let { data: dupListByDate } = await supabase
          .from('sales')
          .select('id, product_id, quantity')
          .eq('user_id', user.id)
          .eq('platform', 'amazon')
          .eq('sold_at', r.postedDate)
          .eq('unit_price_yen', r.unitPrice)
          .eq('quantity', r.quantity);
        if (!dupListByDate || dupListByDate.length === 0) {
          const res = await supabase
            .from('sales')
            .select('id, product_id, quantity')
            .eq('user_id', user.id)
            .eq('platform', 'amazon')
            .eq('sold_at', r.postedDate)
            .eq('quantity', r.quantity)
            .gte('unit_price_yen', r.unitPrice - 3)
            .lte('unit_price_yen', r.unitPrice + 3);
          dupListByDate = res.data ?? [];
        }
        if (await tryMatchAndUpdate(dupListByDate ?? null)) continue;
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
              .select('id, cost_yen')
              .eq('user_id', user.id)
              .eq('platform', 'amazon')
              .or(orClause)
              .limit(1)
              .maybeSingle()
          : { data: null };

      const costYen = existingProduct?.cost_yen ?? 0;

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

      // 重複防止: orderId がある場合、単価がずれていても既存売上があれば UPDATE する（INSERT しない）
      if (r.orderId) {
        const { data: existingByOrder } = await supabase
          .from('sales')
          .select('id, product_id, quantity')
          .eq('user_id', user.id)
          .eq('amazon_order_id', r.orderId)
          .eq('sold_at', r.postedDate)
          .eq('quantity', r.quantity);
        if (existingByOrder && existingByOrder.length > 0 && (await tryUpdateSale(existingByOrder, r))) continue;
      }
      // 同様に orderId なしでも sold_at + unit_price + quantity で既存があれば UPDATE して重複を防ぐ
      const { data: existingByKeys } = await supabase
        .from('sales')
        .select('id, product_id, quantity')
        .eq('user_id', user.id)
        .eq('platform', 'amazon')
        .eq('sold_at', r.postedDate)
        .eq('unit_price_yen', r.unitPrice)
        .eq('quantity', r.quantity);
      if (existingByKeys && existingByKeys.length > 0 && (await tryUpdateSale(existingByKeys, r, r.orderId ?? undefined))) continue;

      const grossProfit = (r.unitPrice - r.feeYen - r.adSpendYen - r.shippingYen - costYen) * r.quantity;
      const totalFeeYen = r.feeYen * r.quantity;
      const totalShippingYen = r.shippingYen * r.quantity;
      const { error: saleErr } = await supabase.from('sales').insert({
        user_id: user.id,
        product_id: productId,
        quantity: r.quantity,
        unit_price_yen: r.unitPrice,
        platform: 'amazon',
        fee_rate_percent: 0,
        fee_yen: totalFeeYen,
        shipping_yen: totalShippingYen,
        gross_profit_yen: grossProfit,
        sold_at: r.postedDate,
        ad_spend_yen: r.adSpendYen * r.quantity,
        amazon_order_id: r.orderId ?? undefined,
      });

      if (!saleErr) synced.push(saleKey);
    }

    // --- 在庫同期: FBA + FBM を SKU ベースで反映 ---
    // FBM取得に必要な sellerId は環境変数 AMAZON_SELLER_ID で指定（Seller Central の商取引アカウント ID）
    const sellerId = process.env.AMAZON_SELLER_ID?.trim();
    let inventoryUpdated = 0;
    let fbaSkusFound = 0;
    let fbaByAsinCount = 0;
    let amazonProductsCount = 0;
    try {
      // sellerId が無くても FBA 在庫は取得可能（getInventorySummaries は sellerId 不要）
      const hasSellerIdForFbm = !!sellerId;

      const fbaMap = new Map<string, { qty: number; productName: string }>();
      const fbaByAsin = new Map<string, { qty: number; sku: string | null; productName: string }>();

      // FBA在庫取得（getInventorySummaries）
      let nextToken: string | undefined;
      do {
        if (fbaMap.size > 0) await sleep(2100); // 0.5 req/sec
        const fbaRes = await spClient.callAPI({
          operation: 'getInventorySummaries',
          endpoint: 'fbaInventory',
          query: {
            granularityType: 'Marketplace',
            granularityId: JAPAN_MARKETPLACE,
            marketplaceIds: [JAPAN_MARKETPLACE],
            details: true,
            ...(nextToken && { nextToken }),
          },
        });
        // レスポンスは payload 経由や pagination マージで返る場合がある
        const rawRes = fbaRes as Record<string, unknown>;
        const fbaPayload = (rawRes?.payload as Record<string, unknown>) ?? rawRes;
        // ライブラリは pagination + payload をマージして返す: { nextToken, inventorySummaries, granularity } 等
        const summariesRaw = fbaRes?.inventorySummaries ?? fbaPayload?.inventorySummaries ?? (rawRes?.payload as Record<string, unknown>)?.inventorySummaries ?? rawRes?.inventorySummaries ?? rawRes?.InventorySummaries ?? [];
        const summaries = Array.isArray(summariesRaw) ? summariesRaw : [];
        nextToken = (fbaRes?.nextToken ?? fbaPayload?.nextToken ?? rawRes?.nextToken) as string | undefined;
        type SummaryItem = {
          sellerSku?: string;
          SellerSku?: string;
          asin?: string;
          Asin?: string;
          fulfillableQuantity?: number;
          FulfillableQuantity?: number;
          totalQuantity?: number;
          TotalQuantity?: number;
          productName?: string;
          ProductName?: string;
          inventoryDetails?: { fulfillableQuantity?: number; FulfillableQuantity?: number };
          InventoryDetails?: { fulfillableQuantity?: number; FulfillableQuantity?: number };
        };
        // inventoryDetails のキーが表記揺れ（Unicode等）の場合に備え、オブジェクト走査で quantity を探す
        const extractFulfillable = (obj: unknown): number | undefined => {
          if (obj == null || typeof obj !== 'object') return undefined;
          const o = obj as Record<string, unknown>;
          for (const k of ['fulfillableQuantity', 'FulfillableQuantity'] as const) {
            const v = o[k];
            if (typeof v === 'number') return v;
          }
          const keys = Object.keys(o).filter((key) => /fulfillable/i.test(key));
          for (const key of keys) {
            const v = o[key];
            if (typeof v === 'number') return v;
          }
          return undefined;
        };
        const getDetails = (obj: Record<string, unknown>) => {
          const d = obj.inventoryDetails ?? obj.InventoryDetails;
          if (d && typeof d === 'object') return d as Record<string, unknown>;
          const key = Object.keys(obj).find((k) => /inventorydetail/i.test(k.replace(/\s|\u200B|\u200C|\u200D|\uFEFF/g, '')));
          return key ? (obj[key] as Record<string, unknown>) : undefined;
        };
        for (const s of summaries as SummaryItem[]) {
          const sku = s.sellerSku ?? s.SellerSku;
          const asinVal = s.asin ?? s.Asin;
          const details = getDetails(s as Record<string, unknown>);
          const qty =
            s.fulfillableQuantity ?? s.FulfillableQuantity ??
            extractFulfillable(details) ??
            s.totalQuantity ?? s.TotalQuantity ?? 0;
          const productName = s.productName ?? s.ProductName ?? `Amazon ${sku ?? asinVal ?? '?'}`;
          if (sku) fbaMap.set(sku, { qty, productName });
          if (asinVal) fbaByAsin.set(asinVal, { qty, sku: sku ?? null, productName });
        }
      } while (nextToken);
      fbaSkusFound = fbaMap.size;
      fbaByAsinCount = fbaByAsin.size;

      // FBAに在庫がありproductsに無いSKU → 新規商品作成（売上なしでも出品中商品を一覧に表示するため）
      const existingSkuSet = new Set<string>();
      // 全Amazon商品を取得し、SKU/ASINのいずれかがあるものを対象（.or構文の互換性問題を回避）
      const { data: allAmazon } = await supabase
        .from('products')
        .select('id, sku, asin')
        .eq('user_id', user.id)
        .eq('platform', 'amazon');
      const amazonProducts = (allAmazon ?? []).filter((p) => (p.sku?.trim() ?? '') !== '' || (p.asin?.trim() ?? '') !== '');
      amazonProductsCount = amazonProducts.length;

      const existingAsinSet = new Set<string>();
      for (const p of amazonProducts ?? []) {
        if (p.sku?.trim()) existingSkuSet.add(p.sku.trim());
        if (p.asin?.trim()) existingAsinSet.add(p.asin.trim());
      }
      for (const [sku, { qty, productName }] of fbaMap) {
        if (qty <= 0 || existingSkuSet.has(sku)) continue;
        const fbaAsin = [...fbaByAsin.entries()].find(([, v]) => v.sku === sku)?.[0];
        if (fbaAsin && existingAsinSet.has(fbaAsin)) continue;
        const { data: newProd } = await supabase
          .from('products')
          .insert({
            user_id: user.id,
            name: productName,
            cost_yen: 0,
            stock: qty,
            platform: 'amazon',
            sku,
            asin: fbaAsin ?? undefined,
            sku_locked: true,
            stock_received_at: new Date().toISOString().slice(0, 10),
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (newProd) {
          existingSkuSet.add(sku);
          inventoryUpdated += 1;
          const now = new Date().toISOString();
          await supabase.from('product_location_stock').upsert(
            [
              { product_id: newProd.id, location: 'home', quantity: 0, updated_at: now },
              { product_id: newProd.id, location: 'warehouse', quantity: 0, updated_at: now },
              { product_id: newProd.id, location: 'fba', quantity: qty, updated_at: now },
            ],
            { onConflict: 'product_id,location' }
          );
        }
      }

      // 大文字小文字を無視したマッチ（FBAとDBで表記揺れがある場合対応）
      const getFbaBySku = (k: string) =>
        fbaMap.get(k) ?? [...fbaMap.entries()].find(([x]) => x?.toLowerCase() === k?.toLowerCase())?.[1];
      const getFbaByAsin = (a: string) =>
        fbaByAsin.get(a) ?? [...fbaByAsin.entries()].find(([x]) => x?.toLowerCase() === a?.toLowerCase())?.[1];

      const productsToUpdate = amazonProducts ?? [];
      for (const p of productsToUpdate) {
        const sku = p.sku?.trim();
        const asin = p.asin?.trim();
        if (!sku && !asin) continue;

        let qty: number | undefined = sku ? getFbaBySku(sku)?.qty : undefined;
        if (qty === undefined && asin) qty = getFbaByAsin(asin)?.qty;
        if (qty === undefined && hasSellerIdForFbm) {
          await sleep(250); // 0.2 req/sec
          const parseFbmQty = (res: Record<string, unknown>) => {
            const avail =
              res?.fulfillmentAvailability ??
              res?.fulfillment_availability ??
              (res?.summaries as Array<{ fulfillmentAvailability?: Array<{ quantity?: number }> }>)?.[0]?.fulfillmentAvailability;
            if (Array.isArray(avail) && avail.length > 0) {
              return (avail as Array<{ quantity?: number }>).reduce((sum, a) => sum + (a.quantity ?? 0), 0);
            }
            return undefined;
          };
          const parseSearchResults = (res: { summaries?: Array<{ fulfillmentAvailability?: Array<{ quantity?: number }> }> }) => {
            const summs = res?.summaries;
            if (!Array.isArray(summs) || summs.length === 0) return undefined;
            return summs.reduce((s, x) => s + ((x.fulfillmentAvailability ?? []).reduce((a, f) => a + (f.quantity ?? 0), 0)), 0);
          };
          if (sku && !sku.startsWith('pr_')) {
            // FBM: SKUがAmazon形式（pr_以外）なら getListingsItem
            try {
              const listingRes = await spClient.callAPI({
                operation: 'getListingsItem',
                endpoint: 'listingsItems',
                path: { sellerId: sellerId!, sku },
                query: { marketplaceIds: JAPAN_MARKETPLACE, includedData: 'fulfillmentAvailability' },
                options: { version: '2021-08-01' as const },
              }) as Record<string, unknown>;
              qty = parseFbmQty(listingRes);
            } catch {
              /* SKU未登録等はスキップ */
            }
          }
          if (qty === undefined && asin) {
            // FBM: SKUがpr_等で使えない場合、ASINで searchListingsItems
            try {
              const searchRes = await spClient.callAPI({
                operation: 'searchListingsItems',
                endpoint: 'listingsItems',
                path: { sellerId: sellerId! },
                query: {
                  marketplaceIds: [JAPAN_MARKETPLACE],
                  identifiers: asin,
                  identifiersType: 'ASIN',
                  includedData: 'fulfillmentAvailability',
                },
                options: { version: '2021-08-01' as const },
              }) as { summaries?: Array<{ fulfillmentAvailability?: Array<{ quantity?: number }> }> };
              qty = parseSearchResults(searchRes);
            } catch {
              /* ASIN検索失敗はスキップ */
            }
          }
        }
        // FBA/FBMでマッチしなかった商品は更新しない（0で上書きして既存在庫を消さない）
        if (qty === undefined) continue;

        const finalQty = qty;

        const { error: updErr } = await supabase
          .from('products')
          .update({
            stock: finalQty,
            stock_received_at: new Date().toISOString().slice(0, 10),
            updated_at: new Date().toISOString(),
          })
          .eq('id', p.id);

        if (!updErr) {
          inventoryUpdated += 1;
          const now = new Date().toISOString();
          // product_location_stock: FBA在庫は fba、FBM在庫は warehouse（家は常に0）
          const isFba = (sku && (getFbaBySku(sku)?.qty ?? 0) > 0) || (asin && (getFbaByAsin(asin)?.qty ?? 0) > 0);
          await supabase.from('product_location_stock').upsert(
            [
              { product_id: p.id, location: 'home', quantity: 0, updated_at: now },
              { product_id: p.id, location: 'warehouse', quantity: isFba ? 0 : finalQty, updated_at: now },
              { product_id: p.id, location: 'fba', quantity: isFba ? finalQty : 0, updated_at: now },
            ],
            { onConflict: 'product_id,location' }
          );
        }
      }
    } catch (invErr) {
      const invErrMsg = (invErr as Error)?.message ?? String(invErr);
      console.warn('Amazon inventory sync warning:', invErr);
      // 診断用: FBA APIエラー時はレスポンスに含める（403=ロール不足、スニペット参照）
      return NextResponse.json({
        ok: true,
        transactionsFound: results.length,
        synced: synced.length,
        inventoryUpdated,
        inventoryError: invErrMsg.includes('Access') || invErrMsg.includes('denied') || invErrMsg.includes('403')
          ? 'FBA在庫APIが拒否されました。SPPで「在庫と注文の追跡」ロールが承認済みか確認してください。'
          : invErrMsg,
      });
    }

    const debug = fbaSkusFound > 0 && inventoryUpdated === 0
      ? '※FBA取得済みだが在庫更新0件。SKU/ASIN不一致の可能性→/api/amazon-diagnostic で確認'
      : undefined;

    return NextResponse.json({
      ok: true,
      transactionsFound: results.length,
      synced: synced.length,
      inventoryUpdated,
      fbaSkusFound,
      fbaByAsinCount,
      amazonProductsCount,
      ...(debug && { debug }),
    });
  } catch (e) {
    const err = e as Error & { response?: { body?: string } };
    let msg = err?.message ?? String(e);
    const rawBody = err?.response?.body;
    if (rawBody) {
      try {
        const body = JSON.parse(rawBody) as { errors?: Array<{ message?: string }>; message?: string };
        const apiMsg = body?.errors?.[0]?.message ?? body?.message;
        if (apiMsg) msg = apiMsg;
      } catch {
        // 非JSON応答（例: "An error occurred"）の場合は生のテキストを使用
        msg = rawBody.length > 200 ? rawBody.slice(0, 200) + '...' : rawBody;
      }
    }
    if (msg.includes('Unexpected token') && msg.includes('not valid JSON')) {
      msg =
        'Amazon APIの応答が不正です。Vercelの環境変数（AMAZON_REFRESH_TOKEN等）が正しく設定されているか確認してください。';
    }
    console.error('Amazon sync error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
