/*
 * Service Worker 源码模板。
 *
 * 它不是最终的 sw.js：构建脚本 scripts/build-sw.mjs 会在 `astro build` 之后
 * 扫描 dist/，把下面三个占位符替换成真实值，再写入 dist/sw.js。
 * 这样开发环境天然没有 Service Worker，也不需要把生成物提交进仓库。
 *
 * 三个占位符（写法见文件末尾的常量声明）：
 *   - 构建号（git 短 SHA 或 CI 的 GITHUB_SHA 前 8 位）
 *   - 构建时间戳（毫秒）
 *   - 预缓存 URL 数组（站点外壳清单，由 build-sw.mjs 生成）
 *
 * 设计取舍：
 *   1. 只预缓存"外壳"（HTML / 打包资源 / mdui / logo / 图标 / 正文字体）。
 *      /apps/** 下几十上百 MB 的原生应用一律**运行时按需缓存**，
 *      既不拖慢首次安装，也避开 iOS 偏小的存储配额。
 *   2. 新版本不自动 skipWaiting：等用户在页脚点「立即更新」或点提示条。
 *      这样页脚展示的"已安装版本"对用户始终可控、可见。
 *   3. 缓存名带构建号：每次构建都是全新缓存，activate 时清掉旧缓存，
 *      因此不存在"内容变了但缓存没跟着变"的陈旧问题。
 */

const BUILD_ID = '__BUILD_ID__';
const BUILD_TIME = __BUILD_TIME__;
const PRECACHE = __PRECACHE__;

const CACHE_PREFIX = '915p-';
const CACHE_NAME = CACHE_PREFIX + BUILD_ID;

/* 永不进入缓存：SW 自身、版本清单（后者每次都必须取到网络最新值） */
const PASSTHROUGH = ['/sw.js', '/version.json'];

/* 命中这些前缀的请求走"缓存优先"（内容哈希或整目录版本化的静态资源） */
const CACHE_FIRST_PREFIXES = ['/apps/', '/assets/', '/vendor/', '/fonts/', '/images/', '/icons/'];

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE_NAME);
			// 逐个 add 而不是 addAll：单个 URL 404 不会让整批预缓存失败
			await Promise.allSettled(
				PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' }))),
			);
		})(),
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
					.map((key) => caches.delete(key)),
			);
			await self.clients.claim();
		})(),
	);
});

self.addEventListener('message', (event) => {
	const data = event.data || {};

	if (data.type === 'SKIP_WAITING') {
		self.skipWaiting();
		return;
	}

	// 页面问"你（即已安装的那份）是哪个版本"
	if (data.type === 'GET_VERSION' && event.source) {
		event.source.postMessage({ type: 'VERSION', buildId: BUILD_ID, buildTime: BUILD_TIME });
	}
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (PASSTHROUGH.includes(url.pathname)) return;
	// Range 请求（音视频拖动进度、部分 wasm 加载）不做缓存，直接交给网络
	if (request.headers.has('range')) return;

	if (request.mode === 'navigate') {
		event.respondWith(networkFirst(request));
		return;
	}

	if (CACHE_FIRST_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
		event.respondWith(cacheFirst(request));
		return;
	}

	event.respondWith(staleWhileRevalidate(request));
});

/** 页面导航：优先网络（保证内容最新），断网时回退缓存 */
async function networkFirst(request) {
	const cache = await caches.open(CACHE_NAME);

	try {
		const response = await fetch(request);
		if (response && response.ok) {
			await putSafe(cache, request, response);
		}
		return response;
	} catch (error) {
		const cached =
			(await cache.match(request, { ignoreSearch: true })) || (await cache.match('/'));
		if (cached) return cached;

		return new Response('离线，且本地没有这份页面的缓存。', {
			status: 503,
			headers: { 'content-type': 'text/plain; charset=utf-8' },
		});
	}
}

/** 静态资源：有缓存直接用，没有就取网络并顺手存下 */
async function cacheFirst(request) {
	const cache = await caches.open(CACHE_NAME);
	const cached = await cache.match(request);
	if (cached) return cached;

	try {
		const response = await fetch(request);
		if (response && response.ok && response.status === 200) {
			await putSafe(cache, request, response);
		}
		return response;
	} catch (error) {
		return new Response('', { status: 504, statusText: 'Gateway Timeout' });
	}
}

/** 其余同源 GET：先给缓存（如果有），同时在后台更新 */
async function staleWhileRevalidate(request) {
	const cache = await caches.open(CACHE_NAME);
	const cached = await cache.match(request);

	const revalidate = fetch(request)
		.then(async (response) => {
			if (response && response.ok && response.status === 200) {
				await putSafe(cache, request, response);
			}
			return response;
		})
		.catch(() => null);

	if (cached) return cached;

	const response = await revalidate;
	if (response) return response;
	return new Response('', { status: 504, statusText: 'Gateway Timeout' });
}

/**
 * 写缓存。QuotaExceededError（iOS 配额偏小）等一律吞掉：
 * 缓存写不进去也不该让这次请求失败。
 */
async function putSafe(cache, request, response) {
	try {
		await cache.put(request, response.clone());
	} catch (error) {
		/* 忽略：配额不足，或该响应不可缓存 */
	}
}
