/**
 * 从 public/favicon.svg 生成 PWA / iOS 图标，输出到 public/icons/pwa/。
 *
 * 生成结果是**提交进仓库**的（图标很小，没必要每次构建都跑一遍 sharp）。
 * 改了 favicon.svg 之后手动跑一次：npm run icons:pwa
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public', 'favicon.svg');
const OUT = path.join(ROOT, 'public', 'icons', 'pwa');

/** maskable 图标四周留白与主题浅色背景一致，避免被系统裁切或出现透明边 */
const MASKABLE_SIZE = 512;
const MASKABLE_INSET = Math.round(MASKABLE_SIZE * 0.1);
const BACKGROUND = { r: 0xfe, g: 0xf7, b: 0xff, alpha: 1 };

await mkdir(OUT, { recursive: true });

const targets = [
	{ file: 'icon-192.png', size: 192 },
	{ file: 'icon-512.png', size: 512 },
	{ file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size } of targets) {
	await sharp(SRC).resize(size, size).png().toFile(path.join(OUT, file));
	console.log(`[icons:pwa] ${file} (${size}×${size})`);
}

// maskable：图案缩到 80%，四周用背景色补齐
await sharp(SRC)
	.resize(MASKABLE_SIZE - MASKABLE_INSET * 2, MASKABLE_SIZE - MASKABLE_INSET * 2)
	.extend({
		top: MASKABLE_INSET,
		bottom: MASKABLE_INSET,
		left: MASKABLE_INSET,
		right: MASKABLE_INSET,
		background: BACKGROUND,
	})
	.flatten({ background: BACKGROUND })
	.png()
	.toFile(path.join(OUT, 'icon-512-maskable.png'));
console.log(`[icons:pwa] icon-512-maskable.png (${MASKABLE_SIZE}×${MASKABLE_SIZE})`);
