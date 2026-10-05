/**
 * PDF 工具箱纯逻辑层的回归测试。
 *
 * 运行：npm run test:pdf
 * （先用 esbuild 把 src/lib/pdf-ops.ts 打成临时 ESM，
 *   再把 @cantoo/pdf-lib 挂到 globalThis.PDFLib —— 浏览器里用的是
 *   public/vendor/pdf/pdf-lib.min.js 这个 UMD 构建，API 一致）
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import * as PDFLibNamespace from '@cantoo/pdf-lib';

globalThis.PDFLib = PDFLibNamespace;
const { PDFDocument, StandardFonts, rgb } = globalThis.PDFLib;

/*
 * 字体环境：浏览器里是 /vendor/fontkit + /fonts/pdf/NotoSansSC-PDF.ttf，
 * Node 侧直接读仓库里的同一份文件，行为一致。
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fontkit = require('@cantoo/fontkit');

const cjkFontBytes = readFileSync('public/fonts/pdf/NotoSansSC-PDF.ttf');

/*
 * 检查产物元数据时必须关掉 updateMetadata：
 * load() 的构造函数默认会把 Producer 改写成 pdf-lib 自己，
 * 否则读到的是被“检查动作”污染过的值。
 */
const inspect = (bytes, options = {}) => PDFDocument.load(bytes, { updateMetadata: false, ...options });

const dir = mkdtempSync(join(tmpdir(), 'pdf-ops-'));
const bundle = join(dir, 'pdf-ops.mjs');
execFileSync(
	'npx',
	['esbuild', 'src/lib/pdf-ops.ts', '--bundle', '--format=esm', `--outfile=${bundle}`, '--log-level=error'],
	{ stdio: 'inherit' },
);

const ops = await import(pathToFileURL(bundle).href);
ops.registerFontEngine({ fontkit, cjkBytes: new Uint8Array(cjkFontBytes) });

let pass = 0;
let fail = 0;
const failures = [];

function ok(label, condition, detail = '') {
	if (condition) {
		pass++;
	} else {
		fail++;
		failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
	}
}

function eq(label, actual, expected) {
	ok(label, Object.is(actual, expected), `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

function throws(label, fragment, fn) {
	try {
		fn();
		ok(label, false, '没有抛错');
	} catch (error) {
		ok(label, fragment.test(String(error?.message ?? error)), `错误信息：${error?.message}`);
	}
}

async function rejects(label, fragment, fn) {
	try {
		await fn();
		ok(label, false, '没有抛错');
	} catch (error) {
		ok(label, fragment.test(String(error?.message ?? error)), `错误信息：${error?.message}`);
	}
}

/** 造一份 n 页、每页写着 pageN 的 PDF */
async function makeDoc(pages, { width = 300, height = 400, title } = {}) {
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	for (let i = 0; i < pages; i++) {
		const page = doc.addPage([width, height]);
		page.drawText(`page${i + 1}`, { x: 20, y: 200, size: 18, font, color: rgb(0, 0, 0.6) });
	}
	if (title) doc.setTitle(title);
	return doc.save();
}

/** 极简 PNG / JPEG 生成：交给 sharp */
const sharp = (await import('sharp')).default;
const pngBytes = await sharp({
	create: { width: 400, height: 260, channels: 3, background: { r: 200, g: 120, b: 60 } },
})
	.png()
	.toBuffer();
const jpgBytes = await sharp({
	create: { width: 300, height: 420, channels: 3, background: { r: 60, g: 120, b: 220 } },
})
	.jpeg()
	.toBuffer();

// ---------------------------------------------------------------- 纯函数

eq('formatBytes 0', ops.formatBytes(0), '0 B');
eq('formatBytes 1023', ops.formatBytes(1023), '1023 B');
eq('formatBytes 1KB', ops.formatBytes(1024), '1.0 KB');
eq('formatBytes 1MB', ops.formatBytes(1024 * 1024), '1.0 MB');
eq('formatBytes 负数', ops.formatBytes(-5), '—');

eq('formatPdfDate 空', ops.formatPdfDate(undefined), '');
eq('formatPdfDate 无效', ops.formatPdfDate(new Date('x')), '');
eq(
	'formatPdfDate 补零',
	ops.formatPdfDate(new Date(2026, 0, 2, 3, 4)),
	'2026-01-02 03:04',
);

{
	const parsed = ops.parseRanges('1-3, 5, 8-', 10);
	eq('parseRanges 数量', parsed.length, 3);
	eq('parseRanges 第1段', `${parsed[0].from}-${parsed[0].to}`, '1-3');
	eq('parseRanges 裸数字=单页', `${parsed[1].from}-${parsed[1].to}`, '5-5');
	eq('parseRanges 越界截断', `${parsed[2].from}-${parsed[2].to}`, '8-10');
}
eq('parseRanges 全角逗号', ops.parseRanges('1，2', 5).length, 2);
eq('parseRanges 开头省略', `${ops.parseRanges('-3', 9)[0].from}-${ops.parseRanges('-3', 9)[0].to}`, '1-3');
eq('parseRanges 顿号式分隔', ops.parseRanges('2;4', 5).length, 2);
throws('parseRanges 空输入', /请至少填写一个页码区间/, () => ops.parseRanges('  ', 5));
throws('parseRanges 非法字符', /无法识别的页码/, () => ops.parseRanges('abc', 5));
throws('parseRanges 起止颠倒', /区间起止颠倒/, () => ops.parseRanges('5-2', 10));
throws('parseRanges 超出范围', /超出文档范围/, () => ops.parseRanges('11', 10));
throws('parseRanges 零页', /必须从 1 开始/, () => ops.parseRanges('0-2', 10));

eq('sniffImageKind PNG', ops.sniffImageKind(pngBytes), 'png');
eq('sniffImageKind JPEG', ops.sniffImageKind(jpgBytes), 'jpg');
eq('sniffImageKind 其它', ops.sniffImageKind(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])), null);

eq('describePageSize A4 纵向', ops.describePageSize(595.28, 841.89), '595 × 842 pt（A4 纵向）');
eq('describePageSize Letter 横向', ops.describePageSize(792, 612), '792 × 612 pt（Letter 横向）');
eq('describePageSize 自定义', ops.describePageSize(200, 300), '200 × 300 pt');

ok('describeError 加密', ops.describeError(new Error('Input document to `PDFDocument.load` is encrypted')).includes('加密'));
ok('describeError 密码错误', ops.describeError(new Error('Password incorrect')).includes('密码不正确'));
ok('describeError 损坏', ops.describeError(new Error('Invalid PDF structure')).includes('不是有效的 PDF'));
ok('describeError 无头', ops.describeError(new Error('Failed to parse PDF document: No PDF header found')).includes('不是有效的 PDF'));
eq('describeError 原文透传', ops.describeError(new Error('boom')), 'boom');

// ---------------------------------------------------------------- 读 / 写元数据

const titled = await makeDoc(1, { title: '原始标题' });
{
	const meta = await ops.readMeta(titled);
	eq('readMeta 标题', meta.title, '原始标题');
	eq('readMeta 缺省作者', meta.author, '');
	ok('readMeta 生产者非空', meta.producer.length > 0, meta.producer);
}
{
	const written = await ops.writeMeta(titled, {
		title: '新标题',
		author: '张三',
		subject: '测试',
		keywords: 'PDF, 单元 , 测试、工具',
		creator: 'pdf-test',
	});
	const back = await ops.readMeta(written);
	eq('writeMeta 标题', back.title, '新标题');
	eq('writeMeta 作者', back.author, '张三');
	eq('writeMeta 主题', back.subject, '测试');
	// pdf-lib 的 setKeywords 用空格连接，落盘就是一个字符串
	eq('writeMeta 关键词', back.keywords, 'PDF 单元 测试 工具');
	eq('writeMeta 创建者', back.creator, 'pdf-test');
	ok('writeMeta 修改时间非空', back.modificationDate.length > 0);
	ok('writeMeta 页数不变', (await PDFDocument.load(written)).getPageCount() === 1);
}

// ---------------------------------------------------------------- 合并

{
	const a = await makeDoc(3);
	const b = await makeDoc(2);
	const merged = await ops.mergePdfs([
		{ name: 'a.pdf', bytes: a },
		{ name: 'b.pdf', bytes: b },
	]);
	const doc = await PDFDocument.load(merged);
	eq('合并页数', doc.getPageCount(), 5);
	eq('合并首页文本', (await ops.readMeta(merged)).title, '');
}
await rejects('合并空列表', /请先选择至少一个 PDF/, () => ops.mergePdfs([]));
{
	// 进度回调要真的走到 100%
	const seen = [];
	await ops.mergePdfs([{ name: 'a.pdf', bytes: await makeDoc(1) }], {
		updateProgress: (done, total, label) => seen.push([done, total, label]),
	});
	ok('合并进度回调有值', seen.length >= 2, `收到 ${seen.length} 次`);
	eq('合并进度收尾', seen[seen.length - 1][0], seen[seen.length - 1][1]);
}

// ---------------------------------------------------------------- 拆分

{
	const src = await makeDoc(6);
	const parts = await ops.splitByRanges(src, ops.parseRanges('1-2,4,5-6', 6));
	eq('拆分文件数', parts.length, 3);
	eq('拆分命名 区间', parts[0].name, 'pages-1-2.pdf');
	eq('拆分命名 单页', parts[1].name, 'page-4.pdf');
	eq('拆分第1份页数', (await PDFDocument.load(parts[0].bytes)).getPageCount(), 2);
	eq('拆分第3份页数', (await PDFDocument.load(parts[2].bytes)).getPageCount(), 2);
}

// ---------------------------------------------------------------- 选页 / 页面编辑

{
	const src = await makeDoc(5);
	const one = await ops.selectPages(src, [4, 0, 2]);
	const doc = await PDFDocument.load(one);
	eq('selectPages 页数', doc.getPageCount(), 3);
}
await rejects('selectPages 空选择', /请至少勾选一页/, async () =>
	ops.selectPages(await makeDoc(2), []),
);

{
	const src = await makeDoc(4);
	const out = await ops.applyPageEdits(src, { order: [3, 0, 1], rotation: { 3: 90, 0: 180 } });
	const doc = await PDFDocument.load(out);
	eq('页面编辑 页数', doc.getPageCount(), 3);
	eq('页面编辑 顺序后旋转', doc.getPage(0).getRotation().angle, 90);
	eq('页面编辑 第二页旋转', doc.getPage(1).getRotation().angle, 180);
	eq('页面编辑 第三页未旋转', doc.getPage(2).getRotation().angle, 0);
}
await rejects('页面编辑 空顺序', /已经没有页面/, async () =>
	ops.applyPageEdits(await makeDoc(2), { order: [], rotation: {} }),
);

// ---------------------------------------------------------------- 图片转 PDF

{
	const out = await ops.imagesToPdf(
		[
			{ name: 'a.png', kind: 'png', bytes: pngBytes },
			{ name: 'b.jpg', kind: 'jpg', bytes: jpgBytes },
		],
		{ pageSize: 'fit', orientation: 'auto', margin: 12 },
	);
	const doc = await PDFDocument.load(out);
	eq('图片 PDF 页数', doc.getPageCount(), 2);
	eq(
		'图片 PDF 第1页尺寸（适应图片+边距）',
		`${Math.round(doc.getPage(0).getWidth())}×${Math.round(doc.getPage(0).getHeight())}`,
		'424×284',
	);
	eq('图片 PDF 生产者', (await inspect(out)).getProducer(), '915P 的小站 PDF 工具箱');
	eq('图片 PDF 创建者', (await inspect(out)).getCreator(), '915P 的小站 PDF 工具箱');
}
{
	const out = await ops.imagesToPdf([{ name: 'a.png', kind: 'png', bytes: pngBytes }], {
		pageSize: 'a4',
		orientation: 'auto',
		margin: 36,
		title: '图集',
	});
	const doc = await PDFDocument.load(out);
	// 400×260 是横图，orientation=auto 时页面跟随图片方向
	eq('图片 PDF A4 auto 横图', `${Math.round(doc.getPage(0).getWidth())}×${Math.round(doc.getPage(0).getHeight())}`, '842×595');
	eq('图片 PDF 标题', (await inspect(out)).getTitle(), '图集');
}
{
	const out = await ops.imagesToPdf([{ name: 'b.jpg', kind: 'jpg', bytes: jpgBytes }], {
		pageSize: 'a4',
		orientation: 'landscape',
		margin: 0,
	});
	const page = (await PDFDocument.load(out)).getPage(0);
	ok('图片 PDF A4 横向', page.getWidth() > page.getHeight(), `${page.getWidth()}×${page.getHeight()}`);
}
await rejects('图片 PDF 空列表', /请先选择至少一张图片/, async () =>
	ops.imagesToPdf([], { pageSize: 'fit', orientation: 'auto', margin: 0 }),
);

// ---------------------------------------------------------------- 内嵌图片

{
	// PDF → 图片 PDF → 再提取，PNG 会被重新编码、JPEG 原样取出
	const src = await ops.imagesToPdf(
		[
			{ name: 'a.png', kind: 'png', bytes: pngBytes },
			{ name: 'b.jpg', kind: 'jpg', bytes: jpgBytes },
		],
		{ pageSize: 'fit', orientation: 'auto', margin: 0 },
	);
	const images = await ops.extractEmbeddedImages(src);
	eq('提取图片数量', images.length, 2);
	eq('提取图片页码', images.map((i) => i.page).join(','), '1,2');
	eq(
		'提取图片扩展名',
		images.map((i) => i.name.split('.').pop()).join(','),
		'png,jpg',
	);
	eq(
		'提取图片类型',
		images.map((i) => i.mimeType).join(','),
		'image/png,image/jpeg',
	);
	ok(
		'提取 PNG 尺寸一致',
		images[0].width === 400 && images[0].height === 260,
		`${images[0].width}x${images[0].height}`,
	);
	ok(
		'提取 JPEG 尺寸一致',
		images[1].width === 300 && images[1].height === 420,
		`${images[1].width}x${images[1].height}`,
	);
	ok('提取 PNG 文件头', images[0].bytes[0] === 0x89, String(images[0].bytes[0]));
	ok('提取 JPEG 文件头', images[1].bytes[0] === 0xff, String(images[1].bytes[0]));
}
{
	// 纯文字页没有位图，应返回空数组而不是抛错
	const images = await ops.extractEmbeddedImages(await makeDoc(2));
	eq('纯文字页提取为空', images.length, 0);
}

// ---------------------------------------------------------------- 裁剪 / 归一

{
	const src = await makeDoc(2, { width: 400, height: 600 });
	const out = await ops.cropPages(src, { left: 20, top: 30, right: 40, bottom: 50 });
	const doc = await inspect(out);
	eq('裁剪页数', doc.getPageCount(), 2);
	const size = doc.getPage(0).getCropBox();
	eq('裁剪后尺寸', `${Math.round(size.width)}x${Math.round(size.height)}`, '340x520');
	// 阅读器取 MediaBox 与 CropBox 的交集，两者必须一致，否则会被二次裁掉
	const media = doc.getPage(0).getMediaBox();
	eq(
		'裁剪后 MediaBox 与 CropBox 一致',
		`${media.width}x${media.height}`,
		`${size.width}x${size.height}`,
	);
}
await rejects('裁剪过度', /太小了/, async () =>
	ops.cropPages(await makeDoc(1, { width: 200, height: 200 }), { left: 90, top: 0, right: 90, bottom: 0 }),
);
await rejects('裁剪负值', /不小于 0/, async () =>
	ops.cropPages(await makeDoc(1), { left: -1, top: 0, right: 0, bottom: 0 }),
);

{
	const src = await makeDoc(3, { width: 300, height: 400 });
	const a4 = await ops.normalizePageSize(src, {
		pageSize: 'a4',
		orientation: 'portrait',
		mode: 'fit',
		margin: 0,
	});
	const doc = await inspect(a4);
	eq('归一页数', doc.getPageCount(), 3);
	eq('归一后尺寸', `${Math.round(doc.getPage(0).getWidth())}x${Math.round(doc.getPage(0).getHeight())}`, '595x842');
	const land = await inspect(
		await ops.normalizePageSize(src, { pageSize: 'letter', orientation: 'landscape', mode: 'cover', margin: 10 }),
	);
	ok(
		'归一横向 + 铺满',
		land.getPage(0).getWidth() > land.getPage(0).getHeight(),
		`${land.getPage(0).getWidth()}x${land.getPage(0).getHeight()}`,
	);
}

// ---------------------------------------------------------------- 页码格式

/**
 * 页码 / 水印这类「往页面上画东西」的操作，保存前的内容流对象里看不到新算子
 * （要等 save 组装），所以断言可观测的两件事：文件变大、页面资源里多了字体。
 */
const hasFontResource = (doc, index = 0) => {
	const resources = doc.getPage(index).node.Resources();
	const fonts = resources?.lookup(globalThis.PDFLib.PDFName.of('Font'));
	return !!fonts && fonts.keys().length > 0;
};

eq('页码 罗马 4', ops.formatPageNumber(4, 'roman'), 'iv');
eq('页码 罗马 1990', ops.formatPageNumber(1990, 'roman'), 'mcmxc');
eq('页码 字母 27', ops.formatPageNumber(27, 'alpha'), 'AA');
eq('页码 阿拉伯', ops.formatPageNumber(12, 'arabic'), '12');
eq('页码 none', ops.formatPageNumber(12, 'none'), '');

{
	const src = await makeDoc(4);
	const out = await ops.addPageNumbers(src, {
		position: 'bottom-center',
		format: 'arabic',
		template: '{n} / {total}',
		fromPage: 2,
	});
	const back = await inspect(out);
	eq('页码页数不变', back.getPageCount(), 4);
	ok('页码让文件变大', out.length > src.length, `${src.length} -> ${out.length}`);
	ok('页码引入字体资源', hasFontResource(back, 1));
}
{
	const src = await makeDoc(2);
	const out = await ops.addPageNumbers(src, { position: 'bottom-right', format: 'roman' });
	ok('罗马页码让文件变大', out.length > src.length, `${src.length} -> ${out.length}`);
}

// ---------------------------------------------------------------- 水印

{
	const src = await makeDoc(2, { width: 400, height: 600 });
	const out = await ops.applyWatermark(src, {
		kind: 'text',
		text: '内部资料 禁止外传',
		position: 'diagonal',
		opacity: 0.3,
		fontSize: 36,
	});
	const back = await inspect(out);
	eq('文字水印页数', back.getPageCount(), 2);
	ok('文字水印让文件变大', out.length > src.length + 2000, `${src.length} -> ${out.length}`);
	ok('文字水印引入字体', hasFontResource(back));
	const size = out.length;
	ok('含中文字体的水印体积合理', size > 3000 && size < 400000, String(size));
}
{
	const src = await makeDoc(1, { width: 400, height: 600 });
	const out = await ops.applyWatermark(src, {
		kind: 'image',
		image: { name: 'logo.png', kind: 'png', bytes: pngBytes },
		position: 'center',
		opacity: 0.2,
	});
	ok('图片水印体积', out.length > 1000, String(out.length));
}
{
	const src = await makeDoc(3);
	const opts = { kind: 'text', text: '只盖第一页', position: 'center' };
	const one = await ops.applyWatermark(src, { ...opts, pages: [0] });
	const all = await ops.applyWatermark(src, opts);
	ok('只盖一页比全盖小', one.length < all.length, `${one.length} vs ${all.length}`);
}
await rejects('水印缺文字', /请填写水印文字/, async () =>
	ops.applyWatermark(await makeDoc(1), { kind: 'text' }),
);
await rejects('水印缺图片', /请先选择一张水印图片/, async () =>
	ops.applyWatermark(await makeDoc(1), { kind: 'image' }),
);

// ---------------------------------------------------------------- 表单

/** 造一个带文本框 / 复选框 / 下拉的表单 */
async function makeFormDoc() {
	const { PDFTextField, PDFCheckBox, PDFOptionList } = PDFLib;
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const page = doc.addPage([400, 300]);
	page.drawText('form', { x: 20, y: 260, size: 12, font });
	const form = doc.getForm();
	const name = form.createTextField('applicant.name');
	name.setText('old');
	name.addToPage(page, { x: 20, y: 220, width: 200, height: 20, font });
	const agree = form.createCheckBox('agree');
	agree.addToPage(page, { x: 20, y: 190, width: 16, height: 16 });
	const city = form.createOptionList('city');
	city.setOptions(['Beijing', 'Shanghai']);
	city.select('Beijing');
	city.addToPage(page, { x: 20, y: 150, width: 160, height: 20, font });
	return doc.save();
}

{
	const bytes = await makeFormDoc();
	const fields = await ops.readFormFields(bytes);
	eq('表单字段数', fields.length, 3);
	const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
	eq('文本字段类型', byName['applicant.name'].type, 'text');
	eq('文本字段原值', byName['applicant.name'].value, 'old');
	eq('复选框类型', byName.agree.type, 'checkbox');
	eq('下拉候选', byName.city.options.join(','), 'Beijing,Shanghai');
}
{
	const bytes = await makeFormDoc();
	const filled = await ops.fillForm(bytes, {
		values: { 'applicant.name': '王小明', agree: 'true', city: 'Shanghai' },
		flatten: false,
	});
	const fields = Object.fromEntries((await ops.readFormFields(filled)).map((f) => [f.name, f]));
	eq('填写后中文值', fields['applicant.name'].value, '王小明');
	eq('填写后复选框', fields.agree.value, 'true');
	eq('填写后下拉', fields.city.value, 'Shanghai');
}
{
	const bytes = await makeFormDoc();
	const flattened = await ops.fillForm(bytes, {
		values: { 'applicant.name': 'Flattened' },
		flatten: true,
	});
	const fields = await ops.readFormFields(flattened);
	eq('压平后字段消失', fields.length, 0);
	ok('压平后仍是一页', (await inspect(flattened)).getPageCount() === 1);
}
await rejects('表单无可写字段', /没有可写的字段/, async () =>
	ops.fillForm(await makeDoc(1), { values: { nope: 'x' }, flatten: false }),
);

// ---------------------------------------------------------------- 加密 / PDF-A

{
	const src = await makeDoc(2);
	const locked = await ops.encryptDocument(src, { userPassword: 'pw', allowCopying: false });
	await rejects('加密后无密码打不开', /已加密/, async () => {
		try {
			await ops.readMeta(locked);
		} catch (error) {
			throw new Error(ops.describeError(error));
		}
	});
	eq('加密后带密码可读', (await ops.readMeta(locked, { password: 'pw' })).title, '');
}
{
	// 只设权限也会写入加密字典（owner 密码），读取时必须带上 owner 密码
	const src = await makeDoc(1);
	const restricted = await ops.encryptDocument(src, { allowPrinting: false });
	await rejects('仅设权限也要密码', /已加密/, async () => {
		try {
			await ops.readMeta(restricted);
		} catch (error) {
			throw new Error(ops.describeError(error));
		}
	});
	eq('owner 密码可读', (await ops.readMeta(restricted, { password: '915p-owner' })).title, '');
}
{
	const src = await makeDoc(1);
	const pdfa = await ops.convertToPdfa(src, '2B');
	const back = await inspect(pdfa);
	eq('PDF/A 页数', back.getPageCount(), 1);
	const catalog = back.catalog.toString();
	ok('PDF/A 写入输出意图', /\/OutputIntents/.test(catalog), catalog.slice(0, 200));
	ok('PDF/A 写入 XMP 元数据', /\/Metadata/.test(catalog), catalog.slice(0, 200));
}

// ---------------------------------------------------------------- 加密 / 错误路径

{
	const doc = await PDFDocument.create();
	doc.addPage([200, 200]);
	doc.encrypt({ userPassword: 'pw', ownerPassword: 'pw2' });
	const locked = await doc.save();
	await rejects('加密文件无密码', /已加密/, async () => {
		try {
			await ops.readMeta(locked);
		} catch (error) {
			throw new Error(ops.describeError(error));
		}
	});
	eq('加密文件带密码可读', (await ops.readMeta(locked, { password: 'pw' })).title, '');
	await rejects('密码错误', /密码不正确|已加密/, async () => {
		try {
			await ops.readMeta(locked, { password: 'nope' });
		} catch (error) {
			throw new Error(ops.describeError(error));
		}
	});
}
await rejects('非 PDF 输入', /不是有效的 PDF|加密/, async () => {
	try {
		await ops.readMeta(new Uint8Array([1, 2, 3, 4]));
	} catch (error) {
		throw new Error(ops.describeError(error));
	}
});

// ---------------------------------------------------------------- 收尾

rmSync(dir, { recursive: true, force: true });
if (failures.length) console.log('\n失败明细：\n' + failures.map((line) => '  ✗ ' + line).join('\n'));
console.log(`\n总计：通过 ${pass} / 失败 ${fail}`);
if (fail) process.exit(1);