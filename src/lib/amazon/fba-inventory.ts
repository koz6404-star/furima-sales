/**
 * FBA Inventory API 呼び出し（Phase 5）
 * getInventorySummaries で在庫サマリーを取得
 */
import { JAPAN_MARKETPLACE } from '@/lib/amazon-sp-api';
import { callAmazonApi } from './client';

const FBA_INVENTORY_DELAY_MS = 550; // restore_rate 0.5 = 2 req/sec

export interface InventorySummaryPayload {
  asin?: string;
  fnSku?: string;
  sellerSku?: string;
  condition?: string;
  inventoryDetails?: {
    fulfillableQuantity?: number;
    inboundWorkingQuantity?: number;
    inboundShippedQuantity?: number;
    inboundReceivingQuantity?: number;
    reservedQuantity?: { totalReservedQuantity?: number; [key: string]: unknown };
    researchingQuantity?: { totalResearchingQuantity?: number; [key: string]: unknown };
    unfulfillableQuantity?: { totalUnfulfillableQuantity?: number; [key: string]: unknown };
  };
  lastUpdatedTime?: string;
  productName?: string;
  totalQuantity?: number;
  [key: string]: unknown;
}

export interface GetInventorySummariesResult {
  granularity?: { granularityType?: string; granularityId?: string };
  inventorySummaries?: InventorySummaryPayload[];
  nextToken?: string;
}

export interface GetInventorySummariesParams {
  details?: boolean;
  nextToken?: string;
}

/**
 * FBA 在庫サマリーを取得
 * ページネーションに対応し、全件取得まで繰り返す
 */
export async function getInventorySummaries(
  params: GetInventorySummariesParams = {}
): Promise<GetInventorySummariesResult> {
  const query: Record<string, string | boolean | string[] | undefined> = {
    marketplaceIds: [JAPAN_MARKETPLACE],
    granularityType: 'Marketplace',
    granularityId: JAPAN_MARKETPLACE,
    details: params.details ?? true,
    ...(params.nextToken && { nextToken: params.nextToken }),
  };

  const res = await callAmazonApi<
    GetInventorySummariesResult | { payload?: GetInventorySummariesResult }
  >(
    'getInventorySummaries',
    'fbaInventory',
    { query },
    {
      delayBeforeMs: FBA_INVENTORY_DELAY_MS,
      context: 'fbaInventory.getInventorySummaries',
    }
  );

  const payload = (res as { payload?: GetInventorySummariesResult }).payload;
  if (payload) {
    return payload;
  }
  return res as GetInventorySummariesResult;
}
