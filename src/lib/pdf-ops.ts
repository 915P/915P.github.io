import type { PDFDocument, PDFPage } from '@cantoo/pdf-lib';

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