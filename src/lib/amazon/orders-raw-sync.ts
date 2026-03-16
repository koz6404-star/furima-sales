/**
 * Amazon Orders API → raw テーブル保存
 * Phase 2: 注文一覧・注文明細をそのまま保存
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrders, getOrderItems } from './orders';
import { sleep } from './client';
import { logAmazonInfo } from './errors';
import type { AmazonOrder } from './orders';

const SOURCE_API_ORDERS = 'orders.getOrders';
const SOURCE_API_ORDER_ITEMS = 'orders.getOrderItems';

/** レート制限: getOrderItems は 2 req/sec なので 500ms 待機 */
const ORDER_ITEMS_DELAY_MS = 550;

export interface SyncOrdersRawParams {
  /** 取得開始日 */
  createdAfter: Date;
  /** 取得終了日 */
  createdBefore?: Date;
  /** 注文本体のみ（商品行をスキップ）デバッグ用 */
  ordersOnly?: boolean;
}

export interface SyncOrdersRawResult {
  ordersFetched: number;
  ordersSaved: number;
  orderItemsFetched: number;
  orderItemsSaved: number;
  errors: string[];
}

/**
 * Orders API から取得し、raw テーブルに保存
 * 再取得時は upsert（source_key で重複時は payload_json, fetched_at を更新）
 */
export async function syncOrdersToRaw(
  supabase: SupabaseClient,
  userId: string,
  params: SyncOrdersRawParams
): Promise<SyncOrdersRawResult> {
  const result: SyncOrdersRawResult = {
    ordersFetched: 0,
    ordersSaved: 0,
    orderItemsFetched: 0,
    orderItemsSaved: 0,
    errors: [],
  };

  const fetchedAt = new Date().toISOString();
  let nextToken: string | undefined;

  do {
    const ordersRes = await getOrders({
      createdAfter: params.createdAfter,
      createdBefore: params.createdBefore,
      nextToken,
      maxResultsPerPage: 100,
    });

    const orders = ordersRes.Orders ?? [];
    result.ordersFetched += orders.length;

    for (const order of orders as AmazonOrder[]) {
      const orderId = order.AmazonOrderId ?? order.amazonOrderId;
      if (!orderId) continue;

      const sourceKey = String(orderId);
      const payloadJson = order as unknown as Record<string, unknown>;

      const { error: orderErr } = await supabase.from('amazon_orders_raw').upsert(
        {
          user_id: userId,
          fetched_at: fetchedAt,
          source_api: SOURCE_API_ORDERS,
          source_key: sourceKey,
          payload_json: payloadJson,
        },
        { onConflict: 'user_id,source_key', ignoreDuplicates: false }
      );

      if (orderErr) {
        result.errors.push(`Order ${orderId}: ${orderErr.message}`);
      } else {
        result.ordersSaved++;
      }

      if (!params.ordersOnly) {
        await sleep(ORDER_ITEMS_DELAY_MS);

        let itemsNextToken: string | undefined;
        do {
          const itemsRes = await getOrderItems(orderId, itemsNextToken);
          const items = itemsRes.OrderItems ?? [];
          result.orderItemsFetched += items.length;

          for (const item of items) {
            const itemId = item.OrderItemId ?? item.orderItemId ?? '';
            const itemSourceKey = `${orderId}|${itemId}`;
            const itemPayload = item as unknown as Record<string, unknown>;

            const { error: itemErr } = await supabase.from('amazon_order_items_raw').upsert(
              {
                user_id: userId,
                fetched_at: fetchedAt,
                source_api: SOURCE_API_ORDER_ITEMS,
                source_key: itemSourceKey,
                payload_json: itemPayload,
              },
              { onConflict: 'user_id,source_key', ignoreDuplicates: false }
            );

            if (itemErr) {
              result.errors.push(`OrderItem ${orderId}/${itemId}: ${itemErr.message}`);
            } else {
              result.orderItemsSaved++;
            }
          }

          itemsNextToken = itemsRes.NextToken;
          if (itemsNextToken) await sleep(ORDER_ITEMS_DELAY_MS);
        } while (itemsNextToken);
      }
    }

    nextToken = ordersRes.NextToken;
    if (nextToken) await sleep(1100);

    logAmazonInfo('syncOrdersToRaw', {
      pageOrders: orders.length,
      nextToken: !!nextToken,
    });
  } while (nextToken);

  return result;
}
