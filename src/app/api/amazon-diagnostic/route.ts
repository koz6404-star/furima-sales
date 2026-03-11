/**
 * Amazon API 診断用（原因調査）
 * 実際のレスポンス構造を返して確認する
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createSpApiClient, JAPAN_MARKETPLACE } from '@/lib/amazon-sp-api';

const API_TIME_OFFSET_MS = 10 * 60 * 1000;

function toISO(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const spClient = createSpApiClient();
    const apiNow = new Date(Date.now() - API_TIME_OFFSET_MS);
    const postedAfter = new Date(apiNow.getTime() - 7 * 864e5); // 直近7日

    const result: Record<string, unknown> = {};

    // 1. Finances API: 1件のトランザクション構造を取得
    try {
      const financeRes = await spClient.callAPI({
        operation: 'listTransactions',
        endpoint: 'finances',
        query: {
          postedAfter: toISO(postedAfter),
          marketplaceId: JAPAN_MARKETPLACE,
        },
        options: { version: '2024-06-19' as const },
      }) as { transactions?: unknown[]; Transactions?: unknown[] };
      const txs = financeRes.transactions ?? financeRes.Transactions ?? [];
      const tx = Array.isArray(txs) && txs.length > 0 ? txs[0] : null;
      const shipmentTx = (txs as Array<Record<string, unknown>>).find(
        (t) => (t.transactionType ?? t.TransactionType ?? '') === 'Shipment'
      );
      if (tx) {
        const t = tx as Record<string, unknown>;
        result.finances = {
          transactionsCount: txs.length,
          sample: {
            transactionType: t.transactionType ?? t.TransactionType,
            description: t.description ?? t.Description,
            totalAmount: t.totalAmount ?? t.TotalAmount,
            itemsCount: (t.items ?? t.Items) ? (t.items as unknown[] ?? t.Items as unknown[])?.length : 0,
            hasBreakdowns: !!(t.breakdowns ?? t.Breakdowns),
            breakdownsStructure: (JSON.stringify(t.breakdowns ?? t.Breakdowns ?? null) ?? '').slice(0, 2000),
            firstItem: (() => {
              const items = (t.items ?? t.Items) as Array<Record<string, unknown>> | undefined;
              const it = items?.[0];
              if (!it) return null;
              const ctx = (it.contexts ?? it.Contexts) as Array<{ asin?: string; sku?: string }> | undefined;
              return {
                totalAmount: it.totalAmount ?? it.TotalAmount,
                hasBreakdowns: !!(it.breakdowns ?? it.Breakdowns),
                breakdownsStructure: (JSON.stringify(it.breakdowns ?? it.Breakdowns ?? null) ?? '').slice(0, 1500),
                contextsAsin: ctx?.find((c) => c.asin)?.asin ?? null,
                contextsSku: ctx?.find((c) => c.sku)?.sku ?? null,
              };
            })(),
          },
          feeShippingFromShipment: shipmentTx ? (() => {
            const items = (shipmentTx.items ?? shipmentTx.Items) as Array<Record<string, unknown>> | undefined;
            const bd = items?.[0]?.breakdowns ?? items?.[0]?.Breakdowns ?? (items?.length === 1 ? (shipmentTx.breakdowns ?? shipmentTx.Breakdowns) : null);
            const parseAmt = (v: unknown) => (v && typeof v === 'object' && 'currencyAmount' in v ? (v as { currencyAmount?: number }).currencyAmount : (v as { CurrencyAmount?: number })?.CurrencyAmount) ?? 0;
            let f = 0; let s = 0;
            const scan = (list: unknown[]) => {
              for (const b of list as Array<{ breakdownType?: string; BreakdownType?: string; breakdownAmount?: unknown; BreakdownAmount?: unknown; breakdowns?: unknown; Breakdowns?: unknown }>) {
                const kids = b.breakdowns ?? b.Breakdowns;
                if (Array.isArray(kids) && kids.length > 0) { scan(kids); continue; }
                const amt = Math.abs(parseAmt(b.breakdownAmount ?? (b as { BreakdownAmount?: unknown }).BreakdownAmount));
                const t = ((b.breakdownType ?? (b as { BreakdownType?: string }).BreakdownType) || '').toLowerCase();
                if (t.includes('shipping') || (t.includes('postage') && !t.includes('vat'))) s += amt;
                else if (t.includes('commission') || t.includes('referral') || t.includes('fba') || t.includes('fee') || t.includes('vat')) f += amt;
              }
            };
            if (Array.isArray(bd)) scan(bd); else if (bd && typeof bd === 'object') scan(Array.isArray((bd as { breakdowns?: unknown }).breakdowns) ? (bd as { breakdowns: unknown[] }).breakdowns : []);
            return { feeYen: f, shippingYen: s };
          })() : null,
        };
      } else {
        result.finances = { transactionsCount: 0, message: '取引がありません（直近7日）' };
      }
    } catch (fe: unknown) {
      result.finances = { error: (fe as Error)?.message ?? String(fe) };
    }

    // 2. FBA Inventory API: レスポンス構造を取得
    try {
      const fbaRes = await spClient.callAPI({
        operation: 'getInventorySummaries',
        endpoint: 'fbaInventory',
        query: {
          granularityType: 'Marketplace',
          granularityId: JAPAN_MARKETPLACE,
          marketplaceIds: [JAPAN_MARKETPLACE],
          details: true,
        },
      }) as Record<string, unknown>;
      const summaries = fbaRes?.inventorySummaries ?? fbaRes?.InventorySummaries ?? fbaRes?.payload;
      const arr = Array.isArray(summaries) ? summaries : (summaries as Record<string, unknown>)?.inventorySummaries ?? (summaries as Record<string, unknown>)?.InventorySummaries;
      const list = Array.isArray(arr) ? arr : [];
      result.fbaInventory = {
        topLevelKeys: Object.keys(fbaRes),
        summariesCount: list.length,
        sampleItem: list[0] ? {
          keys: Object.keys(list[0] as object),
          ...(list[0] as Record<string, unknown>),
        } : null,
      };
    } catch (fb: unknown) {
      result.fbaInventory = { error: (fb as Error)?.message ?? String(fb) };
    }

    // 3. FBM在庫用: 商取引アカウントID（AMAZON_SELLER_ID）の確認
    const sellerId = process.env.AMAZON_SELLER_ID?.trim();
    result.fbmSetup = {
      hasSellerId: !!sellerId,
      note: !sellerId
        ? 'FBM（自社発送）在庫取得には AMAZON_SELLER_ID が必要です。新規作成ではなく、既存のセラーアカウントに付いているIDです。セラーセントラル → 設定 → 出品用アカウント情報 → 出品者情報 → 出品者トークン（A1で始まる13〜14桁）。Vercelの環境変数に追加して再デプロイしてください。'
        : undefined,
    };

    // 4. DB上のAmazon商品（SKU/ASIN照合用サンプル）
    try {
      const { data: dbProducts } = await supabase
        .from('products')
        .select('id, name, sku, asin, stock, platform')
        .eq('user_id', user.id)
        .eq('platform', 'amazon')
        .limit(10);
      result.dbAmazonProducts = dbProducts ?? [];
    } catch (db: unknown) {
      result.dbAmazonProducts = { error: (db as Error)?.message ?? String(db) };
    }

    // 5. 重複疑いの販売履歴チェック（キャンディ等で件数が実際より多い場合の診断）
    try {
      const { data: amazonSales } = await supabase
        .from('sales')
        .select('id, product_id, sold_at, unit_price_yen, quantity, amazon_order_id')
        .eq('user_id', user.id)
        .eq('platform', 'amazon');
      const sales = amazonSales ?? [];
      const byProduct = new Map<string, { count: number; name: string; rows: typeof sales }>();
      // 同一 orderId+sold_at+quantity+product_id で複数ある = 真の重複（同商品が同じ注文で重複登録）
      const orderProductGroups = new Map<string, typeof sales>();
      for (const s of sales) {
        const k = `${s.amazon_order_id ?? 'null'}-${s.sold_at}-${s.quantity}-${s.product_id}`;
        if (!orderProductGroups.has(k)) orderProductGroups.set(k, []);
        orderProductGroups.get(k)!.push(s);
      }
      const duplicateOrderKeys = [...orderProductGroups.entries()].filter(([, v]) => v.length > 1);
      const { data: prods } = await supabase
        .from('products')
        .select('id, name')
        .eq('user_id', user.id);
      const prodMap = new Map((prods ?? []).map((p) => [p.id, p.name]));
      for (const s of sales) {
        const name = prodMap.get(s.product_id) ?? '(不明)';
        if (!byProduct.has(s.product_id)) {
          byProduct.set(s.product_id, { count: 0, name, rows: [] });
        }
        const ent = byProduct.get(s.product_id)!;
        ent.count += s.quantity;
        ent.rows.push(s);
      }
      const productSummary = [...byProduct.entries()].map(([pid, v]) => ({
        product_id: pid,
        name: v.name,
        sale_count: v.count,
        record_count: v.rows.length,
        duplicateOrderIds: [...new Set(v.rows
          .filter((r) => r.amazon_order_id && orderProductGroups.get(`${r.amazon_order_id}-${r.sold_at}-${r.quantity}-${r.product_id}`)?.length > 1)
          .map((r) => r.amazon_order_id!))],
      }));
      result.duplicateCheck = {
        totalAmazonSales: sales.length,
        duplicateOrderGroups: duplicateOrderKeys.length,
        duplicateOrderSamples: duplicateOrderKeys.slice(0, 5).map(([k, v]) => ({ key: k, count: v.length, ids: v.map((s) => s.id) })),
        productSummary: productSummary.sort((a, b) => b.record_count - a.record_count).slice(0, 20),
      };
    } catch (dc: unknown) {
      result.duplicateCheck = { error: (dc as Error)?.message ?? String(dc) };
    }

    result._help = {
      sellerId: '商取引アカウントID = 既に持っているAmazon出品者アカウントのID。新規作成不要。セラーセントラルで確認し、Vercel環境変数 AMAZON_SELLER_ID に設定。',
      fbmAsin: 'FBM商品でSKUがpr_形式の場合、ASINで在庫検索します。AMAZON_SELLER_ID設定が必要。',
    };

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({
      error: (e as Error)?.message ?? String(e),
    }, { status: 500 });
  }
}
