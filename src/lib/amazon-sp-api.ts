/**
 * Amazon SP-API クライアント
 * 環境変数: SELLING_PARTNER_APP_CLIENT_ID, SELLING_PARTNER_APP_CLIENT_SECRET, AMAZON_REFRESH_TOKEN
 */
import { SellingPartner } from 'amazon-sp-api';

const JAPAN_REGION = 'fe';
const JAPAN_MARKETPLACE = 'A1VC38T7YXB528';

export function createSpApiClient() {
  const clientId = process.env.SELLING_PARTNER_APP_CLIENT_ID;
  const clientSecret = process.env.SELLING_PARTNER_APP_CLIENT_SECRET;
  const refreshToken = process.env.AMAZON_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Amazon SP-API credentials missing. Set SELLING_PARTNER_APP_CLIENT_ID, SELLING_PARTNER_APP_CLIENT_SECRET, AMAZON_REFRESH_TOKEN in env.'
    );
  }

  return new SellingPartner({
    region: JAPAN_REGION,
    refresh_token: refreshToken,
    credentials: {
      SELLING_PARTNER_APP_CLIENT_ID: clientId,
      SELLING_PARTNER_APP_CLIENT_SECRET: clientSecret,
    },
  });
}

export { JAPAN_REGION, JAPAN_MARKETPLACE };
