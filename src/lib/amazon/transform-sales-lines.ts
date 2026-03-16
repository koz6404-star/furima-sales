/**
 * Amazon raw → amazon_sales_lines 変換
 * Phase 3: 1注文1商品行の売上明細を生成
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type OrderPayload = {
  AmazonOrderId?: string;
  amazonOrderId?: string;
  PurchaseDate?: string;
  purchaseDate?: string;
  FulfillmentChannel?: string;
  fulfillmentChannel?: string;
  OrderStatus?: string;
  orderStatus?: string;
  [key: string]: unknown;
};

type OrderItemPayload = {
  OrderItemId?: string;
  orderItemId?: string;
  ASIN?: string;
  asin?: string;
  SellerSKU?: string;
  sellerSKU?: string;
  Title?: string;
  title?: string;
  QuantityOrdered?: number;
  quantityOrdered?: number;
  QuantityShipped?: number;
  quantityShipped?: number;
  ItemPrice?: { Amount?: string; amount?: string; CurrencyCode?: string };
  itemPrice?: { Amount?: string; amount?: string; CurrencyCode?: string };
  [key: string]: unknown;
};

function toYMD(val: string | undefined): string {
  if (!val) return '';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** 金額を円の整数に変換。null/undefined は null を返す（sales_amount_yen を NULL 許容にしたため） */
function parseAmount(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return isNaN(val) ? null : Math.round(val);
  const s = String(val).replace(/,/g, '').trim();
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n);
}

function mapFulfillment(ch?: string): 'FBA' | 'FBM' | null {
  if (!ch) return null;
  const u = ch.toUpperCase();
  if (u === 'AFN') return 'FBA';
  if (u === 'MFN') return 'FBM';
  return null;
}

/** sales_state 算出（除外条件ベース） */
type SalesState = 'confirmed' | 'pending_price' | 'canceled' | 'other_excluded';
function resolveSalesState(orderStatus: string | undefined, hasItemPrice: boolean): SalesState {
  const status = (orderStatus ?? '').trim();
  if (status === 'Pending' || status === 'PendingAvailability') return 'pending_price';
  if (status === 'Canceled') return 'canceled';
  if (hasItemPrice) return 'confirmed';
  return 'other_excluded';
}

export interface TransformSalesLinesResult {
  processed: number;
  saved: number;
  skipped: number;
  errors: string[];
}

/**
 * raw テーブルから amazon_sales_lines を生成
 * 再実行時は upsert で上書き
 */
export async function transformRawToSalesLines(
  supabase: SupabaseClient,
  userId: string
): Promise<TransformSalesLinesResult> {
  const result: TransformSalesLinesResult = {
    processed: 0,
    saved: 0,
    skipped: 0,
    errors: [],
  };

  const { data: items, error: itemsErr } = await supabase
    .from('amazon_order_items_raw')
    .select('source_key, payload_json, fetched_at')
    .eq('user_id', userId)
    .order('fetched_at', { ascending: false });

  if (itemsErr) {
    result.errors.push(`OrderItems fetch: ${itemsErr.message}`);
    return result;
  }

  if (!items || items.length === 0) {
    return result;
  }

  const orderIds = new Set<string>();
  for (const row of items) {
    const parts = (row.source_key as string).split('|');
    if (parts[0]) orderIds.add(parts[0]);
  }

  const { data: orders, error: ordersErr } = await supabase
    .from('amazon_orders_raw')
    .select('source_key, payload_json')
    .eq('user_id', userId)
    .in('source_key', [...orderIds]);

  if (ordersErr) {
    result.errors.push(`Orders fetch: ${ordersErr.message}`);
    return result;
  }

  const orderMap = new Map<string, OrderPayload>(
    (orders ?? []).map((o) => [o.source_key as string, o.payload_json as OrderPayload])
  );

  for (const row of items) {
    result.processed++;
    const payload = row.payload_json as OrderItemPayload;
    if (!payload) {
      result.skipped++;
      continue;
    }

    const sourceKey = row.source_key as string;
    const [orderId, orderItemId] = sourceKey.split('|');
    if (!orderId || !orderItemId) {
      result.skipped++;
      continue;
    }

    const order = orderMap.get(orderId);
    if (!order) {
      result.errors.push(`Order not found: ${orderId}`);
      result.skipped++;
      continue;
    }

    const purchaseDate = order.PurchaseDate ?? order.purchaseDate ?? '';
    const orderDate = toYMD(purchaseDate);
    if (!orderDate) {
      result.skipped++;
      continue;
    }

    const quantity = payload.QuantityOrdered ?? payload.quantityOrdered ?? payload.QuantityShipped ?? payload.quantityShipped ?? 1;
    const itemPrice = payload.ItemPrice ?? payload.itemPrice;
    const amountStr = itemPrice?.Amount ?? itemPrice?.amount;
    const amountParsed = parseAmount(amountStr);
    const hasItemPrice = amountParsed != null;
    const orderStatus = order.OrderStatus ?? order.orderStatus ?? '';
    const salesState = resolveSalesState(orderStatus, hasItemPrice);
    const salesAmountYen = salesState === 'confirmed' ? amountParsed! : null;
    const fulfillmentChannel = order.FulfillmentChannel ?? order.fulfillmentChannel ?? '';
    const fulfillmentType = mapFulfillment(fulfillmentChannel);

    const line = {
      user_id: userId,
      order_id: orderId,
      order_item_id: orderItemId,
      order_date: orderDate,
      sku: payload.SellerSKU ?? payload.sellerSKU ?? null,
      asin: payload.ASIN ?? payload.asin ?? null,
      product_name: payload.Title ?? payload.title ?? null,
      quantity: Math.max(1, quantity),
      sales_amount_yen: salesAmountYen,
      sales_state: salesState,
      fulfillment_type: fulfillmentType,
      fee_status: 'pending',
      fee_amount_yen: 0,
      fetched_at: row.fetched_at,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await supabase
      .from('amazon_sales_lines')
      .upsert(line, { onConflict: 'user_id,order_id,order_item_id', ignoreDuplicates: false });

    if (upsertErr) {
      result.errors.push(`Upsert ${orderId}/${orderItemId}: ${upsertErr.message}`);
      result.skipped++;
    } else {
      result.saved++;
    }
  }

  return result;
}
