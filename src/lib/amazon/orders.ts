/**
 * Amazon Orders API 呼び出し
 * Phase 2 で raw 保存するための基盤
 */
import { JAPAN_MARKETPLACE } from '@/lib/amazon-sp-api';
import { callOrdersApi } from './client';

/** 日付を ISO 8601 形式に変換（Orders API 用） */
export function toISO8601(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export interface GetOrdersParams {
  /** 取得開始日（必須） */
  createdAfter: Date;
  /** 取得終了日 */
  createdBefore?: Date;
  /** ページネーション */
  nextToken?: string;
  /** 1ページあたりの最大件数（最大100） */
  maxResultsPerPage?: number;
}

export interface AmazonOrder {
  AmazonOrderId: string;
  PurchaseDate: string;
  OrderStatus?: string;
  FulfillmentChannel?: string;
  NumberOfItemsShipped?: number;
  NumberOfItemsUnshipped?: number;
  [key: string]: unknown;
}

export interface GetOrdersResult {
  Orders?: AmazonOrder[];
  NextToken?: string;
  LastUpdatedBefore?: string;
  CreatedBefore?: string;
}

export interface OrderItem {
  OrderItemId: string;
  ASIN?: string;
  SellerSKU?: string;
  Title?: string;
  QuantityOrdered: number;
  QuantityShipped?: number;
  ItemPrice?: { CurrencyCode?: string; Amount?: string };
  [key: string]: unknown;
}

export interface GetOrderItemsResult {
  OrderItems?: OrderItem[];
  NextToken?: string;
  AmazonOrderId?: string;
}

/**
 * 注文一覧を取得（Orders API getOrders）
 */
export async function getOrders(params: GetOrdersParams): Promise<GetOrdersResult> {
  const query: Record<string, string | number | string[] | undefined> = {
    CreatedAfter: toISO8601(params.createdAfter),
    MarketplaceIds: [JAPAN_MARKETPLACE],
    ...(params.createdBefore && { CreatedBefore: toISO8601(params.createdBefore) }),
    ...(params.nextToken && { NextToken: params.nextToken }),
    ...(params.maxResultsPerPage && { MaxResultPerPage: params.maxResultsPerPage }),
  };

  const res = await callOrdersApi<GetOrdersResult | { payload?: GetOrdersResult }>(
    'getOrders',
    { query },
    { context: 'orders.getOrders' }
  );

  // レスポンスが payload でラップされている場合
  const payload = (res as { payload?: GetOrdersResult }).payload;
  if (payload) {
    return payload;
  }
  return res as GetOrdersResult;
}

/**
 * 注文詳細（商品行）を取得（Orders API getOrderItems）
 */
export async function getOrderItems(orderId: string, nextToken?: string): Promise<GetOrderItemsResult> {
  const query = nextToken ? { NextToken: nextToken } : undefined;
  const res = await callOrdersApi<GetOrderItemsResult | { payload?: GetOrderItemsResult }>(
    'getOrderItems',
    { path: { orderId }, query },
    { context: `orders.getOrderItems.${orderId}` }
  );

  const payload = (res as { payload?: GetOrderItemsResult }).payload;
  if (payload) {
    return payload;
  }
  return res as GetOrderItemsResult;
}
