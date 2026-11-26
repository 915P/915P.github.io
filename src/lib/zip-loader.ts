/*
 * ZIP 工具箱的第三方库按需加载。
 *
 * zip.min.js 是 UMD 单文件（内嵌 Worker 与 WASM，约 169 KB），
 * 不点开 ZIP 页面就不会下载。加载策略与 pdf-loader 相同：
 * fetch + ReadableStream 报进度，再注入 blob URL；失败时清掉缓存可重试。
 * 这里独立一份而不复用 pdf-loader，避免 ZIP 页面把整个 PDF 模块带进来。
 */

export interface LoadProgress {
	(loaded: number, total: number, label: string): void;
}

const ZIP_URL = '/vendor/zip/zip.min.js';

export interface ZipEntry {
	filename: string;
	directory?: boolean;
	encrypted?: boolean;
	compressedSize?: number;
	uncompressedSize?: number;
	lastModDate?: Date;
	compressionMethod?: number;
	getData: (writer: unknown, options?: Record<string, unknown>) => Promise<unknown>;
}

export interface ZipReaderInstance {
	getEntries: (options?: Record<string, unknown>) => Promise<ZipEntry[]>;
	close: () => Promise<void>;
}

export interface ZipWriterInstance {
	add: (name: string, reader: unknown, options?: Record<string, unknown>) => Promise<unknown>;
	close: () => Promise<Blob | Uint8Array>;
}

export interface ZipJs {
	ZipReader: new (reader: unknown, options?: Record<string, unknown>) => ZipReaderInstance;
	ZipWriter: new (writer: unknown, options?: Record<string, unknown>) => ZipWriterInstance;
	BlobReader: new (blob: Blob) => unknown;
	BlobWriter: new (mime?: string) => { getData: () => Promise<Blob> };
}

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
		script.onerror = () => reject(new Error('zip.js 脚本注入失败'));
		document.head.appendChild(script);
	});
}

let task: Promise<ZipJs> | null = null;

export function loadZipJs(onProgress?: LoadProgress): Promise<ZipJs> {
	const holder = window as unknown as { zip?: ZipJs };
	if (holder.zip?.ZipReader) return Promise.resolve(holder.zip);
	if (task) return task;

	task = (async () => {
		const blob = await fetchWithProgress(ZIP_URL, 'ZIP 引擎 zip.js', onProgress);
		const objectUrl = URL.createObjectURL(blob);
		try {
			await injectScript(objectUrl);
		} finally {
			URL.revokeObjectURL(objectUrl);
		}
		if (!holder.zip?.ZipReader) throw new Error('zip.js 没有注册全局变量 zip');
		return holder.zip;
	})().catch((error) => {
		// 网络中断后刷新页面前还能重试
		task = null;
		throw error;
	});

	return task;
}