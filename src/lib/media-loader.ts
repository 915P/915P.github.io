/*
 * 音视频工具箱的 ffmpeg.wasm 按需加载。
 *
 * 为什么不自托管：
 * - `@ffmpeg/core` 的 ffmpeg-core.wasm 单文件 32.2 MB，放进 public/vendor/ 会让
 *   dist 和 .git 体积翻倍，而全站其余 vendor 加起来才 7.4 MB。
 * - `@ffmpeg/core` 是 **GPL-2.0-or-later**。自托管等于「随站点分发」，整站就得
 *   按 GPL 发布（本站 LICENSE 是 MIT）。改为运行时从 CDN 动态加载，浏览器直接
 *   从上游取得二进制，本站不构成分发 —— 代价是首次使用要联网。
 *   详见 THIRD_PARTY_NOTICES.md §16 与 AGENT.md 的决策记录。
 *
 * 三个关键做法（参考 ffmpeg.bmmmd.com 的实现）：
 * 1. **CDN 多源探测**：jsdelivr / unpkg / 国内镜像依次试，只用
 *    `Range: bytes=0-1` 取前 2 字节探测可用性，不下载整个 wasm。探测成功后
 *    把结果**自改写进函数本身**，后续调用直接返回，不再重复探测。
 * 2. **IndexedDB 缓存**：探测到的资源 fetch 下来存进 IndexedDB，之后转成
 *    blob URL 交给 ffmpeg。32 MB 只下载一次，跨会话复用。
 * 3. **不用改源码**：ffmpeg.js 的 UMD 用 `document.currentScript.src` 推出
 *    publicPath，再 `new URL(publicPath + '814.ffmpeg.js')` 找 worker。所以只要
 *    **用 <script src> 直接注入同一个 CDN 的地址**（而不是 blob URL），
 *    worker 路径就自然解析正确，无需正则改写源码。
 *
 * 注意 `@ffmpeg/ffmpeg`（MIT）只是胶水层，真正干活的 `@ffmpeg/core` 是 GPL。
 */

/**
 * 下载进度。loaded / total 是**比例**（0–1），不是字节数 ——
 * 分母要用解压后的真实大小，用 content-length 会得到一个提前跑满的假进度。
 * total 传 0 表示大小未知，此时应显示不确定态。
 */
export interface LoadProgress {
	(loaded: number, total: number, label: string): void;
}

/** 胶水层与 core 必须成对；core 0.12.10 是当前最新 */
export const FFMPEG_VERSION = '0.12.10';
export const CORE_VERSION = '0.12.10';

/**
 * wasm 模块**解压后**的真实字节数（对着 0.12.10 的产物量出来的），
 * 是进度条的分母。不能用响应头里的 content-length —— 见 fetchCached 里的说明。
 *
 * 只有这一个文件配了预期大小：另外三个胶水文件加起来不到 120 KB，
 * 给它们报百分比没有意义，硬报反而会造成「先冲 100% 再跌回 1%」的跳变
 * （实测过，和「进度条提前跑满」是同一类误导）。它们一律走不确定态。
 *
 * 换版本时这个数要一起改。量法：
 *   curl -sL https://cdn.jsdelivr.net/npm/@ffmpeg/core@<版本>/dist/umd/ffmpeg-core.wasm | wc -c
 */
const CORE_WASM_BYTES = 32_232_419;

const WRAPPER_PATH = `/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/umd`;
const CORE_PATH = `/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

/**
 * 候选源。顺序即优先级：先国际源后国内镜像。
 * 国内镜像放前面会让境外部署变慢，故保留 jsdelivr 在首位。
 */
const CANDIDATES = [
	`https://cdn.jsdelivr.net/npm${CORE_PATH}`,
	`https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`,
	`https://fastly.jsdelivr.net/npm${CORE_PATH}`,
	`https://cdn.jsdmirror.com/npm${CORE_PATH}`,
];

const PROBE_TIMEOUT_MS = 3000;
const DB_NAME = '915p-media';
const DB_VERSION = 1;
const STORE = 'ffmpeg';

/* ------------------------------------------------------------------ IndexedDB */

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(new Error('无法打开本地缓存数据库'));
	});
}

async function dbGet(key: string): Promise<Blob | undefined> {
	try {
		const db = await openDb();
		return await new Promise((resolve, reject) => {
			const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
			request.onsuccess = () => resolve(request.result as Blob | undefined);
			request.onerror = () => reject(request.error);
		});
	} catch {
		// 隐私模式 / 存储被禁用时降级为不缓存，功能不受影响
		return undefined;
	}
}

async function dbPut(key: string, blob: Blob): Promise<void> {
	try {
		const db = await openDb();
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite');
			tx.objectStore(STORE).put(blob, key);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	} catch {
		// 缓存失败无所谓，下次重新下载即可
	}
}

export async function clearMediaCache(): Promise<void> {
	try {
		const db = await openDb();
		await new Promise<void>((resolve) => {
			const tx = db.transaction(STORE, 'readwrite');
			tx.objectStore(STORE).clear();
			tx.oncomplete = () => resolve();
			tx.onerror = () => resolve();
		});
	} catch {
		// 忽略
	}
}

/**
 * 核心是否已在本地缓存。
 *
 * 页面初始化时用它决定要不要显示「首次需下载 32 MB」的告知块 ——
 * 第二次访问时那 32 MB 早就下过了，再提示一遍纯属噪音。
 * 只读 IndexedDB 的 key，不碰 32 MB 的 blob 本体，代价是毫秒级。
 */
export async function isCoreCached(): Promise<boolean> {
	const [core, wasm] = await Promise.all([
		dbGet(`core@${CORE_VERSION}.js`),
		dbGet(`core@${CORE_VERSION}.wasm`),
	]);
	return Boolean(core && core.size > 0 && wasm && wasm.size > 0);
}

/* ------------------------------------------------------------------ CDN 探测 */

let coreBase: string | null = null;
let wrapperBase: string | null = null;

/** 只取前 2 字节判断源是否可用，不下载整个 wasm */
async function probe(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: { Range: 'bytes=0-1' },
		});
		return response.ok;
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
	}
}

async function resolveCoreBase(): Promise<string> {
	if (coreBase) return coreBase;
	for (const base of CANDIDATES) {
		if (await probe(`${base}/ffmpeg-core.wasm`)) {
			coreBase = base;
			return base;
		}
	}
	throw new Error(
		'所有 ffmpeg 下载源都不可用。请检查网络后重试，或换用其他网络环境（首次使用需要下载约 32 MB）。',
	);
}

async function resolveWrapperBase(): Promise<string> {
	if (wrapperBase) return wrapperBase;
	// 胶水层只有 4 KB，直接按 core 的优先级逐个试完整文件
	for (const core of CANDIDATES) {
		const base = core.replace(`${CORE_PATH}`, `${WRAPPER_PATH}`);
		if (await probe(`${base}/ffmpeg.js`, 2000)) {
			wrapperBase = base;
			return base;
		}
	}
	throw new Error('无法获取 ffmpeg 胶水层，请检查网络后重试。');
}

/* ------------------------------------------------------------------ 下载缓存 */

/**
 * 下载一个文件并写入 IndexedDB。
 *
 * `expected` 是该文件解压后的真实字节数，用来当进度分母。
 *
 * 为什么不能用 content-length：CDN 开着 gzip/br，响应头里那个数是**线上传输**
 * 的大小，而 `reader.read()` 交出来的是**解压后**的字节。两者不是一个量纲 ——
 * 实测 wasm 模块 content-length 约 9.29 MB，解压后却是 32.23 MB，直接拿
 * content-length 当分母的话，进度条会在下到约 29% 时就顶到 100%，然后
 * 「完成」着继续下载剩下 71%，比不做进度条更误导。
 *
 * 拿不到真实大小时（expected 省略）宁可退化成不确定态，也不显示一个假的百分比。
 */
/**
 * 本次 loadFfmpeg 真的走网络取回来的字节数（解压后）。
 *
 * 用来区分「这次下载了」与「这次命中 IndexedDB」——早先这里写的是
 * `cached: !isFirefox`，那是个常量而不是测量，于是**首次**下载也会
 * 报「使用本地缓存」，用户以为自己没下完。
 */
let downloadedBytes = 0;

async function fetchCached(
	key: string,
	url: string,
	label: string,
	onProgress?: LoadProgress,
	expected?: number,
): Promise<Blob> {
	const hit = await dbGet(key);
	if (hit && hit.size > 0) {
		onProgress?.(1, 1, `${label}（已缓存）`);
		return hit;
	}
	const total = expected ?? 0;
	onProgress?.(0, total, label);
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${label}下载失败（HTTP ${response.status}）`);
	const reader = response.body?.getReader();
	if (!reader) {
		const blob = await response.blob();
		onProgress?.(1, 1, `${label}完成`);
		await dbPut(key, blob);
		return blob;
	}
	const chunks: BlobPart[] = [];
	let loaded = 0;
	// 只有 total 已知才报百分比；未知时保持不确定态
	const report = (): void => {
		if (total > 0) onProgress?.(Math.min(loaded / total, 1), 1, label);
		else onProgress?.(0, 0, label);
	};
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value as BlobPart);
		loaded += value.byteLength;
		report();
	}
	const blob = new Blob(chunks, {
		type: url.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
	});
	/*
	 * 对不上就说明钉住的版本产物变了（CDN 换包、或换源后内容不一致）。
	 * 不当作错误 —— 真文件能不能用由 ffmpeg 自己说了算 —— 但进度条别停在 97%。
	 */
	if (total > 0 && loaded !== total) {
		onProgress?.(1, 1, label);
	}
	downloadedBytes += loaded;
	await dbPut(key, blob);
	return blob;
}

/*
 * ffmpeg.wasm 的 UMD 里这行负责创建 worker：
 *   new Worker(new URL(e.p+e.u(814), e.b), {type: undefined})
 * 其中 e.p 是 UMD 从 document.currentScript.src 推出的 publicPath。
 *
 * 浏览器**禁止跨域创建 Worker**（Worker 脚本必须同源或 blob:），
 * 所以哪怕 <script src> 从 CDN 加载成功，这里也会报
 * "Failed to construct 'Worker': Script at 'https://cdn…' cannot be accessed
 * from origin 'https://915p.github.io'"。
 *
 * 解决办法：把 814 worker 本身也缓存成 blob URL，再改写 UMD 源码里的
 * 这段解析逻辑，让它指向我们的 blob。正则按结构匹配而非写死变量名，
 * 变量名随版本变化也不会失效；匹配不到就报错而不是静默失败。
 */
const WORKER_SITE = /new URL\(\s*\w+\.\w+\s*\+\s*\w+\.u\(\s*814\s*\)\s*,\s*\w+\.\w+\s*,?\s*\)/;

function patchWorkerUrl(source: string, workerUrl: string): string {
	const patched = source.replace(WORKER_SITE, JSON.stringify(workerUrl));
	if (patched === source) {
		throw new Error(
			'ffmpeg 胶水层的结构与预期不符（找不到 worker 入口），' +
				'通常是 @ffmpeg/ffmpeg 升级后产物变了。',
		);
	}
	return patched;
}

/** 动态 import 一个 blob URL 里的 UMD 源码文本 */
async function importPatched(source: string): Promise<void> {
	const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
	try {
		await import(/* @vite-ignore */ url);
	} finally {
		URL.revokeObjectURL(url);
	}
}

/* ------------------------------------------------------------------ 对外接口 */

export interface FfmpegFile {
	name: string;
	data: Uint8Array;
}

/** ffmpeg.wasm 的最小接口面；运行期真实对象由 CDN 上的 UMD 提供 */
export interface FfmpegInstance {
	loaded: boolean;
	load(config: { coreURL: string; wasmURL: string }): Promise<boolean>;
	exec(args: string[], timeout?: number): Promise<number>;
	terminate(): void;
	writeFile(path: string, data: Uint8Array): Promise<boolean>;
	readFile(path: string, encoding?: 'binary' | 'utf8'): Promise<Uint8Array | string>;
	deleteFile(path: string): Promise<boolean>;
	listDir(path: string): Promise<{ name: string; isDir: boolean }[]>;
	createDir(path: string): Promise<boolean>;
	deleteDir(path: string): Promise<boolean>;
	mount(fsType: string, options: unknown, mountPoint: string): Promise<boolean>;
	unmount(mountPoint: string): Promise<boolean>;
	on(event: 'log', handler: (data: { type: string; message: string }) => void): void;
	on(event: 'progress', handler: (data: { progress: number; time: number }) => void): void;
	off(event: 'log', handler: (data: { type: string; message: string }) => void): void;
	off(event: 'progress', handler: (data: { progress: number; time: number }) => void): void;
}

interface FfmpegNamespace {
	FFmpeg: new () => FfmpegInstance;
}

let task: Promise<FfmpegInstance> | null = null;

export interface LoadInfo {
	/** 实际使用的下载源，展示给用户以便反馈 */
	base: string;
	/** 是否完全命中本地缓存（true = 这次一个字节都没下） */
	cached: boolean;
	/** 本次实际下载的字节数（解压后），cached 为 true 时为 0 */
	downloadedBytes: number;
}

let lastInfo: LoadInfo = { base: '', cached: false, downloadedBytes: 0 };

export function mediaLoadInfo(): LoadInfo {
	return lastInfo;
}

/**
 * 加载 ffmpeg.wasm。首次调用会下载约 32 MB 并写入 IndexedDB，
 * 之后同一浏览器不再下载。并发调用共用同一个 Promise。
 */
export async function loadFfmpeg(onProgress?: LoadProgress): Promise<FfmpegInstance> {
	if (task) return task;
	const pending = (async () => {
		downloadedBytes = 0;
		onProgress?.(0, 0, '正在探测下载源…');
		const [coreBaseUrl, wrapperBaseUrl] = await Promise.all([
			resolveCoreBase(),
			resolveWrapperBase(),
		]);

		const w = window as unknown as { FFmpegWASM?: FfmpegNamespace };
		if (!w.FFmpegWASM) {
			/*
			 * 胶水层与 worker 都要先变成 blob：Worker 不允许跨域脚本，
			 * 而 CDN 上的地址与本站不同源。流程是
			 *   fetch 文本 → 正则把 worker 入口换成 blob URL → blob import。
			 */
			onProgress?.(0, 0, '加载 ffmpeg 胶水层…');
			const workerBlob = await fetchCached(
				`ffmpeg@${FFMPEG_VERSION}.814.js`,
				`${wrapperBaseUrl}/814.ffmpeg.js`,
				'下载 worker 脚本',
				onProgress,
			);
			const workerUrl = URL.createObjectURL(workerBlob);
			const source = await (
				await fetchCached(
					`ffmpeg@${FFMPEG_VERSION}.js`,
					`${wrapperBaseUrl}/ffmpeg.js`,
					'下载 ffmpeg 胶水层',
					onProgress,
				)
			).text();
			await importPatched(patchWorkerUrl(source, workerUrl));
			// worker 的 blob URL 要活到 load() 结束，暂不 revoke
		}
		if (!w.FFmpegWASM?.FFmpeg) throw new Error('ffmpeg 胶水层未正确注册');

		const coreBlob = await fetchCached(
			`core@${CORE_VERSION}.js`,
			`${coreBaseUrl}/ffmpeg-core.js`,
			'下载 ffmpeg 核心代码',
			onProgress,
		);
		const wasmBlob = await fetchCached(
			`core@${CORE_VERSION}.wasm`,
			`${coreBaseUrl}/ffmpeg-core.wasm`,
			'下载 ffmpeg 核心模块（32.2 MB，解压后）',
			onProgress,
			CORE_WASM_BYTES,
		);

		/*
		 * Firefox 122+ 拒绝 importScripts() 载入没有 MIME 类型的 blob 资源，
		 * 这里改回直连 CDN 地址（代价是该浏览器不走本地缓存）。
		 */
		const isFirefox = navigator.userAgent.includes('Firefox');
		const coreURL = isFirefox
			? `${coreBaseUrl}/ffmpeg-core.js`
			: URL.createObjectURL(coreBlob);
		const wasmURL = isFirefox
			? `${coreBaseUrl}/ffmpeg-core.wasm`
			: URL.createObjectURL(wasmBlob);

		onProgress?.(1, 1, '正在初始化 ffmpeg（编译 32 MB WebAssembly，约需十几秒）…');
		const instance = new w.FFmpegWASM.FFmpeg();
		await instance.load({ coreURL, wasmURL });

		/*
		 * Firefox 走的是直接引用 CDN 地址的路径（不经过 blob/IndexedDB），
		 * 所以每次访问都要重下，这里别把它算成「命中缓存」。
		 */
		lastInfo = {
			base: coreBaseUrl,
			cached: downloadedBytes === 0,
			downloadedBytes,
		};
		return instance;
	})();
	task = pending;
	try {
		return await pending;
	} catch (error) {
		// 失败后清空缓存的 Promise，允许用户重试
		task = null;
		throw error;
	}
}
