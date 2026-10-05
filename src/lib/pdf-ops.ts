import type { PDFFont, PDFDocument, PDFPage } from '@cantoo/pdf-lib';

/*
 * PDF 工具箱的纯逻辑层。
 *
 * 这里不碰任何 DOM，只吃 Uint8Array、吐 Uint8Array，
 * 因此可以在 Node 里直接跑回归测试（scripts/pdf-test.mjs）。
 * 浏览器端由 public/vendor/pdf/pdf-lib.min.js 提供全局 PDFLib，
 * 本文件只取它的类型，运行时从 globalThis 上读。
 */

type PdfLib = typeof import('@cantoo/pdf-lib');

export interface Progress {
	(done: number, total: number, label: string): void;
}

export interface LoadOptions {
	password?: string;
	updateProgress?: Progress;
	/** 进度提示前缀，例如「拆分」 */
	label?: string;
}

export interface MetaInfo {
	title: string;
	author: string;
	subject: string;
	keywords: string;
	producer: string;
	creator: string;
	language: string;
	creationDate: string;
	modificationDate: string;
}

export interface PageRange {
	from: number;
	to: number;
}

export interface NamedBytes {
	name: string;
	bytes: Uint8Array;
}

/** A4 / Letter 的点数尺寸（1 pt = 1/72 inch） */
export const PAGE_SIZES = {
	a4: { width: 595.28, height: 841.89, label: 'A4' },
	letter: { width: 612, height: 792, label: 'Letter' },
} as const;

export type PageSizePreset = keyof typeof PAGE_SIZES;
export type Orientation = 'auto' | 'portrait' | 'landscape';
export type ImageKind = 'png' | 'jpg';

export interface ImageInput {
	name: string;
	kind: ImageKind;
	bytes: Uint8Array;
}

export interface ImageOptions {
	pageSize: PageSizePreset | 'fit';
	orientation: Orientation;
	/** 边距，单位 pt */
	margin: number;
	title?: string;
	author?: string;
}

function lib(): PdfLib {
	const l = (globalThis as unknown as { PDFLib?: PdfLib }).PDFLib;
	if (!l) throw new Error('PDF 处理库尚未加载完成');
	return l;
}

/** 让出事件循环，浏览器里进度条才能重绘 */
function tick(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function report(update: Progress | undefined, done: number, total: number, label: string): void {
	update?.(done, total, label);
}

export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return '—';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatPdfDate(date: Date | undefined): string {
	if (!date || Number.isNaN(date.getTime())) return '';
	const pad = (n: number) => String(n).padStart(2, '0');
	return (
		`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
		`${pad(date.getHours())}:${pad(date.getMinutes())}`
	);
}

export async function loadDocument(bytes: Uint8Array, options: LoadOptions = {}): Promise<PDFDocument> {
	const { PDFDocument: Doc } = lib();
	const label = options.label ?? '读取文档';
	report(options.updateProgress, 0, 1, `${label}…`);
	// updateMetadata: false —— load()/create() 的构造函数里就会调用 updateInfoDict()，
	// 默认会把 Producer 改写成 pdf-lib 自己，读一个文件就悄悄改掉它的元数据。
	const doc = await Doc.load(bytes, {
		...(options.password ? { password: options.password } : {}),
		updateMetadata: false,
	});
	report(options.updateProgress, 1, 1, `${label}完成，共 ${doc.getPageCount()} 页`);
	return doc;
}

export async function readMeta(bytes: Uint8Array, options: LoadOptions = {}): Promise<MetaInfo> {
	const doc = await loadDocument(bytes, { ...options, label: options.label ?? '读取元数据' });
	return {
		title: doc.getTitle() ?? '',
		author: doc.getAuthor() ?? '',
		subject: doc.getSubject() ?? '',
		keywords: doc.getKeywords() ?? '',
		producer: doc.getProducer() ?? '',
		creator: doc.getCreator() ?? '',
		language: doc.getLanguage() ?? '',
		creationDate: formatPdfDate(doc.getCreationDate()),
		modificationDate: formatPdfDate(doc.getModificationDate()),
	};
}

export async function writeMeta(
	bytes: Uint8Array,
	meta: Partial<MetaInfo>,
	options: LoadOptions = {},
): Promise<Uint8Array> {
	const doc = await loadDocument(bytes, { ...options, label: options.label ?? '写入元数据' });
	doc.setTitle(meta.title ?? '');
	doc.setAuthor(meta.author ?? '');
	doc.setSubject(meta.subject ?? '');
	doc.setProducer(meta.producer ?? '');
	doc.setCreator(meta.creator ?? '');
	if (meta.language !== undefined) doc.setLanguage(meta.language.trim());
	doc.setKeywords(
		(meta.keywords ?? '')
			.split(/[,，;；、\s]+/)
			.map((word) => word.trim())
			.filter(Boolean),
	);
	const now = new Date();
	doc.setModificationDate(now);
	if (!doc.getCreationDate()) doc.setCreationDate(now);
	report(options.updateProgress, 1, 1, '保存文档…');
	// save() 不碰 Info 字典（改写 Producer 的是 load()/create() 的构造函数），
	// 所以用户填的 Producer / Creator 能原样保留。
	return doc.save();
}

export async function mergePdfs(files: NamedBytes[], options: LoadOptions = {}): Promise<Uint8Array> {
	if (files.length === 0) throw new Error('请先选择至少一个 PDF 文件');
	const { PDFDocument: Doc } = lib();
	const out = await Doc.create();
	const total = files.length;
	report(options.updateProgress, 0, total, '准备合并…');
	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		report(options.updateProgress, i, total, `读取 ${file.name}`);
		const src = await Doc.load(file.bytes, options.password ? { password: options.password } : {});
		const copied = await out.copyPages(src, src.getPageIndices());
		copied.forEach((page) => out.addPage(page));
		report(options.updateProgress, i + 1, total, `已合并 ${file.name}`);
		await tick();
	}
	report(options.updateProgress, total, total, '写出合并结果…');
	const bytes = await out.save();
	report(options.updateProgress, total, total, `合并完成，共 ${out.getPageCount()} 页`);
	return bytes;
}

/** 把 "1-3, 5, 8-" 解析成页区间；页码从 1 开始 */
export function parseRanges(text: string, pageCount: number): PageRange[] {
	const out: PageRange[] = [];
	const parts = text
		.split(/[,，;；\s]+/)
		.map((part) => part.trim())
		.filter(Boolean);
	for (const part of parts) {
		const match = /^(\d+)?(?:\s*[-–—]\s*(\d+)?)?$/.exec(part);
		if (!match) throw new Error(`无法识别的页码「${part}」`);
		// 「5」= 第 5 页；「5-」= 5 到末尾；「-5」= 开头到 5；「2-4」= 区间
		const from = match[1] ? Number(match[1]) : 1;
		const to = match[0].includes('-') || match[0].includes('–') || match[0].includes('—')
			? match[2]
				? Number(match[2])
				: pageCount
			: from;
		if (from < 1 || to < 1) throw new Error(`页码必须从 1 开始：「${part}」`);
		if (from > to) throw new Error(`区间起止颠倒：「${part}」`);
		if (from > pageCount) throw new Error(`第 ${from} 页超出文档范围（共 ${pageCount} 页）`);
		out.push({ from, to: Math.min(to, pageCount) });
	}
	if (out.length === 0) throw new Error('请至少填写一个页码区间');
	return out;
}

/** 按页区间拆成多个单页 PDF；页码从 1 开始、闭区间 */
export async function splitByRanges(
	bytes: Uint8Array,
	ranges: PageRange[],
	options: LoadOptions = {},
): Promise<NamedBytes[]> {
	const { PDFDocument: Doc } = lib();
	const label = options.label ?? '拆分';
	const total = ranges.length;
	report(options.updateProgress, 0, total, `${label}…`);
	const files: NamedBytes[] = [];
	const src = await Doc.load(bytes, options.password ? { password: options.password } : {});
	for (let i = 0; i < ranges.length; i++) {
		const range = ranges[i];
		const indices: number[] = [];
		for (let p = range.from; p <= range.to; p++) indices.push(p - 1);
		const out = await Doc.create();
		const copied = await out.copyPages(src, indices);
		copied.forEach((page) => out.addPage(page));
		const name = range.from === range.to ? `page-${range.from}.pdf` : `pages-${range.from}-${range.to}.pdf`;
		files.push({ name, bytes: await out.save() });
		report(options.updateProgress, i + 1, total, `已拆出 ${name}`);
		await tick();
	}
	return files;
}

/** 导出勾选的页面为一个 PDF；indices 为 0 基下标，顺序即输出顺序 */
export async function selectPages(
	bytes: Uint8Array,
	indices: number[],
	options: LoadOptions = {},
): Promise<Uint8Array> {
	if (indices.length === 0) throw new Error('请至少勾选一页');
	const { PDFDocument: Doc } = lib();
	const src = await Doc.load(bytes, options.password ? { password: options.password } : {});
	const out = await Doc.create();
	const copied = await out.copyPages(src, indices);
	copied.forEach((page) => out.addPage(page));
	report(options.updateProgress, 1, 1, `导出 ${out.getPageCount()} 页`);
	return out.save();
}

export interface PageEditOptions extends LoadOptions {
	/** 最终顺序，原页 0 基下标数组 */
	order: number[];
	/** 原页 0 基下标 → 旋转角度（0 / 90 / 180 / 270） */
	rotation: Record<number, 0 | 90 | 180 | 270>;
}

export async function applyPageEdits(bytes: Uint8Array, options: PageEditOptions): Promise<Uint8Array> {
	const { order, rotation } = options;
	if (order.length === 0) throw new Error('文档里已经没有页面了');
	const { PDFDocument: Doc, degrees } = lib();
	const src = await Doc.load(bytes, options.password ? { password: options.password } : {});
	const total = order.length;
	const out = await Doc.create();
	report(options.updateProgress, 0, total, '按新顺序复制页面…');
	for (let i = 0; i < order.length; i++) {
		// 必须由目标文档发起 copyPages：copyPages 返回的页属于调用方的 context，
		// 用 src.copyPages(src, …) 的结果直接 addPage 会抛 ForeignPageError。
		const [page] = await out.copyPages(src, [order[i]]);
		out.addPage(page);
		if (i % 8 === 0) {
			report(options.updateProgress, i, total, `复制第 ${i + 1} / ${total} 页`);
			await tick();
		}
	}
	for (let i = 0; i < order.length; i++) {
		const angle = rotation[order[i]];
		if (!angle) continue;
		out.getPage(i).setRotation(degrees(angle));
	}
	report(options.updateProgress, total, total, '写出结果…');
	return out.save();
}

/** 读文件头判断 PNG / JPEG；其余格式先由页面用 canvas 转成 PNG */
export function sniffImageKind(bytes: Uint8Array): ImageKind | null {
	if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
		return 'png';
	}
	if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return 'jpg';
	}
	return null;
}

function pageDimsFor(
	image: { width: number; height: number },
	options: ImageOptions,
): { pageWidth: number; pageHeight: number } {
	const margin = Math.max(0, options.margin);
	if (options.pageSize === 'fit') {
		return { pageWidth: image.width + margin * 2, pageHeight: image.height + margin * 2 };
	}
	const preset = PAGE_SIZES[options.pageSize];
	const landscape =
		options.orientation === 'landscape' ||
		(options.orientation === 'auto' && image.width > image.height);
	return landscape
		? { pageWidth: preset.height, pageHeight: preset.width }
		: { pageWidth: preset.width, pageHeight: preset.height };
}

export async function imagesToPdf(
	images: ImageInput[],
	options: ImageOptions,
	progress?: Progress,
): Promise<Uint8Array> {
	if (images.length === 0) throw new Error('请先选择至少一张图片');
	const { PDFDocument: Doc } = lib();
	const doc = await Doc.create({ updateMetadata: false });
	const total = images.length;
	for (let i = 0; i < images.length; i++) {
		const item = images[i];
		report(progress, i, total, `嵌入第 ${i + 1} / ${total} 张：${item.name}`);
		const image =
			item.kind === 'png' ? await doc.embedPng(item.bytes) : await doc.embedJpg(item.bytes);
		const { pageWidth, pageHeight } = pageDimsFor(image, options);
		const page = doc.addPage([pageWidth, pageHeight]);
		const margin = options.pageSize === 'fit' ? 0 : Math.max(0, options.margin);
		const boxWidth = Math.max(1, pageWidth - margin * 2);
		const boxHeight = Math.max(1, pageHeight - margin * 2);
		const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
		const drawWidth = image.width * scale;
		const drawHeight = image.height * scale;
		page.drawImage(image, {
			x: (pageWidth - drawWidth) / 2,
			y: (pageHeight - drawHeight) / 2,
			width: drawWidth,
			height: drawHeight,
		});
		await tick();
	}
	if (options.title) doc.setTitle(options.title);
	if (options.author) doc.setAuthor(options.author);
	doc.setProducer('915P 的小站 PDF 工具箱');
	doc.setCreator('915P 的小站 PDF 工具箱');
	const now = new Date();
	doc.setCreationDate(now);
	doc.setModificationDate(now);
	report(progress, total, total, '写出 PDF…');
	return doc.save();
}

/** 页面尺寸文本，形如「595 × 842 pt（A4 纵向）」 */
export function describePageSize(width: number, height: number): string {
	const match = (Object.keys(PAGE_SIZES) as PageSizePreset[]).find((key) => {
		const preset = PAGE_SIZES[key];
		const landscape = Math.abs(preset.width - height) < 2 && Math.abs(preset.height - width) < 2;
		const portrait = Math.abs(preset.width - width) < 2 && Math.abs(preset.height - height) < 2;
		return landscape || portrait;
	});
	const base = `${Math.round(width)} × ${Math.round(height)} pt`;
	if (!match) return base;
	const preset = PAGE_SIZES[match];
	const isLandscape = Math.abs(preset.width - height) < 2;
	return `${base}（${preset.label}${isLandscape ? ' 横向' : ' 纵向'}）`;
}

/** 统一的取页码错误文案（pdf-lib 抛的错五花八门） */
export function describeError(error: unknown): string {
	const raw = error instanceof Error ? error.message : String(error);
	if (/encrypted/i.test(raw)) return '这个 PDF 已加密，请先输入打开密码';
	if (/password/i.test(raw)) return '密码不正确，请重试';
	if (/Invalid PDF|No PDF header|Failed to parse|structure|stream/i.test(raw)) {
		return '文件不是有效的 PDF，或已损坏';
	}
	return raw;
}

export type { PDFDocument, PDFPage };
/* ========================================================================== *
 *  第二批：裁剪 / 尺寸归一 / 水印 / 页码 / 表单 / 加密 / PDF-A
 * ========================================================================== */

/** 站点自托管的中文子集字体（GB2312 全码 + 常用符号，2.3 MB） */
export const CJK_FONT_URL = '/fonts/pdf/NotoSansSC-PDF.ttf';

export type FontRole = 'cjk' | 'standard';

export interface FontOptions {
	/** cjk = 内置中文子集字体；standard = pdf-lib 自带 Helvetica（仅 ASCII） */
	role?: FontRole;
	/** 自定义字体字节，优先于 role */
	bytes?: Uint8Array;
}

/**
 * resolver 必须用**目标文档**的 embedFont：字体对象归属于创建它的文档，
 * 拿别的文档 embed 出来的字体再 drawText，会在保存时炸 ForeignPageError。
 */
export interface FontEngine {
	/** fontkit 实例，交给 doc.registerFontkit() */
	fontkit: unknown;
	/** 中文子集字体字节 */
	cjkBytes: Uint8Array;
}

let fontEngine: FontEngine | null = null;
let cjkFontBytes: Uint8Array | null = null;
const fontkitReady = new WeakSet<object>();

/**
 * 页面把 fontkit 与中文字体准备好后注入这里；纯逻辑层自己不碰网络，
 * 这样 scripts/pdf-test.mjs 才能在 Node 里跑（Node 侧注入同一份字体文件）。
 */
export function registerFontEngine(engine: FontEngine | null): void {
	fontEngine = engine;
}

export async function loadCjkFontBytes(): Promise<Uint8Array> {
	if (cjkFontBytes) return cjkFontBytes;
	const response = await fetch(CJK_FONT_URL);
	if (!response.ok) throw new Error(`中文字体加载失败（HTTP ${response.status}）`);
	cjkFontBytes = new Uint8Array(await response.arrayBuffer());
	return cjkFontBytes;
}

/**
 * 嵌入字体。pdf-lib 自带的 14 种标准字体只含 ASCII，中文必须内嵌字体。
 * 注意 registerFontkit 是**实例方法**，且字体必须由目标文档自己 embed，
 * 否则保存时会抛 ForeignPageError。
 */
export async function embedFont(doc: PDFDocument, options: FontOptions = {}): Promise<PDFFont> {
	const { StandardFonts } = lib();
	if (options.bytes) {
		if (fontEngine) ensureFontkit(doc);
		return doc.embedFont(options.bytes, { subset: true });
	}
	if ((options.role ?? 'cjk') === 'standard') return doc.embedFont(StandardFonts.Helvetica);
	if (!fontEngine) throw new Error('中文字体尚未就绪，请稍候或改用纯英文内容');
	ensureFontkit(doc);
	return doc.embedFont(fontEngine.cjkBytes, { subset: true });
}

function ensureFontkit(doc: PDFDocument): void {
	if (!fontEngine) throw new Error('字体引擎尚未就绪');
	if (fontkitReady.has(doc as unknown as object)) return;
	doc.registerFontkit(fontEngine.fontkit as never);
	fontkitReady.add(doc as unknown as object);
}

function assertFinite(name: string, value: number): number {
	if (!Number.isFinite(value) || value < 0) throw new Error(`「${name}」必须是不小于 0 的数字`);
	return value;
}

/* ---------------------------------------------------------------- 页面裁剪 */

export interface CropOptions extends LoadOptions {
	/** 四边裁掉的点数，顺序 左 / 上 / 右 / 下 */
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** 页面裁剪：同时改 CropBox 并把内容反向平移，不留下空白边 */
export async function cropPages(bytes: Uint8Array, crop: CropOptions): Promise<Uint8Array> {
	const left = assertFinite('左', crop.left);
	const top = assertFinite('上', crop.top);
	const right = assertFinite('右', crop.right);
	const bottom = assertFinite('下', crop.bottom);
	const doc = await loadDocument(bytes, { ...crop, label: '页面裁剪' });
	const pages = doc.getPages();
	report(crop.updateProgress, 0, pages.length, '计算裁剪框…');
	for (let i = 0; i < pages.length; i++) {
		const page = pages[i];
		const box = page.getCropBox();
		const width = box.width - left - right;
		const height = box.height - top - bottom;
		if (width < 24 || height < 24) {
			throw new Error(`第 ${i + 1} 页裁剪后只剩 ${Math.round(width)}×${Math.round(height)} pt，太小了`);
		}
		// 内容反向平移后再把新页面摆到 (0,0)，同时让 MediaBox 等于 CropBox。
		// 阅读器取 MediaBox 与 CropBox 的交集，两者必须一致，否则会二次裁剪。
		page.translateContent(-left, -bottom);
		page.setCropBox(0, 0, width, height);
		page.setMediaBox(0, 0, width, height);
		if (i % 10 === 0) {
			report(crop.updateProgress, i, pages.length, `裁剪第 ${i + 1} / ${pages.length} 页`);
			await tick();
		}
	}
	report(crop.updateProgress, pages.length, pages.length, '写出结果…');
	return doc.save();
}

/* -------------------------------------------------------------- 尺寸归一 */

export interface NormalizeOptions extends LoadOptions {
	pageSize: PageSizePreset;
	orientation: Orientation;
	/** fit = 留白居中，cover = 铺满并裁掉溢出部分 */
	mode: 'fit' | 'cover';
	margin: number;
}

/** 页面尺寸归一：所有页面统一到 A4 / Letter */
export async function normalizePageSize(
	bytes: Uint8Array,
	options: NormalizeOptions,
): Promise<Uint8Array> {
	const { PDFDocument: Doc } = lib();
	const preset = PAGE_SIZES[options.pageSize];
	const doc = await loadDocument(bytes, { ...options, label: '尺寸归一' });
	const sources = doc.getPages();
	const total = sources.length;
	const embedded = await doc.embedPages(sources);
	const margin = Math.max(0, options.margin);
	const out = await Doc.create();
	report(options.updateProgress, 0, total, '按新尺寸重排页面…');
	for (let i = 0; i < total; i++) {
		const sourceSize = sources[i].getSize();
		const landscape =
			options.orientation === 'landscape' ||
			(options.orientation === 'auto' && sourceSize.width > sourceSize.height);
		const target = {
			width: landscape ? preset.height : preset.width,
			height: landscape ? preset.width : preset.height,
		};
		const boxWidth = Math.max(1, target.width - margin * 2);
		const boxHeight = Math.max(1, target.height - margin * 2);
		const scale =
			options.mode === 'cover'
				? Math.max(boxWidth / sourceSize.width, boxHeight / sourceSize.height)
				: Math.min(boxWidth / sourceSize.width, boxHeight / sourceSize.height);
		const page = out.addPage([target.width, target.height]);
		page.drawPage(embedded[i], {
			x: (target.width - sourceSize.width * scale) / 2,
			y: (target.height - sourceSize.height * scale) / 2,
			width: sourceSize.width * scale,
			height: sourceSize.height * scale,
		});
		if (i % 5 === 0) {
			report(options.updateProgress, i, total, `处理第 ${i + 1} / ${total} 页`);
			await tick();
		}
	}
	report(options.updateProgress, total, total, '写出结果…');
	return out.save();
}

/* ------------------------------------------------------------------ 水印 */

export type WatermarkPosition = 'center' | 'top' | 'bottom' | 'diagonal' | 'tile';

export interface WatermarkOptions extends LoadOptions {
	kind: 'text' | 'image';
	text?: string;
	image?: { name: string; kind: ImageKind; bytes: Uint8Array };
	font?: FontOptions;
	fontSize?: number;
	color?: { r: number; g: number; b: number };
	opacity?: number;
	/** 文字水印旋转角度；平铺固定 45 */
	rotation?: number;
	position?: WatermarkPosition;
	/** 距页边距离（pt） */
	margin?: number;
	/** 只处理这些页（0 基），空 = 全部 */
	pages?: number[];
}

/** 水印：文字（内嵌中文字体）或图片，叠在页面内容之上 */
export async function applyWatermark(
	bytes: Uint8Array,
	options: WatermarkOptions,
): Promise<Uint8Array> {
	if (options.kind === 'text' && !(options.text ?? '').trim()) throw new Error('请填写水印文字');
	if (options.kind === 'image' && !options.image) throw new Error('请先选择一张水印图片');
	const doc = await loadDocument(bytes, { ...options, label: '添加水印' });
	const { degrees, rgb } = lib();
	const color = rgb(options.color?.r ?? 0.5, options.color?.g ?? 0.5, options.color?.b ?? 0.5);
	const opacity = Math.min(1, Math.max(0.02, options.opacity ?? 0.25));
	const position = options.position ?? 'diagonal';
	const margin = Math.max(0, options.margin ?? 36);
	const fontSize = options.fontSize ?? 42;
	const angle = position === 'diagonal' || position === 'tile' ? (options.rotation ?? 45) : (options.rotation ?? 0);
	const target = new Set(options.pages ?? []);
	const pages = doc.getPages();
	const total = pages.length;

	const font = options.kind === 'text' ? await embedFont(doc, options.font ?? { role: 'cjk' }) : null;
	const image = options.kind === 'image' && options.image
		? options.image.kind === 'jpg'
			? await doc.embedJpg(options.image.bytes)
			: await doc.embedPng(options.image.bytes)
		: null;

	for (let i = 0; i < total; i++) {
		if (target.size && !target.has(i)) continue;
		const page = pages[i];
		const size = page.getSize();
		// 页面被 /Rotate 转过时，按可视方向摆水印
		const swap = Math.abs(page.getRotation().angle % 180) === 90;
		const pageWidth = swap ? size.height : size.width;
		const pageHeight = swap ? size.width : size.height;
		const cx = pageWidth / 2;
		const cy = pageHeight / 2;
		const anchorX = position === 'top' ? cx : position === 'bottom' ? cx : cx;
		const anchorY = position === 'top' ? pageHeight - margin : position === 'bottom' ? margin : cy;
		const rotate = swap ? degrees(-angle) : degrees(angle);

		if (font && options.text) {
			const fontSizeUsed = position === 'tile' ? Math.min(fontSize, pageWidth / 6) : fontSize;
			const textWidth = font.widthOfTextAtSize(options.text, fontSizeUsed);
			if (position === 'tile') {
				const stepX = Math.max(textWidth + fontSizeUsed * 2, 72);
				const stepY = Math.max(fontSizeUsed * 5, 90);
				for (let ty = -pageHeight; ty <= pageHeight; ty += stepY) {
					for (let tx = -pageWidth; tx <= pageWidth; tx += stepX) {
						page.drawText(options.text, {
							x: cx + tx - textWidth / 2,
							y: cy + ty - fontSizeUsed / 2,
							size: fontSizeUsed,
							font,
							color,
							opacity,
							rotate: swap ? degrees(45) : degrees(45),
						});
					}
				}
			} else {
				page.drawText(options.text, {
					x: anchorX - textWidth / 2,
					y: anchorY - fontSizeUsed / 2,
					size: fontSizeUsed,
					font,
					color,
					opacity,
					rotate,
				});
			}
		}
		if (image) {
			const longest = Math.max(pageWidth, pageHeight);
			const scale =
				position === 'tile'
					? Math.min(1, longest / (Math.max(image.width, image.height) * 6))
					: Math.min(1, (position === 'center' ? Math.min(pageWidth, pageHeight) * 0.4 : Math.min(pageWidth, pageHeight) * 0.22) / image.width);
			const drawWidth = image.width * scale;
			const drawHeight = image.height * scale;
			page.drawImage(image, {
				x: anchorX - drawWidth / 2,
				y: anchorY - drawHeight / 2,
				width: drawWidth,
				height: drawHeight,
				opacity,
				rotate,
			});
		}
		if (i % 10 === 0) {
			report(options.updateProgress, i, total, `处理第 ${i + 1} / ${total} 页`);
			await tick();
		}
	}
	report(options.updateProgress, total, total, '写出结果…');
	return doc.save();
}

/* ------------------------------------------------------------------ 页码 */

export type NumberFormat = 'arabic' | 'roman' | 'alpha' | 'none';

export type PageNumberPosition =
	| 'bottom-center'
	| 'bottom-left'
	| 'bottom-right'
	| 'top-center'
	| 'top-left'
	| 'top-right';

export interface PageNumberOptions extends LoadOptions {
	position: PageNumberPosition;
	format?: NumberFormat;
	/** 显示格式串，{n} 为页码，{total} 为总页数 */
	template?: string;
	startAt?: number;
	/** 从第几页开始显示（1 基），用于跳过封面 */
	fromPage?: number;
	font?: FontOptions;
	fontSize?: number;
	margin?: number;
}

const ROMAN: [number, string][] = [
	[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
	[50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
];

function toRoman(value: number): string {
	let rest = Math.max(1, Math.floor(value));
	let out = '';
	for (const [num, letters] of ROMAN) {
		while (rest >= num) {
			out += letters;
			rest -= num;
		}
	}
	return out;
}

function toAlpha(value: number): string {
	let rest = Math.max(1, Math.floor(value));
	let out = '';
	while (rest > 0) {
		rest -= 1;
		out = String.fromCharCode(65 + (rest % 26)) + out;
		rest = Math.floor(rest / 26);
	}
	return out;
}

export function formatPageNumber(value: number, format: NumberFormat): string {
	switch (format) {
		case 'roman':
			return toRoman(value);
		case 'alpha':
			return toAlpha(value);
		case 'none':
			return '';
		default:
			return String(Math.max(0, Math.floor(value)));
	}
}

/** 页码：位置 / 格式 / 起始号 / 跳过前几页 / 自定义格式串 */
export async function addPageNumbers(
	bytes: Uint8Array,
	options: PageNumberOptions,
): Promise<Uint8Array> {
	const { rgb, degrees } = lib();
	const doc = await loadDocument(bytes, { ...options, label: '添加页码' });
	const pages = doc.getPages();
	const total = pages.length;
	const fontSize = options.fontSize ?? 10;
	const margin = Math.max(8, options.margin ?? 26);
	const format = options.format ?? 'arabic';
	const template = options.template ?? '{n}';
	const startAt = options.startAt ?? 1;
	const fromPage = Math.max(1, options.fromPage ?? 1);
	// 编号只按「可见页」递增，跳过封面时页码不会跳号
	const visible = pages.map((_, index) => index).filter((index) => index + 1 >= fromPage);
	let font: PDFFont | null = null;

	for (const order of visible.keys()) {
		const index = visible[order];
		const text = template
			.replace('{n}', formatPageNumber(startAt + order, format))
			.replace('{total}', String(visible.length));
		if (!text) continue;
		const page = pages[index];
		const size = page.getSize();
		const swap = Math.abs(page.getRotation().angle % 180) === 90;
		const pageWidth = swap ? size.height : size.width;
		const pageHeight = swap ? size.width : size.height;
		const ascii = /^[\x20-\x7E]*$/.test(text);
		if (!font) font = await embedFont(doc, options.font ?? (ascii ? { role: 'standard' } : { role: 'cjk' }));
		const textWidth = font.widthOfTextAtSize(text, fontSize);
		const [vertical, horizontal] = options.position.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];
		const alongX =
			horizontal === 'left'
				? margin
				: horizontal === 'right'
					? pageWidth - margin - textWidth
					: (pageWidth - textWidth) / 2;
		const alongY = vertical === 'top' ? pageHeight - margin - fontSize : margin;
		page.drawText(text, {
			x: swap ? alongY : alongX,
			y: swap ? pageWidth - alongX - textWidth : alongY,
			size: fontSize,
			font,
			color: rgb(0.35, 0.35, 0.42),
			opacity: 0.9,
			rotate: swap ? degrees(-90) : degrees(0),
		});
	}
	report(options.updateProgress, total, total, '写出结果…');
	return doc.save();
}

/* ------------------------------------------------------------------ 表单 */

export interface FormFieldInfo {
	name: string;
	type: 'text' | 'checkbox' | 'choice';
	value: string;
	readOnly: boolean;
	required: boolean;
	options?: string[];
	maxLength?: number | null;
}

/** 读出表单字段（页面上据此渲染填写界面） */
export async function readFormFields(
	bytes: Uint8Array,
	options: LoadOptions = {},
): Promise<FormFieldInfo[]> {
	const doc = await loadDocument(bytes, { ...options, label: '读取表单' });
	const form = doc.getForm();
	const out: FormFieldInfo[] = [];
	const { PDFField, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFOptionList, PDFAcroChoice } = lib();
	for (const field of form.getFields().values()) {
		const name = field.getName();
		const base = { name, readOnly: field.isReadOnly(), required: field.isRequired() };
		try {
			if (field instanceof PDFTextField) {
				out.push({
					...base,
					type: 'text',
					value: field.getText() ?? '',
					maxLength: field.getMaxLength() ?? null,
				});
			} else if (field instanceof PDFCheckBox) {
				out.push({ ...base, type: 'checkbox', value: field.isChecked() ? 'true' : 'false' });
			} else if (field instanceof PDFRadioGroup || field instanceof PDFOptionList) {
				const choices = [...field.getOptions()];
				let selected = choices[0] ?? '';
				try {
					// 多选列表返回数组
					const raw = field.getSelected() as string | string[] | undefined;
					const first = Array.isArray(raw) ? raw[0] : raw;
					if (first) selected = first;
				} catch {
					/* 保持默认值 */
				}
				out.push({
					...base,
					type: 'choice',
					value: selected,
					options: choices,
				});
			} else {
				continue;
			}
		} catch {
			// 畸形字段读不出取值就跳过，不让整个列表挂掉
			continue;
		}
	}
	void PDFField;
	void PDFAcroChoice;
	report(options.updateProgress, out.length, out.length, `共 ${out.length} 个字段`);
	return out;
}

export interface FormFillOptions extends LoadOptions {
	values: Record<string, string>;
	/** true = 填完把表单域压平（之后不可再编辑） */
	flatten: boolean;
	/** 视为「选中」的取值 */
	checkboxTrue?: string[];
}

/** 填写表单，可选压平 */
export async function fillForm(bytes: Uint8Array, options: FormFillOptions): Promise<Uint8Array> {
	const doc = await loadDocument(bytes, { ...options, label: '填写表单' });
	const form = doc.getForm();
	const { PDFTextField, PDFCheckBox, PDFRadioGroup, PDFOptionList } = lib();
	const truthy = new Set((options.checkboxTrue ?? ['on', 'true', '1', 'yes']).map((v) => v.toLowerCase()));
	const entries = Object.entries(options.values).filter(([, value]) => value !== '');
	let nonAscii = false;
	let filled = 0;
	const skipped: string[] = [];

	for (let i = 0; i < entries.length; i++) {
		const [name, value] = entries[i];
		try {
			const field = form.getField(name);
			if (field.isReadOnly()) {
				skipped.push(name);
				continue;
			}
			if (field instanceof PDFCheckBox) {
				if (truthy.has(value.toLowerCase())) field.check();
				else field.uncheck();
			} else if (field instanceof PDFRadioGroup || field instanceof PDFOptionList) {
				field.select(value);
			} else if (field instanceof PDFTextField) {
				field.setText(value);
			} else {
				skipped.push(name);
				continue;
			}
			if (!/^[\x20-\x7E]*$/.test(value)) nonAscii = true;
			filled++;
		} catch {
			skipped.push(name);
		}
		if (i % 5 === 0) {
			report(options.updateProgress, i, entries.length, `填写 ${i + 1} / ${entries.length}`);
			await tick();
		}
	}
	if (entries.length > 0 && filled === 0) throw new Error('没有可写的字段（可能全是只读域）');
	if (options.flatten) {
		// 压平前必须重算外观，否则阅读器里看不到刚填进去的字
		const font = await embedFont(doc, nonAscii ? { role: 'cjk' } : { role: 'standard' });
		form.updateFieldAppearances(font);
		form.flatten();
	}
	if (skipped.length) console.warn('跳过的字段：', skipped.join(', '));
	report(options.updateProgress, entries.length, entries.length, '写出结果…');
	return doc.save();
}

/* ------------------------------------------------------------ 加密与 PDF/A */

export interface EncryptOptions extends LoadOptions {
	userPassword?: string;
	ownerPassword?: string;
	allowPrinting?: boolean;
	allowCopying?: boolean;
	allowModifying?: boolean;
}

/** 加密 + 权限限制（省略打开密码则只设权限） */
export async function encryptDocument(
	bytes: Uint8Array,
	options: EncryptOptions,
): Promise<Uint8Array> {
	const doc = await loadDocument(bytes, { ...options, label: '设置权限' });
	const userPassword = options.userPassword ?? '';
	const ownerPassword = options.ownerPassword || userPassword || '915p-owner';
	report(options.updateProgress, 1, 2, '写入加密字典…');
	doc.encrypt({
		userPassword,
		ownerPassword,
		permissions: {
			printing: options.allowPrinting === false ? false : 'highResolution',
			copying: options.allowCopying !== false,
			modifying: options.allowModifying !== false,
			annotating: true,
			fillingForms: true,
			contentAccessibility: true,
			documentAssembly: true,
		},
	});
	report(options.updateProgress, 2, 2, '写出加密文档…');
	return doc.save();
}

/* ---------------------------------------------------------------- 内嵌图片 */

/** extractContents() 里我们只关心图片分支 */
interface ImageExtractAsset {
	kind: 'image';
	width: number;
	height: number;
	mimeType: string;
	getBytes(): Uint8Array;
}
type ExtractAsset = ImageExtractAsset | { kind: 'text' | 'graphics' };

export interface EmbeddedImage extends NamedBytes {
	/** 1 基页码 */
	page: number;
	/** 该页内第几张（1 基） */
	seq: number;
	width: number;
	height: number;
	mimeType: string;
}

/**
 * 提取页面里的位图。
 *
 * 走 PDFPage.extractContents()：它已经处理了 DCTDecode（JPEG 原样取出）
 * 与 8 位 DeviceRGB/DeviceGray（重新编码成 PNG），也认识 Form XObject 里的嵌套图。
 * 但矢量图、带 SMask 之外高级色彩空间的图会直接被跳过，这是库的限制。
 */
export async function extractEmbeddedImages(
	bytes: Uint8Array,
	options: LoadOptions = {},
): Promise<EmbeddedImage[]> {
	const doc = await loadDocument(bytes, { ...options, label: '提取内嵌图片' });
	const pages = doc.getPages();
	const out: EmbeddedImage[] = [];
	for (let i = 0; i < pages.length; i++) {
		report(options.updateProgress, i, pages.length, `扫描第 ${i + 1} / ${pages.length} 页…`);
		let assets: ExtractAsset[];
		try {
			assets = pages[i].extractContents() as ExtractAsset[];
		} catch {
			// 内容流损坏不该让整份文档的提取失败
			assets = [];
		}
		let seq = 0;
		for (const asset of assets) {
			if (asset.kind !== 'image') continue;
			seq++;
			const data = asset.getBytes();
			if (!data || data.length < 512) continue;
			const isPng = data[0] === 0x89 && data[1] === 0x50;
			const isJpg = data[0] === 0xff && data[1] === 0xd8;
			if (!isPng && !isJpg) continue;
			out.push({
				page: i + 1,
				seq,
				name: `p${i + 1}-${seq}.${isPng ? 'png' : 'jpg'}`,
				bytes: data,
				width: asset.width,
				height: asset.height,
				mimeType: isPng ? 'image/png' : 'image/jpeg',
			});
		}
		await tick();
	}
	report(options.updateProgress, pages.length, pages.length, `共找到 ${out.length} 张图片`);
	return out;
}

export type PdfaConformance = '1B' | '2B' | '2U' | '3B' | '3U';

/**
 * 转 PDF/A。注意：这里只写入 PDF/A 的元数据与输出意图声明，
 * 不做「所有字体必须嵌入」之类的合规体检，导出前请自行确认。
 */
export async function convertToPdfa(
	bytes: Uint8Array,
	conformance: PdfaConformance,
	options: LoadOptions = {},
): Promise<Uint8Array> {
	const doc = await loadDocument(bytes, { ...options, label: '转换 PDF/A' });
	report(options.updateProgress, 1, 2, `写入 PDF/A-${conformance} 声明…`);
	doc.convertToPDFA({ conformance });
	report(options.updateProgress, 2, 2, '写出结果…');
	return doc.save();
}
