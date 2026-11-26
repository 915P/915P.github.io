/**
 * ZIP 工具箱纯逻辑层的回归测试。
 *
 * 运行：npm run test:zip
 *
 * 用 esbuild 的 JS API 打包 zip-ops.ts（而不是 npx），避免 Windows 上
 * spawnSync('npx') 的 ENOENT/EINVAL；Linux CI 行为一致。
 * zip.js 只用于构造/读取真实的 ZIP 字节，逻辑断言仍打在 zip-ops 上。
 */
import { build } from 'esbuild';
import {
	ZipReader,
	ZipWriter,
	Uint8ArrayReader,
	Uint8ArrayWriter,
	configure,
} from '@zip.js/zip.js';

configure({ useWebWorkers: false });

const result = await build({
	entryPoints: ['src/lib/zip-ops.ts'],
	bundle: true,
	format: 'esm',
	write: false,
	logLevel: 'error',
});
// 不落盘：Windows 的临时目录在这台机器上会 Access Denied，data URL 免掉文件权限
const code = result.outputFiles[0].text;
const ops = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

let pass = 0;
let fail = 0;
const failures = [];

function ok(label, condition, detail = '') {
	if (condition) {
		pass++;
	} else {
		fail++;
		failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
	}
}

function eq(label, actual, expected) {
	ok(label, Object.is(actual, expected), `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

async function rejects(label, fragment, fn) {
	try {
		await fn();
		ok(label, false, '没有抛错');
	} catch (error) {
		ok(label, fragment.test(String(error?.message ?? error)), `错误信息：${error?.message}`);
	}
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** 手写一个「存储」模式的单文件 ZIP，用来造 GBK / 路径穿越样本 */
function makeRawZip(nameBytes, dataBytes, flags = 0) {
	const crc = crc32(dataBytes);
	const local = Buffer.alloc(30);
	local.writeUInt32LE(0x04034b50, 0);
	local.writeUInt16LE(20, 4);
	local.writeUInt16LE(flags, 6);
	local.writeUInt16LE(0, 8);
	local.writeUInt16LE(0, 10);
	local.writeUInt16LE(0, 12);
	local.writeUInt32LE(crc, 14);
	local.writeUInt32LE(dataBytes.length, 18);
	local.writeUInt32LE(dataBytes.length, 22);
	local.writeUInt16LE(nameBytes.length, 26);
	local.writeUInt16LE(0, 28);

	const central = Buffer.alloc(46);
	central.writeUInt32LE(0x02014b50, 0);
	central.writeUInt16LE(20, 4);
	central.writeUInt16LE(20, 6);
	central.writeUInt16LE(flags, 8);
	central.writeUInt16LE(0, 10);
	central.writeUInt16LE(0, 12);
	central.writeUInt16LE(0, 14);
	central.writeUInt32LE(crc, 16);
	central.writeUInt32LE(dataBytes.length, 20);
	central.writeUInt32LE(dataBytes.length, 24);
	central.writeUInt16LE(nameBytes.length, 28);
	central.writeUInt16LE(0, 30);
	central.writeUInt16LE(0, 32);
	central.writeUInt16LE(0, 34);
	central.writeUInt16LE(0, 36);
	central.writeUInt32LE(0, 38);
	central.writeUInt32LE(0, 42);

	const cdOffset = local.length + nameBytes.length + dataBytes.length;
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(1, 8);
	eocd.writeUInt16LE(1, 10);
	eocd.writeUInt32LE(central.length + nameBytes.length, 12);
	eocd.writeUInt32LE(cdOffset, 16);

	return new Uint8Array(
		Buffer.concat([
			local,
			Buffer.from(nameBytes),
			Buffer.from(dataBytes),
			central,
			Buffer.from(nameBytes),
			eocd,
		]),
	);
}

function crc32(bytes) {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) {
			crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------- 格式化

eq('formatBytes 0', ops.formatBytes(0), '0 B');
eq('formatBytes 1023', ops.formatBytes(1023), '1023 B');
eq('formatBytes 1024', ops.formatBytes(1024), '1.0 KB');
eq('formatBytes 1MB', ops.formatBytes(1024 * 1024), '1.0 MB');
eq('formatBytes 负数', ops.formatBytes(-1), '—');
eq('formatPercent 0.5', ops.formatPercent(0.5), '50%');
eq('formatPercent 非法', ops.formatPercent(Number.NaN), '—');
eq('formatDate 非法', ops.formatDate(new Date('x')), '—');

// ---------------------------------------------------------------- 路径清洗

const safe = (name) => ops.sanitizePath(name);
eq('普通路径', safe('a/b.txt').safePath, 'a/b.txt');
eq('去掉 ./', safe('./a/./b.txt').safePath, 'a/b.txt');
eq('折叠空段', safe('a//b.txt').safePath, 'a/b.txt');
eq('反斜杠归一', safe('a\\b.txt').safePath, 'a/b.txt');
eq('目录保留尾斜杠', safe('a/b/').safePath, 'a/b/');
eq('绝对路径拒绝', safe('/etc/passwd').reason, 'absolute');
eq('双斜杠拒绝', safe('//server/share').reason, 'absolute');
eq('盘符拒绝', safe('C:/evil.txt').reason, 'drive');
eq('盘符相对拒绝', safe('C:evil.txt').reason, 'drive');
eq('父目录拒绝', safe('../evil.txt').reason, 'parent');
eq('中间父目录拒绝', safe('a/../../evil.txt').reason, 'parent');
eq('反斜杠父目录拒绝', safe('..\\evil.txt').reason, 'parent');
eq('控制字符拒绝', safe('a\u0001b.txt').reason, 'control');
eq('空名拒绝', safe('').reason, 'empty');
eq('只有 ./ 拒绝', safe('./').reason, 'empty');
eq('a..b.txt 正常', safe('a..b.txt').safePath, 'a..b.txt');

// ---------------------------------------------------------------- 去重与命名

{
	const used = new Set();
	eq('唯一名原样', ops.makeUniqueName('a.txt', used), 'a.txt');
	eq('同名加序号', ops.makeUniqueName('a.txt', used), 'a (2).txt');
	eq('大小写冲突', ops.makeUniqueName('A.TXT', used), 'A (3).TXT');
	eq('不同目录不冲突', ops.makeUniqueName('dir/a.txt', used), 'dir/a.txt');
	eq('带目录同名', ops.makeUniqueName('dir/a.txt', used), 'dir/a (2).txt');
}
{
	const names = ops.assignUniqueNames(['中文.txt', '中文.txt', 'dir/中文.txt']);
	eq('批量去重 1', names[0], '中文.txt');
	eq('批量去重 2', names[1], '中文 (2).txt');
	eq('不同目录不冲突', names[2], 'dir/中文.txt');
}
eq('输入名兜底', ops.normalizeInputName('../evil.txt'), 'evil.txt');
eq('压缩包名补后缀', ops.normalizeArchiveName('资料'), '资料.zip');
eq('压缩包名去非法字符', ops.normalizeArchiveName('a/b:c'), 'a-b-c.zip');
eq('压缩包名空', ops.normalizeArchiveName('   '), 'archive.zip');

// ---------------------------------------------------------------- 分类与汇总

const rawEntries = [
	{ name: 'docs/report.pdf', compressedSize: 400, uncompressedSize: 1000, lastModDate: new Date('2026-01-02T03:04:00') },
	{ name: 'images/a.png', compressedSize: 100, uncompressedSize: 200, encrypted: true },
	{ name: 'docs/', directory: true, compressedSize: 0, uncompressedSize: 0 },
	{ name: '../evil.sh', compressedSize: 1, uncompressedSize: 1 },
	{ name: 'docs/report.pdf', compressedSize: 400, uncompressedSize: 1000 },
	{ name: 'bomb.bin', compressedSize: 1, uncompressedSize: 20 * 1024 * 1024 },
];
const classified = ops.classifyEntries(rawEntries);
eq('分类数量', classified.length, 6);
eq('id 保持下标', classified[5].id, 5);
eq('目录识别', classified[2].directory, true);
eq('目录 kind', classified[2].kind, 'folder');
eq('pdf kind', classified[0].kind, 'pdf');
eq('png kind', classified[1].kind, 'image');
eq('加密识别', classified[1].encrypted, true);
eq('不安全条目', classified[3].unsafe, 'parent');
eq('不安全条目 safePath', classified[3].safePath, null);
eq('重复标记 1', classified[0].duplicate, true);
eq('重复标记 2', classified[4].duplicate, true);
eq('高压缩比', classified[5].highRatio, true);
eq('普通条目不高压缩比', classified[0].highRatio, false);
eq('压缩率', classified[0].ratio, 0.4);

const summary = ops.summarize(classified);
eq('汇总总数', summary.total, 6);
eq('汇总文件数', summary.files, 5);
eq('汇总目录数', summary.dirs, 1);
eq('汇总不安全', summary.unsafe, 1);
eq('汇总重复', summary.duplicates, 2);
eq('汇总加密', summary.encrypted, 1);
eq('汇总高压缩比', summary.highRatio, 1);

eq('搜索命中', ops.filterEntries(classified, 'REPORT').length, 2);
eq('搜索无命中', ops.filterEntries(classified, 'nope').length, 0);
{
	const windowed = ops.renderWindow(classified, '', 2);
	eq('渲染窗口条数', windowed.items.length, 2);
	eq('渲染窗口匹配数', windowed.matched, 6);
	eq('渲染窗口截断', windowed.truncated, true);
}

// ---------------------------------------------------------------- 限额与解压计划

eq('加载条目上限', ops.validateLoad(Array.from({ length: 10_001 }, () => ({ name: 'a' }))).includes('条目过多'), true);
eq('压缩空列表', ops.validateCompressionInput([]).includes('请先选择'), true);
eq('压缩文件数上限', ops.validateCompressionInput(Array.from({ length: 2001 }, () => ({ name: 'a', size: 0 }))).includes('文件太多'), true);
eq('压缩大小上限', ops.validateCompressionInput([{ name: 'a', size: 600 * 1024 * 1024 }]).includes('超过'), true);

{
	const plan = ops.planExtraction(classified, [0, 1, 2, 3, 5]);
	eq('计划包含安全条目', plan.entries.length, 4);
	eq('计划排除不安全', plan.skippedUnsafe.length, 1);
	eq('计划总大小', plan.totalBytes, 1000 + 200 + 0 + 20 * 1024 * 1024);
	eq('计划无错误', plan.error, null);
}
{
	const plan = ops.planExtraction(classified, [0, 1], {
		...ops.LIMITS,
		maxExtractTotalBytes: 500,
	});
	eq('计划超总上限', Boolean(plan.error), true);
}
{
	const plan = ops.planExtraction(classified, [3]);
	eq('计划全不安全', plan.error, '没有可解压的条目');
}
{
	const plan = ops.planExtraction(classified, [5], {
		...ops.LIMITS,
		maxExtractEntryBytes: 1024,
	});
	eq('计划排除超大条目', plan.skippedOversize.length, 1);
	eq('计划全超大', plan.error, '没有可解压的条目');
}

eq('编码 auto', ops.encodingFor('auto'), undefined);
eq('编码 gbk', ops.encodingFor('gbk'), 'gbk');
eq('编码 shift-jis', ops.encodingFor('shift-jis'), 'shift-jis');
eq('编码未知', ops.encodingFor('utf-8'), undefined);

// ---------------------------------------------------------------- 错误文案

eq(
	'密码错误（code）',
	ops.describeError({ code: 'ERR_INVALID_PASSWORD' }),
	'密码不正确，请重试',
);
eq('密码错误（message）', ops.describeError(new Error('Invalid password')), '密码不正确，请重试');
eq('不安全路径（message）', ops.describeError(new Error('Unsafe filename')), '压缩包包含不安全的文件路径');
eq('非 ZIP', ops.describeError(new Error('End of central directory not found')), '不是有效的 ZIP 文件');
eq('密码错误判断', ops.isPasswordError(new Error('Invalid password')), true);
eq('未提供密码判断', ops.isPasswordError(new Error('File contains encrypted entry')), true);
eq('未提供密码文案', ops.describeError(new Error('File contains encrypted entry')), '该条目已加密，需要密码');
eq('非密码错误判断', ops.isPasswordError(new Error('Unsafe filename')), false);

// ---------------------------------------------------------------- zip.js 真实往返

const sampleText = '你好，ZIP 工具箱';
{
	const writer = new ZipWriter(new Uint8ArrayWriter(), { level: 6 });
	await writer.add('中文/说明.txt', new Uint8ArrayReader(encoder.encode(sampleText)), {
		lastModDate: new Date('2026-01-02T03:04:00'),
	});
	await writer.add('docs/report.txt', new Uint8ArrayReader(encoder.encode('report')));
	const bytes = await writer.close();

	const reader = new ZipReader(new Uint8ArrayReader(bytes));
	const entries = await reader.getEntries();
	eq('往返条目数', entries.length, 2);
	eq('UTF-8 文件名', entries[0].filename, '中文/说明.txt');
	const info = ops.classifyEntries(
		entries.map((entry) => ({
			name: entry.filename,
			directory: entry.directory,
			encrypted: entry.encrypted,
			compressedSize: entry.compressedSize,
			uncompressedSize: entry.uncompressedSize,
			lastModDate: entry.lastModDate,
			compressionMethod: entry.compressionMethod,
		})),
	);
	eq('往返分类安全', info.every((entry) => entry.safePath), true);
	eq('往返路径', info[0].safePath, '中文/说明.txt');
	const data = await entries[0].getData(new Uint8ArrayWriter());
	eq('往返内容', decoder.decode(data), sampleText);
	await reader.close();
}

// ---------------------------------------------------------------- GBK 旧式压缩包

{
	const gbkName = [0xd6, 0xd0, 0xce, 0xc4, 0x2e, 0x74, 0x78, 0x74]; // 中文.txt
	const bytes = makeRawZip(gbkName, encoder.encode('hello'));

	const autoReader = new ZipReader(new Uint8ArrayReader(bytes), {
		filenameValidation: 'tolerant',
	});
	const [autoEntry] = await autoReader.getEntries();
	ok('GBK 自动模式不乱码才是意外', autoEntry.filename !== '中文.txt', autoEntry.filename);
	await autoReader.close();

	const gbkReader = new ZipReader(new Uint8ArrayReader(bytes), {
		filenameEncoding: 'gbk',
		filenameValidation: 'tolerant',
	});
	const [gbkEntry] = await gbkReader.getEntries();
	eq('GBK 指定编码', gbkEntry.filename, '中文.txt');
	eq('GBK 原始字节保留', Array.from(gbkEntry.rawFilename).join(','), gbkName.join(','));
	await gbkReader.close();
}

// ---------------------------------------------------------------- 路径穿越压缩包

{
	const bytes = makeRawZip(Array.from(encoder.encode('../evil.txt')), encoder.encode('x'));
	const reader = new ZipReader(new Uint8ArrayReader(bytes), {
		filenameValidation: 'tolerant',
		checkCrc32: true,
	});
	const [entry] = await reader.getEntries();
	eq('穿越包能列出', entry.filename, '../evil.txt');
	const [info] = ops.classifyEntries([{ name: entry.filename }]);
	eq('穿越包标记不安全', info.unsafe, 'parent');
	const plan = ops.planExtraction([info], [info.id]);
	eq('穿越包不进入解压计划', plan.entries.length, 0);
	eq('穿越包计划报错', plan.error, '没有可解压的条目');
	await reader.close();
}

// ---------------------------------------------------------------- AES 加解密

{
	const writer = new ZipWriter(new Uint8ArrayWriter(), { level: 0, password: 'secret' });
	await writer.add('secret.txt', new Uint8ArrayReader(encoder.encode('classified')));
	const bytes = await writer.close();

	const reader = new ZipReader(new Uint8ArrayReader(bytes));
	const [entry] = await reader.getEntries();
	eq('AES 条目标记加密', entry.encrypted, true);
	await rejects('AES 错误密码', /password/i, () => entry.getData(new Uint8ArrayWriter(), { password: 'bad' }));
	try {
		await entry.getData(new Uint8ArrayWriter(), { password: 'bad' });
	} catch (error) {
		eq('AES 错误密码可识别', ops.isPasswordError(error), true);
	}
	const plain = await entry.getData(new Uint8ArrayWriter(), { password: 'secret' });
	eq('AES 正确密码', decoder.decode(plain), 'classified');
	await reader.close();
}

// ---------------------------------------------------------------- 汇总

if (fail > 0) {
	console.error(`\n${fail} 项失败：`);
	for (const failure of failures) console.error(`  ✗ ${failure}`);
}
console.log(`\nZIP 测试：${pass} 通过，${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);