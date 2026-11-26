/**
 * 邮件头分析器回归测试。
 *
 * 运行：npm run test:mail
 *
 * 用 esbuild 在内存里打成 ESM 再导入，避免 Windows 下临时目录权限问题。
 * 覆盖解析、编码字、地址、日期、认证汇总、Received 链路、规则与报告。
 */
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';

const bundle = await build({
	entryPoints: ['src/lib/mail-parse.ts'],
	bundle: true,
	platform: 'node',
	format: 'esm',
	write: false,
	logLevel: 'error',
});
const code = bundle.outputFiles[0].text;
const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const {
	MailParseError,
	alignedDomains,
	analyzeMail,
	authLabel,
	buildReport,
	buildReceivedChain,
	decodeEncodedWords,
	domainOf,
	filterHeaderFields,
	formatDelay,
	maskText,
	parseAddressList,
	parseMailDate,
	parseMailHeaders,
	parseReceived,
	summarizeAuth,
} = mod;

let pass = 0;
let fail = 0;

function eq(label, actual, expected) {
	if (JSON.stringify(actual) === JSON.stringify(expected)) {
		pass++;
		return;
	}
	fail++;
	console.log(`FAIL ${label}: ${JSON.stringify(actual)} (期望 ${JSON.stringify(expected)})`);
}

function ok(label, condition, detail = '') {
	if (condition) {
		pass++;
		return;
	}
	fail++;
	console.log(`FAIL ${label}${detail ? `: ${detail}` : ''}`);
}

function throws(label, fn, code) {
	try {
		fn();
		fail++;
		console.log(`FAIL ${label}: 没有抛错`);
	} catch (error) {
		if (error instanceof MailParseError && error.code === code) {
			pass++;
			return;
		}
		fail++;
		console.log(`FAIL ${label}: 抛错类型/代码不符：${error?.name} ${error?.code} ${error?.message}`);
	}
}

function b64(text) {
	return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

const fixedNow = new Date('2026-11-26T04:00:00Z');

// ── RFC 2047 ──
eq('B 编码', decodeEncodedWords('=?UTF-8?B?5L2g5aW9?='), '你好');
eq('Q 编码', decodeEncodedWords('=?UTF-8?Q?=E4=BD=A0=E5=A5=BD?='), '你好');
eq('相邻编码字去空白', decodeEncodedWords(`${b64('你')} ${b64('好')}`), '你好');
eq('编码字前后保留普通文字', decodeEncodedWords(`Re: ${b64('测试')} done`), 'Re: 测试 done');
eq('ISO-8859-1', decodeEncodedWords('=?ISO-8859-1?Q?Caf=E9?='), 'Café');
eq('GBK 编码字', decodeEncodedWords('=?GBK?B?1tDOxA==?='), '中文');
eq('未知字符集不崩', decodeEncodedWords('=?x-unknown?Q?abc?='), 'abc');

// ── 地址 ──
const addresses = parseAddressList('"Alice Wang" <alice@example.com>, bob@example.net (Bob Li), 坏地址');
eq('地址数量', addresses.length, 3);
eq('带引号姓名', addresses[0].name, 'Alice Wang');
eq('带引号地址', addresses[0].address, 'alice@example.com');
eq('注释作为姓名', addresses[1].name, 'Bob Li');
eq('无效项保留姓名', [addresses[2].name, addresses[2].address], ['坏地址', '']);
eq('分组地址', parseAddressList('Team: a@example.com, b@example.com;').map((item) => item.address), [
	'a@example.com',
	'b@example.com',
]);
eq('编码姓名', parseAddressList(`${b64('张三')} <zhang@example.cn>`)[0].name, '张三');

// ── 域名对齐 ──
ok('同域', alignedDomains('example.com', 'example.com'));
ok('子域', alignedDomains('mail.example.com', 'example.com'));
ok('不同域', !alignedDomains('example.com', 'example.net'));
ok('后缀伪装不算同域', !alignedDomains('example.com.evil.test', 'example.com'));
eq('domainOf', domainOf('a@Mail.Example.COM.'), 'mail.example.com');

// ── 日期 ──
eq('日期 +0800', parseMailDate('Wed, 25 Nov 2026 09:42:05 +0800').date?.toISOString(), '2026-11-25T01:42:05.000Z');
eq('日期 -0500', parseMailDate('25 Nov 2026 09:42:05 -0500').date?.toISOString(), '2026-11-25T14:42:05.000Z');
eq('日期 GMT', parseMailDate('Wed, 25 Nov 2026 01:42:05 GMT').date?.toISOString(), '2026-11-25T01:42:05.000Z');
eq('两位年份', parseMailDate('25 Nov 99 01:42:05 +0000').date?.getUTCFullYear(), 1999);
eq('非法日期', parseMailDate('Wed, 31 Feb 2026 09:42:05 +0800').date, null);
eq('时区未知但可解析', parseMailDate('Wed, 25 Nov 2026 09:42:05 -0000').zoneKnown, false);

// ── 折行与基本字段 ──
const folded = `From: "Alice" <alice@example.com>
To: bob@example.net
Subject: ${b64('会议')}
 安排
Date: Wed, 25 Nov 2026 09:42:05 +0800
Message-ID: <abc@example.com>
X-Test: one
X-Test: two

正文不应被解析。
`;
const parsed = parseMailHeaders(folded);
eq('折行主题', parsed.subject, '会议 安排');
eq('headerOnly', parsed.headerOnly, true);
eq('字段数', parsed.fields.length, 7);
eq('重复字段', parsed.duplicateKeys.includes('x-test'), true);
eq('From 解析', [parsed.from.name, parsed.from.address], ['Alice', 'alice@example.com']);
eq('To 解析', parsed.to[0].address, 'bob@example.net');
eq('Message-ID', parsed.messageId, '<abc@example.com>');

const mbox = parseMailHeaders('From alice@example.com Wed Nov 25 09:42:05 2026\nSubject: hi\n\nbody');
eq('跳过 mbox 首行', mbox.subject, 'hi');
throws('空输入', () => parseMailHeaders('   '), 'empty');
throws('非头部', () => parseMailHeaders('这不是邮件头\n只是普通文字'), 'not-headers');

const malformed = parseMailHeaders('Subject: ok\n这一行没有冒号\nFrom: a@example.com\n');
eq('坏行仍解析后续字段', malformed.from.address, 'a@example.com');
ok('坏行产生提示', malformed.issues.length >= 1);

// ── 认证与 Received ──
const authFields = parseMailHeaders(`Authentication-Results: mx.example.net;
 spf=pass smtp.mailfrom=example.org;
 dkim=pass header.d=example.org header.s=sel1;
 dkim=fail header.d=other.example;
 dmarc=pass header.from=example.org;
 arc=pass
Received-SPF: pass (mx.example.net: domain of example.org designates 192.0.2.1)
DKIM-Signature: v=1; a=rsa-sha256; d=example.org; s=sel1;
 i=@example.org; b=xxx
`).fields;
const auth = summarizeAuth(authFields);
eq('SPF 结果', auth.badges.find((item) => item.method === 'spf').result, 'pass');
eq('DKIM 有任一 pass 即 pass', auth.badges.find((item) => item.method === 'dkim').result, 'pass');
eq('DMARC 结果', auth.badges.find((item) => item.method === 'dmarc').result, 'pass');
eq('认证总体', auth.overall, 'pass');
eq('DKIM 签名数', auth.dkimSignatures.length, 1);
eq('DKIM 签名域', auth.dkimSignatures[0].domain, 'example.org');
eq('authserv-id', auth.authServIds, ['mx.example.net']);

const hop = parseReceived(
	'from smtp.example.org (smtp.example.org [198.51.100.23]) by mx.example.net with ESMTPS id abc for <u@example.net>; Wed, 25 Nov 2026 09:42:10 +0800',
	1,
);
eq('Received fromHost', hop.fromHost, 'smtp.example.org');
eq('Received byHost', hop.byHost, 'mx.example.net');
eq('Received 协议', hop.protocol, 'ESMTPS');
eq('Received IP', hop.ips, ['198.51.100.23']);
eq('Received 日期', hop.date.date?.toISOString(), '2026-11-25T01:42:10.000Z');
eq('Received for', hop.forNode, '<u@example.net>');
const compactHop = parseReceived(
	'from 10.10.0.17(mailfrom:a@example.org) by smtpdm.aliyun.com(127.0.0.1); Wed, 25 Nov 2026 19:41:00 +0800',
	1,
);
eq('紧凑节点 fromHost', compactHop.fromHost, '10.10.0.17');
eq('紧凑节点 byHost', compactHop.byHost, 'smtpdm.aliyun.com');

// ── 样例：正常邮件 ──
const normalHeaders = `Return-Path: <notifications@example.org>
Received: from mx.example.org (mx.example.org [192.0.2.10])
 by mail.example.net with ESMTPS id abc123
 for <user@example.net>; Wed, 25 Nov 2026 09:42:10 +0800
Received: from app.example.org (app.example.org [192.0.2.11])
 by mx.example.org with ESMTP id def456;
 Wed, 25 Nov 2026 09:42:05 +0800
Authentication-Results: mail.example.net;
 spf=pass smtp.mailfrom=example.org;
 dkim=pass header.d=example.org header.s=sel1;
 dmarc=pass header.from=example.org;
 arc=pass
DKIM-Signature: v=1; a=rsa-sha256; d=example.org; s=sel1;
 t=1764034925; bh=abc; b=xxx
From: "Example 通知" <notifications@example.org>
To: "测试用户" <user@example.net>
Subject: ${b64('你的订单已发货')}
Date: Wed, 25 Nov 2026 09:42:05 +0800
Message-ID: <20261125014205.abc@example.org>
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8
List-Unsubscribe: <https://example.org/unsubscribe>
`;
const normal = analyzeMail(normalHeaders, fixedNow);
eq('正常样例结论', normal.verdict.level, 'ok');
eq('正常样例认证', normal.auth.overall, 'pass');
eq('正常样例主题', normal.parsed.subject, '你的订单已发货');
eq('正常样例路径', normal.received.length, 2);
eq('正常样例时间差', normal.received[1].delayMs, 5000);
ok('正常样例无高风险', normal.checks.every((check) => check.level !== 'high'));
ok('正常样例有认证通过项', normal.checks.some((check) => check.id === 'auth-pass'));

// ── 样例：可疑邮件 ──
const suspiciousHeaders = `Return-Path: <bounce@bulk-sender.example>
Received: from unknown (unknown [203.0.113.66])
 by mx.example.net with SMTP id x1
 for <user@example.net>; Wed, 25 Nov 2026 10:04:31 +0800
Received: from smtp.mail-relay.example (smtp.mail-relay.example [198.51.100.23])
 by mx.example.org with ESMTP id y2;
 Wed, 25 Nov 2026 10:04:30 +0800
Authentication-Results: mx.example.net;
 spf=fail smtp.mailfrom=mail-relay.example;
 dkim=none;
 dmarc=fail header.from=mail-relay.example
From: "某支付平台安全中心 <security@pay.example>" <security@mail-relay.example>
Reply-To: help@pay.example
To: user@example.net
Subject: ${b64('【紧急】您的账户存在异常，请立即验证')}
Date: Wed, 25 Nov 2026 10:04:29 +0800
Message-ID: <random123@mail-relay.example>
X-Spam-Status: Yes, score=12.4
X-Spam-Flag: YES
X-Mailer: BulkMailer 1.0

正文不解析。
`;
const suspicious = analyzeMail(suspiciousHeaders, fixedNow);
eq('可疑样例结论', suspicious.verdict.level, 'high');
eq('可疑样例主题', suspicious.parsed.subject, '【紧急】您的账户存在异常，请立即验证');
eq('可疑样例 From', suspicious.parsed.from.address, 'security@mail-relay.example');
ok('命中显示名伪装', suspicious.checks.some((check) => check.id === 'display-name-spoof' && check.level === 'high'));
ok('命中 DMARC', suspicious.checks.some((check) => check.id === 'dmarc-fail' && check.level === 'high'));
ok('命中垃圾邮件标记', suspicious.checks.some((check) => check.id === 'spam-flagged' && check.level === 'high'));
ok('命中 Reply-To 不一致', suspicious.checks.some((check) => check.id === 'reply-to-mismatch' && check.level === 'warn'));
ok('命中 Return-Path 提示', suspicious.checks.some((check) => check.id === 'return-path-mismatch' && check.level === 'info'));
eq('高风险计数', suspicious.verdict.highCount, 3);
eq('可疑样例链路顺序', suspicious.received.map((item) => item.byHost), ['mx.example.org', 'mx.example.net']);
eq('链路延迟', suspicious.received[1].delayMs, 1000);

// ── 额外规则 ──
ok('多个 From 触发高风险', analyzeMail(multiFromRaw(), fixedNow).checks.some((check) => check.id === 'multiple-from'));
function multiFromRaw() {
	return `From: a@example.com
From: b@example.com
Date: Wed, 25 Nov 2026 09:42:05 +0800
Message-ID: <x@example.com>
`;
}

const punycode = analyzeMail(
	`From: a@xn--exmple-cua.com
To: b@example.net
Date: Wed, 25 Nov 2026 09:42:05 +0800
Message-ID: <x@xn--exmple-cua.com>
`,
	fixedNow,
);
ok('Punycode 提醒', punycode.checks.some((check) => check.id === 'punycode-from' && check.level === 'warn'));

const future = analyzeMail(
	`From: a@example.com
To: b@example.net
Date: Sat, 28 Nov 2026 09:42:05 +0800
Message-ID: <x@example.com>
`,
	fixedNow,
);
ok('未来日期提醒', future.checks.some((check) => check.id === 'future-date' && check.level === 'warn'));

const noReceived = analyzeMail(
	`From: a@example.com
To: b@example.net
Date: Wed, 25 Nov 2026 09:42:05 +0800
Message-ID: <x@example.com>
`,
	fixedNow,
);
ok('缺少 Received 提醒', noReceived.checks.some((check) => check.id === 'no-received' && check.level === 'warn'));

const mismatchAuthserv = analyzeMail(
	`Received: from a.example.org (a.example.org [192.0.2.1]) by mx.other.net with ESMTP; Wed, 25 Nov 2026 09:42:05 +0800
Authentication-Results: trusted.example; spf=pass smtp.mailfrom=example.org; dkim=pass; dmarc=pass
From: a@example.org
To: b@example.net
Date: Wed, 25 Nov 2026 09:42:05 +0800
Message-ID: <x@example.org>
`,
	fixedNow,
);
ok('认证来源不一致提醒', mismatchAuthserv.checks.some((check) => check.id === 'authserv-mismatch' && check.level === 'warn'));

const orgSiblingAuthserv = analyzeMail(
	`Received: from out.example.org (out.example.org [192.0.2.1]) by newxmmxszc21-0.qq.com (NewMX) with SMTP id A1 for <u@qq.com>; Wed, 25 Nov 2026 09:42:05 +0800
Authentication-Results: mx.qq.com;
 spf=pass smtp.mailfrom=example.org;
 dkim=pass header.d=example.org;
 dmarc=pass(p=NONE sp=NONE pct=100)
From: a@example.org
To: u@qq.com
Date: Wed, 25 Nov 2026 09:42:05 +0800
Message-ID: <x@example.org>
`,
	fixedNow,
);
ok('同组织域的认证主机不误报', !orgSiblingAuthserv.checks.some((check) => check.id === 'authserv-mismatch'));
ok('识别 DMARC p=none', orgSiblingAuthserv.checks.some((check) => check.id === 'dmarc-policy-none' && check.level === 'info'));

const realWorldSample = analyzeMail(
	`Received: from out208-20.dm.aliyun.com [140.205.208.20]
 by newxmmxszc21-0.qq.com (NewMX) with SMTP id A52266B1
 for <someone@qq.com>; Wed, 18 Nov 2026 19:41:18 +0800
Received: from 10.10.0.17(mailfrom:bzth7hqzk@ethnolinguistically.ren)
 by smtpdm.aliyun.com(127.0.0.1); Wed, 18 Nov 2026 19:41:17 +0800
Authentication-Results: mx.qq.com;
 spf=pass(140.205.208.20) smtp.mailfrom=6m2nTVWEWzRdK3bMji@ethnolinguistically.ren;
 dkim=pass(signature was verified) header.d=ethnolinguistically.ren;
 dmarc=pass(p=NONE sp=NONE pct=100)
From: Titan Bio <6m2nTVWEWzRdK3bMji@ethnolinguistically.ren>
Sender: bzth7hqzk@ethnolinguistically.ren
Reply-To: a13565220748@163.com
To: 1901653141@qq.com
Subject: =?utf-8?q?51_View_Row=2C_Colorado_Springs?=
Date: Wed, 18 Nov 2026 19:41:17 +0800
Message-ID: <600000375262452248.auto.1795002077@ethnolinguistically.ren>
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=ethnolinguistically.ren; s=aliyun-cn-hangzhou
`,
	fixedNow,
);
eq('真实样件主题 Q 编码', realWorldSample.parsed.subject, '51 View Row, Colorado Springs');
eq('真实样件认证全绿', realWorldSample.auth.overall, 'pass');
ok('真实样件不误报认证来源', !realWorldSample.checks.some((check) => check.id === 'authserv-mismatch'));
ok('真实样件提示 p=none', realWorldSample.checks.some((check) => check.id === 'dmarc-policy-none'));
ok('真实样件提示 Reply-To 不同域', realWorldSample.checks.some((check) => check.id === 'reply-to-mismatch'));
eq('真实样件紧凑 Received', realWorldSample.received.map((hop) => hop.byHost), ['smtpdm.aliyun.com', 'newxmmxszc21-0.qq.com']);

const negative = analyzeMail(
	`Received: from b.example.org (b.example.org [192.0.2.2]) by mx.example.net with ESMTP; Wed, 25 Nov 2026 09:40:00 +0800
Received: from a.example.org (a.example.org [192.0.2.1]) by mx.example.org with ESMTP; Wed, 25 Nov 2026 09:42:00 +0800
From: a@example.org
To: b@example.net
Date: Wed, 25 Nov 2026 09:42:05 +0800
Message-ID: <x@example.org>
`,
	fixedNow,
);
ok('时间倒退提醒', negative.checks.some((check) => check.id === 'negative-delay' && check.level === 'warn'));

// ── 报告与遮罩 ──
const masked = maskText('Alice <alice@example.com> 从 192.0.2.123 发到 [2001:db8::1]');
ok('遮罩邮箱', masked.includes('a***@e***.com') && !masked.includes('alice@example.com'), masked);
ok('遮罩 IPv4', masked.includes('192.0.***.***'), masked);
ok('遮罩 IPv6', masked.includes('[2001:***]'), masked);
const report = buildReport(suspicious, false);
ok('报告含结论', report.includes('发现高风险信号'));
ok('报告含全部头字段', report.includes('全部头字段') && report.includes('X-Spam-Flag: YES'));
const maskedReport = buildReport(suspicious, true);
ok('遮罩报告不泄露完整邮箱', !maskedReport.includes('security@mail-relay.example') && maskedReport.includes('s***@m***.example'));
eq('认证标签', [authLabel('pass'), authLabel('softfail'), authLabel('none')], ['通过', '软失败', '未声明']);
eq('延迟格式', formatDelay(5000), '5.0 秒');
eq('负延迟格式', formatDelay(-65000), '−1 分 5 秒');
const filtered = filterHeaderFields(parsed.fields, 'message-id');
eq('头字段搜索', filtered.map((field) => field.key), ['message-id']);

console.log(`\n${pass} 通过，${fail} 失败`);
if (fail) process.exit(1);