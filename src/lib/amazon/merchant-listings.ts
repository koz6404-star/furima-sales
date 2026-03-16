/**
 * Amazon 出品レポート取得（Phase16 改修）
 *
 * Reports API の GET_MERCHANT_LISTINGS_ALL_DATA を使って
 * 全出品 SKU（FBA + FBM）を一括取得する。
 *
 * 日本マーケットプレイスではカラム名が日本語:
 *   出品者SKU / フルフィルメント・チャンネル / ステータス / 商品名 / 商品ID / 在庫数
 *
 * FBM 在庫同期で「まだ売れていない出品商品」を含めるために使用。
 */
import { createSpApiClient, JAPAN_MARKETPLACE } from '@/lib/amazon-sp-api';
import { logAmazonInfo } from './errors';

export interface MerchantListingRow {
  [key: string]: string;
}

// 日本語カラム名のマッピング
const COL_SKU = '出品者SKU';
const COL_CHANNEL = 'フルフィルメント・チャンネル';
const COL_STATUS = 'ステータス';

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
    interval: 10000,
    download: {
      json: true,
      charset: 'Shift_JIS',
    },
  });

  const rows = (listings ?? []) as MerchantListingRow[];

  if (rows.length > 0) {
    // チャンネル別の件数を集計
    const channelCounts: Record<string, number> = {};
    for (const r of rows) {
      const ch = r[COL_CHANNEL] ?? 'unknown';
      channelCounts[ch] = (channelCounts[ch] ?? 0) + 1;
    }
    logAmazonInfo('fetchMerchantListings', {
      message: `レポート取得完了: ${rows.length} 件`,
      channelCounts,
    });
  } else {
    logAmazonInfo('fetchMerchantListings', { message: 'レポート取得完了: 0 件' });
  }

  return rows;
}

/**
 * レポートから FBM（自己発送チャンネル）の SKU だけを抽出する。
 * 日本レポートでは フルフィルメント・チャンネル が「DEFAULT」= FBM。
 * ステータスが空 or Active 相当のものを対象にする。
 */
export function extractFbmSkus(listings: MerchantListingRow[]): string[] {
  return listings
    .filter((r) => {
      const channel = (r[COL_CHANNEL] ?? '').trim().toUpperCase();
      const status = (r[COL_STATUS] ?? '').trim();
      // DEFAULT = FBM。ステータスは日本語の場合もあるため、空でないもの全てを対象
      // （FBA は AMAZON_JP などの値になる）
      return channel === 'DEFAULT' && status !== '停止中';
    })
    .map((r) => r[COL_SKU])
    .filter(Boolean);
}
