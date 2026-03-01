/**
 * 市松模様（白・薄いグレー）のピクセルを透明に変換する
 * 使用方法: node scripts/remove-checkerboard.mjs
 */
import sharp from 'sharp';
import { rename } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const imagesDir = join(publicDir, 'images');

/** 市松模様の色かどうか（白 or 薄いグレー R=G=B） */
function isCheckerboardPixel(r, g, b) {
  const diff = Math.max(r, g, b) - Math.min(r, g, b);
  if (diff > 8) return false; // 柴のクリーム色などを除外
  const v = (r + g + b) / 3;
  return v >= 168; // 白(255)〜グレー(170前後)を対象
}

async function processImage(inputPath, outputPath) {
  const tempPath = outputPath + '.tmp.png';
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (isCheckerboardPixel(r, g, b)) {
      data[i + 3] = 0; // 透明に
    }
  }

  await sharp(data, { raw: { width, height, channels } })
    .png()
    .toFile(tempPath);
  await rename(tempPath, outputPath);
  console.log(`  ✓ ${outputPath}`);
}

async function main() {
  const targets = [
    { input: join(publicDir, 'shiba-registration.png'), output: join(publicDir, 'shiba-registration.png') },
    { input: join(imagesDir, 'mcgSbmtM.png'), output: join(imagesDir, 'mcgSbmtM.png') },
  ];

  console.log('市松模様を除去しています...');
  for (const { input, output } of targets) {
    try {
      await processImage(input, output);
    } catch (err) {
      console.error(`  ✗ ${input}:`, err.message);
    }
  }
  console.log('完了しました。');
}

main();
