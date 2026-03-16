/**
 * Amazon SP-API 共通エラーハンドリング
 * API失敗時に何が失敗したかわかるようにする
 */

const LOG_PREFIX = '[Amazon]';

export type AmazonApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CREDENTIALS_MISSING'
  | 'INVALID_REFRESH_TOKEN'
  | 'RATE_LIMITED'
  | 'INVALID_INPUT'
  | 'RESOURCE_NOT_FOUND'
  | 'API_ERROR'
  | 'UNKNOWN';

export interface AmazonApiError {
  code: AmazonApiErrorCode;
  message: string;
  details?: string;
  raw?: unknown;
}

/**
 * API エラーを正規化して返す
 */
export function normalizeAmazonError(error: unknown): AmazonApiError {
  const err = error as Error & { response?: { body?: string; statusCode?: number } };
  const msg = err?.message ?? String(error);
  const rawBody = err?.response?.body;
  const statusCode = err?.response?.statusCode;

  let details = '';
  if (rawBody) {
    try {
      const parsed = JSON.parse(rawBody) as { errors?: Array<{ message?: string; code?: string }>; message?: string };
      const apiMsg = parsed?.errors?.[0]?.message ?? parsed?.message;
      if (apiMsg) details = apiMsg;
      else details = rawBody.length > 500 ? rawBody.slice(0, 500) + '...' : rawBody;
    } catch {
      details = rawBody.length > 500 ? rawBody.slice(0, 500) + '...' : rawBody;
    }
  }

  const lowerMsg = (msg + details).toLowerCase();

  let code: AmazonApiErrorCode = 'API_ERROR';
  if (lowerMsg.includes('credentials missing') || lowerMsg.includes('refresh_token')) {
    code = 'CREDENTIALS_MISSING';
  } else if (lowerMsg.includes('invalid refresh token') || lowerMsg.includes('invalid_grant')) {
    code = 'INVALID_REFRESH_TOKEN';
  } else if (statusCode === 401 || lowerMsg.includes('unauthorized')) {
    code = 'UNAUTHORIZED';
  } else if (statusCode === 403 || lowerMsg.includes('access') || lowerMsg.includes('denied') || lowerMsg.includes('forbidden')) {
    code = 'FORBIDDEN';
  } else if (statusCode === 429 || lowerMsg.includes('rate') || lowerMsg.includes('throttl')) {
    code = 'RATE_LIMITED';
  } else if (statusCode === 404 || lowerMsg.includes('not found')) {
    code = 'RESOURCE_NOT_FOUND';
  } else if (lowerMsg.includes('invalid') || lowerMsg.includes('bad request')) {
    code = 'INVALID_INPUT';
  }

  return {
    code,
    message: details || msg,
    details: details || undefined,
    raw: rawBody ? { statusCode, body: details } : undefined,
  };
}

/**
 * エラーをログ出力し、人間が読めるメッセージを返す
 */
export function logAmazonError(context: string, error: unknown): string {
  const normalized = normalizeAmazonError(error);
  const displayMsg = normalized.details || normalized.message;

  console.error(`${LOG_PREFIX} ${context}:`, {
    code: normalized.code,
    message: displayMsg,
  });

  const userMessages: Record<AmazonApiErrorCode, string> = {
    CREDENTIALS_MISSING:
      'Amazon SP-API の認証情報が設定されていません。SELLING_PARTNER_APP_CLIENT_ID, SELLING_PARTNER_APP_CLIENT_SECRET, AMAZON_REFRESH_TOKEN を確認してください。',
    INVALID_REFRESH_TOKEN:
      'リフレッシュトークンが無効です。AMAZON_SP_API_SETUP.md の手順で再取得してください。',
    UNAUTHORIZED: '認証に失敗しました。リフレッシュトークンが期限切れの可能性があります。',
    FORBIDDEN:
      'API へのアクセスが拒否されました。開発者コンソールで必要なロール（在庫と注文の追跡、財務会計など）が承認済みか確認してください。',
    RATE_LIMITED: 'レート制限に達しました。しばらく待ってから再試行してください。',
    INVALID_INPUT: `リクエストが不正です: ${displayMsg}`,
    RESOURCE_NOT_FOUND: `リソースが見つかりません: ${displayMsg}`,
    API_ERROR: displayMsg || 'Amazon API でエラーが発生しました。',
    UNKNOWN: displayMsg || '不明なエラーが発生しました。',
  };

  return userMessages[normalized.code] ?? userMessages.API_ERROR;
}

/**
 * ログ出力（デバッグ・情報用）
 */
export function logAmazonInfo(context: string, data: Record<string, unknown>): void {
  console.info(`${LOG_PREFIX} ${context}:`, data);
}
