/**
 * PostgREST は 1 リクエストあたり既定 1,000 行で静かに打ち切る。
 * エラーも警告も出ないため、集計系が「成功」を返しながら数字だけ欠ける。
 * （2026-08-04 CFO-025 / 2026-08-05 DEV-053 の真因）
 *
 * 集計・全件走査を目的とした select は必ずこのヘルパー経由で取得する。
 * 画面のページング表示など「1 ページだけ欲しい」用途では使わない。
 */
const PAGE_SIZE = 1000;
const HARD_LIMIT = 500_000; // 暴走ガード

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * range() でページングしながら全件取得する。
 *
 * @param buildQuery from/to を受け取り .range(from, to) を付けた PostgREST クエリを返す関数
 * @example
 *   const { data, error } = await fetchAllPages<Row>((from, to) =>
 *     supabase.from('amazon_fee_events')
 *       .select('order_id, fee_amount_yen')
 *       .eq('user_id', userId)
 *       .range(from, to)
 *   );
 */
export async function fetchAllPages<T>(
  buildQuery: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<{ data: T[]; error: string | null; truncated: boolean }> {
  const out: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) return { data: out, error: error.message, truncated: true };

    const rows = data ?? [];
    out.push(...rows);

    if (rows.length < PAGE_SIZE) break;
    if (out.length >= HARD_LIMIT) {
      return { data: out, error: `取得上限 ${HARD_LIMIT} 件に到達（想定外の件数）`, truncated: true };
    }
  }

  return { data: out, error: null, truncated: false };
}

/**
 * .in('col', values) は URL 長の制約もあるため、値側もチャンクして全件取得する。
 */
export async function fetchAllPagesIn<T>(
  values: string[],
  buildQuery: (chunk: string[], from: number, to: number) => PromiseLike<PageResult<T>>,
  chunkSize = 200,
): Promise<{ data: T[]; error: string | null; truncated: boolean }> {
  const out: T[] = [];

  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    const res = await fetchAllPages<T>((from, to) => buildQuery(chunk, from, to));
    out.push(...res.data);
    if (res.error) return { data: out, error: res.error, truncated: true };
  }

  return { data: out, error: null, truncated: false };
}
