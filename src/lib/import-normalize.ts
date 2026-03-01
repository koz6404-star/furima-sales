/** Excel取込用の共通正規化ロジック（API/クライアント両方で使用） */

export interface ExcelRow {
  [key: string]: string | number | undefined;
}

export interface NormalizedProduct {
  sku?: string;
  name: string;
  costYen: number;
  stock: number;
  memo?: string;
  campaign?: string;
  size?: string;
  color?: string;
  imageRef?: string;
  /** 入荷日（出荷日から引用） YYYY-MM-DD */
  stockReceivedAt?: string;
}

const normalizeKey = (s: string) =>
  String(s).trim().toLowerCase().replace(/[\s　]/g, '');

const findColumn = (row: ExcelRow, candidates: string[]) => {
  for (const c of candidates) {
    const v = row[c];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  const keys = Object.keys(row);
  for (const k of keys) {
    const nk = normalizeKey(k);
    for (const c of candidates) {
      const nc = normalizeKey(c);
      if (!nc) continue;
      if (nk.includes(nc) || nc.includes(nk)) {
        const v = row[k];
        if (v !== undefined && v !== null && v !== '') return v;
      }
    }
  }
  return undefined;
};

const parseKikaku = (val: string): { size?: string; color?: string } => {
  if (!val || typeof val !== 'string') return {};
  let size: string | undefined;
  let color: string | undefined;
  const regex = /(?:^|[\s,，；;])(サイズ|規格|色)[:：]\s*([^,，；;\s]+(?=[,，；;\s]|$))/g;
  for (const m of val.matchAll(regex)) {
    if (m[1] === '色') color = m[2].trim();
    else size = m[2].trim();
  }
  return { size, color };
};

export function normalizeRow(row: ExcelRow): NormalizedProduct {
  const costVal = findColumn(row, [
    '1個あたりのコスト（円）',
    '1個あたりのコスト',
    '原価（税込）',
    '原価(税込)',
    '原価',
    'げんか',
    '成本',
    '仕入価格',
    'cost',
    'COST',
  ]);
  let stockVal = findColumn(row, [
    '商品数',
    '在庫数',
    '在庫',
    '仕入れ数',
    '仕入れの個数',
    '購入数',
    '購入した個数',
    '入荷数',
    'stock',
    'STOCK',
    '数量',
    '品数',
  ]);
  if (stockVal === undefined || stockVal === null || stockVal === '') {
    const stockKey = Object.keys(row).find((k) => {
      const nk = normalizeKey(k);
      const trimmed = k.trim().replace(/\uFEFF/g, '');
      return (
        nk.includes('商品数') ||
        nk.includes('shouhinsuu') ||
        nk === '品数' ||
        trimmed === '商品数'
      );
    });
    if (stockKey) stockVal = row[stockKey];
  }
  if (stockVal === undefined || stockVal === null || stockVal === '') {
    const keys = Object.keys(row);
    const fifthKey = keys[4];
    if (
      fifthKey &&
      (normalizeKey(keys[3] ?? '').includes('規格') || normalizeKey(fifthKey).includes('商品'))
    ) {
      const v = row[fifthKey];
      if (v !== undefined && v !== null && v !== '' && /^\d+$/.test(String(v).trim())) {
        stockVal = v;
      }
    }
  }
  const kikakuVal = findColumn(row, ['規格', 'サイズ', 'size', '色', 'カラー', 'color']);
  const parsed = parseKikaku(String(kikakuVal ?? ''));
  const sizeCol = findColumn(row, ['サイズ', 'size', 'SIZE', 'サイズ（cm）', 'サイズ(cm)']);
  const colorCol = findColumn(row, ['色', 'カラー', 'color', 'COLOR', 'colour']);
  const shippedAtVal = findColumn(row, ['出荷日', '入荷日', '仕入れ日', '発送日', 'ship_date', 'received_at']);
  const stockReceivedAt = parseDateForStock(shippedAtVal);
  return {
    sku: String(findColumn(row, ['THE CKB SKU', 'THE CKBSKU', 'SKU', 'sku', '品番', '商品コード']) ?? '').trim() || undefined,
    name: String(findColumn(row, ['商品名', 'name', '品名']) ?? '').trim(),
    costYen: Math.round(Number(costVal ?? 0)),
    stock: Math.max(0, Math.floor(Number(String(stockVal ?? '').replace(/[^\d.-]/g, '') || 0))),
    memo: String(findColumn(row, ['メモ', 'memo', '備考', '自由記入']) ?? '').trim() || undefined,
    campaign: String(findColumn(row, ['企画', 'キャンペーン', 'campaign']) ?? '').trim() || undefined,
    size: String(sizeCol ?? parsed.size ?? '').trim() || undefined,
    color: String(colorCol ?? parsed.color ?? '').trim() || undefined,
    imageRef: String(findColumn(row, ['画像', '画像ファイル', 'image', '写真', 'ファイル名']) ?? '').trim() || undefined,
    stockReceivedAt: stockReceivedAt || undefined,
  };
}

/** Excelの日付セル（数値・文字列・Date）を YYYY-MM-DD に変換 */
function parseDateForStock(val: string | number | undefined): string | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'object' && 'getFullYear' in val) {
    const d = val as Date;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const s = String(val).trim();
  if (!s) return null;
  const num = Number(s);
  if (!Number.isNaN(num) && num > 0) {
    const d = XLSXDateToJSDate(num);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const m2 = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return null;
}

function XLSXDateToJSDate(serial: number): Date {
  const utc = Math.floor(serial) - 25569;
  const date = new Date(utc * 86400 * 1000);
  return date;
}
