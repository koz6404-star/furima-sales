/**
 * Amazon SP-API 共通クライアント層
 * レート制限・リトライ・エラーハンドリングを統一
 */
import { createSpApiClient } from '@/lib/amazon-sp-api';
import { logAmazonError } from './errors';

const DEFAULT_RETRY_DELAY_MS = 2000;
const DEFAULT_MAX_RETRIES = 2;
const RATE_LIMIT_DELAY_MS = 1100; // Orders API: 1 req/sec

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface CallApiOptions {
  /** 呼び出し前に待機するミリ秒（レート制限対策） */
  delayBeforeMs?: number;
  /** リトライ回数（0 = リトライなし） */
  maxRetries?: number;
  /** リトライ待機ミリ秒 */
  retryDelayMs?: number;
  /** コンテキスト名（ログ用） */
  context?: string;
}

/**
 * callAPI をラップし、リトライ・レート制限・エラーハンドリングを適用
 */
export async function callAmazonApi<T>(
  operation: string,
  endpoint: string,
  params: { query?: Record<string, unknown>; path?: Record<string, string>; body?: unknown },
  options: CallApiOptions = {}
): Promise<T> {
  const {
    delayBeforeMs = 0,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    context = `${endpoint}.${operation}`,
  } = options;

  if (delayBeforeMs > 0) {
    await sleep(delayBeforeMs);
  }

  const client = createSpApiClient();
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await client.callAPI({
        operation,
        endpoint,
        ...(params.query ? { query: params.query } : {}),
        ...(params.path ? { path: params.path } : {}),
        ...(params.body !== undefined ? { body: params.body } : {}),
      });
      return result as T;
    } catch (e) {
      lastError = e;
      const errMsg = (e as Error)?.message ?? String(e);
      const isRetryable =
        attempt < maxRetries &&
        (errMsg.toLowerCase().includes('rate') ||
          errMsg.toLowerCase().includes('throttl') ||
          errMsg.toLowerCase().includes('timeout') ||
          (e as { response?: { statusCode?: number } })?.response?.statusCode === 429);

      if (isRetryable) {
        await sleep(retryDelayMs);
        continue;
      }
      throw e;
    }
  }

  const userMsg = logAmazonError(context, lastError);
  throw new Error(userMsg);
}

/**
 * Orders API 用: 1 req/sec を守るための待機付き呼び出し
 */
export async function callOrdersApi<T>(
  operation: string,
  params: { query?: Record<string, unknown>; path?: Record<string, string> },
  options: CallApiOptions = {}
): Promise<T> {
  return callAmazonApi<T>(
    operation,
    'orders',
    params,
    {
      ...options,
      delayBeforeMs: options.delayBeforeMs ?? RATE_LIMIT_DELAY_MS,
      context: options.context ?? `orders.${operation}`,
    }
  );
}
