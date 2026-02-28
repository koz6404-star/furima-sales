#!/usr/bin/env node
/**
 * Excelテンプレートサンプルを生成
 * 実行: node scripts/generate-excel-template.mjs
 */
import * as XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'Excelテンプレートサンプル.xlsx');

const data = [
  ['SKU', '商品名', '原価（税込）', '在庫数', 'メモ'],
  ['A001', 'サンプル商品A', 1000, 5, 'テスト用'],
  ['A002', 'サンプル商品B', 2500, 3, ''],
  ['A003', 'サンプル商品C', 500, 10, '人気商品'],
];
const ws = XLSX.utils.aoa_to_sheet(data);
ws['!cols'] = [{ wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 20 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '商品一覧');
XLSX.writeFile(wb, outPath);
console.log('生成しました:', outPath);
