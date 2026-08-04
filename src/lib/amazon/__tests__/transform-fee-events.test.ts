import { describe, it, expect } from 'vitest';
import { dedupeSnapshotRows, isAdjustmentTypeFeeLike } from '../transform-fee-events';

type Row = {
  id: string;
  order_id: string | null;
  transaction_type: string;
  payload_json: unknown;
  posted_date: string | null;
  fetched_at: string | null;
};

function row(over: Partial<Row> & { id: string }): Row {
  return {
    order_id: 'ORDER-1',
    transaction_type: 'ShipmentEventList',
    payload_json: {},
    posted_date: '2026-07-01',
    fetched_at: '2026-07-02T00:00:00Z',
    ...over,
  };
}

describe('dedupeSnapshotRows', () => {
  // 正常系1: 同一注文の重複スナップショットは最新の fetched_at 1件だけ残る
  it('同一 (type, order_id, posted_date) は最新の fetched_at のみ残す', () => {
    const rows = [
      row({ id: 'a', fetched_at: '2026-07-02T00:00:00Z' }),
      row({ id: 'b', fetched_at: '2026-07-05T00:00:00Z' }),
      row({ id: 'c', fetched_at: '2026-07-03T00:00:00Z' }),
    ];
    const { kept, deduped } = dedupeSnapshotRows(rows);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe('b');
    expect(deduped).toBe(2);
  });

  // 正常系2: 別注文・別計上日は残る
  it('order_id か posted_date が違えば別イベントとして残す', () => {
    const rows = [
      row({ id: 'a', order_id: 'ORDER-1', posted_date: '2026-07-01' }),
      row({ id: 'b', order_id: 'ORDER-2', posted_date: '2026-07-01' }),
      row({ id: 'c', order_id: 'ORDER-1', posted_date: '2026-07-02' }),
    ];
    const { kept, deduped } = dedupeSnapshotRows(rows);
    expect(kept).toHaveLength(3);
    expect(deduped).toBe(0);
  });

  // 正常系3: Adjustment / ServiceFee は payload 完全一致でまとめる
  it('AdjustmentEventList は payload が完全一致するものだけまとめる', () => {
    const same = { PostedDate: '2026-07-01T09:29:31Z', AdjustmentType: 'PostageBilling_Postage', AdjustmentAmount: { CurrencyCode: 'JPY', CurrencyAmount: -168 } };
    const rows = [
      row({ id: 'a', transaction_type: 'AdjustmentEventList', order_id: null, payload_json: same }),
      row({ id: 'b', transaction_type: 'AdjustmentEventList', order_id: null, payload_json: { ...same } }),
      // 時刻が違う＝別の請求なので残る
      row({ id: 'c', transaction_type: 'AdjustmentEventList', order_id: null, payload_json: { ...same, PostedDate: '2026-07-01T18:00:00Z' } }),
      // 金額が違う＝別の請求なので残る
      row({ id: 'd', transaction_type: 'AdjustmentEventList', order_id: null, payload_json: { ...same, AdjustmentAmount: { CurrencyCode: 'JPY', CurrencyAmount: -175 } } }),
    ];
    const { kept, deduped } = dedupeSnapshotRows(rows);
    expect(kept).toHaveLength(3);
    expect(deduped).toBe(1);
  });

  // 正常系5: payload のキー順が違っても同一とみなす
  it('payload のキー順が違っても同一請求としてまとめる', () => {
    const rows = [
      row({ id: 'a', transaction_type: 'ServiceFeeEventList', order_id: null, payload_json: { A: 1, B: { C: 2, D: 3 } } }),
      row({ id: 'b', transaction_type: 'ServiceFeeEventList', order_id: null, payload_json: { B: { D: 3, C: 2 }, A: 1 } }),
    ];
    const { kept, deduped } = dedupeSnapshotRows(rows);
    expect(kept).toHaveLength(1);
    expect(deduped).toBe(1);
  });

  // 正常系6: 未知の transaction_type は素通しする
  it('未知の transaction_type は重複排除せず素通しする', () => {
    const rows = [
      row({ id: 'a', transaction_type: 'ProductAdsPaymentEventList' }),
      row({ id: 'b', transaction_type: 'ProductAdsPaymentEventList' }),
    ];
    const { kept, deduped } = dedupeSnapshotRows(rows);
    expect(kept).toHaveLength(2);
    expect(deduped).toBe(0);
  });

  // 正常系4: RefundEventList もスナップショットとして重複排除の対象
  it('RefundEventList も重複排除する', () => {
    const rows = [
      row({ id: 'a', transaction_type: 'RefundEventList', fetched_at: '2026-07-01T00:00:00Z' }),
      row({ id: 'b', transaction_type: 'RefundEventList', fetched_at: '2026-07-09T00:00:00Z' }),
    ];
    const { kept, deduped } = dedupeSnapshotRows(rows);
    expect(kept.map((r) => r.id)).toEqual(['b']);
    expect(deduped).toBe(1);
  });

  // 異常系1: order_id が列にない場合は payload から拾って同一視する
  it('order_id が null でも payload の AmazonOrderId で同一判定する', () => {
    const rows = [
      row({ id: 'a', order_id: null, payload_json: { AmazonOrderId: 'ORDER-9' } }),
      row({ id: 'b', order_id: null, payload_json: { AmazonOrderId: 'ORDER-9' }, fetched_at: '2026-07-10T00:00:00Z' }),
    ];
    const { kept, deduped } = dedupeSnapshotRows(rows);
    expect(kept.map((r) => r.id)).toEqual(['b']);
    expect(deduped).toBe(1);
  });

  // 異常系2: fetched_at が null でも落ちず、1件は必ず残る
  it('fetched_at が全て null でも1件残す', () => {
    const rows = [
      row({ id: 'a', fetched_at: null }),
      row({ id: 'b', fetched_at: null }),
    ];
    const { kept, deduped } = dedupeSnapshotRows(rows);
    expect(kept).toHaveLength(1);
    expect(deduped).toBe(1);
  });

  // 異常系3: posted_date が null でも payload の PostedDate にフォールバックする
  it('posted_date が null なら payload の PostedDate を使う', () => {
    const rows = [
      row({ id: 'a', posted_date: null, payload_json: { PostedDate: '2026-07-01T00:00:00Z' } }),
      row({ id: 'b', posted_date: null, payload_json: { PostedDate: '2026-07-05T00:00:00Z' } }),
    ];
    const { kept } = dedupeSnapshotRows(rows);
    expect(kept).toHaveLength(2);
  });

  // 異常系4: 空配列
  it('空配列でも落ちない', () => {
    const { kept, deduped } = dedupeSnapshotRows([]);
    expect(kept).toEqual([]);
    expect(deduped).toBe(0);
  });

  // 異常系5: payload_json が null でも落ちない
  it('payload_json が null でも落ちない', () => {
    const rows = [row({ id: 'a', order_id: null, payload_json: null })];
    expect(() => dedupeSnapshotRows(rows)).not.toThrow();
    expect(dedupeSnapshotRows(rows).kept).toHaveLength(1);
  });
});

describe('isAdjustmentTypeFeeLike（回帰）', () => {
  it('PostageBilling / PostageRefund で始まるものだけ手数料扱い', () => {
    expect(isAdjustmentTypeFeeLike('PostageBilling_VAT')).toBe(true);
    expect(isAdjustmentTypeFeeLike('PostageRefund')).toBe(true);
    expect(isAdjustmentTypeFeeLike('OtherAdjustment')).toBe(false);
    expect(isAdjustmentTypeFeeLike('')).toBe(false);
  });
});
