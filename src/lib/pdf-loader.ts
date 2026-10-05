/*
 * PDF 工具箱的第三方库按需加载。
 *
 * 三个库加起来约 4.2 MB，全部懒加载：不点开这个页面就一份都不会下载。
 * 加载过程带进度回调（fetch + ReadableStream 读 Content-Length），
 * UI 用它驱动 mdui-linear-progress。
 */

export interface LoadProgress {
	(loaded: number, total: number, label: string): void;
}

const VENDOR = '/vendor/';

interface VendorSpec {
	url: string;
	label: string;
}

const SPECS = {
	pdfLib: { url: `${VENDOR}pdf/pdf-lib.min.js`, label: 'PDF 处理引擎 pdf-lib' },
	pdfJs: { url: `${VENDOR}pdfjs/pdf.min.mjs`, label: 'PDF 渲染引擎 pdf.js' },
	fflate: { url: `${VENDOR}fflate/fflate.umd.js`, label: 'ZIP 打包组件 fflate' },
	fontkit: { url: `${VENDOR}fontkit/fontkit.umd.min.js`, label: '字体引擎 fontkit' },
} satisfies Record<string, VendorSpec>;

/** 流式 fetch，能拿到 Content-Length 就报百分比，拿不到就退化成不确定进度 */
async function fetchWithProgress(
	url: string,
	label: string,
	onProgress?: LoadProgress,
): Promise<Blob> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${label}加载失败（HTTP ${response.status}）`);
	const total = Number(response.headers.get('content-length') ?? 0);
	const reader = response.body?.getReader();
	if (!reader) {
		onProgress?.(0, 0, label);
		return response.blob();
	}
	const chunks: Uint8Array[] = [];
	let loaded = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		loaded += value.byteLength;
		onProgress?.(loaded, total, label);
	}
	return new Blob(chunks as BlobPart[]);
}

function injectScript(src: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = src;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error('脚本注入失败：' + src));
		document.head.appendChild(script);
	});
}

/** 加载经典脚本（UMD），执行后挂在 window 上 */
async function loadUmd(key: keyof typeof SPECS, globalName: string, onProgress?: LoadProgress) {
	const w = window as unknown as Record<string, unknown>;
	if (w[globalName]) return w[globalName];
	const spec = SPECS[key];
	const pending = (w[`__${globalName}Promise`] as Promise<unknown> | undefined) ?? null;
	if (pending) return pending;
	const task = (async () => {
		const blob = await fetchWithProgress(spec.url, spec.label, onProgress);
		const objectUrl = URL.createObjectURL(blob);
		try {
			await injectScript(objectUrl);
		} finally {
			URL.revokeObjectURL(objectUrl);
		}
		if (!w[globalName]) throw new Error(`${spec.label} 没有注册全局变量 ${globalName}`);
		return w[globalName];
	})();
	w[`__${globalName}Promise`] = task;
	try {
		return await task;
	} catch (error) {
		delete w[`__${globalName}Promise`];
		throw error;
	}
}

/**
 * 加载 ES 模块。优先用「先 fetch 报进度 → blob URL import」，
 * 浏览器若拒绝 blob 模块导入（个别实现会），退回按 URL 直接 import。
 */
async function loadModule<T>(key: keyof typeof SPECS, onProgress?: LoadProgress): Promise<T> {
	const spec = SPECS[key];
	const blob = await fetchWithProgress(spec.url, spec.label, onProgress);
	const objectUrl = URL.createObjectURL(blob);
	try {
		return (await import(/* @vite-ignore */ objectUrl)) as T;
	} catch {
		onProgress?.(0, 0, `${spec.label}（改用直接加载）`);
		return (await import(/* @vite-ignore */ spec.url)) as T;
	} finally {
		URL.revokeObjectURL(objectUrl);
	}
}

export function loadPdfLib(onProgress?: LoadProgress) {
	return loadUmd('pdfLib', 'PDFLib', onProgress);
}

export function loadFflate(onProgress?: LoadProgress) {
	return loadUmd('fflate', 'fflate', onProgress);
}

export interface PdfJsModule {
	getDocument: (src: Record<string, unknown>) => {
		promise: Promise<PdfJsDocument>;
		onProgress?: (handler: (state: { loaded: number; total: number }) => void) => void;
		destroy: () => Promise<void>;
	};
	GlobalWorkerOptions: { workerSrc: string };
	PasswordResponses: { NEED_PASSWORD: number; INCORRECT_PASSWORD: number };
	version?: string;
}

export interface PdfJsViewport {
	width: number;
	height: number;
	rotation: number;
}

export interface PdfJsTextItem {
	str: string;
	hasEOL: boolean;
}

export interface PdfJsPage {
	getViewport: (options: { scale: number; rotation?: number }) => PdfJsViewport;
	render: (options: Record<string, unknown>) => { promise: Promise<void>; cancel: () => void };
	getTextContent: (options?: Record<string, unknown>) => Promise<{ items: unknown[] }>;
	cleanup: () => void;
}

export interface PdfJsDocument {
	numPages: number;
	getPage: (index: number) => Promise<PdfJsPage>;
	getMetadata: () => Promise<{ info: Record<string, unknown> }>;
	destroy: () => Promise<void>;
	cleanup: () => void;
}

let pdfJsTask: Promise<PdfJsModule> | null = null;

export function loadPdfJs(onProgress?: LoadProgress): Promise<PdfJsModule> {
	if (pdfJsTask) return pdfJsTask;
	pdfJsTask = (async () => {
		const mod = await loadModule<PdfJsModule>('pdfJs', onProgress);
		mod.GlobalWorkerOptions.workerSrc = `${VENDOR}pdfjs/pdf.worker.min.mjs`;
		return mod;
	})();
	return pdfJsTask;
}
/**
 * 准备「可内嵌中文字体」的环境：确保 pdf-lib 与 fontkit 都已加载。
 *
 * 注意 **registerFontkit 是 PDFDocument 的实例方法**，命名空间上没有 ——
 * 由 pdf-ops 的 ensureFontkit() 在每个文档上注册一次。
 *
 * 必须是 @cantoo/fontkit：老的 @pdf-lib/fontkit 1.1.1 在这份字体子集上
 * 会抛 "Cannot read properties of undefined (reading 'pos')"。
 */
export async function setupCjkFont(onProgress?: LoadProgress): Promise<void> {
	await loadUmd('pdfLib', 'PDFLib', onProgress);
	await loadUmd('fontkit', 'fontkit', onProgress);
}

/** 内置中文字体子集（2.3 MB），带进度 */
export async function loadCjkFont(onProgress?: LoadProgress): Promise<Uint8Array> {
	const w = window as unknown as { __cjkFont?: Uint8Array; __cjkFontTask?: Promise<Uint8Array> };
	if (w.__cjkFont) return w.__cjkFont;
	w.__cjkFontTask ??= (async () => {
		const bytes = await fetchWithProgress('/fonts/pdf/NotoSansSC-PDF.ttf', '中文字体', onProgress);
		const out = new Uint8Array(await bytes.arrayBuffer());
		w.__cjkFont = out;
		return out;
	})();
	return w.__cjkFontTask;
}
