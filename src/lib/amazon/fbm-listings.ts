/**
 * Listings Items API 呼び出し（Phase14）
 * FBM（自己発送）商品の出品在庫数を SKU 単位で取得
 *
 * 使用 API: GET /listings/2021-08-01/items/{sellerId}/{sku}
 * Rate limit: 5 req/sec → 210ms 間隔
 *
 * 事前条件: 環境変数 AMAZON_SELLER_ID にセラーIDを設定
 */
import { JAPAN_MARKETPLACE } from '@/lib/amazon-sp-api';
import { callAmazonApi } from './client';

const FBM_LISTINGS_DELAY_MS = 210; // 5 req/sec

export interface FbmListingItem {
  sku: string;
  asin: string | null;
  itemName: string | null;
  listingStatus: string | null;
  /** DEFAULT チャンネル（自己発送）の出品在庫数 */
  quantity: number;
}

type ListingsItemResponse = {
  sku?: string;
  summaries?: Array<{
    marketplaceId?: string;
    asin?: string;
    itemName?: string;
    status?: string[];
    [key: string]: unknown;
  }>;
  fulfillmentAvailability?: Array<{
    fulfillmentChannelCode?: string;
    quantity?: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

/**
 * 1 SKU の Listings Item 情報（在庫数・ASIN・出品ステータス）を取得
 * @returns FbmListingItem、または API エラー時は null
 */
export async function getFbmListingItem(sku: string): Promise<FbmListingItem | null> {
  const sellerId = process.env.AMAZON_SELLER_ID;
  if (!sellerId) {
    throw new Error('AMAZON_SELLER_ID が設定されていません。.env.local に追加してください。');
  }

  const res = await callAmazonApi<ListingsItemResponse>(
    'getListingsItem',
    'listingsItems',
    {
      path: { sellerId, sku: encodeURIComponent(sku) },
      query: {
        marketplaceIds: [JAPAN_MARKETPLACE],
        includedData: ['summaries', 'fulfillmentAvailability'],
      },
    },
    {
      delayBeforeMs: FBM_LISTINGS_DELAY_MS,
      context: `listingsItems.getListingsItem`,
    }
  );

  const summaries = res?.summaries ?? [];
  const fulfillmentAvailability = res?.fulfillmentAvailability ?? [];

  const summary = summaries[0] ?? {};
  // "DEFAULT" = FBM 自己発送チャンネル
  const defaultFulfillment = fulfillmentAvailability.find(
    (f) => (f.fulfillmentChannelCode ?? '').toUpperCase() === 'DEFAULT'
  );

  return {
    sku,
    asin: summary.asin ?? null,
    itemName: summary.itemName ?? null,
    listingStatus: summary.status?.[0] ?? null,
    quantity: defaultFulfillment?.quantity ?? 0,
  };
}
