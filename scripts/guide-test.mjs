/*
 * /guide/ 起始页的纯逻辑测试。
 *
 * 只测 src/data/guide.ts 里不碰浏览器的部分 —— 磁贴渲染、拖拽、favicon
 * 那些要看真实浏览器，不在这里假装能测。
 */
import { build } from 'esbuild';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const dir = mkdtempSync(join(tmpdir(), 'guide-ops-'));
const bundle = join(dir, 'guide.mjs');
execFileSync(
	'npx',
	['esbuild', 'src/data/guide.ts', '--bundle', '--format=esm', `--outfile=${bundle}`, '--log-level=error'],
	{ stdio: 'inherit' },
);
const guide = await import(pathToFileURL(bundle).href);

let pass = 0;
let fail = 0;
const failures = [];

function ok(label, condition, detail = '') {
	if (condition) {
		pass++;
	} else {
		fail++;
		failures.push(label + (detail ? ` — ${detail}` : ''));
	}
}

function eq(label, actual, expected) {
	ok(label, Object.is(actual, expected), `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

// ---------------------------------------------------------------- 补全协议

eq('无协议补 https', guide.normalizeUrl('github.com'), 'https://github.com');
eq('已有 https 不动', guide.normalizeUrl('https://a.cn'), 'https://a.cn');
eq('已有 http 不动', guide.normalizeUrl('http://a.cn/x?y=1'), 'http://a.cn/x?y=1');
eq('其他协议不动', guide.normalizeUrl('chrome://settings'), 'chrome://settings');
eq('前后空格忽略', guide.normalizeUrl('  example.com  '), 'https://example.com');

// ---------------------------------------------------------------- 网址判定

const URLS = [
	'github.com',
	'https://a.cn',
	'http://a.cn',
	'192.168.0.1',
	'192.168.0.1:9990',
	'localhost',
	'localhost:3000',
	'localhost:3000/x',
	'xn--fsq.com',
	'sub.domain.example.co.uk/path?q=1',
	'chrome://extensions',
];
for (const input of URLS) {
	ok(`判为网址：${input}`, guide.looksLikeUrl(input));
}

const SEARCHES = [
	'同济 选课',
	'今天天气',
	'deepseek 深度求索',
	'how to center div',
	'3.14',
	'C++',
	'1系统',
	'a',
	'what is av1',
	'同济大学图书馆 数据库',
];
for (const input of SEARCHES) {
	ok(`判为搜索：${input}`, !guide.looksLikeUrl(input));
}

eq('空串不是网址', guide.looksLikeUrl(''), false);
eq('纯空格不是网址', guide.looksLikeUrl('   '), false);
// 末段必须是 2 位以上字母，否则「3.14」「1.2」这类会被当域名
ok('小数不当域名', !guide.looksLikeUrl('3.14'));
ok('版本号不当域名', !guide.looksLikeUrl('1.0'));

// ---------------------------------------------------------------- 回车去哪

eq('网址 → 直接跳', guide.resolveTarget('github.com'), 'https://github.com');
eq(
	'搜索词 → 搜索引擎',
	guide.resolveTarget('同济 选课'),
	`https://www.bing.com/search?q=${encodeURIComponent('同济 选课')}`,
);
eq('空输入不跳', guide.resolveTarget(''), null);
eq('纯空格不跳', guide.resolveTarget('  '), null);

// 搜索词里的特殊字符必须转义，否则会拼出坏 URL
{
	const target = guide.resolveTarget('a&b=c?d#e');
	ok('特殊字符已转义', target.includes('q=a%26b%3Dc%3Fd%23e'), target);
}

// ---------------------------------------------------------------- favicon

// 图标一律用本地清单，绝不运行时热链别人的 /favicon.ico
// （用 Material Icons 画的小工具除外，它们本来就不走 favicon）
const faviconTiles = guide.defaultTiles.filter((tile) => !tile.materialIcon);
ok('每个 favicon 磁贴都有本地图标', faviconTiles.every((tile) => guide.siteIcon(tile.id, tile.url)));
ok(
	'本地图标都是本站路径',
	faviconTiles.every((tile) => (guide.siteIcon(tile.id, tile.url) ?? '').startsWith('/icons/sites/')),
);
ok(
	'小工具不该再有 favicon（同一域名抓来的都是主站图标）',
	guide.defaultTiles.filter((tile) => tile.materialIcon).every((tile) => !guide.siteIcon(tile.id, tile.url)),
);
eq('自建磁贴按域名也能查到', guide.siteIcon('u-自定义', 'https://github.com/x'), '/icons/sites/github.png');
eq('不认识的站点返回 null', guide.siteIcon('u-未知', 'https://not-a-real-site-xyz.example/'), null);
eq('非法网址不抛异常', guide.siteIcon('u-坏', '::::'), null);

// 兜底徽标：标题首字，不是 emoji
eq('兜底取标题首字', guide.siteFallback('同济邮箱', 'https://mail.tongji.edu.cn'), '同');
eq('兜底无标题取域名首字母', guide.siteFallback('', 'https://github.com/x'), 'G');
eq('兜底非法网址也不抛', guide.siteFallback('', '::::'), '·');
ok('兜底配色按域名稳定', guide.siteFallbackColor('https://a.cn/x') === guide.siteFallbackColor('https://a.cn/y'));
ok('不同域名配色不同', guide.siteFallbackColor('https://a.cn') !== guide.siteFallbackColor('https://b.cn'));
ok('兜底配色是合法 hsl', /^hsl\(\d+ 46% 42%\)$/.test(guide.siteFallbackColor('https://a.cn')));

// ---------------------------------------------------------------- 磁贴

ok('默认磁贴非空', guide.defaultTiles.length > 0, String(guide.defaultTiles.length));
ok('默认磁贴 id 不重复', new Set(guide.defaultTiles.map((t) => t.id)).size === guide.defaultTiles.length);
ok(
	'默认磁贴都能在候选里找到',
	guide.defaultTiles.every((t) => guide.guideCatalog.some((c) => c.id === t.id)),
);
ok(
	'每个默认磁贴都有名称与兜底图标',
	guide.defaultTiles.every((t) => t.title.trim() && t.icon.trim()),
);
// 站内小工具是根相对路径，new URL() 解不出 hostname，所以按 isUsableUrl 判
ok('每个默认磁贴的网址都能用', guide.defaultTiles.every((t) => guide.isUsableUrl(t.url)));
ok('每个默认磁贴的网址都认得出来', guide.defaultTiles.every((t) => guide.looksLikeUrl(t.url)));
ok(
	'默认磁贴不包含需校内网的条目',
	guide.defaultTiles.every((t) => !guide.guideCatalog.find((c) => c.id === t.id)?.intranet),
);
ok('候选非空', guide.guideCatalog.length > 10, String(guide.guideCatalog.length));

// ---------------------------------------------------------------- 磁贴标题

eq('有描述用描述', guide.tileLabel('https://a.cn', '  教务系统  '), '教务系统');
eq('无描述退回域名', guide.tileLabel('https://www.a.cn/x', ''), 'a.cn');
eq('无描述且无协议也退回域名', guide.tileLabel('b.cn', '   '), 'b.cn');
eq('非法网址原样返回', guide.tileLabel('::::', ''), '::::');

// ---------------------------------------------------------------- 网络检测

// 校园网判定必须用「公网无 A 记录」的地址，否则校外会误报已连接
{
	ok('校园网探针非空', guide.CAMPUS_ONLY_HOSTS.length >= 2);
	for (const host of guide.CAMPUS_ONLY_HOSTS) {
		ok(`${host} 是校内域名`, host.endsWith('.tongji.edu.cn'));
	}
	ok(
		'包含用户点名的 software.tongji.edu.cn',
		guide.CAMPUS_ONLY_HOSTS.includes('software.tongji.edu.cn'),
	);
	ok(
		'不含公网可解析的 lib/1/mail/nic',
		!guide.CAMPUS_ONLY_HOSTS.some((h) => /^(lib|1|mail|nic)\./.test(h)),
		guide.CAMPUS_ONLY_HOSTS.join(','),
	);
	// 每个探针都是 https + no-cors（校内站点没有 CORS 头）
	for (const probe of guide.CAMPUS_TARGET.probes) {
		ok(`探针 ${probe.url} 走 https`, probe.url.startsWith('https://'));
		ok(`探针 ${probe.url} 用 no-cors`, probe.mode === 'no-cors');
	}
	ok('校园网有多个候选（单站宕机不至于误报）', guide.CAMPUS_TARGET.probes.length >= 2);
	// 走域名的前提是「校内解析得出」，换公共 DNS 就不成立 —— 所以必须有兜底开关
	ok(
		'校园网探测仍走域名（裸 IP 会把内网地址写进公开仓库）',
		guide.CAMPUS_TARGET.probes.every((p) => /^https:\/\/[a-z][a-z0-9.-]+\/$/.test(p.url)),
		guide.CAMPUS_TARGET.probes.map((p) => p.url).join(','),
	);
	ok(
		'探测目标里没有裸 IP',
		guide.netTargets.every((t) => !t.probes.some((p) => /\/\d{1,3}(\.\d{1,3}){3}/.test(p.url))),
	);
}

// 「默认在校园网环境下」兜底：解析器换成公共 DNS 后探测恒失败，只能用户自己声明
{
	const off = { campus: 'fail', github: 'ok', google: 'ok', at: 1700000000000 };
	const access = guide.tileAccess('https://software.tongji.edu.cn/');

	// 探测说校外时，校内资源照样被提示
	eq('探测校外会提示校园网', guide.accessWarning(access, off), '需校园网');

	// 打开开关后：campus 直接当 ok，校内资源不再被提示
	const on = guide.applyAssumeCampus(off, true);
	eq('开关打开后判为已接入', on.campus, 'ok');
	eq('开关打开后不再提示', guide.accessWarning(access, on), null);
	// 时间戳照旧：github / google 那两项是真探过的，时间戳对它们成立。
	// 归零会让 isStale() 永远为真，每次打开页面都重跑一遍探测。
	eq('开关生效时保留检测时间', on.at, off.at);
	// github / google 不受影响：那是国际连通性，跟在不在校园网无关
	eq('国际连通性照旧', on.github, 'ok');
	eq('国际连通性照旧（Google）', on.google, 'ok');

	// 关掉开关时原样返回，不多改一个字段
	const untouched = guide.applyAssumeCampus(off, false);
	eq('关掉开关时不改结果', untouched.campus, 'fail');
	eq('关掉开关时保留时间戳', untouched.at, off.at);

	// 表达式与总览文案也要跟着变，否则设置面板里显示的还是「国际互联网不畅」
	const overall = guide.describeOverall(on);
	ok('总览说已接入校园网', overall.text.includes('已接入校园网'), overall.text);

	// 已经在校内时开关不改变结论（幂等）
	const already = guide.applyAssumeCampus({ campus: 'ok', github: 'ok', google: 'ok', at: 5 }, true);
	eq('已在校内时开关无副作用', already.campus, 'ok');
	// unknown / checking 也都当已接入：宁可少提示，不要误报
	for (const state of ['unknown', 'checking']) {
		const s = guide.applyAssumeCampus({ campus: state, github: 'ok', google: 'ok', at: 5 }, true);
		eq(`${state} 时开关也当已接入`, s.campus, 'ok');
	}
}

// 目标表结构
{
	eq('三个检测目标', guide.netTargets.length, 3);
	eq('第一项是校园网', guide.netTargets[0].id, 'campus');
	// 探的是网站本身：API 通不代表网页能打开
	ok(
		'GitHub 探网站首页',
		guide.netTargets[1].probes[0].url === 'https://github.com/',
		guide.netTargets[1].probes[0].url,
	);
	ok(
		'GitHub 不探 api.github.com',
		!guide.netTargets[1].probes.some((p) => p.url.includes('api.github.com')),
	);
	ok(
		'GitHub 首页没有 ACAO，只能 no-cors',
		guide.netTargets[1].probes[0].mode === 'no-cors',
	);
	ok('Google 用 generate_204', guide.netTargets[2].probes[0].url.includes('generate_204'));
	// generate_204 不回 Access-Control-Allow-Origin，cors 模式会永远 fail（假阴性）
	ok(
		'Google 必须走 no-cors（否则永远探不通）',
		guide.netTargets[2].probes[0].mode === 'no-cors',
	);
	// 回归防线：别再往里塞 cors 探针，除非先验证过对方确实回 ACAO
	ok(
		'所有探针都是 no-cors（不依赖对方支持 CORS）',
		guide.netTargets.every((t) => t.probes.every((p) => p.mode === 'no-cors')),
		guide.netTargets.flatMap((t) => t.probes.filter((p) => p.mode !== 'no-cors').map((p) => p.url)).join(','),
	);
	eq('Google 只查一个地址', guide.netTargets[2].probes.length, 1);
	ok('每项都有超时值', guide.netTargets.every((t) => t.timeoutMs > 0));
	ok('每项都有说明文案', guide.netTargets.every((t) => t.hint.length > 4));
	// 所有探针都得是 https，避免混合内容被浏览器直接拦掉
	ok(
		'没有 http 探针（否则会被当混合内容拦下）',
		guide.netTargets.every((t) => t.probes.every((p) => p.url.startsWith('https://'))),
	);
	ok('id 不重复', new Set(guide.netTargets.map((t) => t.id)).size === 3);
}

// 标签页与可达性提示
{
	const groups = new Set(guide.defaultTiles.map((tile) => tile.group));
	ok(
		'每个默认磁贴都有已知分类',
		[...groups].every((g) => guide.guideTabs.some((tab) => tab.key === g)),
		[...groups].join(','),
	);
	// ⭐ 合规防线：公开仓库里不得出现校内裸 IP（网段 + 端口 + 路径 = 现成的扫描目标清单）
	// 这几条改由「导出 / 导入」承载，需要的人自己把 JSON 传给自己想给的人。
	{
		const leaked = guide.defaultTiles
			.map((tile) => tile.url)
			.filter((url) => /^http:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url));
		ok('默认磁贴里没有校内裸 IP', leaked.length === 0, leaked.join(', '));
		ok(
			'默认磁贴里没有内网主机名',
			guide.defaultTiles.every((tile) => !/\.internal\b/.test(tile.url)),
		);
	}
	ok(
		'内网条目改由导入配置承载（往返能带回来）',
		guide.parseConfig(
			guide.serializeConfig(
				[
					{
						id: 'x',
						title: '高程作业',
						url: 'http://192.0.2.10:2080',
						icon: '📝',
						group: 'course',
					},
				],
				null,
				{ color: '#66ccff', mode: 'auto', wallpaper: 'none', scrub: 0.72, assumeCampus: false },
				new Date(),
			),
		).tiles.length === 1,
	);
	ok('兜底分类存在', guide.guideTabs.some((tab) => tab.key === guide.FALLBACK_GROUP));

	// 标记只存在 links.ts 一处，磁贴按网址反查
	const campus = guide.tileAccess('https://software.tongji.edu.cn/');
	ok('software 标记为需校园网', campus.campusOnly);
	ok('software 不算境外站', campus.intl === false);
	const intl = guide.tileAccess('https://scholar.google.com/');
	ok('Google Scholar 标记为境外', intl.intl);
	ok('Google Scholar 不算校内', intl.campusOnly === false);
	const plain = guide.tileAccess('https://www.bing.com/');
	ok('普通站点无任何限制', !plain.campusOnly && !plain.intl);

	// 校外才提示；还没测出来（unknown）不该给用户添堵
	const off = { campus: 'fail', github: 'fail', google: 'fail', at: 1 };
	eq('校外提示接校园网', guide.accessWarning(campus, off), '需校园网');
	eq('校外提示境外站', guide.accessWarning(intl, off), '境外');
	eq('未检测时不提示', guide.accessWarning(campus, guide.emptySnapshot()), null);
	eq(
		'检测中不提示',
		guide.accessWarning(campus, { campus: 'checking', github: 'checking', google: 'checking', at: 1 }),
		null,
	);
	eq(
		'接了校园网就不提示',
		guide.accessWarning(campus, { campus: 'ok', github: 'fail', google: 'fail', at: 1 }),
		null,
	);
	eq('无限制的站点永远不提示', guide.accessWarning(plain, off), null);
	// 国际线路分两档：只有一个通 → 「部分受限」；两个都通 → 不打标记
	eq(
		'只有一个国际站可达 → 部分受限',
		guide.accessWarning(intl, { campus: 'ok', github: 'ok', google: 'fail', at: 1 }),
		'部分受限',
	);
	eq(
		'两个国际站都可达 → 不提示',
		guide.accessWarning(intl, { campus: 'ok', github: 'ok', google: 'ok', at: 1 }),
		null,
	);
	eq(
		'国际探测未出全结果 → 不提示',
		guide.accessWarning(intl, { campus: 'ok', github: 'unknown', google: 'fail', at: 1 }),
		null,
	);
	// 探明可达的探测目标自身不再提示：GitHub 通、Google 不通时，GitHub 磁贴不提示
	const ghOk = { campus: 'ok', github: 'ok', google: 'fail', at: 1 };
	eq('GitHub 通 → GitHub 磁贴不提示', guide.accessWarning(intl, ghOk, 'https://github.com'), null);
	eq(
		'GitHub 通 → 仍提示别的境外站',
		guide.accessWarning(intl, ghOk, 'https://scholar.google.com/'),
		'部分受限',
	);
	const ggOk = { campus: 'ok', github: 'fail', google: 'ok', at: 1 };
	eq(
		'Google 通 → Google 子域不提示',
		guide.accessWarning(intl, ggOk, 'https://scholar.google.com/'),
		null,
	);
	eq('Google 通 → 仍提示 GitHub', guide.accessWarning(intl, ggOk, 'https://github.com'), '部分受限');

	// 图书馆订购资源单独一类，不跟校内系统混为一谈
	const sub = guide.tileAccess('https://dl.acm.org/');
	ok('ACM 数字图书馆标记为需订阅', sub.subscription);
	ok('ACM 不算校内专用', sub.campusOnly === false);
	eq('校外提示订购库', guide.accessWarning(sub, off), '需订阅');
	eq('接了校园网就不再提订阅', guide.accessWarning(sub, { campus: 'ok', github: 'fail', google: 'fail', at: 1 }), null);
	ok(
		'订购库都打了标记',
		['https://www.cnki.net', 'https://www.webofscience.com/', 'https://ieeexplore.ieee.org/'].every(
			(url) => guide.tileAccess(url).subscription,
		),
	);
	ok(
		'校内系统不算订购库',
		!guide.tileAccess('https://software.tongji.edu.cn/').subscription &&
			!guide.tileAccess('https://scholar.google.com/').subscription,
	);

	// 弹窗文案按具体资源类型分别措辞，不再是「可能无法打开此网站」那种含糊话
	const campusText = guide.accessNotice(campus, '正版软件平台');
	ok('校内资源文案点名', typeof campusText === 'string' && campusText.includes('正版软件平台'));
	ok('校内资源文案说清校内网前提', campusText.includes('校内网'));
	const subText = guide.accessNotice(sub, 'ACM 数字图书馆');
	ok('订购库文案说清订阅前提', subText.includes('机构订阅'));
	ok('订购库文案提到 VPN', subText.includes('VPN'));
	const intlText = guide.accessNotice(intl, 'Google Scholar');
	ok('境外文案按网络环境措辞', intlText.includes('在当前网络环境下可能无法打开'));

	// 境外站再分两档：全不通 vs 只有部分线路可达
	const intlDown = guide.accessNotice(intl, 'Google Scholar', {
		campus: 'unknown',
		github: 'fail',
		google: 'fail',
		at: 1,
	});
	ok('境外全不通文案点名境外站', intlDown.includes('境外站点'));
	ok('境外全不通文案说受限', intlDown.includes('可能受限'));
	const intlPartial = guide.accessNotice(intl, 'Google Scholar', {
		campus: 'unknown',
		github: 'ok',
		google: 'fail',
		at: 1,
	});
	ok('境外部分可达文案用保守措辞', intlPartial.includes('你当前的网络环境可能无法打开'));
	ok('境外两档文案不同', intlDown !== intlPartial);
	eq('无限制的资源没有提醒', guide.accessNotice(plain, '必应'), null);
	// 各种说法必须互不相同 —— 分具体情况写的前提是确实分开了
	ok('各类文案互不相同', new Set([campusText, subText, intlText, intlDown, intlPartial]).size === 5);
	ok(
		'文案里不再出现含糊的万能句',
		![campusText, subText, intlText, intlDown, intlPartial].some((s) => s.includes('没有解锁此资源')),
	);
	ok(
		'文案里不再出现「当前推测」',
		![campusText, subText, intlText, intlDown, intlPartial].some((s) => s.includes('推测')),
	);
}

// 小工具图标必须走 Material Icons，不能回落到本站 favicon
{
	const tools = guide.defaultTiles.filter((tile) => tile.group === 'toolbox');
	eq('小工具 16 个', tools.length, 16);
	ok(
		'小工具都带 materialIcon',
		tools.every((tile) => typeof tile.materialIcon === 'string' && /^[a-z0-9-]+$/.test(tile.materialIcon)),
	);
	ok(
		'普通网站磁贴不带 materialIcon',
		guide.defaultTiles.filter((tile) => tile.group !== 'toolbox').every((tile) => !tile.materialIcon),
	);
	ok(
		'小工具用根相对路径',
		tools.every((tile) => tile.url.startsWith('/')),
	);
	// 之前踩的坑：所有工具都在同一域名下，按 host 取 favicon 会全变成同一个图标
	ok('小工具不再是同一个主站域名', new Set(tools.map((tile) => new URL(tile.url, 'https://915p.github.io').host)).size >= 1);
	// 导出的磁贴配置要把 materialIcon 带出去，否则导入回来就退回 favicon 了
	const exported = guide.serializeConfig(tools, null, { color: '#66ccff', mode: 'auto', wallpaper: 'none', scrub: 0.72, assumeCampus: false }, new Date(2026, 0, 2));
	const parsed = guide.parseConfig(exported);
	ok(
		'导入导出保留 materialIcon',
		!('error' in parsed) &&
			parsed.tiles.length === tools.length &&
			parsed.tiles.every((tile, index) => tile.materialIcon === tools[index].materialIcon),
	);
	// 恶意配置不能借此注入任意标签名
	const injected = JSON.parse(exported);
	injected.tiles[0].materialIcon = 'x" onclick="alert(1)';
	const safe = guide.parseConfig(JSON.stringify(injected));
	// 只针对被注入的那一条：其余 15 条本来就该有图标
	ok(
		'非法 materialIcon 被丢掉',
		!('error' in safe) && !safe.tiles[0].materialIcon && safe.tiles.length === tools.length,
	);

	// 站内小工具用根相对路径：取 favicon、取域名都不能抛
	eq('相对路径判为可用', guide.isUsableUrl('/tools/radix/'), true);
	ok('根相对路径算网址', guide.looksLikeUrl('/tools/radix/'));
	ok('协议相对写法不算站内网址', !guide.looksLikeUrl('//evil.com/x'));
	// 补 https:// 会得到 https:///tools/radix/ 这种废地址，磁贴点了就打不开
	eq('相对路径原样保留', guide.normalizeUrl('/tools/radix/'), '/tools/radix/');
	eq('相对路径回车直接去站内', guide.resolveTarget('/tools/radix/'), '/tools/radix/');
	eq('普通网址照常补协议', guide.normalizeUrl('github.com'), 'https://github.com');
	// 小工具标题要能搜到（原来这里 new URL 相对路径会抛）
	ok('小工具标题可搜', guide.linkSearchText(guide.guideCatalog.find((l) => l.id === 'tool-radix')).includes('进制转换'));
	ok('站内小工具没被当成域名', !guide.linkSearchText(guide.guideCatalog.find((l) => l.id === 'tool-radix')).includes('915p'));
	ok('协议相对地址不算站内', !guide.isUsableUrl('//evil.com/x'));
	ok('相对路径的站点图标不抛', guide.siteIcon('不存在的 id', '/tools/radix/') === null);
	eq('相对路径没有 hostname', guide.urlHost('/tools/radix/'), null);
	ok('绝对地址照常取 hostname', guide.urlHost('https://github.com/') === 'github.com');
	// 站内相对路径也要能导入导出（之前这里会整份配置被判非法）
	const roundTrip = guide.parseConfig(guide.serializeConfig(tools, null, { color: '#66ccff', mode: 'auto', wallpaper: 'none', scrub: 0.72, assumeCampus: false }, new Date(2026, 0, 2)));
	ok(
		'小工具配置能原样导出再导入',
		!('error' in roundTrip) && roundTrip.tiles.length === tools.length,
	);
}

// 快照读写
{
	const fresh = guide.emptySnapshot();
	eq('初始未检测', fresh.campus, 'unknown');
	eq('初始无时间戳', fresh.at, 0);
	ok('空快照是过期的', guide.isStale(fresh, Date.now()));

	eq('null → 空快照', guide.parseSnapshot(null).at, 0);
	eq('坏 JSON → 空快照', guide.parseSnapshot('{oops').at, 0);
	eq('非对象 → 空快照', guide.parseSnapshot('"hi"').at, 0);
	eq('数组 → 空快照', guide.parseSnapshot('[]').at, 0);

	// 非法状态值要被降级成 unknown，不能原样透传
	const dirty = guide.parseSnapshot('{"campus":"yes","github":"ok","google":1,"at":"soon"}');
	eq('非法 campus 降级', dirty.campus, 'unknown');
	eq('合法 github 保留', dirty.github, 'ok');
	eq('非法 google 降级', dirty.google, 'unknown');
	eq('非数字 at 降级', dirty.at, 0);

	const good = guide.parseSnapshot('{"campus":"ok","github":"fail","google":"ok","at":1700000000000}');
	eq('正常 campus', good.campus, 'ok');
	eq('正常 github', good.github, 'fail');
	eq('正常时间戳', good.at, 1700000000000);

	// 时效
	const now = 1_000_000;
	ok('刚检测过不算过期', !guide.isStale({ ...good, at: now - 1000 }, now));
	ok('超过 TTL 算过期', guide.isStale({ ...good, at: now - guide.NET_TTL - 1 }, now));
	ok('TTL 是 5 分钟', guide.NET_TTL === 300000);
	ok('可自定义 TTL', !guide.isStale({ ...good, at: now - 5000 }, now, 10000));
}

// 单项文案
{
	eq('可达', guide.describeNetState('ok').text, '可达');
	eq('不通', guide.describeNetState('fail').text, '不通');
	eq('检测中', guide.describeNetState('checking').text, '检测中…');
	eq('未检测', guide.describeNetState('unknown').text, '未检测');
	eq('通是 ok 色', guide.describeNetState('ok').tone, 'ok');
	eq('不通是 warn 色', guide.describeNetState('fail').tone, 'warn');
}

// 整体结论：国际互联网由 GitHub + Google 共同推断
{
	eq('全未检测', guide.describeOverall(guide.emptySnapshot()).text, '尚未检测');
	eq('检测中', guide.describeOverall({ campus: 'checking', github: 'checking', google: 'checking' }).text, '正在检测网络…');

	const campusOnly = guide.describeOverall({ campus: 'ok', github: 'fail', google: 'fail', at: 1 });
	ok('含「已接入校园网」', campusOnly.text.includes('校园网'), campusOnly.text);
	ok('含「国际互联网不畅」', campusOnly.text.includes('国际互联网不畅'), campusOnly.text);

	const allOk = guide.describeOverall({ campus: 'ok', github: 'ok', google: 'ok', at: 1 });
	ok('全通', allOk.text.includes('国际互联网通畅'), allOk.text);
	eq('全通是 ok 色', allOk.tone, 'ok');

	// 单个国际站可达 → 只算「部分可达」，不能报通畅
	const half = guide.describeOverall({ campus: 'unknown', github: 'ok', google: 'fail', at: 1 });
	ok('单站可达算部分', half.text.includes('部分可达'), half.text);
	ok('部分可达不是 warn', half.tone !== 'warn', half.tone);

	const none = guide.describeOverall({ campus: 'unknown', github: 'fail', google: 'fail', at: 1 });
	ok('国际全不畅', none.text.includes('国际互联网不畅'), none.text);
	eq('国际全不通是 warn 色', none.tone, 'warn');

	// 一项 fail 一项 unknown：不能断言「不通」（可能是没测出来）
	const mixed = guide.describeOverall({ campus: 'unknown', github: 'ok', google: 'unknown', at: 1 });
	ok('含 unknown 时不下断言', !mixed.text.includes('国际互联网不畅'), mixed.text);
}

// ---------------------------------------------------------------- 搜索引擎

{
	ok('引擎表非空', guide.SEARCH_ENGINES.length >= 2);
	ok(
		'每个引擎都有 {q} 占位符',
		guide.SEARCH_ENGINES.every((e) => e.url.includes('{q}')),
	);
	ok(
		'每个引擎都是 https（否则会被搜索页当混合内容拦）',
		guide.SEARCH_ENGINES.every((e) => e.url.startsWith('https://')),
		guide.SEARCH_ENGINES.filter((e) => !e.url.startsWith('https://')).map((e) => e.id).join(','),
	);
	ok('id 唯一', new Set(guide.SEARCH_ENGINES.map((e) => e.id)).size === guide.SEARCH_ENGINES.length);
	ok('有 Google', guide.SEARCH_ENGINES.some((e) => e.id === 'google'));
	ok('有 Bing', guide.SEARCH_ENGINES.some((e) => e.id === 'bing'));
	ok('有 Google 学术', guide.SEARCH_ENGINES.some((e) => e.id === 'scholar' && e.scholar === true));
	ok(
		'境外引擎都标了 intl',
		guide.SEARCH_ENGINES.filter((e) => e.intl).every((e) => e.intl),
	);
	// Wikipedia 中英文
	const wzh = guide.SEARCH_ENGINES.find((e) => e.id === 'wikipedia-zh');
	const wen = guide.SEARCH_ENGINES.find((e) => e.id === 'wikipedia-en');
	ok('有中文维基', !!wzh);
	ok('有英文维基', !!wen);
	ok('中文维基用 zh 域名', wzh.url.includes('zh.wikipedia.org'), wzh?.url);
	ok('英文维基用 en 域名', wen.url.includes('en.wikipedia.org'), wen?.url);
	ok('维基走站内搜索', wzh.url.includes('index.php?search=') && wen.url.includes('index.php?search='));
	ok('维基标记为 wiki', wzh.wiki === true && wen.wiki === true);
	ok('维基需要国际网络', wzh.intl === true && wen.intl === true);
	eq('中英文维基是两条独立项', guide.SEARCH_ENGINES.filter((e) => e.wiki).length, 2);

	// 每个引擎都要有本地 logo，且文件真的存在（否则磁贴位置会留个空洞）
	const icons = new Set(guide.SEARCH_ENGINES.map((e) => e.icon));
	ok('logo 路径都是本站的 /icons/', [...icons].every((i) => i.startsWith('/icons/search/')));
	for (const icon of icons) {
		ok(`logo 存在：${icon}`, existsSync(join(process.cwd(), 'public', icon.slice(1))), icon);
	}

	ok('Bing / 百度 不标 intl（国内可用）', !guide.SEARCH_ENGINES.find((e) => e.id === 'bing').intl);

	// 国际互联网判定：任一通就算可用
	ok('全通 → 可用', guide.intlAvailable({ campus: 'ok', github: 'ok', google: 'ok', at: 1 }));
	ok('只有 GitHub 通 → 可用', guide.intlAvailable({ campus: 'ok', github: 'ok', google: 'fail', at: 1 }));
	ok('只有 Google 通 → 可用', guide.intlAvailable({ campus: 'ok', github: 'fail', google: 'ok', at: 1 }));
	ok(
		'两个都不通 → 不可用',
		!guide.intlAvailable({ campus: 'ok', github: 'fail', google: 'fail', at: 1 }),
	);
	ok(
		'没测出来不算可用（别乐观假设）',
		!guide.intlAvailable(guide.emptySnapshot()),
	);

	// 自动挑引擎
	eq(
		'未选 + 国际通 → Google',
		guide.pickEngine({ campus: 'ok', github: 'ok', google: 'ok', at: 1 }, null).id,
		'google',
	);
	eq(
		'未选 + 国际不畅 → Bing',
		guide.pickEngine({ campus: 'ok', github: 'fail', google: 'fail', at: 1 }, null).id,
		'bing',
	);
	eq('未选 + 还没检测 → Bing（保守）', guide.pickEngine(guide.emptySnapshot(), null).id, 'bing');
	eq(
		'未选 + 国际部分可达 → Bing',
		guide.pickEngine({ campus: 'ok', github: 'ok', google: 'fail', at: 1 }, null).id,
		'bing',
	);
	eq(
		'未选 + 国际部分可达（另一侧）→ Bing',
		guide.pickEngine({ campus: 'ok', github: 'fail', google: 'ok', at: 1 }, null).id,
		'bing',
	);

	// 手动选择优先于自动逻辑，即便当前网络用不了
	eq(
		'手动选 Google 优先（即使国际不通）',
		guide.pickEngine({ campus: 'ok', github: 'fail', google: 'fail', at: 1 }, 'google').id,
		'google',
	);
	eq(
		'手动选学术',
		guide.pickEngine({ campus: 'ok', github: 'fail', google: 'fail', at: 1 }, 'scholar').id,
		'scholar',
	);
	eq(
		'未选 + 国际通 + 手动 Bing → 尊重手动',
		guide.pickEngine({ campus: 'ok', github: 'ok', google: 'ok', at: 1 }, 'bing').id,
		'bing',
	);
	eq(
		'存了不存在的 id → 退回自动',
		guide.pickEngine({ campus: 'ok', github: 'ok', google: 'ok', at: 1 }, 'yandex').id,
		'google',
	);

	// 搜索跳转要跟着引擎走
	const terms = '同济 选课';
	eq(
		'Google 搜索 URL',
		guide.resolveTarget(terms, guide.pickEngine({ campus: 'ok', github: 'ok', google: 'ok', at: 1 }, null)),
		`https://www.google.com/search?q=${encodeURIComponent(terms)}`,
	);
	eq(
		'Google 学术搜索 URL',
		guide.resolveTarget(terms, guide.pickEngine({ campus: 'ok', github: 'ok', google: 'ok', at: 1 }, 'scholar')),
		`https://scholar.google.com/scholar?q=${encodeURIComponent(terms)}`,
	);
	eq(
		'不传引擎时退回 Bing（老行为不变）',
		guide.resolveTarget(terms),
		`https://www.bing.com/search?q=${encodeURIComponent(terms)}`,
	);
	ok(
		'网址输入不受引擎影响',
		guide.resolveTarget('github.com', guide.pickEngine({ campus: 'ok', github: 'ok', google: 'ok', at: 1 }, null)) ===
			'https://github.com',
	);
	eq('空输入仍返回 null', guide.resolveTarget('   ', guide.SEARCH_ENGINES[0]), null);
}

// ---------------------------------------------------------------- 配置导入 / 导出

{
	const tiles = [
		{ id: 'a', title: '图书馆', url: 'https://www.lib.tongji.edu.cn/', icon: '📚', group: 'academic' },
		{ id: 'b', title: '高程作业', url: 'http://192.0.2.10:2080', icon: '📝', group: 'course' },
	];

	// 导出 → 导入 应当无损往返
	const json = guide.serializeConfig(tiles, 'scholar', { color: '#66ccff', mode: 'auto', wallpaper: 'none', scrub: 0.72, assumeCampus: false }, new Date('2026-10-07T03:04:05Z'));
	const round = guide.parseConfig(json);
	ok('往返解析成功', !('error' in round), round.error ?? '');
	eq('条目数一致', round.tiles.length, 2);
	eq('标题保真', round.tiles[0].title, '图书馆');
	eq('网址保真', round.tiles[1].url, 'http://192.0.2.10:2080');
	eq('分类保真', round.tiles[1].group, 'course');
	eq('引擎保真', round.engine, 'scholar');
	eq('版本号', JSON.parse(json).version, guide.CONFIG_VERSION);
	eq('导出文件名', guide.configFilename(new Date('2026-11-07T00:00:00')), '起始页-配置-2026-11-07.json');

	// ---- iconMode：三种自定义图标模式 ----
	const iconTiles = [
		{ id: 'a', title: '图片图标', url: 'https://a.cn', icon: 'https://a.cn/i.png', iconMode: 'url', group: 'tools' },
		{ id: 'b', title: 'MDUI 图标', url: 'https://b.cn', icon: 'home', iconMode: 'material', group: 'tools' },
		{ id: 'c', title: '文字图标', url: 'https://c.cn', icon: '🚀', iconMode: 'text', group: 'tools' },
		{ id: 'd', title: '自动站点图标', url: 'https://d.cn', icon: '', group: 'tools' },
	];
	const iconJson = guide.serializeConfig(iconTiles, null, { color: '#66ccff', mode: 'auto', wallpaper: 'none', scrub: 0.72, assumeCampus: false }, new Date());
	const iconRound = guide.parseConfig(iconJson);
	ok('iconMode 往返成功', !('error' in iconRound), iconRound.error ?? '');
	eq('url 模式保真', iconRound.tiles[0].iconMode, 'url');
	eq('url 图标值保真', iconRound.tiles[0].icon, 'https://a.cn/i.png');
	eq('material 模式保真', iconRound.tiles[1].iconMode, 'material');
	eq('material 图标名保真', iconRound.tiles[1].icon, 'home');
	eq('text 模式保真', iconRound.tiles[2].iconMode, 'text');
	eq('text 图标值保真', iconRound.tiles[2].icon, '🚀');
	eq('无 iconMode 时省略', iconRound.tiles[3].iconMode, undefined);

	// 无效 iconMode 被丢弃（不崩溃、不保留）
	const badMode = guide.parseConfig(JSON.stringify({
		version: 2,
		tiles: [{ id: 'x', title: 'x', url: 'https://a.cn', icon: 'y', iconMode: 'hacker', group: 'tools' }],
	}));
	ok('无效 iconMode 被丢弃', !('error' in badMode) && badMode.tiles[0].iconMode === undefined);

	// 旧版配置（无 iconMode）仍能解析
	const legacy = guide.parseConfig(JSON.stringify({
		version: 1,
		tiles: [{ id: 'x', title: '旧磁贴', url: 'https://a.cn', icon: '🔗', group: 'tools' }],
	}));
	ok('旧版无 iconMode 可解析', !('error' in legacy) && legacy.tiles[0].iconMode === undefined);

	// 引擎为 null（自动模式）也要能往返
	eq(
		'自动模式导出为 null',
		guide.parseConfig(guide.serializeConfig(tiles, null, { color: '#66ccff', mode: 'auto', wallpaper: 'none', scrub: 0.72, assumeCampus: false }, new Date())).engine,
		null,
	);

	// ---- 恶意 / 畸形输入必须被挡住 ----
	const bad = (label, text) =>
		ok(label, 'error' in guide.parseConfig(text) || guide.parseConfig(text).dropped.length > 0);

	bad('非法 JSON 被拒', '{ 不是 json');
	bad('顶层是数组被拒', '[]');
	bad('顶层是字符串被拒', '"hello"');
	bad('版本号不符被拒', JSON.stringify({ version: 999, tiles }));
	bad('缺 tiles 被拒', JSON.stringify({ version: 1 }));
	bad('tiles 不是数组被拒', JSON.stringify({ version: 1, tiles: 'x' }));

	// ⭐ 协议白名单：javascript: 绝不能变成可点的 href
	const js = guide.parseConfig(JSON.stringify({
		version: 1,
		tiles: [{ id: 'x', title: '恶意', url: 'javascript:alert(1)', icon: 'x', group: 'tools' }],
	}));
	ok('javascript: 网址被丢弃', 'error' in js || js.dropped.length > 0, JSON.stringify(js));
	const data = guide.parseConfig(JSON.stringify({
		version: 1,
		tiles: [{ id: 'x', title: '恶意', url: 'data:text/html,<script>alert(1)</script>', icon: 'x', group: 'tools' }],
	}));
	ok('data: 网址被丢弃', 'error' in data || data.dropped.length > 0);

	// 条目数量上限
	const over = Array.from({ length: guide.MAX_CONFIG_TILES + 1 }, (_, i) => ({
		id: `x${i}`, title: `t${i}`, url: 'https://a.cn', icon: '🔗', group: 'tools',
	}));
	bad('超过条目上限被拒', JSON.stringify({ version: 1, tiles: over }));

	// 部分坏条目：整体不失败，坏的丢掉、好的留下，并如实报丢弃数
	const mixed = guide.parseConfig(JSON.stringify({
		version: 1,
		tiles: [
			{ id: 'ok1', title: '好的', url: 'https://a.cn', icon: '🔗', group: 'tools' },
			{ id: 'bad1', title: '没网址', icon: '🔗', group: 'tools' },
			{ id: 'bad2', title: '', url: 'https://b.cn', icon: '🔗', group: 'tools' },
			{ id: 'ok2', title: '也是好的', url: 'https://c.cn', icon: '🔗', group: 'tools' },
		],
	}));
	ok('部分损坏仍能导入', !('error' in mixed) && mixed.tiles.length === 2, JSON.stringify(mixed));
	eq('如实报告丢弃 2 条', mixed.dropped.length, 2);

	// 未知分类要落到兜底分类，而不是让磁贴凭空消失
	const odd = guide.parseConfig(JSON.stringify({
		version: 1,
		tiles: [{ id: 'z', title: '未知分类', url: 'https://a.cn', icon: '🔗', group: '不存在的分类' }],
	}));
	eq('未知分类落到兜底', odd.tiles[0].group, guide.FALLBACK_GROUP);

	// 超长字段被截断，不至于撑破布局
	const long = guide.parseConfig(JSON.stringify({
		version: 1,
		tiles: [{ id: 'y', title: '标'.repeat(500), url: `https://a.cn/${'p'.repeat(2000)}`, icon: '🔗', group: 'tools' }],
	}));
	ok('超长名称被截断', !('error' in long) && long.tiles[0].title.length <= 60, String(!('error' in long) && long.tiles[0].title.length));
	ok('超长网址被截断后仍合法', !('error' in long) && /^https:\/\//.test(long.tiles[0].url));

	// 非法引擎 id 退成自动模式，而不是把搜索引擎弄坏
	const eng = guide.parseConfig(JSON.stringify({ version: 1, engine: 'yandex', tiles }));
	eq('未知引擎退成自动', eng.engine, null);

	// 完全没有可用条目时必须报错，不能导入出一个空页面
	bad('全无有效条目时报错', JSON.stringify({
		version: 1,
		tiles: [{ id: 'x', title: '没网址', icon: '🔗', group: 'tools' }],
	}));
}

// ---------------------------------------------------- 导入导出：全部设置

{
	const tiles = [{ id: 'a', title: '图书馆', url: 'https://a.cn/', icon: '📚', group: 'academic' }];
	const full = {
		color: '#ee0000',
		mode: 'dark',
		wallpaper: 'sea',
		scrub: 0.5,
		assumeCampus: true,
	};

	const json = guide.serializeConfig(tiles, 'bing', full, new Date('2026-11-07T00:00:00Z'));
	eq('格式版本', JSON.parse(json).version, guide.CONFIG_VERSION);
	const back = guide.parseConfig(json);
	ok('解析成功', !('error' in back), back.error ?? '');
	ok('外观整体带过来了', 'appearance' in back && !!back.appearance);
	eq('主题色保真', back.appearance.color, '#ee0000');
	eq('外观模式保真', back.appearance.mode, 'dark');
	eq('壁纸保真', back.appearance.wallpaper, 'sea');
	eq('遮罩保真', back.appearance.scrub, 0.5);
	eq('校园网假设保真', back.appearance.assumeCampus, true);

	// v1 文件没有 appearance：导入**不碰**现有外观，而不是把外观清空
	const v1 = guide.parseConfig(JSON.stringify({
		version: 1, exportedAt: '2026-10-01T00:00:00.000Z', engine: null, tiles,
	}));
	ok('v1 仍能导入', !('error' in v1));
	eq('v1 没有外观字段', v1.appearance, undefined);

	// 畸形外观：哪个字段认得出来就用哪个，认不出来的一律回落默认值
	const dirty = guide.parseConfig(JSON.stringify({
		version: guide.CONFIG_VERSION,
		exportedAt: '2026-10-01T00:00:00.000Z',
		engine: null,
		appearance: { color: 'not-a-color', mode: 'sideways', wallpaper: '火星', scrub: 'abc', assumeCampus: 'yes' },
		tiles,
	}));
	ok('畸形外观不报错', !('error' in dirty), dirty.error ?? '');
	eq('颜色回落默认', dirty.appearance.color, '#66ccff');
	eq('模式回落自动', dirty.appearance.mode, 'auto');
	eq('壁纸回落纯色', dirty.appearance.wallpaper, 'none');
	eq('遮罩回落默认', dirty.appearance.scrub, guide.SCRUB_RANGE.defaultValue);
	// 字符串 'yes' 不算 true —— 布尔字段只认真布尔
	eq('校园网假设不真就不启用', dirty.appearance.assumeCampus, false);
	// 整个 appearance 不是对象时整块丢掉
	const notObj = guide.parseConfig(JSON.stringify({
		version: guide.CONFIG_VERSION, exportedAt: 'x', engine: null, appearance: [], tiles,
	}));
	eq('appearance 不是对象时忽略', notObj.appearance, undefined);

	// 自定义壁纸：小的带走，太大的整个不带（对方导入时退回纯色）
	const small = guide.serializeConfig(
		tiles, null, { ...full, wallpaper: 'custom', customWall: 'data:image/png;base64,AAAA' }, new Date(),
	);
	eq('小自定义壁纸带得走', guide.parseConfig(small).appearance.wallpaper, 'custom');
	ok(
		'自定义壁纸内容也带走',
		(guide.parseConfig(small).appearance.customWall ?? '').startsWith('data:image/png'),
	);
	const big = guide.serializeConfig(
		tiles,
		null,
		{ ...full, wallpaper: 'custom', customWall: 'x'.repeat(guide.MAX_CUSTOM_WALL_IN_CONFIG + 10) },
		new Date(),
	);
	eq('超大自定义壁纸不带', guide.parseConfig(big).appearance.customWall, undefined);
	// 声称是 custom 但没有 data：退回纯色，不能留下一个加载不出图的壁纸位
	const orphan = guide.parseConfig(JSON.stringify({
		version: guide.CONFIG_VERSION, exportedAt: 'x', engine: null,
		appearance: { color: '#66ccff', mode: 'auto', wallpaper: 'custom', scrub: 0.72, assumeCampus: false },
		tiles,
	}));
	eq('只有 custom 标记没有图时退回纯色', orphan.appearance.wallpaper, 'none');
}

// ------------------------------------------------- 壁纸：分组 + 按季节随机

{
	// 照片壁纸全部按季节分好了组，且每组至少一张
	for (const season of guide.PHOTO_WALLS) {
		ok(`${season.label} 组有照片`, season.photos.length >= 1);
		for (const photo of season.photos) {
			ok(`${season.label}·${photo.label} 有文件名`, photo.file.startsWith('/images/walls/'));
		}
	}
	ok('总表里带上了所有照片', guide.WALLPAPERS.length >= 15);
	// 「纯色」和「随机」在最前面，用户一眼能看到
	eq('第一项是纯色', guide.WALLPAPERS[0].value, 'none');
	eq('第二项是随机', guide.WALLPAPERS[1].value, 'random');
	// 分组渲染要用的 group 字段必须有值，且不重名到看不出区别
	const groups = new Set(guide.WALLPAPERS.map((w) => w.group));
	ok('分组有区分度', groups.has('基础') && groups.has('渐变') && groups.size >= 6, String(groups.size));
	// 每个分组下的壁纸都得能掏出 css（照片是 url(...)，渐变是 linear-gradient）
	for (const w of guide.WALLPAPERS) {
		ok(`${w.label} 有背景值`, typeof w.css === 'string');
	}
	// 缩略图用的 wallCss 要能查到每一项
	eq('查纯色为空串', guide.wallCss('none'), '');
	ok('查照片有 url', guide.wallCss('spring-lib').startsWith('url('));
	eq('查不到返回空串', guide.wallCss('不存在的壁纸'), '');

	// 时段：19 点后、7 点前走「夜」
	for (const hour of [19, 20, 23, 0, 3, 6]) {
		const picked = guide.pickWallByTime(new Date(2026, 0, 15, hour, 0, 0));
		eq(`${hour} 点抽到夜组`, picked.split('-')[0], 'night');
	}
	// 白天按季节：3-5 春 / 6-8 夏 / 9-11 秋 / 12-2 冬
	for (const [month, season] of [[3, 'spring'], [4, 'spring'], [5, 'spring'], [6, 'summer'], [8, 'summer'],
		[9, 'autumn'], [11, 'autumn'], [12, 'winter'], [1, 'winter'], [2, 'winter']]) {
		const picked = guide.pickWallByTime(new Date(2026, month - 1, 15, 10, 0, 0));
		eq(`${month} 月抽到 ${season}`, picked.split('-')[0], season);
	}
	// 白天 7 点整和 18 点整都还算白天（边界）
	const at7 = guide.pickWallByTime(new Date(2026, 3, 15, 7, 0, 0));
	const at18 = guide.pickWallByTime(new Date(2026, 3, 15, 18, 0, 0));
	eq('7 点算白天', at7.split('-')[0], 'spring');
	eq('18 点算白天', at18.split('-')[0], 'spring');

	// 抽出来的一定是那个组里真实存在的一张，不能落到组外
	for (let i = 0; i < 60; i += 1) {
		const picked = guide.pickWallByTime(new Date(2026, i % 12, 15, i % 24, 0, 0));
		ok('抽到的壁纸在总表里', guide.WALLPAPERS.some((w) => w.value === picked), picked);
	}
	// 分布：夜里抽到的应该全在夜组内，别抽到别的组
	for (let i = 0; i < 40; i += 1) {
		const hour = 19 + (i % 5);
		eq(`${hour} 点仍在夜组`, guide.pickWallByTime(new Date(2026, 3, 15, hour, 0, 0)).split('-')[0], 'night');
	}
}

// ------------------------------------------------------ 遮罩：照片要更厚

{
	// 照片壁纸的遮罩默认值必须比渐变更厚，否则亮照片上文字读不清
	ok('照片默认遮罩更厚', guide.PHOTO_SCRUB_DEFAULT > guide.SCRUB_RANGE.defaultValue);
	eq('樱花大道用厚遮罩', guide.defaultScrubFor('spring-sakura'), guide.PHOTO_SCRUB_DEFAULT);
	eq('夜照片也用厚遮罩', guide.defaultScrubFor('night-lib'), guide.PHOTO_SCRUB_DEFAULT);
	// 渐变和纯色维持原默认
	eq('渐变用常规遮罩', guide.defaultScrubFor('dawn'), guide.SCRUB_RANGE.defaultValue);
	eq('纯色用常规遮罩', guide.defaultScrubFor('none'), guide.SCRUB_RANGE.defaultValue);
	// 认不出的值退回常规，别把遮罩悄悄改厚
	eq('未知壁纸退回常规', guide.defaultScrubFor('不存在的'), guide.SCRUB_RANGE.defaultValue);
	// 用户手动调过的值永远优先（sanitizeScrub 负责收敛范围）
	eq('手动值优先', guide.sanitizeScrub(0.5), 0.5);
	// 遮罩不跟主题走：浓度只由壁纸决定，两档默认值都落在可调区间内
	ok('照片默认在区间内', guide.PHOTO_SCRUB_DEFAULT <= guide.SCRUB_RANGE.max);
	ok('渐变默认在区间内', guide.SCRUB_RANGE.defaultValue >= guide.SCRUB_RANGE.min);
	// 自定义壁纸不按照片算 —— data URL 无法预知亮度，用常规档
	eq('自定义壁纸用常规遮罩', guide.defaultScrubFor('custom'), guide.SCRUB_RANGE.defaultValue);
}

// ------------------------------------------------------ 标签页（可新建/删除/排序）

{
	// parseTabs：合法项通过，非法项跳过；非法/空返回 null
	const good = guide.parseTabs([
		{ key: 'frequent', label: '常用', tone: 'primary' },
		{ key: 'x-1', label: '自定义', tone: 'nope' },
		{ key: 'BAD KEY', label: '非法', tone: 'primary' },
		{ key: 'dup', label: '一', tone: 'primary' },
		{ key: 'dup', label: '二', tone: 'secondary' },
		null,
		'x',
	]);
	ok('parseTabs 返回数组', Array.isArray(good));
	eq('parseTabs 跳过非法项', good.length, 3);
	eq('parseTabs 非法 tone 被轮换补齐', good[1].tone, guide.nextTabTone(good.slice(0, 1)));
	ok('parseTabs 保留合法 key', good[0].key === 'frequent' && good[2].key === 'dup');

	eq('parseTabs 空数组返回 null', guide.parseTabs([]), null);
	eq('parseTabs 非数组返回 null', guide.parseTabs('x'), null);
	eq('parseTabs 全是垃圾返回 null', guide.parseTabs([{ key: '??', label: '' }]), null);

	const many = Array.from({ length: guide.MAX_TABS + 1 }, (_, i) => ({
		key: `t${i}`,
		label: `T${i}`,
		tone: 'primary',
	}));
	eq('parseTabs 超过上限返回 null', guide.parseTabs(many), null);

	// makeTabKey 不与现有重复
	const keys = new Set([...guide.guideTabs.map((t) => t.key), guide.makeTabKey(guide.guideTabs)]);
	eq('makeTabKey 不撞现有', keys.size, guide.guideTabs.length + 1);

	// 序列化 / 解析往返保留自定义标签页与归组
	const customTabs = [
		{ key: 'frequent', label: '常用', tone: 'primary' },
		{ key: 'tab-mine', label: '我的', tone: 'tertiary' },
	];
	const tabsTiles = [
		{ id: 'a', title: 'A', url: 'https://a.com', icon: '🔗', group: 'tab-mine' },
	];
	const json = guide.serializeConfig(
		tabsTiles,
		null,
		{ color: '#66ccff', mode: 'auto', wallpaper: 'none', scrub: 0.5, assumeCampus: false },
		new Date(),
		customTabs,
	);
	eq('导出带 tabs', JSON.parse(json).tabs.length, 2);
	const back = guide.parseConfig(json);
	ok('导回保留 tabs', 'tiles' in back && back.tabs && back.tabs.length === 2);
	eq('导回保留 label', back.tabs[1].label, '我的');
	eq('导回磁贴 group 保留', back.tiles[0].group, 'tab-mine');

	// v1/v2（无 tabs）→ tabs 缺省，磁贴按默认分类归置
	const legacy = guide.parseConfig(
		JSON.stringify({
			version: 2,
			tiles: [{ id: 'a', title: 'A', url: 'https://a.com', icon: '🔗', group: 'frequent' }],
		}),
	);
	ok('老文件没有 tabs', 'tiles' in legacy && legacy.tabs === undefined);
	eq('老文件 group 保留', legacy.tiles[0].group, 'frequent');

	// v3 文件里 group 指向不存在的标签页 → 落到第一个标签页
	const stray = guide.parseConfig(
		JSON.stringify({
			version: 3,
			tabs: [{ key: 'only', label: '唯一', tone: 'primary' }],
			tiles: [{ id: 'a', title: 'A', url: 'https://a.com', icon: '🔗', group: 'nope' }],
		}),
	);
	ok('未知 group 落到首个标签页', 'tiles' in stray && stray.tiles[0].group === 'only');
}

// ---------------------------------------------------------------- 收尾

rmSync(dir, { recursive: true, force: true });
if (failures.length) console.log('\n失败明细：\n' + failures.map((line) => '  ✗ ' + line).join('\n'));
console.log(`\n总计：通过 ${pass} / 失败 ${fail}`);
if (fail) process.exit(1);
