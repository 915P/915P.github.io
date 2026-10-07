/**
 * 抓取各站点的 favicon，存到 public/icons/sites/。
 *
 * 为什么要单独抓、而不是让页面运行时去读 https://站点/favicon.ico：
 *
 * 1. 本站不热链第三方资源（见 AGENT.md）。运行时直接读别人主机的 favicon
 *    等于每次打开首页都往对方发一次请求，还把对方的可用性变成自己的问题。
 * 2. 直接读 /favicon.ico **失败率很高**：404、证书无效
 *    （net::ERR_CERT_AUTHORITY_INVALID）、跨源策略拦截
 *    （ERR_BLOCKED_BY_RESPONSE.NotSameOrigin）…… 每一种都会在控制台
 *    刷一条红色报错，页面看着像坏了。
 * 3. 抓下来的图可以统一规格（正方形 PNG、带透明底），
 *    小尺寸的 16x16 也能放大得看得清。
 *
 * 抓取顺序（谁先成用谁）：
 *   1. Google 的 favicon 服务，能拿到规范的 128px 图（需代理）
 *   2. 站点自己的 /apple-touch-icon.png（苹果的图标通常最规范）
 *   3. 站点自己的 /favicon.ico
 *   4. 兜底：本地生成一个字母/汉字徽标（见 buildMonogram）
 *
 * 用法：
 *   npm run icons:sites
 *
 * 需要墙内无法直连的源时，用本机代理（clash 默认 7897）：
 *   https_proxy=http://127.0.0.1:7897 npm run icons:sites
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'public/icons/sites');
const SIZE = 128;

/**
 * `--only=ketangpai,tongji.edu.cn` 只处理匹配这些 id / 域名的链接。
 * 调试个别站点时用得上（否则每次都要重跑 50 多个站）。
 */
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg
	? new Set(onlyArg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean))
	: null;

/* ------------------------------------------------------------ 读 links.ts */

const tmp = mkdtempSync(join(tmpdir(), 'site-icons-'));
const bundle = join(tmp, 'links.mjs');
await build({
	entryPoints: [join(ROOT, 'src/data/links.ts')],
	bundle: true,
	format: 'esm',
	outfile: bundle,
	logLevel: 'error',
});
const { navLinks } = await import(pathToFileURL(bundle).href);

/** 搜索引擎的 logo 也在 public/icons/search 下，一并纳入「是否被引用」的判断 */
async function searchEngineIcons() {
	const guideBundle = join(tmp, 'guide.mjs');
	await build({
		entryPoints: [join(ROOT, 'src/data/guide.ts')],
		bundle: true,
		format: 'esm',
		outfile: guideBundle,
		logLevel: 'error',
	});
	const guide = await import(pathToFileURL(guideBundle).href);
	return guide.SEARCH_ENGINES.map((engine) => engine.icon);
}

/* ----------------------------------------------------------- 抓取通道 */

/** 首页抓下来之后，从里面挖图标声明。返回 { url, html }，url 是跟随跳转后的地址 */
function fetchPage(url) {
	try {
		const env = curlEnv(url);
		const args = [
			'-sL',
			'--max-time',
			'12',
			'-A',
			'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
		];
		const html = execFileSync('curl', [...args, url], {
			encoding: 'utf8',
			timeout: 20000,
			maxBuffer: 8 * 1024 * 1024,
			env,
		});
		/*
		 * 用 -w 拿最终地址（跟随跳转后的），相对路径要按它来解析。
		 *
		 * ⚠️ 这里必须**独立 try**：拿不到最终地址就退回请求的 url 本身，
		 * 可不能让它连累上面已经抓到的 HTML —— 之前它和抓 HTML 共用一个 try，
		 * 一旦这条命令出错就把整页丢掉，表现为「明明声明了 icon 却一个都挖不到」。
		 */
		let finalUrl = url;
		try {
			finalUrl = execFileSync('curl', [...args, '-o', '/dev/null', '-w', '%{url_effective}', url], {
				encoding: 'utf8',
				timeout: 20000,
				env,
			}).trim();
		} catch {
			/* 保留原 url */
		}
		return { url: finalUrl || url, html };
	} catch {
		return null;
	}
}

/** 把相对路径补成绝对地址 */
function absolutize(href, base) {
	try {
		return new URL(href, base).href;
	} catch {
		return '';
	}
}

/**
 * 从首页 HTML 里按优先级挖图标地址。
 *
 * 站内系统尤其有用：不少站点不提供标准的 /favicon.ico，而是在自己的
 * 框架里声明了图标（实测 yunpan.tongji.edu.cn 声明的是 /anyshare/favicon.ico，
 * 盲猜 /favicon.ico 只会拿到 404）。
 *
 * 顺序按「最像 logo」排：apple-touch-icon 通常是 180px 的精修图，
 * og:image 有时是整张 banner（所以后面要按尺寸筛掉过大的），
 * img[src*=logo] 最可能是文字 logo 但质量参差。
 */
function scrapeIcons(host, page) {
	const found = [];
	const push = (raw) => {
		// ⚠️ base 必须是页面 URL，不是 HTML 正文 —— 传错的话所有相对路径
		// （./favicon.ico 这种）都会解析失败，一个图标都挖不到。
		const abs = absolutize(raw.trim(), page.url);
		// data: 和 javascript: 之类的不处理
		if (abs && /^https?:/i.test(abs) && !found.includes(abs)) found.push(abs);
	};

	const head = page.html.slice(0, 200000);

	// <link rel="apple-touch-icon" href="...">（含 rel 顺序颠倒的写法）
	for (const m of head.matchAll(/<link[^>]*>/gi)) {
		const tag = m[0];
		const rel = (tag.match(/\brel=["\']?([^"\'>]+)/i)?.[1] ?? '').toLowerCase();
		const href = tag.match(/\bhref=["\']?([^"\'>]+)/i)?.[1];
		if (!href) continue;
		if (rel.includes('apple-touch-icon')) push(href);
	}
	for (const m of head.matchAll(/<link[^>]*>/gi)) {
		const tag = m[0];
		const rel = (tag.match(/\brel=["\']?([^"\'>]+)/i)?.[1] ?? '').toLowerCase();
		const href = tag.match(/\bhref=["\']?([^"\'>]+)/i)?.[1];
		if (!href) continue;
		// 只要图标，别把 stylesheet / manifest 也当成图
		if (/\b(icon|mask-icon)\b/.test(rel) && !rel.includes('stylesheet')) push(href);
	}

	// <meta property="og:image" content="..."> / og:image:secure_url
	for (const m of head.matchAll(/<meta[^>]*>/gi)) {
		const tag = m[0];
		const prop = (tag.match(/\b(?:property|name)=["\']?(og:image|og:image:secure_url|twitter:image)["\']?/i)?.[1] ?? '').toLowerCase();
		const content = tag.match(/\bcontent=["\']?([^"\'>]+)/i)?.[1];
		if (prop && content) push(content);
	}

	/*
	 * <img> 里名字带 logo / brand / icon 的。
	 *
	 * ⚠️ 但要**排掉明显不是品牌标识的 UI 图标**。踩过的坑：
	 * originlab 首页有个 `back-to-the-top-iconv3.webp`（回到顶部的向上箭头），
	 * 文件名里带 "icon" 就被当成 logo 抓走了，结果 Origin 的磁贴显示成
	 * 一个蓝色上箭头 —— 比没有图标更糟，因为它看着像是有图。
	 */
	const NOT_A_LOGO = /(^|[^a-z])(top|back|arrow|up|down|close|bg|blank|spacer|pixel)([^a-z]|$)/i;
	for (const m of head.matchAll(/<img[^>]*>/gi)) {
		const tag = m[0];
		const src = tag.match(/\bsrc=["\']?([^"\'>]+)/i)?.[1];
		const hay = `${src ?? ''} ${tag.match(/\balt=["\']?([^"\'>]+)/i)?.[1] ?? ''} ${tag.match(/\bclass=["\']?([^"\'>]+)/i)?.[1] ?? ''} ${tag.match(/\bid=["\']?([^"\'>]+)/i)?.[1] ?? ''}`;
		if (!/logo|brand|icon/i.test(hay)) continue;
		// 文件名像 UI 图标就跳过；但 class="logo" 之类仍要收，所以只在 src 里判
		if (src && NOT_A_LOGO.test(src)) continue;
		if (src) push(src);
	}

	return found;
}

/**
 * ⚠️ 这里**故意不用** icon.horse / Google favicon 服务。
 *
 * 之前用过，问题是：站点自己没有 favicon 时，这两个服务不会失败，
 * 而是**自己合成一张占位图** —— icon.horse 给一个灰底字母（域名首字母），
 * Google 给一个灰色地球。结果是几十个校内系统的磁贴显示着同一个灰色
 * 地球、或一个随手合成的字母，看起来就像「有图标」，实际是假货，
 * 而且正是「文字 logo」那种丑东西。
 *
 * 所以现在只信**站点自己提供的**图标：HTML 里声明的 icon/apple-touch-icon/
 * og:image/img[logo]，以及约定路径 /apple-touch-icon.png、/favicon.ico。
 * 拿不到就是拿不到，如实退到兜底 —— 不拿假图充数。
 */
function sources() {
	return [];
}

/** 页面候选：先试链接原样（含路径），再退回它的站点根 —— 少数站点只在根目录声明图标 */
function pageUrlCandidates(pageUrl) {
	try {
		const parsed = new URL(pageUrl);
		return [parsed.href, `${parsed.protocol}//${parsed.host}/`];
	} catch {
		return [pageUrl];
	}
}

/**
 * ⚠️ 这里**曾经**还有一档「约定 logo 路径」（/images/logo.png、/logo.png…），
 * 用来捞那些没有 favicon、只在校名页放了一张宽字标的校内站点
 * （实测 gaoshutongbu / nic 确实有，547x97、481x86）。
 *
 * 但实测下来**更难看**：那些是浅色文字的横版校名字标，缩到磁贴的方格里
 * 要么被压成一条看不清的细线，要么白底白字糊成一块空白 —— 比一个
 * 干净的字母徽标还不如。而用户要的本来就是「不要文字 logo」。
 *
 * 所以这条路删掉了，宁可退回徽标。
 */

/** 首页 + 常规路径 + logo 路径，凑齐所有候选 */
function collectCandidates(host, bareHost, pageUrl) {
	/** @type {{ url: string; wide: boolean }[]} */
	const urls = sources(host).map((url) => ({ url, wide: false }));
	/*
	 * 页面抓**链接本身的 URL**（含路径），不能只抓站点根目录。
	 *
	 * 同一主机下不同路径往往是不同应用、各自声明不同图标：实测
	 * 203.0.113.10 上 /Website/ 声明 /Website/Tongji.svg，
	 * 而 /QA/ 声明 /QA/assets/img/favicon.svg。只抓根目录的话，
	 * 「高程答疑」会错用「高程网站」的图标。而且相对路径本来就
	 * 要按这个完整 URL 来解析。
	 */
	for (const url of pageUrlCandidates(pageUrl)) {
		const page = fetchPage(url);
		if (page && page.html.length > 120) {
			// 从 HTML 里挖到的：link rel=icon 是正经图标，og:image 可能是 banner
			for (const icon of scrapeIcons(host, page)) urls.push({ url: icon, wide: false });
			break;
		}
	}
	// 常规路径兜底
	for (const scheme of ['https', 'http']) {
		urls.push({ url: `${scheme}://${host}/apple-touch-icon.png`, wide: false });
		urls.push({ url: `${scheme}://${host}/favicon.ico`, wide: false });
	}
	return urls;
}

/**
 * 内网 / 私有地址必须**绕过代理**。
 *
 * 高程作业是 http://192.0.2.10:2080，走本机 clash 代理的话，
 * 代理根本没法路由到这个私有 IP（能通是因为 curl 连的是本机内网），
 * 于是下载全部失败，只能退化成文字徽标。
 */
function hostBypassesProxy(url) {
	try {
		const hostname = new URL(url).hostname;
		return (
			hostname === 'localhost' ||
			/^127\./.test(hostname) ||
			/^10\./.test(hostname) ||
			/^192\.168\./.test(hostname) ||
			/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
		);
	} catch {
		return false;
	}
}

/**
 * 下载一个候选。
 *
 * 重试 2 次：这几个图标服务**时通时不通**（实测同一批请求里
 * google s2 一会儿 200 一会儿连接失败），不重试的话同一份代码
 * 每次跑出来的图标数量都不一样（实测在 47~50 之间跳）。
 * 只有 4xx 才立刻放弃 —— 那是「确实没有」，重试也没用。
 */
function curl(url, dest) {
	for (let attempt = 1; attempt <= 2; attempt++) {
		const ok = curlOnce(url, dest);
		if (ok) return true;
		if (existsSync(dest) && statSync(dest).size > 0) {
			const head = readFileSync(dest).subarray(0, 200).toString('latin1');
			// curl -f 已经把 4xx 变成失败了，能落到这里说明是网络层问题
			if (/^\s*<!DOCTYPE|^\s*<html/i.test(head)) return false;
		}
	}
	return false;
}

/**
 * 给 curl 准备环境变量：内网地址要把 no_proxy 补上。
 *
 * ⚠️ fetchPage 和 curlOnce **都要用** —— 漏掉哪一个，内网站点就抓不到：
 * 高程作业的首页在 http://192.0.2.10:2080，走代理连不上，
 * 于是首页抓不到 → 挖不出里面声明的 ./favicon.png。
 */
function curlEnv(url) {
	const env = { ...process.env };
	if (hostBypassesProxy(url)) {
		// no_proxy 的优先级高于 http_proxy，显式把该主机加进去
		env.no_proxy = `${env.no_proxy ?? ''},${new URL(url).hostname}`.toLowerCase();
		env.NO_PROXY = env.no_proxy;
	}
	return env;
}

function curlOnce(url, dest) {
	const env = curlEnv(url);
	try {
		execFileSync(
			'curl',
			[
				'-sL',
				'--max-time',
				'10',
				// 有些站点没有 favicon 会回 404 或一张 1x1 的占位图，
				// 加上 -f 让 curl 对 HTTP 错误直接失败，省得存下空文件
				'-f',
				'-A',
				'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
				'-o',
				dest,
				url,
			],
			{ stdio: ['ignore', 'ignore', 'ignore'], env, timeout: 16000 },
		);
		return existsSync(dest) && statSync(dest).size > 80;
	} catch {
		return false;
	}
}

/** 图像的实际像素尺寸；不是图像（或 ImageMagick 不认识）返回 null */
function imageSize(path) {
	try {
		return execFileSync('identify', ['-format', '%w %h', `${path}[0]`], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
			timeout: 15000,
		}).trim();
	} catch {
		return null;
	}
}

/**
 * 图标是不是「一张白纸」。
 *
 * 有些站点的 /favicon.ico 返回的是纯白/纯色占位图（实测 tj-vpn 的标准差
 * 正好是 0），显示出来就是一个白方块，比没有图标更让人以为页面坏了。
 * 用灰度标准差判断：纯色图的各像素完全一致，标准差为 0。
 * 阈值 0.01 对应「几乎没有明暗变化」，正常的 logo 远高于它。
 */
function isBlank(path) {
	try {
		const sd = execFileSync(
			'convert',
			[path, '-colorspace', 'Gray', '-format', '%[fx:standard_deviation]', 'info:'],
			{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 },
		).trim();
		return Number(sd) < 0.01;
	} catch {
		return false;
	}
}

/**
 * 筛掉不适合当站点图标的图。
 *
 * - 1x1 / 极小的：那是像素统计用的占位图，不是图标
 * - 宽高比过大的：多半是 og:image 里的整条 banner，缩成方块会糊成一团
 *   （logo 路径例外，见 allowWide）
 */
function looksLikeIcon(path, allowWide = false) {
	const size = imageSize(path);
	if (!size) return false;
	const [w, h] = size.split(/\s+/).map(Number);
	if (!w || !h) return false;
	// 太小的是像素统计占位图，不是图标
	if (Math.min(w, h) < 8) return false;
	const ratio = Math.max(w, h) / Math.min(w, h);
	// logo 路径放宽到 6:1（校名字标实测 5.6:1），再宽就当成 banner 拒掉
	return ratio <= (allowWide ? 6 : 2.5);
}

/**
 * 归一成 128x128 的 PNG。
 *
 * 放大用 Lanczos 而不是默认插值 —— 小图放大后边缘会发虚，
 * 而磁贴里是要放大的（编辑态、菜单、hover）。
 * 背景补白而不是透明：不少 favicon 是白底图，透明底在深色主题上会显出
 * 一个白色方块，比原图还难看。
 */
function normalize(src, dest) {
	try {
	/*
	 * ⚠️ 输入必须显式取 `[0]` 第一帧。
	 *
	 * favicon.ico 常常是**多帧**的（实测 scholar.google.com/favicon.ico 有
	 * 48/32/24/16 四帧），而 `-flatten` 是用来把「图像 + 背景」合成为一张的，
	 * 遇到多帧输入它会把**所有帧叠在一起**，出来是一张竖着涂抹的糊图 ——
	 * 实测 Google 学术的学士帽就是这样变成一条蓝色竖条的。
	 *
	 * `-resize` / `-extent` 对多帧是安全的，但 `-flatten` 不安全，所以必须
	 * 在读入时就只取第一帧。identify 那两处本来就已经带了 [0]。
	 */
	const input = `${src}[0]`;
	execFileSync(
		'convert',
		[
			input,
				'-background',
				'white',
				'-flatten',
				'-filter',
				'Lanczos',
				'-resize',
				`${SIZE}x${SIZE}`,
				'-gravity',
				'center',
				'-background',
				'white',
				'-extent',
				`${SIZE}x${SIZE}`,
				dest,
			],
			{ stdio: ['ignore', 'ignore', 'ignore'], timeout: 25000 },
		);
		return existsSync(dest) && statSync(dest).size > 80;
	} catch {
		return false;
	}
}

/**
 * 兜底徽标：拿标题的首个字符画一个圆角方块。
 *
 * 站点标题首字往往是「同」「微」「O」「G」这种辨识度够高的字，
 * 比一个跟站点无关的 emoji 更容易对上号 —— 至少用户知道这是哪个站。
 * 配色按 host 稳定散列到一组固定色相，保证同一个站每次生成的颜色一致。
 */
function buildMonogram(label, host, dest) {
	const char = [...label.trim()][0] ?? host[0].toUpperCase();
	// 域名散列 → 固定色相；饱和度/亮度固定，避免出现难读的浅黄浅绿
	const hue = [...host].reduce((acc, ch) => (acc * 31 + ch.codePointAt(0)) % 360, 7);
	const bg = `hsl(${hue} 46% 42%)`;
	try {
		execFileSync(
			'convert',
			[
				'-size',
				`${SIZE}x${SIZE}`,
				'xc:none',
				'-fill',
				bg,
				'-draw',
				`roundrectangle 0,0 ${SIZE - 1},${SIZE - 1} 28,28`,
				'-font',
				'/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
				'-pointsize',
				String(Math.round(SIZE * 0.56)),
				'-gravity',
				'center',
				'-fill',
				'white',
				'-annotate',
				'+0+0',
				char,
				dest,
			],
			{ stdio: ['ignore', 'ignore', 'ignore'], timeout: 25000 },
		);
		return existsSync(dest) && statSync(dest).size > 80;
	} catch {
		return false;
	}
}

/* ---------------------------------------------------------------- 主流程 */

mkdirSync(OUT_DIR, { recursive: true });

/**
 * 图标来源标记：'favicon' = 站点自己提供的，'monogram' = 我们生成的兜底。
 *
 * 必须记下来：只看「有没有图」是看不出真假的 —— 之前就是因为清单里不记来源，
 * 我把一批生成的占位图当成「抓到了 54 个真 favicon」汇报了，实际其中有 17 个
 * 是兜底徽标，而页面上两者长得一样、根本分不出来。
 */
const kinds = {};
const manifest = {};
/** 持久化进度：id → { kind, host, path } */
const state = {};
const stats = { real: 0, manual: 0, monogram: 0, failed: 0, skipped: 0 };
/** 见生成文件里 siteIconMasks 的说明 */
const masks = new Set();

/*
 * 三档开关，决定「哪些站点值得再花时间」。
 *
 *   默认          —— 只处理「从没抓过 / 文件丢了」的，已有的和兜底过的都跳过
 *   --retry-missing —— 连兜底徽标的也重试一遍（换了网络环境时才需要，
 *                       比如代理刚开、站点刚加了 favicon）
 *   --force       —— 全部重抓
 *
 * 为什么要有默认「跳过兜底」：那 20 个没图标的站点每轮要试十几条候选路径、
 * 还要重试，光它们就吃掉近 10 分钟，而结果几乎不变。
 */
const force = process.argv.includes('--force');
const retryMissing = force || process.argv.includes('--retry-missing');

/**
 * 已知会「合成占位图」的第三方 favicon 服务。
 *
 * 这些服务在站点没有图标时不会失败，而是自己造一张：实测 Google 的给一个
 * Material 的 thumb_up 点赞手，icon.horse 给一个灰底字母。页面上一眼看过去
 * 确实是个「图标」，实际和那个站点毫无关系 —— 之前 scholar.png 就被它坑成
 * 了点赞手，而且因为增量跳过而一直留在磁盘上。
 */
const AGGREGATORS = ['icon.horse', 'google.com/s2/favicons', 'faviconkit', 'favicone'];

/**
 * --rescrape：重抓「来源不可信」的图标。
 *
 * 早期版本还没记录 source（或者来源是聚合服务）的那批，一律重新抓一遍，
 * 只信站点自己给的地址。配合聚合服务黑名单一起用。
 */
const rescrape = process.argv.includes('--rescrape');

/**
 * --only 模式下要**合并**进已有清单。
 * 这个文件还没进过 git（guide 整体未提交），所以直接读磁盘上的版本，
 * 用正则抠出 JSON 字面量。
 */
/*
 * 进度记在**独立的** scripts/.icons-state.json，而不是回读
 * src/data/site-icons.ts。
 *
 * 之前拿生成物当输入，结果一次中途被打断（40 分钟超时）就把自己写坏了：
 * 下一次跑时 kinds 只剩几条、siteIcons 却有 104 条，两者对不上。
 * 输出就该是输出，进度得另存，而且每抓完一个站点就立刻落盘 ——
 * 中断也不丢已完成的部分。
 */
/**
 * 手动补图的目录：public/icons/sites/manual/<id>.<png|jpg|webp|svg>
 *
 * 有些站点**真的**没有任何可用图标（同济校内系统居多 —— 没有 favicon、
 * 没有 apple-touch-icon、HTML/CSS/JS 里也没有任何品牌图）。抓取解决不了，
 * 只能由人放一张进去。
 *
 * 优先级最高，而且**永远不会被覆盖**：这些 id 直接跳过抓取，
 * 也不会被兜底徽标顶掉（兜底图另存到 sites/<id>.png，不会写进 manual/）。
 * 站点 id 见 src/data/links.ts 的 navLinks[].id，或跑一次本脚本看输出里的清单。
 */
const MANUAL_DIR = join(OUT_DIR, 'manual');

/**
 * 共用同一张图的磁贴。
 *
 * 校内系统（1 系统、图书馆、排课助手……）的 favicon 十有八九就是**同济校徽**，
 * 只是抓回来的清晰度参差 —— 有些是矢量级的清晰版，有些是 16x16 拉大的糊版，
 * 缩到磁贴里看着很脏。既然手里有一份干净的校徽（manual/logo.pdf 渲染而来），
 * 这些磁贴就统一用它。
 *
 * 判定方式不是肉眼看的，是把每张图降采样 + 模糊后两两算 RMSE，
 * 校内校徽那一簇是 0.069~0.102，簇外下一个就跳到 0.165，界限很清楚。
 * （一开始拿模糊版 tj-1 当基准比，只匹配出 3 张逐像素相同的 —— 基准选错了。）
 */
const SHARED_MANUAL = new Map([
	['tj-lib', 'logo.png'],
	/*
	 * 校内系统一律用校徽，不要首字徽标。
	 *
	 * 这批站点的 /favicon.ico 在校外根本抓不到（DNS 或直接拒连），
	 * 于是退成「一 + 域名配色」的方块 —— 一屏七八个长得几乎一样的
	 * 蓝绿色块，用户看着像加载失败。校徽本来就是这些系统共用的标识，
	 * 语义准确得多。
	 */
	['tj-agent', 'logo.png'],
	['tj-ywtb', 'logo.png'],
	['tj-look', 'logo.png'],
	['tj-phy', 'logo.png'],
	['tj-hq', 'logo.png'],
	['tj-qgzx', 'logo.png'],
	['tj-cxcy', 'logo.png'],
	['tj-pay', 'logo.png'],
	['tj-nic', 'logo.png'],
	['tj-gaoshu', 'logo.png'],
	['tj-second', 'logo.png'],
	['tj-1', 'logo.png'],
	['tj-freshman', 'logo.png'],
	['xk-schedule', 'logo.png'],
	['tj-portal', 'logo.png'],
	['tj-stadium', 'logo.png'],
	['tj-power', 'logo.png'],
	['tj-software', 'logo.png'],
	// 高程课程网站用的也是校徽（浅蓝变体），同样统一
	['gaochengweb', 'logo.png'],
]);
const MANUAL_EXT = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'ico'];

const STATE_PATH = join(ROOT, 'scripts/.icons-state.json');
const MANIFEST_PATH = join(ROOT, 'src/data/site-icons.ts');
if (existsSync(STATE_PATH)) {
	try {
		Object.assign(state, JSON.parse(readFileSync(STATE_PATH, 'utf8')));
	} catch {
		console.warn('⚠️ 进度文件损坏，从头开始');
	}
}

/** 每抓完一个站点就写一次进度，中断也不丢 */
function persistState(id, entry) {
	try {
		const saved = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, 'utf8')) : {};
		saved[id] = entry;
		writeFileSync(STATE_PATH, JSON.stringify(saved, null, '\t'), 'utf8');
	} catch {
		// 进度写不进去不影响本次结果
	}
}

for (const link of navLinks) {
	/*
	 * 用 Material Icons 画图标的小工具（主站 /tools/*）**完全跳过**。
	 *
	 * 它们都指向同一个主站域名，按 host 抓 favicon 只会把主站首页的图标
	 * 复制成 16 份一模一样的文件 —— 实测 16 个 24804 字节的金色奖杯，
	 * 一个比一个没用。页面里这些磁贴走 <mdui-icon-*> 渲染，
	 * 根本不看这里的产物。
	 */
	if (link.materialIcon) {
		stats.skipped += 1;
		continue;
	}

	if (only && ![link.id, link.url].some((v) => [...only].some((o) => v.includes(o)))) {
		/*
		 * --only 时没轮到这个站点，**但仍然要把它的缓存条目带进输出**。
		 * 直接 continue 会让生成的清单被截断成只剩这几个站点 ——
		 * 之前就这么把 siteIcons 从 54 条写成了 3 条，页面里一半磁贴丢图标。
		 */
		const cached = state[link.id];
		if (cached && existsSync(join(ROOT, 'public', cached.path ?? ''))) {
			kinds[link.id] = cached.kind;
			manifest[link.id] = cached.path;
			if (cached.host) manifest[cached.host] = cached.path;
			if (cached.path?.endsWith('.svg')) {
				const body = readFileSync(join(ROOT, 'public', cached.path.slice(1)), 'utf8');
				if (body.includes('prefers-color-scheme')) masks.add(link.id);
			}
		}
		continue;
	}

	/*
	 * **增量**：已经有真 favicon 的站点直接跳过，不重新下载。
	 *
	 * 每轮全量重下的代价太大 —— 54 个站 × 十几条候选路径 × 重试，
	 * 实测跑满 40 分钟都未必跑完。绝大多数站点的图标是稳定的，
	 * 只有「兜底徽标」的才值得再试（可能站点刚加了 favicon，
	 * 或者这次网络环境比上次好）。
	 * 需要强制重来时用 --force。
	 */
	let host;
	let siteHost;
	try {
		const parsed = new URL(link.url);
		// host 带端口（高程作业是 :2080），hostname 不带 —— 抓取必须用前者，
		// 否则会连到 80 端口去，首页和图标全都 404
		siteHost = parsed.host;
		host = parsed.hostname;
	} catch {
		console.log(`  ✗ ${link.title}  网址不合法：${link.url}`);
		stats.failed += 1;
		continue;
	}

	/*
	 * 手动补的图优先级最高：命中就直接用，连 state 都不查，也绝不会被覆盖。
	 * 原始文件直接引用（不做 128px 归一化），img 标签本来就支持 svg/webp，
	 * 这样矢量图放进去能保持锐利。
	 */
	let manual = null;
	for (const ext of MANUAL_EXT) {
		const candidate = join(MANUAL_DIR, `${link.id}.${ext}`);
		if (existsSync(candidate)) {
			manual = `/icons/sites/manual/${link.id}.${ext}`;
			break;
		}
	}
	// 共用图（统一换成干净的同济校徽）
	if (!manual && SHARED_MANUAL.has(link.id)) {
		const file = SHARED_MANUAL.get(link.id);
		if (existsSync(join(MANUAL_DIR, file))) manual = `/icons/sites/manual/${file}`;
	}
	if (manual) {
		kinds[link.id] = 'manual';
		manifest[link.id] = manual;
		// 图标 SVG 自己带 prefers-color-scheme 的话，必须改用 mask 渲染
		if (manual.endsWith('.svg')) {
			const body = readFileSync(join(ROOT, 'public', manual.slice(1)), 'utf8');
			if (body.includes('prefers-color-scheme')) masks.add(link.id);
		}
		if (host) manifest[host] = manual;
		persistState(link.id, { kind: 'manual', host, path: manual });
		stats.manual += 1;
		continue;
	}

	/*
	 * **增量**：已经有可用图标的站点直接跳过，不重新下载。
	 *
	 * 每轮全量重下代价太大 —— 54 个站 × 十几条候选路径 × 重试，实测跑满
	 * 40 分钟都未必跑完。绝大多数站点的图标是稳定的；只有「兜底徽标」才
	 * 值得再试（可能站点刚加了 favicon，或者这次网络环境比上次好）。
	 *
	 * 注意：'favicon' 和 'manual' 都算「可用」，永远跳过；
	 * 'monogram' 只在 --retry-missing 时才重试。--force 全部重来。
	 */
	const existingFile = join(OUT_DIR, `${link.id}.png`);
	const alreadyHave = state[link.id] && existsSync(existingFile);
	/** 来源是聚合服务、或压根没记录来源（旧版本抓的）→ 一律不可信 */
	const untrusted =
		alreadyHave &&
		(!state[link.id].source ||
			AGGREGATORS.some((host) => state[link.id].source.includes(host)));
	if (rescrape && untrusted && state[link.id].kind === 'favicon') {
		// 明确要求重抓，走下面的正常流程
	} else if (!force && alreadyHave && (state[link.id].kind !== 'monogram' || !retryMissing)) {
		kinds[link.id] = state[link.id].kind;
		manifest[link.id] = state[link.id].path ?? `/icons/sites/${link.id}.png`;
		if (state[link.id].host) manifest[state[link.id].host] = manifest[link.id];
		if (manifest[link.id].endsWith('.svg')) {
			const body = readFileSync(join(ROOT, 'public', manifest[link.id].slice(1)), 'utf8');
			if (body.includes('prefers-color-scheme')) masks.add(link.id);
		}
		stats.skipped += 1;
		continue;
	}

	const dest = join(OUT_DIR, `${link.id}.png`);
	let got = false;
	/** 采纳的是哪个地址 —— 必须记下来，否则无法分辨真图标和占位图 */
	let usedSource = null;

	for (const { url, wide } of collectCandidates(siteHost, host, link.url)) {
		/*
		 * ⚠️ 临时文件**必须带扩展名**。
		 * ImageMagick 挑解码器时依赖文件名/魔数，纯 'raw' 这种无扩展名的文件
		 * 会报 "no decode delegate for this image format ''"，于是合法的
		 * favicon.ico 被误判成「不是图像」而丢掉（宿舍购电就栽在这）。
		 * .ico 足够通用：png/jpg/webp/svg 都能照常解码。
		 */
		const raw = join(tmp, 'raw.ico');
		// DEBUG=1 npm run icons:sites —— 抓不到时用它看每一步是被什么条件筛掉的
		const trace = (why) => {
			if (process.env.DEBUG) console.log(`      ↳ ${why}  ${url.slice(0, 90)}`);
		};
		if (!curl(url, raw)) {
			trace('下载失败/404');
			continue;
		}
		// 宽字标只对 logo 路径放行；og:image 这类仍按方形筛
		if (!looksLikeIcon(raw, wide)) {
			trace(`尺寸不合格 (${imageSize(raw) ?? '不是图像'})`);
			continue;
		}
		if (isBlank(raw)) {
			trace('空白图（纯色占位）');
			continue;
		}
		if (!normalize(raw, dest)) {
			trace('转换失败');
			continue;
		}
		got = true;
		usedSource = url;
		stats.real += 1;
		if (process.env.DEBUG) console.log(`      ✓ 采用 ${url.slice(0, 90)}`);
		break;
	}

	if (!got) {
		if (buildMonogram(link.title, host, dest)) {
			stats.monogram += 1;
			console.log(`  ◇ ${link.title.padEnd(18)} 生成徽标（没抓到 favicon）`);
		} else {
			stats.failed += 1;
			console.log(`  ✗ ${link.title.padEnd(18)} 徽标也生成失败`);
			continue;
		}
	}

	manifest[link.url ? new URL(link.url).hostname : link.id] = `/icons/sites/${link.id}.png`;
	const kind = got ? 'favicon' : 'monogram';
	kinds[link.id] = kind;
	manifest[host] = `/icons/sites/${link.id}.png`;
	manifest[link.id] = `/icons/sites/${link.id}.png`;
	persistState(link.id, { kind, host, path: manifest[link.id], source: usedSource });
}

writeFileSync(
	MANIFEST_PATH,
	`/**
 * 本文件由 \`npm run icons:sites\` **自动生成**，请勿手改。
 *
 * 每个站点的图标都抓到了 \`public/icons/sites/\` 本地存放：
 * 运行时不去热链别人的主机，也不必担心对方站点挂了我们首页就花屏。
 *
 * 抓不到 favicon 的站点会退化成「标题首字 + 域名散列配色」的徽标，
 * 至少能让用户认出是哪个站。
 */

export const siteIcons: Record<string, string> = ${JSON.stringify(manifest, null, '\t')};

/**
 * 每个图标是「站点自带的」还是「我们生成的兜底徽标」。
 * 'favicon'   —— 站点确实提供了图标
 * 'monogram'  —— 站点没有可用图标，这张是我们按标题首字生成的
 */
export const siteIconKinds: Record<string, 'favicon' | 'manual' | 'monogram'> = ${JSON.stringify(kinds, null, '\t')};

/**
 * 需要用 CSS mask 渲染的图标（id 列表）。
 *
 * 有些图标 SVG 内部带 \`<style>：:root{fill:#000} @media (prefers-color-scheme:dark){fill:#fff}\`，
 * 是想自己适配深浅色的。但用 \`<img>\` 加载时，**SVG 里的媒体查询是按操作系统的
 * 配色方案算的，跟页面主题无关** —— 你系统是浅色、页面切到深色，图标就成了
 * 一团黑的、看不见。
 *
 * 所以这类图标改用 mask 渲染：形状来自 SVG，颜色来自 CSS 的 currentColor，
 * 而 currentColor 会跟着页面的 mdui-theme 走，两套主题都对。
 * （ChatGPT 的六环结就是这种。）
 */
export const siteIconMasks: readonly string[] = ${JSON.stringify([...masks], null, '\t')};
`,
	'utf8',
);

/** 兜底徽标（站点本身没有图标）的 id 清单，方便排查 */
const monograms = Object.entries(kinds)
	.filter(([, kind]) => kind === 'monogram')
	.map(([id]) => id);
console.log(`\n其中 ${monograms.length} 个站点没有可用图标，已退到兜底徽标：`);
console.log(`  ${monograms.join(' ') || '(无)'}`);
console.log(
	`\n要人工补图的话，把文件放到 public/icons/sites/manual/<上面某个 id>.<png|svg|jpg|webp>` +
		`\n（该目录优先级最高，重跑脚本也不会被覆盖）。`,
);

/*
 * 顺手体检：扫一遍 public/icons，把**没有任何引用**的图片找出来。
 *
 * 删除链接、或某个磁贴改用了 manual 图之后，原来抓回来的那张就成了孤儿
 * （实测攒到过 14 个、240K）。它们不会被加载，但会一直躺在仓库里，
 * 所以这里每次跑都报一次，由人决定删不删 —— 脚本不自动删，怕误伤源码文件。
 */
{
	const referenced = new Set([...Object.values(manifest), ...(await searchEngineIcons())]);
	const orphans = [];
	const PUBLIC_DIR = join(ROOT, 'public');
	const walk = (dir) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (!/\.(png|jpe?g|webp|gif|ico|svg)$/i.test(entry.name)) continue;
			else if (!referenced.has(`/${relative(PUBLIC_DIR, full).replace(/\\/g, '/')}`))
				orphans.push(full);
		}
	};
	walk(join(ROOT, 'public/icons'));
	if (orphans.length) {
		console.log(`\n⚠️ public/icons 下有 ${orphans.length} 个图片没有被引用（不删也不影响运行）：`);
		for (const file of orphans) console.log(`     ${relative(ROOT, file)}`);
	} else {
		console.log('\npublic/icons 没有未引用的图片 ✓');
	}
}

rmSync(tmp, { recursive: true, force: true });

console.log(
	`\n共 ${navLinks.length} 个站点：本轮抓到真 favicon ${stats.real}，生成徽标 ${stats.monogram}，` +
		`手动补图 ${stats.manual}，失败 ${stats.failed}，跳过（已有图标，本次不动）${stats.skipped}`,
);
console.log(`清单已写入 src/data/site-icons.ts，图片在 public/icons/sites/`);
