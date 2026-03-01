'use client';

import {
  getDaysSinceReceived,
  getStockAgeStatus,
  STOCK_AGE_BADGE_LABELS,
  STOCK_AGE_MESSAGES,
  type StockAgeStatus,
} from '@/lib/stock-age';

type Props = {
  oldestReceivedAt: string | Date | null | undefined;
  /** oldest_received_at が未設定の既存データ向けフォールバック */
  stockReceivedAt?: string | Date | null | undefined;
  stock: number;
  /** 商品一覧用: バッジのみ。詳細用: 文言も表示 */
  variant?: 'badge-only' | 'full';
};

/** 在庫ありかつ日付がある場合のみ表示（oldest_received_at 優先、なければ stock_received_at） */
export function StockAgeBadge({ oldestReceivedAt, stockReceivedAt, stock, variant = 'badge-only' }: Props) {
  const dateToUse = oldestReceivedAt || stockReceivedAt;
  if (stock <= 0 || !dateToUse) return null;

  const days = getDaysSinceReceived(dateToUse);
  const status = getStockAgeStatus(days);

  if (status === 'normal') return null;

  const badgeLabel = STOCK_AGE_BADGE_LABELS[status];
  const message = STOCK_AGE_MESSAGES[status];
  const daysText = days !== null ? `${days}日` : '';

  const badgeClass: Record<Exclude<StockAgeStatus, 'normal'>, string> = {
    attention: 'bg-amber-100 text-amber-800 border-amber-200',
    warning: 'bg-orange-100 text-orange-800 border-orange-200',
    danger: 'bg-red-100 text-red-800 border-red-200',
  };

  const badge = (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border text-sm font-medium shrink-0 w-fit ${badgeClass[status]}`}
    >
      {badgeLabel}
      {daysText && <span className="ml-1">({daysText})</span>}
    </span>
  );

  if (variant === 'badge-only') {
    return badge;
  }

  return (
    <div className="flex flex-col gap-1">
      {badge}
      <p className={`text-sm mt-1 ${
        status === 'attention' ? 'text-amber-700' :
        status === 'warning' ? 'text-orange-700' :
        'text-red-700'
      }`}>
        {message}
      </p>
    </div>
  );
}
