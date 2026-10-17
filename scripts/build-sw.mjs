/**
 * 构建后处理：生成 dist/sw.js 与 dist/version.json。
 *
 * 必须在 `astro build` **之后**运行 —— 它要扫描 dist/ 里真实存在的文件，
 * 才能算出准确的预缓存清单。`npm run build` 已经串好了。
 *
 * 单独调试：
 *   npm run build && node scripts/build-sw.mjs
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const TEMPLATE = path.join(ROOT, 'scripts', 'sw-template.js');

/**
 * 预缓存的"外壳"：
 *   - 所有页面 HTML（见下方扫描，排除 /apps/ 与未公开的 /guide/）
 *   - Astro 打包产物、mdui、PWA 图标
 *   - 正文用到的字体（Questrial 两个子集，几十 KB）
 *   - logo / favicon / manifest
 * 大件（/apps/**、/images/**、/vendor 其余、PDF 与数学字体）留给运行时按需缓存。
 */
const PRECACHE_DIRS = ['assets', 'vendor/mdui', 'icons/pwa'];
const PRECACHE_STATIC = [
	'/favicon.svg',
	'/favicon.ico',
	'/manifest.webmanifest',
	'/images/logo.svg',
	'/fonts/questrial-latin-400-normal.woff2',
	'/fonts/questrial-latin-ext-400-normal.woff2',
];
/** 不预缓存的页面：整体拷贝的原生应用 + 未公开的起始页 + 404（服务器返回 404 状态） */
const PRECACHE_PAGE_EXCLUDE = [/^\/apps\//, /^\/guide\//, /^\/404\.html$/];

if (!existsSync(DIST)) {
	console.error('[build-sw] 找不到 dist/，请先执行 astro build');
	process.exit(1);
}

/** 递归列出 dist/ 下的所有文件，返回相对 dist 的 POSIX 路径 */
async function walk(dir, prefix = '') {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			files.push(...(await walk(path.join(dir, entry.name), rel)));
		} else if (entry.isFile()) {
			files.push(rel);
		}
	}

	return files;
}

/** dist 里的 HTML 文件 → 对应的访问 URL（目录形式，便于 SW 用 caches.match 命中） */
function htmlToUrl(file) {
	if (file === 'index.html') return '/';
	if (file.endsWith('/index.html')) return `/${file.slice(0, -'index.html'.length)}`;
	return `/${file}`;
}

function buildId() {
	if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 8);
	try {
		return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT })
			.toString()
			.trim();
	} catch {
		return 'local';
	}
}

const files = await walk(DIST);

const pageUrls = files
	.filter((file) => file.endsWith('.html'))
	.map(htmlToUrl)
	.filter((url) => !PRECACHE_PAGE_EXCLUDE.some((re) => re.test(url)));

const dirUrls = files
	.filter((file) => PRECACHE_DIRS.some((dir) => file.startsWith(`${dir}/`)))
	.map((file) => `/${file}`);

const candidates = [...new Set([...pageUrls, ...PRECACHE_STATIC, ...dirUrls])];

// 丢掉 dist 里实际不存在的条目（例如某次构建没生成某个图标），并提示出来
const missing = candidates.filter((url) => !existsSync(path.join(DIST, url)));
for (const url of missing) {
	console.warn(`[build-sw] 预缓存条目不存在，已跳过：${url}`);
}
const precache = candidates.filter((url) => !missing.includes(url));

const BUILD_ID = buildId();
const BUILD_TIME = Date.now();

let sw = await readFile(TEMPLATE, 'utf8');
sw = sw.replace("'__BUILD_ID__'", JSON.stringify(BUILD_ID));
sw = sw.replace('__BUILD_TIME__', String(BUILD_TIME));
sw = sw.replace('__PRECACHE__', JSON.stringify(precache, null, '\t'));

if (sw.includes('__BUILD_ID__') || sw.includes('__BUILD_TIME__') || sw.includes('__PRECACHE__')) {
	console.error('[build-sw] 模板里仍有未替换的占位符，请检查 sw-template.js');
	process.exit(1);
}

await writeFile(path.join(DIST, 'sw.js'), sw);
await writeFile(
	path.join(DIST, 'version.json'),
	`${JSON.stringify({ id: BUILD_ID, time: BUILD_TIME }, null, '\t')}\n`,
);

console.log(
	`[build-sw] sw.js 已生成：版本 ${BUILD_ID}，预缓存 ${precache.length} 项` +
		`（${pageUrls.length} 个页面 + ${precache.length - pageUrls.length} 个静态资源）`,
);
