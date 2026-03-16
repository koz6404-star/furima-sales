/**
 * Amazon 出品レポート取得（Phase16 改修）
 *
 * Reports API の GET_MERCHANT_LISTINGS_ALL_DATA を使って
 * 全出品 SKU（FBA + FBM）を一括取得する。
 *
 * FBM 在庫同期で「まだ売れていない出品商品」を含めるために使用。
 */
import { createSpApiClient, JAPAN_MARKETPLACE } from '@/lib/amazon-sp-api';
import { logAmazonInfo } from './errors';

export interface MerchantListingRow {
  'seller-sku': string;
  'asin1': string;
  'item-name': string;
  'quantity': string;
  'fulfillment-channel': string;
  'status': string;
  'price': string;
  [key: string]: string;
}

/**
 * GET_MERCHANT_LISTINGS_ALL_DATA レポートをリクエスト・ダウンロードし、
 * パース済みの配列を返す。
 *
 * 内部で createReport → getReport（ポーリング） → download を行う。
 * レポート生成に数十秒〜数分かかる場合がある。
 */
export async function fetchMerchantListings(): Promise<MerchantListingRow[]> {
  const client = createSpApiClient();

  logAmazonInfo('fetchMerchantListings', { message: 'レポートをリクエスト中...' });

  const listings = await client.downloadReport({
    body: {
      reportType: 'GET_MERCHANT_LISTINGS_ALL_DATA',
      marketplaceIds: [JAPAN_MARKETPLACE],
    },
    interval: 10000, // 10秒ごとにポーリング
    download: {
      json: true,
      charset: 'utf-8',
    },
  });

  const rows = (listings ?? []) as MerchantListingRow[];

  logAmazonInfo('fetchMerchantListings', {
    message: `レポート取得完了: ${rows.length} 件`,
    sample: rows.slice(0, 2).map((r) => ({
      sku: r['seller-sku'],
      channel: r['fulfillment-channel'],
      status: r['status'],
    })),
  });

  return rows;
}

/**
 * レポートから FBM（DEFAULT チャンネル）の SKU だけを抽出する
 */
export function extractFbmSkus(listings: MerchantListingRow[]): string[] {
  return listings
    .filter((r) => r['fulfillment-channel'] === 'DEFAULT' && r['status'] === 'Active')
    .map((r) => r['seller-sku'])
    .filter(Boolean);
}
