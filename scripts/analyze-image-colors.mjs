/**
 * 画像内の主な色をサンプリングして表示（市松模様の色特定用）
 */
import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

async function analyze(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const colors = new Map();
  const step = Math.max(1, Math.floor((width * height) / 500));
  for (let i = 0; i < data.length; i += step * channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = `${r},${g},${b}`;
    colors.set(key, (colors.get(key) || 0) + 1);
  }
  const sorted = [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log('\n' + path);
  sorted.forEach(([rgb, count]) => {
    const [r, g, b] = rgb.split(',').map(Number);
    const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
    const isGray = r === g && g === b;
    console.log(`  rgb(${r},${g},${b}) ${hex} count=${count} ${isGray ? '(gray)' : ''}`);
  });
}

async function main() {
  await analyze(join(publicDir, 'shiba-registration.png'));
  await analyze(join(publicDir, 'images', 'mcgSbmtM.png'));
}

main();
