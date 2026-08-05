import { describe, it, expect } from 'vitest';
import { fetchAllPages, fetchAllPagesIn } from '../fetch-all';

type Row = { id: number };

/** n 行を持つ擬似テーブルに対して range(from, to) を再現する */
function makeTable(total: number) {
  const rows: Row[] = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: Array<[number, number]> = [];
  const query = (from: number, to: number) => {
    calls.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  };
  return { query, calls };
}

describe('fetchAllPages', () => {
  it('正常系: 1,000 行を超えても全件取得する（既定上限で切れない）', async () => {
    const { query, calls } = makeTable(1626);
    const res = await fetchAllPages<Row>(query);

    expect(res.error).toBeNull();
    expect(res.truncated).toBe(false);
    expect(res.data).toHaveLength(1626);
    expect(res.data[0].id).toBe(0);
    expect(res.data[1625].id).toBe(1625);
    // 1000 / 626 の 2 ページに分割されている
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('正常系: 1,000 行未満なら 1 リクエストで終わる', async () => {
    const { query, calls } = makeTable(170);
    const res = await fetchAllPages<Row>(query);

    expect(res.data).toHaveLength(170);
    expect(calls).toHaveLength(1);
  });

  it('境界値: ちょうど 1,000 行のときも欠落しない', async () => {
    const { query, calls } = makeTable(1000);
    const res = await fetchAllPages<Row>(query);

    expect(res.data).toHaveLength(1000);
    // 1000 件返ったので次ページを確認しに行く（空が返って終了）
    expect(calls).toHaveLength(2);
  });

  it('異常系: 途中でエラーが出たら error を返し truncated=true にする', async () => {
    let n = 0;
    const res = await fetchAllPages<Row>(() => {
      n++;
      if (n === 1) {
        return Promise.resolve({
          data: Array.from({ length: 1000 }, (_, i) => ({ id: i })),
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: { message: 'boom' } });
    });

    expect(res.error).toBe('boom');
    expect(res.truncated).toBe(true);
    // 取れた分は捨てずに返す
    expect(res.data).toHaveLength(1000);
  });

  it('異常系: data が null でも空配列として扱い落ちない', async () => {
    const res = await fetchAllPages<Row>(() => Promise.resolve({ data: null, error: null }));

    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
  });
});

describe('fetchAllPagesIn', () => {
  it('正常系: in() の値をチャンクしても全件が結合される', async () => {
    const values = Array.from({ length: 450 }, (_, i) => `order-${i}`);
    const seen: string[][] = [];

    const res = await fetchAllPagesIn<Row>(
      values,
      (chunk, from, to) => {
        if (from === 0) seen.push(chunk);
        // チャンクごとに chunk.length 行返る想定
        const rows = from === 0 ? chunk.map((_, i) => ({ id: i })) : [];
        return Promise.resolve({ data: rows.slice(0, to - from + 1), error: null });
      },
      200,
    );

    expect(res.error).toBeNull();
    // 200 / 200 / 50 の 3 チャンク
    expect(seen.map((c) => c.length)).toEqual([200, 200, 50]);
    expect(res.data).toHaveLength(450);
  });

  it('異常系: チャンクの途中でエラーが出たら打ち切って error を返す', async () => {
    const values = Array.from({ length: 300 }, (_, i) => `o${i}`);
    let chunkNo = 0;

    const res = await fetchAllPagesIn<Row>(
      values,
      () => {
        chunkNo++;
        if (chunkNo === 1) return Promise.resolve({ data: [{ id: 1 }], error: null });
        return Promise.resolve({ data: null, error: { message: 'ng' } });
      },
      200,
    );

    expect(res.error).toBe('ng');
    expect(res.truncated).toBe(true);
    expect(res.data).toHaveLength(1);
  });

  it('正常系: 値が空なら 1 度もクエリせず空配列を返す', async () => {
    let called = 0;
    const res = await fetchAllPagesIn<Row>([], () => {
      called++;
      return Promise.resolve({ data: [], error: null });
    });

    expect(called).toBe(0);
    expect(res.data).toEqual([]);
    expect(res.error).toBeNull();
  });
});
