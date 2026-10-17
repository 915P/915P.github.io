/**
 * PWA 客户端逻辑：Service Worker 注册、版本查询、更新与安装引导。
 *
 * Base.astro / Nav.astro / Footer.astro 都会 import 这个模块 —— Astro 会把同一个
 * 模块打包成一份，三处拿到的是同一个实例，所以下面的模块级状态是共享的。
 * 三个地方各自调用 initPwa() 也没问题：它是幂等的。
 */

export interface PwaVersion {
	/** 构建号（git 短 SHA） */
	id: string;
	/** 构建时间戳（毫秒；展示时按访问者本地时区格式化） */
	time: number;
}

export interface PwaState {
	/** 浏览器是否支持 Service Worker */
	supported: boolean;
	/** 当前控制本页面的那份 SW 的版本，即"已安装版本"；未安装为 null */
	installed: PwaVersion | null;
	/** 服务器上的最新构建（来自 /version.json），取不到为 null */
	latest: PwaVersion | null;
	/** 是否有新版本已装好、正等待激活 */
	updateReady: boolean;
	/** 是否可触发安装（beforeinstallprompt 已触发） */
	installAvailable: boolean;
	/** 是否已经以独立窗口方式运行 */
	standalone: boolean;
	/** 是否 iOS/iPadOS 上的 Safari（没有 beforeinstallprompt，需要手动引导） */
	ios: boolean;
}

export type UpdateResult = 'updated' | 'current' | 'failed' | 'unsupported';
export type InstallResult = 'accepted' | 'dismissed' | 'ios' | 'unavailable';

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** 只声明我们用到的 mdui 全局函数（mdui.global.js 在 <head> 里先于本模块执行） */
interface MduiGlobal {
	snackbar?: (options: {
		message: string;
		action?: string;
		placement?: 'top' | 'top-start' | 'top-end' | 'bottom' | 'bottom-start' | 'bottom-end';
		onActionClick?: () => void;
	}) => unknown;
	dialog?: (options: {
		headline?: string;
		body?: string;
		actions?: Array<{ text: string; onClick?: () => boolean | void }>;
	}) => unknown;
}

const SW_URL = '/sw.js';
const VERSION_URL = '/version.json';

const state: PwaState = {
	supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
	installed: null,
	latest: null,
	updateReady: false,
	installAvailable: false,
	standalone: false,
	ios: false,
};

type Listener = (state: PwaState) => void;

const listeners = new Set<Listener>();
let registration: ServiceWorkerRegistration | null = null;
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initializing: Promise<void> | null = null;
/** 点了"立即更新"之后，等 controllerchange 再刷新页面 */
let reloadPending = false;
/** 本次会话是否已经提示过"发现新版本"（见 announceIfNeeded） */
let announcedUpdate = false;

function emit(): void {
	announceIfNeeded();

	for (const listener of listeners) {
		try {
			listener(state);
		} catch (error) {
			console.error('[pwa] 状态监听器报错', error);
		}
	}
}

/**
 * 边沿触发地提示"发现新版本"：只在 updateReady 由 false 变 true 时弹一次。
 * 所有状态变化都走 emit()，所以这里是唯一需要判重的地方
 * （自动检查更新与手动点"检查更新"都可能触发，不判重会弹两次）。
 */
function announceIfNeeded(): void {
	if (!state.updateReady) {
		announcedUpdate = false;
		return;
	}

	if (announcedUpdate) return;
	announcedUpdate = true;
	notify('发现新版本', { text: '立即更新', onClick: () => void applyUpdate() });
}

export function getPwaState(): PwaState {
	return state;
}

/** 订阅状态变化，注册时立即用当前状态回调一次。返回取消订阅函数。 */
export function onPwaState(listener: Listener): () => void {
	listeners.add(listener);
	listener(state);
	return () => {
		listeners.delete(listener);
	};
}

export function initPwa(): Promise<void> {
	if (initializing) return initializing;

	initializing = (async () => {
		state.standalone = detectStandalone();
		state.ios = detectIos();

		window.addEventListener('beforeinstallprompt', (event) => {
			// 拦掉浏览器自带的安装横幅，改由顶栏的安装按钮触发
			event.preventDefault();
			deferredPrompt = event as BeforeInstallPromptEvent;
			state.installAvailable = true;
			emit();
		});

		window.addEventListener('appinstalled', () => {
			deferredPrompt = null;
			state.installAvailable = false;
			emit();
		});

		// 开发环境没有 dist/sw.js（它由构建脚本生成），注册必然 404，直接跳过
		if (!state.supported || import.meta.env.DEV) {
			emit();
			return;
		}

		navigator.serviceWorker.addEventListener('message', (event) => {
			const data = event.data as { type?: string; buildId?: string; buildTime?: number } | null;
			if (!data || data.type !== 'VERSION' || !data.buildId) return;

			state.installed = { id: data.buildId, time: Number(data.buildTime) || 0 };
			syncUpdateReady();
			emit();
		});

		navigator.serviceWorker.addEventListener('controllerchange', () => {
			void refreshInstalledVersion();

			if (reloadPending) {
				reloadPending = false;
				window.location.reload();
			}
		});

		try {
			registration = await navigator.serviceWorker.register(SW_URL, {
				scope: '/',
				updateViaCache: 'none',
			});
		} catch (error) {
			console.warn('[pwa] Service Worker 注册失败', error);
			emit();
			return;
		}

		watchForUpdates(registration);

		// 上一次访问时可能已经留下了等待激活的新版本
		if (registration.waiting && navigator.serviceWorker.controller) {
			state.updateReady = true;
		}

		emit();
		await Promise.all([refreshInstalledVersion(), refreshLatestVersion()]);

		// 顺手查一次更新，但不用等它（失败也无所谓）
		void registration.update().catch(() => {});
	})();

	return initializing;
}

function watchForUpdates(reg: ServiceWorkerRegistration): void {
	reg.addEventListener('updatefound', () => {
		const installing = reg.installing;
		if (!installing) return;

		installing.addEventListener('statechange', () => {
			if (installing.state !== 'installed') return;

			if (navigator.serviceWorker.controller) {
				// 旧版本还在跑 → 新版本装好但处于 waiting，交给用户决定何时更新
				// （提示由 emit() 里的 announceIfNeeded 统一发出）
				state.updateReady = true;
				emit();
			} else {
				// 首次安装：装完即接管，补一次"已安装版本"
				void refreshInstalledVersion();
			}
		});
	});
}

async function refreshInstalledVersion(): Promise<void> {
	const controller = navigator.serviceWorker.controller;
	if (!controller) {
		state.installed = null;
		emit();
		return;
	}

	// SW 会回一条 { type: 'VERSION' }，由上面的 message 监听器接住
	controller.postMessage({ type: 'GET_VERSION' });
}

/** 拉取服务器上的最新构建信息（绕过 HTTP 缓存与 SW 缓存） */
export async function refreshLatestVersion(): Promise<PwaVersion | null> {
	try {
		const response = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
		if (!response.ok) return null;

		const data = (await response.json()) as { id?: string; time?: number };
		if (!data || typeof data.id !== 'string') return null;

		state.latest = { id: data.id, time: Number(data.time) || 0 };
		syncUpdateReady();
		emit();
		return state.latest;
	} catch {
		return null;
	}
}

function syncUpdateReady(): void {
	if (registration?.waiting) {
		state.updateReady = true;
		return;
	}

	const { installed, latest } = state;
	// 判重必须带上 time：页脚展示的是时间戳，而同一提交重新构建时
	// BUILD_ID 不变、BUILD_TIME 变了 —— 只用 id 判会出现"两个版本号不同
	// 却不提示更新"的矛盾状态。time 拿不到（老版本 SW）时才退回比 id。
	state.updateReady = Boolean(
		installed &&
			latest &&
			(installed.id !== latest.id || (installed.time > 0 && installed.time !== latest.time)),
	);
}

/** 手动检查更新。返回 'updated' 表示发现新版本（还需调用 applyUpdate 才会生效）。 */
export async function checkForUpdate(): Promise<UpdateResult> {
	if (!state.supported || import.meta.env.DEV) return 'unsupported';

	try {
		if (!registration) {
			registration = (await navigator.serviceWorker.getRegistration('/')) ?? null;
		}
		await registration?.update();
	} catch (error) {
		console.warn('[pwa] 检查更新失败', error);
	}

	// update() 解析后若发现了新版本，installing / waiting 会存在，等它装完
	if (registration && (registration.installing || registration.waiting)) {
		await waitFor(() => Boolean(registration?.waiting || state.updateReady), 4000);
	}

	await Promise.all([refreshLatestVersion(), refreshInstalledVersion()]);
	await waitFor(() => state.installed !== null, 1000);

	syncUpdateReady();
	emit();

	if (state.updateReady) return 'updated';
	return state.latest ? 'current' : 'failed';
}

/**
 * 让等待中的新版本立即接管并刷新页面。
 *
 * 若此刻还没有 waiting 的 SW（例如刚触发更新、SW 还在安装），
 * 就现场查一次再决定：能接管就接管，查不到就如实提示。
 */
export async function applyUpdate(): Promise<void> {
	if (registration?.waiting) {
		activateWaiting(registration.waiting);
		return;
	}

	const result = await checkForUpdate();

	if (registration?.waiting) {
		activateWaiting(registration.waiting);
		return;
	}

	if (result === 'current') {
		notify('已是最新版本');
	} else if (result === 'failed') {
		notify('更新失败，请稍后重试');
	} else {
		notify('新版本还在下载，请稍候再试');
	}
}

function activateWaiting(worker: ServiceWorker): void {
	reloadPending = true;
	worker.postMessage({ type: 'SKIP_WAITING' });
}

/**
 * 「检查更新 / 立即更新」按钮的统一行为（页脚与 /guide 设置面板共用）：
 * 有新版本在等待就直接切换；否则现场查一次，并如实提示结果。
 *
 * 查到新版本时不额外提示 —— emit() 里的 announceIfNeeded 已经弹过一次了。
 */
export async function manualUpdate(): Promise<void> {
	if (state.updateReady) {
		await applyUpdate();
		return;
	}

	const result = await checkForUpdate();

	if (result === 'current') {
		notify('已是最新版本');
	} else if (result === 'failed') {
		notify('检查更新失败，请稍后重试');
	}
}

export async function promptInstall(): Promise<InstallResult> {
	if (deferredPrompt) {
		const prompt = deferredPrompt;
		deferredPrompt = null;
		state.installAvailable = false;
		emit();

		try {
			await prompt.prompt();
			const choice = await prompt.userChoice;
			return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
		} catch {
			return 'unavailable';
		}
	}

	if (state.ios && !state.standalone) {
		showIosInstallHelp();
		return 'ios';
	}

	return 'unavailable';
}

/**
 * 把构建时间戳格式化成版本号 `YYMMDDhhmm`（按访问者本地时区）。
 * 例：2026-10-17 10:08 → `2610171008`。
 */
export function formatVersionTime(time: number): string {
	if (!time) return '—';

	const date = new Date(time);
	if (Number.isNaN(date.getTime())) return '—';

	const pad = (value: number) => String(value).padStart(2, '0');
	return [
		pad(date.getFullYear() % 100),
		pad(date.getMonth() + 1),
		pad(date.getDate()),
		pad(date.getHours()),
		pad(date.getMinutes()),
	].join('');
}

function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
	return new Promise((resolve) => {
		const deadline = Date.now() + timeoutMs;

		const tick = () => {
			if (predicate()) {
				resolve(true);
				return;
			}
			if (Date.now() >= deadline) {
				resolve(false);
				return;
			}
			window.setTimeout(tick, 150);
		};

		tick();
	});
}

function mdui(): MduiGlobal | undefined {
	return (window as unknown as { mdui?: MduiGlobal }).mdui;
}

/** 用 mdui 的消息条提示；mdui 未就绪时退回控制台，不抛错 */
export function notify(message: string, action?: { text: string; onClick: () => void }): void {
	const api = mdui();
	if (!api?.snackbar) {
		console.info('[pwa]', message);
		return;
	}

	api.snackbar({
		message,
		action: action?.text,
		placement: 'bottom',
		onActionClick: action?.onClick,
	});
}

function showIosInstallHelp(): void {
	const api = mdui();
	if (api?.dialog) {
		api.dialog({
			headline: '安装到主屏幕',
			body: '<p>在 Safari 中点击底部的「分享」按钮，再选择「添加到主屏幕」即可。</p>',
			actions: [{ text: '知道了' }],
		});
		return;
	}

	window.alert('在 Safari 中点击「分享」→「添加到主屏幕」即可安装。');
}

function detectStandalone(): boolean {
	if (typeof window === 'undefined') return false;
	if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
	if (window.matchMedia?.('(display-mode: minimal-ui)').matches) return true;
	return (navigator as unknown as { standalone?: boolean }).standalone === true;
}

function detectIos(): boolean {
	if (typeof navigator === 'undefined') return false;

	const ua = navigator.userAgent;
	const maxTouchPoints =
		(navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints ?? 0;
	// iPadOS 13+ 默认伪装成 macOS，只能靠触摸点数识别
	const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && maxTouchPoints > 1);
	// iOS 上只有 Safari 有"添加到主屏幕"入口，CriOS/FxiOS/EdgiOS 同样是 WebKit 但没有
	const isSafari = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

	return isIos && isSafari;
}
