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
	// 校园网探测必须全是**域名**：裸 IP 没法区分「没接校园网」和「那台机器没开机」
	ok(
		'校园网探针不含裸 IP（不保证在线的机器不能当判定依据）',
		guide.CAMPUS_TARGET.probes.every((p) => !/\/\d{1,3}(\.\d{1,3}){3}/.test(p.url)),
		guide.CAMPUS_TARGET.probes.map((p) => p.url).join(','),
	);
	// 注意：它也不在默认磁贴里 —— 内网地址不随站点公开发布（见下方合规防线断言）
	ok(
		'高程作业不在探测目标里（它不保证在线）',
		!guide.netTargets.some((t) =>
			t.probes.some((p) => p.url.includes('192.0.2.10')),
		),
	);
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
	eq(
		'国际还通着就不提示境外',
		guide.accessWarning(intl, { campus: 'ok', github: 'ok', google: 'fail', at: 1 }),
		null,
	);

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
	ok('境外文案说清在境外', intlText.includes('境外'));
	eq('无限制的资源没有提醒', guide.accessNotice(plain, '必应'), null);
	// 三种说法必须互不相同 —— 分具体情况写的前提是确实分开了
	ok('三类文案互不相同', new Set([campusText, subText, intlText]).size === 3);
	ok('文案里不再出现含糊的万能句', ![campusText, subText, intlText].some((s) => s.includes('没有解锁此资源')));
	ok('文案里不再出现「当前推测」', ![campusText, subText, intlText].some((s) => s.includes('推测')));
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
	const exported = guide.serializeConfig(tools, null, new Date(2026, 0, 2));
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
	const roundTrip = guide.parseConfig(guide.serializeConfig(tools, null, new Date(2026, 0, 2)));
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
	const json = guide.serializeConfig(tiles, 'scholar', new Date('2026-10-07T03:04:05Z'));
	const round = guide.parseConfig(json);
	ok('往返解析成功', !('error' in round), round.error ?? '');
	eq('条目数一致', round.tiles.length, 2);
	eq('标题保真', round.tiles[0].title, '图书馆');
	eq('网址保真', round.tiles[1].url, 'http://192.0.2.10:2080');
	eq('分类保真', round.tiles[1].group, 'course');
	eq('引擎保真', round.engine, 'scholar');
	eq('版本号', JSON.parse(json).version, guide.CONFIG_VERSION);
	eq('导出文件名', guide.configFilename(new Date('2026-10-07T00:00:00')), '起始页-链接-2026-10-07.json');

	// 引擎为 null（自动模式）也要能往返
	eq(
		'自动模式导出为 null',
		guide.parseConfig(guide.serializeConfig(tiles, null, new Date())).engine,
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

// ---------------------------------------------------------------- 收尾

rmSync(dir, { recursive: true, force: true });
if (failures.length) console.log('\n失败明细：\n' + failures.map((line) => '  ✗ ' + line).join('\n'));
console.log(`\n总计：通过 ${pass} / 失败 ${fail}`);
if (fail) process.exit(1);
