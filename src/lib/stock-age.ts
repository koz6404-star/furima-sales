/**
 * 入荷からの経過日数に基づく不良在庫判定
 * 判定単位: SKUごと
 * 経過日数: oldest_received_at からの日数
 */

export type StockAgeStatus = 'normal' | 'attention' | 'warning' | 'danger';

const THRESHOLD_ATTENTION = 30;
const THRESHOLD_WARNING = 60;
const THRESHOLD_DANGER = 90;

/** 経過日数を算出（today - oldest_received_at） */
export function getDaysSinceReceived(oldestReceivedAt: string | Date | null | undefined): number | null {
  if (!oldestReceivedAt) return null;
  const d = typeof oldestReceivedAt === 'string' ? new Date(oldestReceivedAt) : oldestReceivedAt;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  return diff >= 0 ? diff : null;
}

/** 経過日数からステータスを判定 */
export function getStockAgeStatus(days: number | null): StockAgeStatus {
  if (days === null || days < THRESHOLD_ATTENTION) return 'normal';
  if (days < THRESHOLD_WARNING) return 'attention';
  if (days < THRESHOLD_DANGER) return 'warning';
  return 'danger';
}

/** 固定表示文言（30/60/90日のしきい値に対応） */
export const STOCK_AGE_MESSAGES: Record<Exclude<StockAgeStatus, 'normal'>, string> = {
  attention: '注意：入荷から30日。まだ寝てる？ 画像・タイトル・価格を叩き起こして見直そう',
  warning: '警告：入荷から60日。売れなさすぎて在庫が泣いてる。値下げ or 販路追加、今すぐ出動！',
  danger: '危険：入荷から90日。ここまで来たら伝説級。損切り（処分・セット化・投げ売り）で成仏させよう',
};

/** バッジ表示用テキスト */
export const STOCK_AGE_BADGE_LABELS: Record<Exclude<StockAgeStatus, 'normal'>, string> = {
  attention: '🟡注意',
  warning: '🟠警告',
  danger: '🔴危険',
};
