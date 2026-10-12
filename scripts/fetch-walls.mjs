/**
 * 抓取「印象同济」的校园照片当壁纸。
 *
 * 站点：https://photo.tongji.edu.cn/tp/tpxq.htm?type=5&id=<ID>
 * 页面上的图片是异步拉的，真正的数据在这个接口：
 *   /dynamic/cm-sites-custom/info/getDetailById?id=<ID>&type=5
 * 拿到 storageFile.path 后，把路径里的 /storage/ 换成 /readStorage/ 就是原图。
 *
 * ⚠️ 不要用 smallPath / midPath：那两个路径返回的是「system not found fileInfo!」
 * 这串文本（状态码还是 200），curl -o 出来的 .jpg 只有 27 字节。
 *
 * 原图动辄 7MB、7952×4473，原样放进仓库会让首屏体积爆炸，
 * 所以抓下来统一压到 1600px 宽、quality 82 —— 当壁纸足够，体积掉一个数量级。
 *
 * 用法：node scripts/fetch-walls.mjs [--force]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';

const SITE = 'https://photo.tongji.edu.cn';
const OUT = 'public/images/walls';

/** 分类 -> [名字, 页面 id]。命名即分组，顺序即面板里的展示顺序 */
const SEASONS = [
	['春', [
		['图书馆', '6391768d34b3d3b3d38f11b20'],
		['樱花大道', '67d3ea4c39303930398d1f980'],
		['三好坞', '67f3679f39303930398a0ff70'],
		['国立柱', '693135df39303930398a5e830'],
	]],
	['夏', [
		['三好坞', '6391768d34b3d3b3d38f0c9b0'],
		['国立柱', '681d64df39303930398c34990'],
		['桥', '6a477826ce5a1037f04b22f40'],
	]],
	['秋', [
		['国立柱', '6391768d34b3d3b3d38f06670'],
		['桥', '6ab487dbce5a1037f0c2606b0'],
	]],
	['冬', [
		['国立柱', '6391768d34b3d3b3d38f04a70'],
		['三好坞', '677cd75b39303930398bc5810'],
		['校门', '693135df39303930398a58d60'],
	]],
	['夜', [
		['三好坞', '6391768d34b3d3b3d38efd110'],
		['图书馆', '6391768d34b3d3b3d38efde30'],
		['国立柱', '6391768d34b3d3b3d38efcff0'],
	]],
];

const force = process.argv.includes('--force');
/**
 * 下载到文件。原图 7MB 起，校园网/代理慢时 60 秒未必够，
 * 所以给到 180 秒，并且在失败时自动重试两次（接口偶发 5xx）。
 */
const curl = (url, out) => {
	let last;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			execFileSync('curl', ['-sS', '--max-time', '180', '-o', out, url], { stdio: 'pipe' });
			return;
		} catch (e) {
			last = e;
		}
	}
	throw last;
};

let ok = 0;
let skipped = 0;
const made = [];

for (const [season, items] of SEASONS) {
	for (const [name, id] of items) {
		const file = join(OUT, `${season}-${name}.jpg`);
		if (existsSync(file) && !force) {
			skipped += 1;
			continue;
		}
		const raw = join(tmpdir(), `wall-${id}.json`);
		curl(`${SITE}/dynamic/cm-sites-custom/info/getDetailById?id=${id}&type=5`, raw);
		const detail = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(raw, 'utf8')));
		const path = detail?.data?.storageFile?.path;
		if (!path) {
			console.log(`  ✗ ${season}-${name}：接口没给出图片路径`);
			continue;
		}
		// /storage/xxx → /readStorage/xxx 才是能下载的原图
		const img = join(tmpdir(), `wall-${id}.jpg`);
		curl(`${SITE}${path.replace('/storage/', '/readStorage/')}`, img);
		try {
			await sharp(img)
				.resize({ width: 1600, withoutEnlargement: true })
				.jpeg({ quality: 82, mozjpeg: true })
				.toFile(file);
			const size = (await import('node:fs').then((fs) => fs.statSync(file).size)) / 1024;
			made.push(`${season}-${name}.jpg ${size.toFixed(0)}KB`);
			ok += 1;
		} catch (e) {
			console.log(`  ✗ ${season}-${name}：${e.message}`);
		}
	}
}

rmSync(join(OUT, 'README.md'), { force: true });
writeFileSync(
	join(OUT, 'README.md'),
	'# 壁纸\n\n来源：「印象同济」photo.tongji.edu.cn，按季节分组。\n\n' +
		'重新抓取：`node scripts/fetch-walls.mjs`（已存在则跳过，`--force` 强制重抓）。\n\n' +
		'文件名即分组和地点：`春-图书馆.jpg`。日期与作者见各页面链接，未随文件保存。\n',
	'utf8',
);

console.log(`\n抓取完成：新抓 ${ok}，跳过 ${skipped}`);
for (const line of made) console.log('  ' + line);
