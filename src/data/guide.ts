/**
 * /guide/ 起始页的数据。
 *
 * 这个页面是照着 Firefox 新标签页做的：顶部一个「搜索 / 输网址」框，
 * 下面一屏站点磁贴。磁贴分两部分：
 *   - defaultTiles：首次访问的默认集合（挑的是最常用的一批）
 *   - guideCatalog：全部候选，用户在编辑模式里可以随时加进来
 *
 * 目录直接复用 links.ts 的 navLinks —— 两边是同一批链接，不重复维护。
 */

import { navLinks, linkCategories, type NavLink, type LinkGroup } from './links';
import { siteIcons } from './site-icons';

// 页面脚本要用到这个类型，这里转出去，免得它再去碰 links.ts
export type { LinkGroup };

export interface GuideTile {
	id: string;
	title: string;
	/** 完整网址；不含协议时按 https 处理 */
	url: string;
	/** favicon 加载失败时的兜底图标 */
	icon: string;
	/** 归属哪个标签页 */
	group: LinkGroup;
}

/** 一个磁贴的可达性前提，用于在校外给出提示 */
export interface TileAccess {
	/** 校外解析不出、必须校园网 */
	campusOnly: boolean;
	/** 境外站点，国内可能打不开 */
	intl: boolean;
	/** 要图书馆订购权限才拿得到全文（校外通常还得先连 VPN） */
	subscription: boolean;
}

/**
 * 查某个网址的可达性前提。
 *
 * 标记只存在 links.ts 这一处，磁贴不重复存 —— 用户手动加的磁贴只要网址
 * 和目录里的某条对得上，也能自动继承标记，不用同步维护两份。
 */
export function tileAccess(url: string): TileAccess {
	const key = normalizeUrl(url).replace(/\/+$/, '');
	const hit = navLinks.find((link) => link.url.replace(/\/+$/, '') === key);
	return {
		campusOnly: Boolean(hit?.campusOnly),
		intl: Boolean(hit?.intl),
		subscription: Boolean(hit?.subscription),
	};
}

/**
 * 某个标签页在当前网络下「能不能用」。
 *
 * 返回 null 表示这条链接没有网络前提，不该显示任何提示。
 * 注意 campusOnly 的判定不看 campus 状态为 'unknown'/'checking' ——
 * 那不是「校外」，只是还没测出来，此时不该给用户添堵。
 */
export function accessWarning(
	access: TileAccess,
	snapshot: NetSnapshot,
	url?: string,
): string | null {
	if (access.campusOnly && snapshot.campus === 'fail') return '需校园网';
	if (access.subscription && snapshot.campus === 'fail') return '需订阅';
	if (access.intl) {
		/*
		 * 境外站点按国际连通性**分两档**，不能一律「境外」、也不能一律不提示：
		 *   - GitHub / Google 都通 → 国际线路正常，不打标记；
		 *   - 只有一个通 → 线路只通了一部分，标「部分受限」；
		 *   - 两个都不通 → 「境外」。
		 * 只要还有 unknown / checking，就当还没测出来，什么都不标 ——
		 * 拿没出结果的探测吓人，是这个页面最忌讳的事。
		 */
		const intlOk = (snapshot.github === 'ok' ? 1 : 0) + (snapshot.google === 'ok' ? 1 : 0);
		if (intlOk === 2) return null;
		if (intlOk === 1) {
			/*
			 * 「部分受限」只提醒**确实可能打不开**的站：探测目标自身
			 * （github.com / google.com 及其子域）既然已经探明可达，再挂标记
			 * 就是自相矛盾。典型场景是「GitHub 通、Google 不通」——GitHub
			 * 磁贴不该提示。url 缺省时（旧调用点/纯单测）退回到一律提示。
			 */
			if (url && coveredByOkProbe(url, snapshot)) return null;
			return '部分受限';
		}
		if (snapshot.github === 'fail' && snapshot.google === 'fail') return '境外';
	}
	return null;
}

/** 探测目标对应的站点；探明可达时，这类站点自身不再提示「部分受限」 */
const INTL_PROBE_SITES: Array<{ key: 'github' | 'google'; host: string }> = [
	{ key: 'github', host: 'github.com' },
	{ key: 'google', host: 'google.com' },
];

/** 该网址是否落在某个「已探测为可达」的目标域名（含子域）内 */
function coveredByOkProbe(url: string, snapshot: NetSnapshot): boolean {
	const host = urlHost(url);
	if (!host) return false;
	return INTL_PROBE_SITES.some(
		(p) => (host === p.host || host.endsWith(`.${p.host}`)) && snapshot[p.key] === 'ok',
	);
}

/**
 * 点开前那句提醒，**按资源的具体类型分别措辞**。
 *
 * 之前这里只有一句「你所在的网络环境可能无法打开此网站/没有解锁此资源」，
 * 什么都不说清：校内系统、图书馆订购库、境外站是三件完全不同的事，
 * 用一句话糊过去等于没提醒。所以拆成三种说法：
 *
 *  - 校内资源：明说只在校内网解析得出来；
 *  - 订购数据库：明说全文要机构账号解锁，校外先连 VPN；
 *  - 境外站点：明说服务器在境外，并按当前国际连通性分「全部不通」与
 *    「只有部分线路可达」两种说法。
 *
 * 一条都**不猜**探测结论（「当前推测」「你可能开着 VPN」这类）——
 * 用户明确说过不要。探测是推测，把它当事实讲出来是误导；
 * 这里只讲「这类资源本来就有什么前提」，那是确定的事实。
 * 境外这一档会用到探测结果，但**一律带「可能」**，且不猜用户自己的状况。
 *
 * @param snapshot 当前网络快照；省略时按「不确定」措辞（向后兼容）
 */
export function accessNotice(
	access: TileAccess,
	title: string,
	snapshot?: NetSnapshot,
): string | null {
	if (access.campusOnly) {
		return `「${title}」是校内资源，只在校内网（或已连的 VPN）里才解析得出来。现在还要打开吗？`;
	}
	if (access.subscription) {
		return `「${title}」需要通过校园网（或学校 VPN ）的机构订阅才能下全文。现在还要打开吗？`;
	}
	if (access.intl) {
		const intlOk = snapshot
			? (snapshot.github === 'ok' ? 1 : 0) + (snapshot.google === 'ok' ? 1 : 0)
			: 0;
		if (snapshot && snapshot.github === 'fail' && snapshot.google === 'fail') {
			return `「${title}」是境外站点，当前网络访问国际互联网可能受限。现在还要打开吗？`;
		}
		if (intlOk === 1) {
			return `「${title}」是境外站点，你当前的网络环境可能无法打开。现在还要打开吗？`;
		}
		return `「${title}」是境外站点，在当前网络环境下可能无法打开。现在还要打开吗？`;
	}
	return null;
}

/**
 * 磁贴图标：查**本地**清单，拿不到返回 null。
 *
 * ⚠️ 刻意**不再**用 `https://{host}/favicon.ico` 实时去读。实测失败率极高：
 * 404、证书无效（ERR_CERT_AUTHORITY_INVALID）、跨源策略拦截
 * （ERR_BLOCKED_BY_RESPONSE.NotSameOrigin）…… 每一种都会在控制台刷一条
 * 红色报错，一屏磁贴能刷十几条，看着像页面坏了；而且那等于把 50 多个
 * 第三方站点的可用性全绑到自家首页上。
 *
 * 图标由 `npm run icons:sites` 在**构建期**抓下来放进 public/icons/sites/，
 * 清单见 src/data/site-icons.ts（自动生成，别手改）。
 *
 * 先按磁贴 id 查（默认磁贴的 id 就是链接 id），再按域名查
 * —— 用户自己加的磁贴只有域名，得走第二条路。
 */
export function siteIcon(id: string, url: string): string | null {
	const byId = siteIcons[id];
	if (byId) return byId;
	const host = urlHost(url);
	return (host && siteIcons[host]) || null;
}

/**
 * 磁贴图标的兜底文字。
 *
 * 用站点标题的首字，不是 emoji —— 用户明确说过不要那些 emoji。
 * 抓不到 favicon 时至少能认出是哪个站（标题首字 + 域名配色）。
 */
export function siteFallback(label: string, url: string): string {
	const text = [...label.trim()][0];
	if (text) return text;
	const host = urlHost(url);
	return (host ? host.replace(/^www\./, '')[0].toUpperCase() : '·');
}

/** 兜底文字的配色：域名散列成稳定色相，同一个站每次都一样 */
export function siteFallbackColor(url: string): string {
	// 取不到域名就拿整条地址散列，同一个工具永远同一个颜色
	const host = urlHost(url) ?? url;
	let hash = 7;
	for (const ch of host) hash = (hash * 31 + ch.codePointAt(0)!) % 360;
	return `hsl(${hash} 46% 42%)`;
}

/** 补全协议。磁贴与搜索框共用，避免各写一套 */
export function normalizeUrl(input: string): string {
	const trimmed = input.trim();
	// 站内根相对路径没有域名可补，补 `https://` 会变成 https:///tools/... 这种废地址
	if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
	if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
	return `https://${trimmed}`;
}

/** 磁贴列表里显示的标题：去掉协议、去掉末尾斜杠，域名短一点更好看 */
export function tileLabel(url: string, fallback: string): string {
	const fallbackText = fallback.trim();
	// 用户自己加的磁贴（没有描述）就直接用域名，看起来比长 URL 干净
	if (!fallbackText) {
			const host = urlHost(url);
		return host ? host.replace(/^www\./, '') : url;
	}
	return fallbackText;
}

/** 全部候选（去掉需要校内网 / 登录的，避免一屏都是打不开的） */
export const guideCatalog: NavLink[] = navLinks.filter((link) => !link.intranet);

/**
 * 磁贴的搜索文本。
 *
 * 转发 links.ts 的实现，顺便说明为什么要转发：站内小工具的网址是
 * 根相对路径，`new URL()` 解不出 hostname，直接用会抛异常。
 */
export { linkSearchText } from '../data/links';

/**
 * 标签页。
 *
 * 默认用 links.ts 的分类定义，不另建一套 —— 同一个链接只归一类，
 * 不会出现「两处叫法不一样」。用户可以自己新建/删除/重排，
 * 那一份存在 localStorage 里，这里只给**默认值**。
 */
export interface GuideTab {
	/** 稳定标识；磁贴的 group 就是它。字符集限定 [a-z0-9-] */
	key: string;
	label: string;
	/** MD3 配色角色，用于分类标题 */
	tone: 'primary' | 'secondary' | 'tertiary';
}

export const guideTabs: GuideTab[] = linkCategories;

/** 用户手加磁贴时没得选分类时的兜底 */
export const FALLBACK_GROUP: string = 'tools';

/** 标签页数量的上限，防止畸形配置把标签栏撑爆 */
export const MAX_TABS = 24;
/** 标签页名称长度上限 */
export const MAX_TAB_LABEL = 12;

const TAB_TONES: GuideTab['tone'][] = ['primary', 'secondary', 'tertiary'];

/** 新标签页的配色：按已有数量轮换，避免清一色 */
export function nextTabTone(tabs: GuideTab[]): GuideTab['tone'] {
	return TAB_TONES[tabs.length % TAB_TONES.length];
}

/** 生成一个不与现有重复的标签页 key */
export function makeTabKey(tabs: GuideTab[]): string {
	const used = new Set(tabs.map((t) => t.key));
	const base = `tab-${Date.now().toString(36)}`;
	let key = base;
	let n = 1;
	while (used.has(key)) key = `${base}-${n++}`;
	return key;
}

/**
 * 校验并规整一份标签页数组（来自本地存储或导入文件）。
 *
 * 任何一项非法就跳过该条；一条都不剩则返回 null，由调用方决定退回默认。
 * key 限定 `[a-z0-9-]`：它会被写进磁贴的 group、也会拼进 DOM 的 data 属性，
 * 放开字符集只会自找麻烦。
 */
export function parseTabs(raw: unknown): GuideTab[] | null {
	if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TABS) return null;
	const out: GuideTab[] = [];
	const seen = new Set<string>();
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const entry = item as Record<string, unknown>;
		const key = typeof entry.key === 'string' ? entry.key.trim().slice(0, 40) : '';
		const label = typeof entry.label === 'string' ? entry.label.trim().slice(0, MAX_TAB_LABEL) : '';
		if (!key || !label || seen.has(key) || !/^[a-z0-9-]+$/.test(key)) continue;
		seen.add(key);
		const tone = TAB_TONES.includes(entry.tone as GuideTab['tone'])
			? (entry.tone as GuideTab['tone'])
			: nextTabTone(out);
		out.push({ key, label, tone });
	}
	return out.length ? out : null;
}


/**
 * 默认磁贴 = **全部**候选，一个不藏。
 *
 * 之前只铺十几个常用、剩下的塞进「添加磁贴」对话框的候选列表 ——
 * 结果大半链接要主动去翻才看得到。这个起始页的意义就是「一眼看全常用入口」，
 * 所以直接全铺出来，按分类分 tab；编辑态仍可删除、拖动排序。
 */
export const defaultTiles: GuideTile[] = guideCatalog.map((link) => ({
	id: link.id,
	title: link.title,
	url: link.url,
	icon: link.icon,
	group: link.group,
	// 小工具用 Material Icons；favicon 磁贴不带这个字段
	...(link.materialIcon ? { materialIcon: link.materialIcon } : {}),
}));

/* -------------------------------------------------------------- 搜索引擎 */

export interface SearchEngine {
	id: string;
	name: string;
	/** {q} 会被替换成用户输入 */
	url: string;
	/** 需要国际互联网才打得开 */
	intl?: boolean;
	/** 学术检索（Google 学术这类），和普通网页搜索区分开 */
	scholar?: boolean;
	/** 百科检索（维基百科中英文） */
	wiki?: boolean;
	/**
	 * 本地 logo（public/icons/search/ 下）。
	 *
	 * ⚠️ 必须**下载到本地**、不能热链各家的 favicon：
	 * 一来 Google 系站点在墙内根本连不上（实测 curl 直接超时），
	 * 二来热链别人的资源等于每次打开首页都往对方发一次请求。
	 * 来源是 simple-icons（CC0-1.0）。
	 *
	 * 用的是 iconify 的**彩色官方 logo**（logos / academicons 集合），
	 * 不是 simple-icons —— 后者全是单色路径。实测把官方彩色 logo 放进
	 * 深色主题后一片「看不见」，原因有二：
	 *
	 * 1. `<img src="x.svg">` 里的 SVG 跑在独立文档中，**完全不继承宿主 CSS**：
	 *    既没有 currentColor，也没有 color。不带 fill 的路径会默认填黑，
	 *    深色底上直接隐形。所以每个文件里都**烙死了颜色**。
	 * 2. iconify 返回的根 <svg> 带 `width="0.66em" height="1em"` 这类 em 尺寸，
	 *    在 <img> 里按 font-size 解析 —— 实测 Bing 的 logo 被缩到 11px 宽，
	 *    几乎看不见。所以统一**去掉根元素的 width/height**，只留 viewBox，
	 *    尺寸交给 CSS 的 object-fit 控制。
	 *
	 * 例外两个：
	 * - Baidu、Wikipedia 官方本来就是单色（品牌蓝 / 灰度字母），
	 *   Wikipedia 那版改成中性灰，否则官方纯黑在深色主题下不可见。
	 * - Google 学术**没有**可用的彩色矢量：iconify 的 academicons 版本
	 *   是一团分不清的蓝色笔触，缩到 26px 完全认不出是什么
	 *   （踩过，见 commit 说明）。改成从 scholar.google.com 抓的**官方
	 *   favicon**（经本机 7897 代理才连得上），转成 96px PNG。
	 *   代价是位图不像矢量那么锐利，但 26px 显示绰绰有余。
	 */
	icon: string;
}

export const SEARCH_ENGINES: SearchEngine[] = [
	{
		id: 'google',
		name: 'Google',
		url: 'https://www.google.com/search?q={q}',
		intl: true,
		icon: '/icons/search/google.svg',
	},
	{ id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q={q}', icon: '/icons/search/bing.svg' },
	{ id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd={q}', icon: '/icons/search/baidu.svg' },
	{
		id: 'scholar',
		name: 'Google 学术',
		url: 'https://scholar.google.com/scholar?q={q}',
		intl: true,
		scholar: true,
		icon: '/icons/search/scholar.png',
	},
	{
		id: 'wikipedia-zh',
		name: '维基百科',
		url: 'https://zh.wikipedia.org/w/index.php?search={q}',
		intl: true,
		wiki: true,
		icon: '/icons/search/wikipedia.svg',
	},
	{
		id: 'wikipedia-en',
		name: 'Wikipedia',
		url: 'https://en.wikipedia.org/w/index.php?search={q}',
		intl: true,
		wiki: true,
		icon: '/icons/search/wikipedia.svg',
	},
	{
		id: 'ddg',
		name: 'DuckDuckGo',
		url: 'https://duckduckgo.com/?q={q}',
		intl: true,
		icon: '/icons/search/duckduckgo.svg',
	},
];

/**
 * 国际互联网算不算可用。
 *
 * GitHub / Google 任一通就算 —— 要求两个都通太苛刻：单个站点被单独墙掉
 * 不代表整个国际网络不通，用它当门槛会把一堆正常网络误判成「不通」。
 */
export function intlAvailable(snapshot: NetSnapshot): boolean {
	return snapshot.github === 'ok' || snapshot.google === 'ok';
}

/**
 * 实际用哪个引擎。
 *
 * 用户在界面上显式选过就尊重选择（哪怕当前网络用不了那个引擎 ——
 * 用户可能开着自己的代理）；没选过才按网络自动挑：
 * 国际互联网**完全通畅**（GitHub 与 Google 都通）→ Google；
 * 其余情况（部分可达 / 不畅 / 未检测）→ Bing。
 *
 * 门槛刻意用「两个都通」而不是 intlAvailable 的「任一通」：
 * 只通一个时 Google 未必稳，默认走 Bing 更保险。
 */
export function pickEngine(snapshot: NetSnapshot, chosenId: string | null): SearchEngine {
	if (chosenId) {
		const hit = SEARCH_ENGINES.find((engine) => engine.id === chosenId);
		if (hit) return hit;
	}
	const intlFull = snapshot.github === 'ok' && snapshot.google === 'ok';
	const preferred = intlFull ? 'google' : 'bing';
	return (
		SEARCH_ENGINES.find((engine) => engine.id === preferred) ??
		// SEARCH_ENGINES 是模块内写死的常量，按 id 找不到只可能是数据写错了
		(() => {
			throw new Error(`没有 id 为 ${preferred} 的搜索引擎`);
		})()
	);
}

/**
 * 判断一段输入是网址还是搜索词。
 *
 * 判错很烦：把搜索词当网址会得到 DNS 报错，反之会拿「example.com」去搜索。
 * 规则偏保守 —— 只有明确像网址才当网址，其余一律走搜索。
 */
export function looksLikeUrl(text: string): boolean {
	const s = text.trim();
	if (!s) return false;
	/*
	 * 站内根相对路径（/tools/radix/）。
	 *
	 * 小工具磁贴就是这么存的：写死绝对域名一换域名就失效，写相对路径
	 * 才跟站点部署位置无关。`//evil.com` 是协议相对写法，会真的指到外站，
	 * 所以必须排除掉。
	 */
	if (s.startsWith('/') && !s.startsWith('//')) return true;
	// 已带协议
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return true;
	// localhost（可带端口）
	if (/^localhost(:\d+)?(\/|$)/i.test(s)) return true;
	// 纯 IP 或 IP:端口
	if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(s)) return true;
	/*
	 * 域名：中间若干段 + **末段必须是 2 个以上字母**。
	 * 末段这条限制是必需的：正则带 /i 时 `[a-z]` 也匹配数字，
	 * 于是「3.14」「1.0」这种小数/版本号会被当成域名，回车直接跳到
	 * https://3.14/ 拿到 DNS 报错。真实域名的 TLD 不会是纯数字。
	 */
	return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(s);
}

/**
 * 输入框回车后该去哪里。返回 null 表示什么都不做（输入为空）。
 *
 * 抽成纯函数是为了能在 Node 里测 —— 这个判定错了很难靠肉眼发现。
 *
 * engine 不传就用 Bing，等价于过去的固定行为。
 */
export function resolveTarget(text: string, engine?: SearchEngine): string | null {
	const value = text.trim();
	if (!value) return null;
	if (looksLikeUrl(value)) return normalizeUrl(value);
	const target = engine ?? SEARCH_ENGINES.find((item) => item.id === 'bing')!;
	return target.url.replace('{q}', encodeURIComponent(value));
}

/* ------------------------------------------------------------------ 网络检测 */

/**
 * 「我连上了什么网」的探测目标。
 *
 * ⚠️ 网页看不到你的 IP，也判断不了路由，只能通过「某个已知只在特定网络里
 * 可达的地址能不能连通」来**推断**。所以下面的措辞都是「推测」而不是断言。
 */
export type NetId = 'campus' | 'github' | 'google';

export type NetState = 'unknown' | 'checking' | 'ok' | 'fail';

export interface NetProbe {
	url: string;
	/**
	 * 只有在**确认对方会回 Access-Control-Allow-Origin** 时才能用 `cors`。
	 * `cors` 模式确实能明确区分「有响应」与「网络不通」，但代价是：
	 * 对方一旦不回 CORS 头，fetch 必然 reject —— 此时你分不清
	 * 「被墙了」还是「只是没回 CORS 头」，而且控制台会刷一条红色的
	 * CORS 报错。实测 www.google.com/generate_204 就不回这个头。
	 *
	 * 所以现网三个探针**全用 no-cors**：拿到不透明响应，但 resolve 本身就
	 * 代表「连上了并有响应」（对方回 404 / 500 也算连上），
	 * reject 代表根本没连到（DNS 失败 / 连不上 / 超时）。
	 */
	mode: 'cors' | 'no-cors';
}

export interface NetTarget {
	id: NetId;
	label: string;
	/** 这项结果意味着什么 */
	hint: string;
	/**
	 * 候选探测地址，按顺序尝试。
	 * 给 GitHub / Google 各留了后备：主地址被策略拦截时还有 favicon 那条路。
	 */
	probes: NetProbe[];
	/** 单个地址的超时；DNS 失败通常很快，这个值主要防「连上了但握手卡住」 */
	timeoutMs: number;
}

/**
/**
/**
 * 校园网判定用的地址，以及**为什么是这几个**。
 *
 * 实测（对 223.5.5.5 与 119.29.29.29 两个公共 DNS 分别 dig，结果一致）：
 *
 *   公网**无 A 记录**，只在校园网 DNS 解析 ——
 *     software.tongji.edu.cn   正版软件平台
 *     itongjis.tongji.edu.cn   第二课堂
 *     phyvr.tongji.edu.cn      物理实验中心
 *     cxcy.tongji.edu.cn       创新创业
 *
 *   公网**有 A 记录**、校外照常访问 ——
 *     1. / lib. / mail. / nic. / canvas. / myportal. / stadium. 等
 *
 * 所以只有前一类能拿来判断校园网：校外浏览器拿到的是 **NXDOMAIN**（解析失败），
 * 快速失败、不必掐 TCP 超时；接了校园网或 VPN 才解析得出、连得上。
 *
 * ⚠️ 踩过的坑：最初用 `getent hosts` 查这几个域名，拿到的是 192.168.x.x，
 * 于是我一度以为「同济把校内 IP 发布到了公网 DNS」。那其实是**本机的
 * systemd-resolved（127.0.0.53）** 返回的结果，不代表公网行为。
 * 判断「校外能不能访问」必须显式指定公共 DNS 去问，不能信本机解析器。
 *
 * ⚠️ 这条路**依赖解析器**，而解析器是可以换的：系统 DNS 换成 TUNA 的
 * 101.6.6.6 这类公共解析器后，这几个域名在校内校外都解析不出，探测恒为失败，
 * 于是满屏「需校园网」的误报。改用裸 IP 探测可以绕开 DNS，但得把内网地址
 * 写进公开仓库的源码里 —— 综合考虑后没有这么做。
 *
 * 所以留给用户一个**兜底**：设置里的「默认在校园网环境下」。
 * 打开它就当校园网可达，不再依赖探测（见 assumeCampusOn）。
 *
 * ⚠️ 另外几个**故意没放进来**的候选：
 * - `192.0.2.10:2080`（高程作业）：裸 IP，路由确实只有校园网通。但它**不保证
 *   一直在线** —— 关机 / 维护时在校内也会探不通，用它判「有没有接校园网」会
 *   让人在校内被误报成校外。它只作为磁贴存在，带 campusOnly 标记。
 * - `cxcy.tongji.edu.cn`：公网确实无记录，但站点本身太新、稳定性没验证过，
 *   留着不作为判定依据。
 *
 * 选这几个的共同前提：**校内稳定常开**。判定地址越稳定，误报越少。
 */
export const CAMPUS_ONLY_HOSTS = [
	'software.tongji.edu.cn',
	'itongjis.tongji.edu.cn',
	'phyvr.tongji.edu.cn',
] as const;

/** 校园网：探多个地址，任一通即视为已接入（避免个别站点宕机造成误报） */
export const CAMPUS_TARGET: NetTarget = {
	id: 'campus',
	label: '校园网',
	hint: '这些地址只在校园网 DNS 解析，能连通即推测已接入校园网或 VPN',
	probes: CAMPUS_ONLY_HOSTS.map((host) => ({
		url: `https://${host}/`,
		mode: 'no-cors' as const,
	})),
	timeoutMs: 3000,
};

export const netTargets: NetTarget[] = [
	CAMPUS_TARGET,
	{
		id: 'github',
		label: 'GitHub',
		hint: '代码托管。探的是网站本身：API 通不代表网页能打开',
		/*
		 * 刻意不探 api.github.com。
		 * 实测这俩会**分开**：API 有 ACAO 头、走的路径也不一样，
		 * 有时 api 通而网页打不开（被单独限制）。用户真正要的是「网页能不能开」，
		 * 所以探首页。首页没有 ACAO，只能 no-cors。
		 */
		probes: [{ url: 'https://github.com/', mode: 'no-cors' }],
		timeoutMs: 4000,
	},
	{
		id: 'google',
		label: 'Google',
		hint: '常被限制，是国际连通性最有代表性的指标',
		/*
		 * ⚠️ 这里**必须**用 no-cors，用 cors 会得到「永远 fail」的假阴性。
		 *
		 * 实测（带 Origin 头请求响应头）：
		 *     www.google.com/generate_204  →  204，但**没有** access-control-allow-origin
		 *     api.github.com/zen            →  ACAO: *
		 *     github.com                    →  无 ACAO
		 *
		 * generate_204 只回 204，不回 CORS 头，所以 cors 模式的 fetch 必然被浏览器
		 * 判成跨域失败 —— 哪怕服务器完全可达。我一开始就是用 cors 探它，于是
		 * 「Google 不通」这个结论是**假的**（实际机器走代理完全能通），
		 * 控制台还会刷一条红色的 "CORS Missing Allow Origin"，看着像页面坏了。
		 *
		 * no-cors 下拿到的是不透明响应，但 resolve 本身就代表「连上了」，
		 * 这才是我们要的语义。
		 */
		probes: [{ url: 'https://www.google.com/generate_204', mode: 'no-cors' }],
		timeoutMs: 4000,
	},
];


/** 一次检测的结果 */
export interface NetSnapshot {
	campus: NetState;
	github: NetState;
	google: NetState;
	/** 上次检测时间戳（毫秒）；0 = 从未检测 */
	at: number;
}

/** 两次检测之间至少隔这么久才自动重测，避免每次打开页面都打三个外部请求 */
export const NET_TTL = 5 * 60 * 1000;

export function emptySnapshot(): NetSnapshot {
	return { campus: 'unknown', github: 'unknown', google: 'unknown', at: 0 };
}

/** 快照是否过期（从未检测过也算过期） */
export function isStale(snapshot: NetSnapshot, now: number, ttl = NET_TTL): boolean {
	return snapshot.at === 0 || now - snapshot.at > ttl;
}

/**
 * 「默认在校园网环境下」—— 用户自己声明的一档，**不信探测**。
 *
 * 为什么需要它：校园网探测的判据是「校内域名解析不出就连不上」，而这依赖
 * 系统解析器。解析器一旦换成公共 DNS（TUNA 101.6.6.6、Cloudflare 之类），
 * 校内域名照样解析失败，于是**人在校内也被判成校外**，满屏「需校园网」误报。
 * 探测在这里没有能力分辨，只能问人。
 *
 * 打开时直接把 campus 当 'ok'：校内系统不该再被提示，也不会再去探那几个
 * 域名（省三次外部请求）。GitHub / Google 的探测照旧 —— 那一层跟校园网无关。
 */
export const ASSUME_CAMPUS_KEY = 'jwwl:net-campus';

/** 读用户声明；解析失败（隐私模式、脏数据）一律当作没声明 */
export function readAssumeCampus(): boolean {
	try {
		return localStorage.getItem(ASSUME_CAMPUS_KEY) === '1';
	} catch {
		return false;
	}
}

export function writeAssumeCampus(on: boolean): void {
	try {
		if (on) localStorage.setItem(ASSUME_CAMPUS_KEY, '1');
		else localStorage.removeItem(ASSUME_CAMPUS_KEY);
	} catch {
		// 存不住只是下次打开回到默认，不影响本次
	}
}

/**
 * 把「默认在校园网环境下」叠到探测结果上，得到**实际生效**的判定。
 *
 * 只改 campus 一项，github / google 照旧 —— 那一层是国际连通性，
 * 跟在不在校园网没关系，不能顺手一起放行。
 *
 * ⚠️ `at` 刻意**不**动：它记录的是「上次探测是什么时候」，github / google
 * 那两项照旧在探、时间戳对它们仍然成立。归零会让 isStale() 永远为真，
 * 于是每次打开页面都重跑一遍探测 —— 白费两次外部请求。
 */
export function applyAssumeCampus(snapshot: NetSnapshot, assumed: boolean): NetSnapshot {
	if (!assumed) return snapshot;
	return { ...snapshot, campus: 'ok' };
}

/**
 * 读本地缓存。
 *
 * 存坏数据就当没检测过 —— 这个信息本来就是「参考」，读不出来不该阻断页面。
 */
export function parseSnapshot(raw: string | null): NetSnapshot {
	const base = emptySnapshot();
	if (!raw) return base;
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object') return base;
		const pick = (value: unknown): NetState =>
			value === 'ok' || value === 'fail' ? value : 'unknown';
		const record = parsed as Record<string, unknown>;
		return {
			campus: pick(record.campus),
			github: pick(record.github),
			google: pick(record.google),
			at: typeof record.at === 'number' && Number.isFinite(record.at) ? record.at : 0,
		};
	} catch {
		return base;
	}
}

/** 单个检测项的显示文案（与具体目标无关，故不收 target 参数） */
export function describeNetState(state: NetState): { text: string; tone: 'ok' | 'warn' | 'muted' } {
	switch (state) {
		case 'ok':
			return { text: '可达', tone: 'ok' };
		case 'fail':
			return { text: '不通', tone: 'warn' };
		case 'checking':
			return { text: '检测中…', tone: 'muted' };
		default:
			return { text: '未检测', tone: 'muted' };
	}
}

/**
 * 整体结论。
 *
 * 「国际互联网」不是单独探测的目标，而是由 GitHub / Google 共同推断 ——
 * 单个站点不通可能只是它自己挂了或被单独墙了。
 */
export function describeOverall(snapshot: NetSnapshot): { text: string; tone: 'ok' | 'warn' | 'muted' } {
	const { campus, github, google } = snapshot;
	const intl = [github, google].filter((s) => s === 'ok').length;

	if (campus === 'checking' || github === 'checking' || google === 'checking') {
		return { text: '正在检测网络…', tone: 'muted' };
	}
	if (campus === 'unknown' && github === 'unknown' && google === 'unknown') {
		return { text: '尚未检测', tone: 'muted' };
	}

	const parts: string[] = [];
	if (campus === 'ok') parts.push('已接入校园网');
	if (intl === 2) parts.push('国际互联网通畅');
	else if (intl === 1) parts.push('国际互联网部分可达');
	else if (github === 'fail' && google === 'fail') parts.push('国际互联网不畅');

	const tone: 'ok' | 'warn' | 'muted' =
		campus === 'ok' || intl === 2 ? 'ok' : intl === 1 ? 'muted' : 'warn';
	return { text: parts.length ? parts.join(' · ') : '网络状况一般', tone };
}

/* ---------------------------------------------------------- 配置导入 / 导出 */

/**
 * 配置文件的格式版本。
 *
 * 导入时**必须**严格校验，理由不是「怕文件坏」：
 * 配置文件里的网址会变成磁贴的 href，而 href 是用户可点的东西 ——
 * 一个 `javascript:` 开头的地址就够在别人浏览器里执行任意脚本了。
 * 所以这里对协议、字段类型、条目数量全都设卡。
 */
export const CONFIG_VERSION = 3;

/** 能导入的最低版本。1 只含链接与搜索引擎，没有任何外观字段 */
export const MIN_CONFIG_VERSION = 1;

/**
 * 外观类设置，导入导出用。
 *
 * `customWall` 是自定义壁纸的 data URL，动辄几百 KB。它只在内置壁纸
 * 不够用、用户自己传了图时才有值；导出的文件超过体积上限就整个不带这个字段
 * （对方导入时退回纯色，导入结果里会说明）。
 */
export interface AppearanceConfig {
	/** 主题色种子，见 THEME_COLORS */
	color: string;
	mode: ThemeMode;
	/** 壁纸 id，见 WALLPAPERS；'custom' 表示用 customWall */
	wallpaper: string;
	/** 背景遮罩不透明度 */
	scrub: number;
	/** 是否默认按校园网环境处理（不探测校内站点） */
	assumeCampus: boolean;
	customWall?: string;
}

/** 单个磁贴的导出格式 */
export interface TileConfig {
	id: string;
	title: string;
	url: string;
	icon: string;
	/**
	 * 图标模式：'url' → 图片 URL，'material' → Material Icons 组件名，
	 * 'text' → emoji 或短文字。未设置时按网址自动取站点 favicon。
	 */
	iconMode?: 'url' | 'material' | 'text';
	/** 归属的标签页 key（用户可自定义，故不再限定为固定分类） */
	group: string;
	/** Material Icons 组件名（如 'swap-horiz'）；有值时渲染图标而不是 favicon */
	materialIcon?: string;
}

export interface GuideConfig {
	version: number;
	/** ISO 时间戳，仅供人看 */
	exportedAt: string;
	/** 搜索引擎 id；null = 按网络自动挑 */
	engine: string | null;
	/** 主题色 / 模式 / 壁纸 / 遮罩 / 校园网假设。v1 文件里没有 */
	appearance?: AppearanceConfig;
	/** 标签页定义（顺序即显示顺序）。v1/v2 文件里没有，缺席时保持现状 */
	tabs?: GuideTab[];
	tiles: TileConfig[];
}

/** 导入时允许的最大条目数，防止畸形文件把页面撑爆 */
export const MAX_CONFIG_TILES = 500;
/** 字段长度上限，同样是防畸形 */
const MAX_TITLE = 60;
const MAX_URL = 500;
/** 文字 / emoji 图标的最大长度 */
const MAX_ICON_TEXT = 8;
/** 图片 URL 的最大长度 */
const MAX_ICON_URL = 500;

/**
 * 允许的链接形态：http(s) 绝对地址，或**根相对路径**。
 *
 * 根相对路径（`/tools/radix/`）是小工具磁贴用的：它们本来就在同一个站里，
 * 写死绝对域名反而换域名就失效。注意 `//evil.com/x` 这种协议相对写法
 * 会被当成外站指过去，所以明确排除。
 */
export const isUsableUrl = (value: string): boolean => {
	if (value.startsWith('/') && !value.startsWith('//')) return true;
	try {
		const parsed = new URL(value);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch {
		return false;
	}
};

/**
 * 取链接的 hostname，取不到返回 null。
 *
 * 根相对路径（站内入口）没有域名可言，返回 null 而不是让 new URL 抛出去。
 */
export function urlHost(url: string): string | null {
	// 站内根相对路径没有域名，不能交给 normalizeUrl 补协议 ——
	// `https:///tools/radix/` 会被解析成 host 为 "tools" 的畸形地址
	if (url.startsWith('/') && !url.startsWith('//')) return null;
	try {
		return new URL(normalizeUrl(url)).hostname || null;
	} catch {
		return null;
	}
}

/** 自定义壁纸进配置文件的上限：再大这文件就没法看也没法转手了 */
export const MAX_CUSTOM_WALL_IN_CONFIG = 600 * 1024;

/**
 * 导出：把磁贴、搜索引擎与外观设置打包成 JSON（带缩进，方便人看/手动改）
 *
 * 自定义壁纸按体积决定去留：小就一起带过去，太大就只留个 id，
 * 对方导入时会退回纯色并在结果里说明 —— 不声不响丢设置比丢个提示糟。
 */
export function serializeConfig(
	tiles: TileConfig[],
	engine: string | null,
	appearance: AppearanceConfig,
	now: Date,
	tabs: GuideTab[] = guideTabs,
): string {
	/*
	 * 自定义壁纸按体积决定去留。
	 * ⚠️ 必须是「显式挑字段再拼」，不能写成 `{ ...appearance, ...(带上 ? {customWall} : {}) }`
	 * —— 后者在**不带**的时候只是没往里加，原来那个大字符串仍在
	 * appearance 里被展开带出去，等于没截断（实测就是这么错的）。
	 */
	const wall = appearance.customWall ?? '';
	const keepWall = wall.length > 0 && wall.length <= MAX_CUSTOM_WALL_IN_CONFIG;
	const config: GuideConfig = {
		version: CONFIG_VERSION,
		exportedAt: now.toISOString(),
		engine,
		appearance: {
			color: appearance.color,
			mode: appearance.mode,
			wallpaper: appearance.wallpaper,
			scrub: appearance.scrub,
			assumeCampus: appearance.assumeCampus,
			...(keepWall ? { customWall: wall } : {}),
		},
		tabs: tabs.map((tab) => ({ key: tab.key, label: tab.label, tone: tab.tone })),
		tiles: tiles.map((tile) => ({
			id: tile.id,
			title: tile.title,
			url: tile.url,
			icon: tile.icon,
			group: tile.group,
			...(tile.iconMode ? { iconMode: tile.iconMode } : {}),
			...(tile.materialIcon ? { materialIcon: tile.materialIcon } : {}),
		})),
	};
	return `${JSON.stringify(config, null, '\t')}\n`;
}

export interface ParseResult {
	tiles: TileConfig[];
	engine: string | null;
	/**
	 * 外观设置。v1 文件里没有，为 undefined —— 此时导入**不碰**现有外观，
	 * 只换链接和搜索引擎。
	 */
	appearance?: AppearanceConfig;
	/**
	 * 标签页定义。v3 才带；缺席时导入**不碰**现有标签页，
	 * 只按现有标签页归置磁贴。
	 */
	tabs?: GuideTab[];
	/** 被丢弃的条目数及原因，便于如实告诉用户「导入了 N 条、丢弃了 M 条」 */
	dropped: string[];
	exportedAt?: string;
}

/**
 * 导入：解析并**严格校验**一份配置。
 *
 * 校验失败就返回错误信息而不是抛异常 —— 用户从微信/邮件里收到的文件
 * 可能是任何样子，不该让页面白屏。
 */
export function parseConfig(raw: string): ParseResult | { error: string } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { error: '这不是合法的 JSON 文件。' };
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return { error: '配置文件的顶层结构不对，应当是一个对象。' };
	}
	const record = parsed as Record<string, unknown>;

	const version = record.version;
	if (typeof version !== 'number' || version < MIN_CONFIG_VERSION || version > CONFIG_VERSION) {
		return {
			error: `配置版本是 ${JSON.stringify(version)}，这份程序只认 ${MIN_CONFIG_VERSION} 到 ${CONFIG_VERSION}。`,
		};
	}

	const rawTiles = record.tiles;
	if (!Array.isArray(rawTiles)) {
		return { error: '配置里缺少 tiles 数组。' };
	}
	if (rawTiles.length > MAX_CONFIG_TILES) {
		return { error: `配置里有 ${rawTiles.length} 条，超过上限 ${MAX_CONFIG_TILES} 条。` };
	}

	/*
	 * 标签页：v3 文件才带。带了就用文件里的（磁贴按它的 key 归置），
	 * 缺席则按默认分类校验 —— 老文件的行为保持不变。
	 */
	const parsedTabs = parseTabs(record.tabs) ?? undefined;
	const tabKeys = (parsedTabs ?? guideTabs).map((tab) => tab.key);
	const knownGroups = new Set<string>(tabKeys);
	const fallbackGroup = parsedTabs ? tabKeys[0] : FALLBACK_GROUP;
	const tiles: TileConfig[] = [];
	const dropped: string[] = [];

	for (const [index, item] of rawTiles.entries()) {
		const where = `第 ${index + 1} 条`;
		if (!item || typeof item !== 'object') {
			dropped.push(`${where}：不是对象`);
			continue;
		}
		const entry = item as Record<string, unknown>;
		const id = typeof entry.id === 'string' ? entry.id.slice(0, 80) : '';
		const title = typeof entry.title === 'string' ? entry.title.trim().slice(0, MAX_TITLE) : '';
		const url = typeof entry.url === 'string' ? entry.url.trim().slice(0, MAX_URL) : '';
		const rawIcon = typeof entry.icon === 'string' ? entry.icon : '';
		const iconMode =
			entry.iconMode === 'url' || entry.iconMode === 'material' || entry.iconMode === 'text'
				? entry.iconMode
				: undefined;
		const icon = iconMode === 'url'
			? rawIcon.trim().slice(0, MAX_ICON_URL)
			: rawIcon.trim().slice(0, MAX_ICON_TEXT);

		if (!title) {
			dropped.push(`${where}：没有名称`);
			continue;
		}
		// 协议白名单：只放行 http/https，javascript: / data: 一律拒掉
		if (!url || !isUsableUrl(url)) {
			dropped.push(`${where}「${title}」：网址不合法或不是 http(s)`);
			continue;
		}
		const group = knownGroups.has(String(entry.group)) ? String(entry.group) : fallbackGroup;

		const material =
			typeof entry.materialIcon === 'string' && /^[a-z0-9-]{1,40}$/.test(entry.materialIcon)
				? entry.materialIcon
				: undefined;
		tiles.push({
			// id 缺失时自己补一个，保证渲染与排序不出问题
			id: id || `i-${Date.now().toString(36)}-${index}`,
			title,
			url,
			icon: icon || '🔗',
			group,
			// 组件名会拼进标签名，必须限制字符集：不能有空格、斜杠、尖括号
			...(material ? { materialIcon: material } : {}),
			...(iconMode ? { iconMode } : {}),
		});
	}

	if (!tiles.length) {
		return { error: '配置里没有一条可用的链接。' };
	}

	const engineRaw = record.engine;
	const engine =
		typeof engineRaw === 'string' && SEARCH_ENGINES.some((item) => item.id === engineRaw)
			? engineRaw
			: null;

	const exportedAt = typeof record.exportedAt === 'string' ? record.exportedAt : undefined;

	/*
	 * 外观设置：v1 没有这个字段，**缺席时返回 undefined**，调用方保持现状。
	 * 少了字段不代表文件坏 —— 老版本导出的文件照样能用，只是不带外观。
	 */
	const rawAppearance = record.appearance;
	let appearance: AppearanceConfig | undefined;
	if (rawAppearance && typeof rawAppearance === 'object' && !Array.isArray(rawAppearance)) {
		const a = rawAppearance as Record<string, unknown>;
		const color =
			typeof a.color === 'string' && THEME_COLORS.some((c) => c.value === a.color)
				? a.color
				: undefined;
		const mode = THEME_MODES.some((m) => m.value === a.mode) ? (a.mode as ThemeMode) : undefined;
		const wallRaw = typeof a.wallpaper === 'string' ? a.wallpaper : '';
		const knownWall = WALLPAPERS.some((w) => w.value === wallRaw);
		/*
		 * 体积同样要卡：手搓一个超大 data URL 就能把 localStorage 顶爆，
		 * 而那会让**所有**偏好都存不住（不只是壁纸）。
		 * 超限的一并按「没有自定义壁纸」处理，退回纯色。
		 */
		const wallRawText = typeof a.customWall === 'string' ? a.customWall : '';
		const customWall =
			wallRawText.length > 0 && wallRawText.length <= MAX_CUSTOM_WALLPAPER_BYTES
				? wallRawText
				: undefined;
		// 'custom' 只是标记，真正的图在 customWall 里；少了它就等于没有
		const wallpaper = knownWall
			? wallRaw
			: wallRaw === 'custom' && customWall
				? 'custom'
				: 'none';
		/*
		 * 文件里**出现** appearance 就整份替换（语义和链接一样：覆盖导入）。
		 * 单个字段认不出来只回落那一个字段的默认值，不连累其他字段 ——
		 * 手改过的文件里一个写错的颜色，不该把好好的壁纸设置也一起扔掉。
		 */
		appearance = {
			color: color ?? THEME_COLORS[0].value,
			mode: mode ?? 'auto',
			wallpaper,
			scrub: sanitizeScrub(a.scrub),
			assumeCampus: a.assumeCampus === true,
			...(wallpaper === 'custom' && customWall ? { customWall } : {}),
		};
	}

	return {
		tiles,
		engine,
		appearance,
		dropped,
		...(parsedTabs ? { tabs: parsedTabs } : {}),
		...(exportedAt ? { exportedAt } : {}),
	};
}

/**
 * 导出文件名：起始页-配置-2026-10-11.json
 *
 * 从「链接」改成「配置」是因为导出的内容早就不只是链接了 ——
 * 主题色、壁纸、遮罩、校园网假设都在里面。
 */
export function configFilename(now: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `起始页-配置-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/* ------------------------------------------------------------ 外观设置 */

/** 主题色：只存**种子色**，整套 MD3 色调板交给 mdui.setColorScheme() 生成 */
export interface ThemeColor {
	value: string;
	label: string;
}

export const THEME_COLORS: ThemeColor[] = [
	{ value: '#66ccff', label: '天蓝' },
	{ value: '#546ecc', label: '靛蓝' },
	{ value: '#5b5f97', label: '紫罗兰' },
	{ value: '#39c5bb', label: '薄荷' },
	{ value: '#00696e', label: '深青' },
	{ value: '#00ffcc', label: '荧光青' },
	{ value: '#7d5260', label: '玫瑰' },
	{ value: '#ee0000', label: '正红' },
];

export interface ThemeModeOption {
	value: ThemeMode;
	label: string;
}

export type ThemeMode = 'auto' | 'light' | 'dark';

export const THEME_MODES: ThemeModeOption[] = [
	{ value: 'auto', label: '跟随系统' },
	{ value: 'light', label: '浅色' },
	{ value: 'dark', label: '深色' },
];

/**
/**
 * 校园照片壁纸，按季节分组。
 *
 * 图片来源：「印象同济」photo.tongji.edu.cn（学校官方图片站）。
 * 由 scripts/fetch-walls.mjs 抓取并压到 1600px 宽，落盘在 public/images/walls/。
 * 每个分组用 `photo` 标记，面板按这个字段分段显示。
 *
 * ⚠️ 照片当背景，文字对比度不如纯色那么好做 —— 所以遮罩默认值给得比较高
 * （见 SCRUB_RANGE），且深色主题会自动再压暗一档。
 */
export const PHOTO_WALLS = [
	{ value: 'spring', label: '春', css: '', photos: [
		{ value: 'spring-lib', label: '图书馆', file: '/images/walls/春-图书馆.jpg' },
		{ value: 'spring-sakura', label: '樱花大道', file: '/images/walls/春-樱花大道.jpg' },
		{ value: 'spring-sanhao', label: '三好坞', file: '/images/walls/春-三好坞.jpg' },
		{ value: 'spring-pillar', label: '国立柱', file: '/images/walls/春-国立柱.jpg' },
	] },
	{ value: 'summer', label: '夏', css: '', photos: [
		{ value: 'summer-sanhao', label: '三好坞', file: '/images/walls/夏-三好坞.jpg' },
		{ value: 'summer-pillar', label: '国立柱', file: '/images/walls/夏-国立柱.jpg' },
		{ value: 'summer-bridge', label: '桥', file: '/images/walls/夏-桥.jpg' },
	] },
	{ value: 'autumn', label: '秋', css: '', photos: [
		{ value: 'autumn-pillar', label: '国立柱', file: '/images/walls/秋-国立柱.jpg' },
		{ value: 'autumn-bridge', label: '桥', file: '/images/walls/秋-桥.jpg' },
	] },
	{ value: 'winter', label: '冬', css: '', photos: [
		{ value: 'winter-pillar', label: '国立柱', file: '/images/walls/冬-国立柱.jpg' },
		{ value: 'winter-sanhao', label: '三好坞', file: '/images/walls/冬-三好坞.jpg' },
		{ value: 'winter-gate', label: '校门', file: '/images/walls/冬-校门.jpg' },
	] },
	{ value: 'night', label: '夜', css: '', photos: [
		{ value: 'night-sanhao', label: '三好坞', file: '/images/walls/夜-三好坞.jpg' },
		{ value: 'night-lib', label: '图书馆', file: '/images/walls/夜-图书馆.jpg' },
		{ value: 'night-pillar', label: '国立柱', file: '/images/walls/夜-国立柱.jpg' },
	] },
] as const;

/** 纯渐变壁纸：不按季节分组，也不需要遮罩之外的额外处理 */
export const GRADIENT_WALLS = [
	{ value: 'dawn', label: '晨曦', css: 'linear-gradient(160deg,#ffd8a8 0%,#ff9a8b 45%,#a18cd1 100%)' },
	{ value: 'sea', label: '海雾', css: 'linear-gradient(160deg,#a8edea 0%,#7fcdbb 50%,#2f6f8f 100%)' },
	{ value: 'night', label: '夜航', css: 'linear-gradient(160deg,#2b5876 0%,#4e4376 100%)' },
	{ value: 'ink', label: '素笺', css: 'linear-gradient(160deg,#f6f5f4 0%,#e8e6e3 100%)' },
] as const;

/**
 * 壁纸选项的总表。
 *
 * 面板直接遍历它；`group` 用来分段渲染（照片按季节、渐变单独一段）。
 * `random` 是「按当前季节/时段随机抽一张」的伪 id —— 它不对应任何一张具体图，
 * 而是每次应用时现抽（见 pickWallByTime）。
 */
export interface WallpaperOption {
	value: string;
	label: string;
	css: string;
	group: string;
}

export const WALLPAPERS: WallpaperOption[] = [
	{ value: 'none', label: '纯色', css: '', group: '基础' },
	{ value: 'random', label: '随机（按季节）', css: '', group: '基础' },
	...PHOTO_WALLS.flatMap((season) =>
		season.photos.map((photo) => ({
			value: photo.value,
			label: `${season.label}·${photo.label}`,
			css: `url(${photo.file})`,
			group: `校园照片·${season.label}`,
		})),
	),
	...GRADIENT_WALLS.map((wall) => ({ value: wall.value, label: wall.label, css: wall.css, group: '渐变' })),
];

export type WallpaperId = string;

/**
 * 按当前时间挑一张照片壁纸。
 *
 * 白天从**当前季节**那一组抽，晚上从「夜」抽。
 * 抽完返回具体那一张的 value，所以界面上能显示「现在用的是哪张」，
 * 用户也依然可以在面板里手动改。
 *
 * 月份 → 季节：3-5 春，6-8 夏，9-11 秋，12-2 冬。
 * 时段：19:00 之后、7:00 之前算夜晚。
 */
export function pickWallByTime(now: Date): string {
	const month = now.getMonth() + 1;
	const hour = now.getHours();
	const season =
		hour >= 19 || hour < 7
			? 'night'
			: month >= 3 && month <= 5
				? 'spring'
				: month >= 6 && month <= 8
					? 'summer'
					: month >= 9 && month <= 11
						? 'autumn'
						: 'winter';
	const group = PHOTO_WALLS.find((item) => item.value === season) ?? PHOTO_WALLS[0];
	// Math.random 只在每次加载/点按钮时调用一次，不放进渲染循环
	const picked = group.photos[Math.floor(Math.random() * group.photos.length)];
	return picked.value;
}

/** 取一张照片壁纸的 css 背景值 */
export function wallCss(value: string): string {
	return WALLPAPERS.find((w) => w.value === value)?.css ?? '';
}

/**
 * 遮罩不透明度：太小则前景文字读不清，太大则看不见壁纸。
 *
 * ⚠️ 默认 0.5 是给**渐变**壁纸定的。渐变本身自带颜色（素笺那张接近白），
 * 0.72 压上去连「有壁纸」都看不出来，用户只会以为背景是纯色。
 */
export const SCRUB_RANGE = { min: 0.3, max: 0.92, step: 0.02, defaultValue: 0.3 };

/**
 * 照片壁纸的默认遮罩：比渐变更厚，保证亮照片上的文字也读得清。
 *
 * 遮罩色是固定近黑（不跟主题走），所以深浅两套主题共用这一档浓度 ——
 * 之前浅色主题走浅灰白遮罩时定的 0.88 那个数不能要了：
 * 同一个浓度换成深色遮罩，樱花大道会黑得看不清轮廓。
 */
export const PHOTO_SCRUB_DEFAULT = 0.58;

/**
 * 按当前壁纸算出遮罩默认值：照片用更厚的那档。
 *
 * 用户手动调过之后以他调的为准，这里只在「没存过遮罩」时给出起点值。
 */
export function defaultScrubFor(wallpaper: string): number {
	return wallpaper !== 'none' && wallpaper !== 'custom' && WALLPAPERS.find((w) => w.value === wallpaper)?.group.startsWith('校园照片')
		? PHOTO_SCRUB_DEFAULT
		: SCRUB_RANGE.defaultValue;
}

/** 校验存进来的壁纸/遮罩值，防止手改 localStorage 存进奇怪的值 */
export function sanitizeScrub(value: unknown): number {
	const num = typeof value === 'number' ? value : Number(value ?? Number.NaN);
	if (!Number.isFinite(num)) return SCRUB_RANGE.defaultValue;
	const clamped = Math.min(SCRUB_RANGE.max, Math.max(SCRUB_RANGE.min, num));
	// 对齐到 step，避免存进 0.7133333 这种值
	return Math.round(clamped / SCRUB_RANGE.step) * SCRUB_RANGE.step;
}

/**
 * 自定义壁纸：data URL 直接进 style 属性是安全的（不经过 HTML 解析），
 * 但体积可能很大，所以限制大小；超限就退回内置壁纸。
 */
export const MAX_CUSTOM_WALLPAPER_BYTES = 2 * 1024 * 1024;
