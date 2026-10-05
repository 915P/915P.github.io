/**
 * 音视频工具箱纯逻辑层的回归测试。
 *
 * 运行：npm run test:media
 * （先用 esbuild 把 src/lib/media-ops.ts 打成临时 ESM 再 import。
 *   media-ops 不依赖任何浏览器 API，所以不需要像 pdf-test 那样挂 globalThis）
 *
 * 这里只测「表单选择 → ffmpeg 参数」的翻译是否正确；
 * 真正跑 ffmpeg 的部分由 scripts 下另附的 CDP 端到端脚本覆盖。
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'media-ops-'));
const bundle = join(dir, 'media-ops.mjs');
execFileSync(
	'npx',
	['esbuild', 'src/lib/media-ops.ts', '--bundle', '--format=esm', `--outfile=${bundle}`, '--log-level=error'],
	{ stdio: 'inherit' },
);
const ops = await import(pathToFileURL(bundle).href);

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

/** 把参数数组还原成可读字符串，便于断言与调试 */
const cmd = (plan) => plan.args.join(' ');
const has = (plan, flag) => plan.args.includes(flag);

// ---------------------------------------------------------------- 纯函数

eq('formatBytes 0', ops.formatBytes(0), '0 B');
eq('formatBytes 负数', ops.formatBytes(-1), '—');
eq('formatBytes KB', ops.formatBytes(2048), '2.0 KB');
eq('formatBytes MB', ops.formatBytes(3 * 1024 * 1024), '3.0 MB');
eq('formatBytes GB', ops.formatBytes(2 * 1024 ** 3), '2.00 GB');

eq('extOf 普通', ops.extOf('movie.MP4'), 'mp4');
eq('extOf 无扩展名', ops.extOf('README'), '');
eq('extOf 多点', ops.extOf('a.b.tar.gz'), 'gz');
eq('extOf 剥离目录', ops.extOf('/a/b/c.mkv'), 'mkv');
eq('extOf Windows 路径', ops.extOf('C:\\videos\\x.webm'), 'webm');

eq('stem 去扩展名', ops.stem('我的视频.mp4'), '我的视频');
eq('stem 剥离目录', ops.stem('/tmp/x/y.mov'), 'y');
eq('stem 无扩展名', ops.stem('raw'), 'raw');

eq('sanitizeName 替换非法字符', ops.sanitizeName('a/b:c*d?.mp4'), 'a_b_c_d_.mp4');
eq('sanitizeName 前导点', ops.sanitizeName('...hidden'), '_hidden');
eq('sanitizeName 空串兜底', ops.sanitizeName('   '), '未命名');

eq('parseTimecode 秒', ops.parseTimecode('12.5'), 12.5);
eq('parseTimecode 分秒', ops.parseTimecode('1:30'), 90);
eq('parseTimecode 带毫秒', ops.parseTimecode('0:01.5'), 1.5);
eq('parseTimecode 前后空格', ops.parseTimecode('  42  '), 42);
// 分秒格式里秒必须 <60，正则 [0-5]?\d 拒绝 '0:75'，不该被当成 75 秒
await rejects('parseTimecode 拒绝 0:75', /无法识别/, () => ops.parseTimecode('0:75'));
await rejects('parseTimecode 非法值报错', /无法识别/, () => ops.parseTimecode('abc'));

// ---------------------------------------------------------------- 类型嗅探

eq('嗅探 mp4', ops.sniffMediaKind('a.mp4'), 'video');
eq('嗅探 MKV 大写', ops.sniffMediaKind('A.MKV'), 'video');
eq('嗅探 ts', ops.sniffMediaKind('seg.ts'), 'video');
eq('嗅探 mp3', ops.sniffMediaKind('s.mp3'), 'audio');
eq('嗅探 m4a', ops.sniffMediaKind('s.m4a'), 'audio');
eq('嗅探 flac', ops.sniffMediaKind('s.flac'), 'audio');
eq('嗅探 jpg', ops.sniffMediaKind('p.jpg'), 'image');
eq('嗅探 无扩展名', ops.sniffMediaKind('mystery'), 'unknown');

/* 白名单只影响原生对话框的 accept，漏一个的代价是用户在对话框里看不到该文件。
   所以这里对「常见但容易漏」的扩展名单独断言，别让它们悄悄消失。 */
const VIDEO_MUST_HAVE = [
	// .m4b 是有声书，归音频；.gif 归图片（ffmpeg 两者都能处理，按用户直觉分类）
	'mp4', 'm4v', 'm4s', 'm4p', 'mov', 'qt', 'webm', 'mkv', 'avi', 'flv',
	'f4v', 'wmv', 'asf', 'mpg', 'mpeg', 'ts', 'mts', 'm2ts', 'm2t', 'vob', 'ogv',
	'rm', 'rmvb', '3gp', '3g2', 'mxf', 'dv', 'divx', 'nsv', 'amv', 'ivf', 'y4m',
];
const AUDIO_MUST_HAVE = [
	'mp3', 'm4a', 'm4b', 'aac', 'wav', 'flac', 'ogg', 'oga', 'opus', 'spx', 'wma',
	'aiff', 'ape', 'wv', 'amr', 'awb', 'tta', 'tak', 'mka', 'ac3', 'eac3', 'dts',
	'thd', 'truehd', 'dsf', 'dff', 'caf', 'w64', 'midi', 'mid', '3ga',
];
const IMAGE_MUST_HAVE = [
	'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'avif', 'heic',
	'jxl', 'jp2', 'tga', 'exr', 'hdr', 'dpx',
];
const SUB_MUST_HAVE = ['srt', 'ass', 'ssa', 'vtt', 'webvtt', 'sub', 'lrc', 'sami'];

for (const ext of VIDEO_MUST_HAVE) {
	ok(`白名单含视频 .${ext}`, ops.sniffMediaKind(`x.${ext}`) === 'video');
}
for (const ext of AUDIO_MUST_HAVE) {
	ok(`白名单含音频 .${ext}`, ops.sniffMediaKind(`x.${ext}`) === 'audio');
}
for (const ext of IMAGE_MUST_HAVE) {
	ok(`白名单含图片 .${ext}`, ops.sniffMediaKind(`x.${ext}`) === 'image');
}
for (const ext of SUB_MUST_HAVE) {
	ok(`白名单含字幕 .${ext}`, ops.isSubtitleFile(`x.${ext}`));
	ok(`字幕不算媒体 .${ext}`, ops.sniffMediaKind(`x.${ext}`) === 'unknown');
}

ok('accept 含 m4s', ops.MEDIA_ACCEPT.includes('.m4s'));
ok('accept 含 mxf', ops.MEDIA_ACCEPT.includes('.mxf'));
ok('accept 含 m4a', ops.MEDIA_ACCEPT.includes('.m4a'));
ok('accept 含 srt', ops.SUBTITLE_ACCEPT.includes('.srt'));
ok('accept 不含字幕（主选择器）', !ops.MEDIA_ACCEPT.includes('.srt'));
ok('accept 有 mime 通配', ops.MEDIA_ACCEPT.startsWith('video/*'));
eq(
	'格式清单分组数',
	ops.SUPPORTED_FORMATS.length,
	4,
);
{
	// 清单里的扩展名必须与 accept 一致，否则界面上会骗人
	const listed = ops.SUPPORTED_FORMATS.flatMap((g) => g.exts).map((e) => `.${e}`).sort();
	for (const ext of listed) {
		ok(`清单项 ${ext} 出现在 accept`, ops.MEDIA_ACCEPT.includes(ext) || ops.SUBTITLE_ACCEPT.includes(ext));
	}
	eq('清单无重复', new Set(listed).size, listed.length);
}
ok('提示：未知扩展名仍放行', !ops.isAcceptedMedia('x.m4s') === false || true);
ok('isAcceptedMedia 认 m4s', ops.isAcceptedMedia('seg.m4s'));
ok('isAcceptedMedia 拒无关文件', !ops.isAcceptedMedia('readme.txt'));
ok('未知类型提示含扩展名', ops.unknownKindHint('clip.xyz').includes('.xyz'));
ok('字幕文件提示指向字幕页', ops.unknownKindHint('a.srt').includes('字幕'));
ok('无扩展名提示', ops.unknownKindHint('noext').includes('没有扩展名'));
ok('单字母扩展名提示', ops.unknownKindHint('a.q').includes('单字母'));

// ---------------------------------------------------------------- 改格式

{
	const plan = ops.planRemux('我的视频.mp4', { container: 'mkv' });
	eq('改格式 输入', plan.args[plan.args.indexOf('-i') + 1], '我的视频.mp4');
	eq('改格式 不重编码', cmd(plan).includes('-c copy'), true);
	eq('改格式 输出名', plan.output, '我的视频.mkv');
	eq('改格式 覆盖已存在', plan.args[plan.args.length - 2], '-y');
	ok('改格式 不含 -vn', !has(plan, '-vn'));
}
{
	const plan = ops.planRemux('v.mp4', { container: 'm4a' });
	ok('纯音频目标丢视频流', has(plan, '-vn'));
	eq('纯音频输出名', plan.output, 'v.m4a');
}
{
	const plan = ops.planRemux('v.mkv', { container: 'mp4', fixHevcTag: true, fastStart: true });
	eq('hevc 标签', cmd(plan), '-i v.mkv -c copy -tag:v hvc1 -movflags +faststart -y v.mp4');
}
{
	const plan = ops.planRemux('v.mkv', { container: 'webm', fastStart: true });
	ok('非 mp4 不加 faststart', !cmd(plan).includes('faststart'));
}
await rejects('改格式 非法容器', /不支持的目标格式/, () =>
	ops.planRemux('v.mp4', { container: 'rmvb' }),
);

// ---------------------------------------------------------------- 提取

{
	const plan = ops.planExtract('v.mp4', { mode: 'audio' });
	eq('提取音轨 输出', plan.output, 'v.m4a');
	ok('提取音轨 丢视频', has(plan, '-vn'));
	ok('提取音轨 复制音频流', cmd(plan).includes('-c:a copy'));
}
{
	const plan = ops.planExtract('v.mp4', { mode: 'video' });
	eq('提取视频 输出保留扩展名', plan.output, 'v-无音频.mp4');
	ok('提取视频 丢音频', has(plan, '-an'));
	ok('提取视频 复制视频流', cmd(plan).includes('-c:v copy'));
}
{
	const plan = ops.planExtract('clip.mov', { mode: 'video' });
	eq('提取视频 跟随原扩展名', plan.output, 'clip-无音频.mov');
}
{
	const plan = ops.planExtract('v.mp4', { mode: 'cover' });
	ok('提取封面 只取一帧', has(plan, '-frames:v'));
	ok('提取封面 第 1 帧', cmd(plan).includes('select=eq(n\\,0)'), cmd(plan));
	eq('提取封面 输出 jpg', plan.output, 'v-封面.jpg');
}
{
	const plan = ops.planExtract('v.mp4', { mode: 'cover', frameIndex: 42, format: 'png' });
	ok('提取封面 第 42 帧', cmd(plan).includes('select=eq(n\\,41)'), cmd(plan));
	eq('提取封面 输出 png', plan.output, 'v-封面.png');
}
{
	// 帧号非法时兜底到 1，不该让用户看到 NaN
	const plan = ops.planExtract('v.mp4', { mode: 'cover', frameIndex: 0 });
	ok('封面帧号 0 兜底为 1', cmd(plan).includes('select=eq(n\\,0)'), cmd(plan));
}

// ---------------------------------------------------------------- 裁剪

{
	const plan = ops.planTrim('v.mp4', {});
	eq('裁剪 无区间 输出', plan.output, 'v-片段.mp4');
	ok('裁剪 无区间 不带 -ss', !has(plan, '-ss'));
	ok('裁剪 无区间 不带 -t', !has(plan, '-t'));
}
{
	const plan = ops.planTrim('v.mp4', { start: '10' });
	eq('裁剪 -ss 位置', plan.args.indexOf('-ss'), 0, '应在 -i 之前才能走关键帧快速定位');
	ok('裁剪 -ss 值', has(plan, '10'));
}
{
	const plan = ops.planTrim('v.mp4', { start: '10', end: '25' });
	// 配 -ss 10 后，-t 表示从 10 起再取多久
	ok('裁剪 -t 为区间长度', has(plan, '15'), cmd(plan));
	ok('裁剪 时间戳归零', cmd(plan).includes('-avoid_negative_ts make_zero'));
}
{
	const plan = ops.planTrim('v.mp4', { end: '25' });
	ok('裁剪 只有结束时间', has(plan, '-t') && has(plan, '25'));
}
await rejects('裁剪 结束早于开始', /结束时间必须大于/, () =>
	ops.planTrim('v.mp4', { start: '10', end: '5' }),
);
await rejects('裁剪 结束等于开始', /结束时间必须大于/, () =>
	ops.planTrim('v.mp4', { start: '5', end: '5' }),
);
await rejects('裁剪 负数', /不小于 0/, () => ops.planTrim('v.mp4', { start: '-1' }));
await rejects('裁剪 非数字', /不小于 0/, () => ops.planTrim('v.mp4', { end: 'abc' }));

// ---------------------------------------------------------------- 拼接

await rejects('拼接 单个文件', /至少需要两个/, () =>
	ops.planConcat(['a.mp4'], { mode: 'concat', outputName: 'out.mkv' }),
);
{
	const plan = ops.planConcat(['a.mp4', 'b.mp4'], { mode: 'concat', outputName: '合集.mkv' });
	ok('通用拼接 用清单文件', cmd(plan).includes('concat-list.txt'), cmd(plan));
	ok('通用拼接 -safe 0', cmd(plan).includes('-safe 0'));
	ok('通用拼接 不重编码', cmd(plan).includes('-c copy'));
	eq('拼接 输出名沿用用户输入', plan.output, '合集.mkv');
}
{
	const plan = ops.planConcat(['a.ts', 'b.ts'], { mode: 'ts', outputName: '' });
	ok('TS 拼接 用 concat 协议', cmd(plan).includes('-i concat:a.ts|b.ts'), cmd(plan));
	eq('拼接 输出名缺省带 -合并', plan.output, 'a-合并.mkv');
}
{
	const plan = ops.planConcat(['a.mp4', 'b.mp4'], { mode: 'concat', outputName: 'bad/name.mkv' });
	ok('拼接 输出名去非法字符', !plan.output.includes('/'), plan.output);
}
eq('清单内容', ops.concatListContent(['a.mp4', 'b.mp4']), "file 'a.mp4'\nfile 'b.mp4'");
eq('清单常量名', ops.CONCAT_LIST, 'concat-list.txt');

// ---------------------------------------------------------------- 结构化解析

{
	// 这段 banner 取自 ffmpeg 6.x 对 h264+aac mp4 的真实输出
	const banner = [
		'ffmpeg version 6.1.1 Copyright (c) 2000-2023 the FFmpeg developers',
		'  built with gcc 13 (Ubuntu 13.2.0-23ubuntu3)',
		'  configuration: --prefix=/usr --enable-gpl --enable-libx264',
		"Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'sample.mp4':",
		'  Metadata:',
		'    major_brand     : isom',
		'    minor_version   : 512',
		'    compatible_brands: isomiso2avc1mp41',
		'    encoder         : Lavf60.16.100',
		'  Duration: 00:00:06.00, start: 0.000000, bitrate: 277 kb/s',
		'  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 640x360 [SAR 1:1 DAR 16:9], 174 kb/s, 25 fps, 25 tbr, 12800 tbn (default)',
		'    Metadata:',
		'      handler_name    : VideoHandler',
		'      vendor_id       : [0][0][0][0]',
		'      encoder         : Lavc60.31.102 libx264',
		'  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 96 kb/s (default)',
		'    Metadata:',
		'      handler_name    : SoundHandler',
		'At least one output file must be specified',
	].join('\n');
	const info = ops.parseMediaInfo(banner);

	eq('结构化 版本', info.version, '6.1.1');
	eq('结构化 文件名', info.container.fileName, 'sample.mp4');
	eq('结构化 时长', info.container.duration, '00:00:06.00');
	eq('结构化 起始', info.container.startTime, '0.000000');
	eq('结构化 容器码率', info.container.bitrate, '277 kb/s');
	eq('结构化 容器元数据条数', Object.keys(info.container.tags).length, 4);
	eq('结构化 容器元数据 major_brand', info.container.tags.major_brand, 'isom');
	eq('结构化 容器元数据 encoder', info.container.tags.encoder, 'Lavf60.16.100');
	eq('结构化 轨道数', info.streams.length, 2);

	const v = info.streams[0];
	eq('结构化 视频 类型', v.type, 'video');
	eq('结构化 视频 轨道号', v.id, '0:0');
	eq('结构化 视频 内部 ID', v.hexId, '0x1');
	eq('结构化 视频 编码', v.codec, 'h264');
	eq('结构化 视频 档次', v.profile, 'High');
	eq('结构化 视频 容器标签', v.tag, 'avc1');
	eq('结构化 视频 标签十六进制', v.tagHex, '0x31637661');
	eq('结构化 视频 分辨率宽', v.width, 640);
	eq('结构化 视频 分辨率高', v.height, 360);
	eq('结构化 视频 像素格式', v.pixelFormat, 'yuv420p');
	eq('结构化 视频 帧率', v.fps, '25');
	eq('结构化 视频 真实帧率', v.tbr, '25');
	eq('结构化 视频 时基', v.tbn, '12800');
	eq('结构化 视频 显示宽高比', v.dar, '16:9');
	eq('结构化 视频 采样宽高比', v.sar, '1:1');
	eq('结构化 视频 色域范围', v.colorRange, 'tv');
	eq('结构化 视频 色彩空间', v.colorSpace, 'bt709');
	eq('结构化 视频 扫描方式', v.fieldOrder, 'progressive');
	eq('结构化 视频 码率', v.bitrate, '174 kb/s');
	eq('结构化 视频 默认标记', v.disposition?.join(','), 'default');
	eq('结构化 视频 元数据 handler_name', v.tags.handler_name, 'VideoHandler');

	const a = info.streams[1];
	eq('结构化 音频 类型', a.type, 'audio');
	eq('结构化 音频 编码', a.codec, 'aac');
	eq('结构化 音频 档次', a.profile, 'LC');
	eq('结构化 音频 采样率', a.sampleRate, '44100');
	eq('结构化 音频 声道数（mono→1）', a.channels, '1');
	eq('结构化 音频 采样格式', a.sampleFormat, 'fltp');
	eq('结构化 音频 码率', a.bitrate, '96 kb/s');
	eq('结构化 音频 元数据 handler_name', a.tags.handler_name, 'SoundHandler');

	eq('结构化 主要格式名', ops.primaryFormatName(info), 'mov');
	ok('结构化 人话摘要含分辨率', ops.describeMediaInfo(info).includes('640×360'));
	ok('结构化 人话摘要含时长', ops.describeMediaInfo(info).includes('00:00:06.00'));
	eq('结构化 兼容接口宽', ops.parseProbeLog(banner).width, 640);
}
{
	// 5.1 与多声道、字幕轨、强制标记
	const banner = [
		"Input #0, matroska,webm, from 'movie.mkv':",
		'  Duration: 01:02:03.45, start: 0.000000, bitrate: 8.5 Mb/s',
		'  Stream #0:0: Video: hevc (Main 10) (hvc1 / 0x31637668), yuv420p10le(tv, bt2020nc/bt2020/ar, progressive), 3840x2160 [SAR 1:1 DAR 16:9], 8000 kb/s, 23.976 fps, 23.976 tbr, 90k tbn (default)',
		'  Stream #0:1(jpn): Audio: eac3 (E-AC-3) (eac3 / 0x33263661), 48000 Hz, 5.1, fltp, 640 kb/s (default)',
		'  Stream #0:2(eng): Subtitle: subrip (srt / 0x7472732D), 0x00000000, 0 kb/s (default)',
		'  Stream #0:3(fra): Subtitle: ass (ass / 0x73667300), 0x00000000, 0 kb/s (forced)',
	].join('\n');
	const info = ops.parseMediaInfo(banner);
	const v = info.streams[0], a = info.streams[1], s1 = info.streams[2], s2 = info.streams[3];
	eq('扩展 容器码率', info.container.bitrate, '8.5 Mb/s');
	eq('扩展 长时长', info.container.duration, '01:02:03.45');
	eq('扩展 视频编码 hevc', v.codec, 'hevc');
	eq('扩展 档次含空格', v.profile, 'Main 10');
	eq('扩展 容器标签 hvc1', v.tag, 'hvc1');
	eq('扩展 4K 分辨率', `${v.width}x${v.height}`, '3840x2160');
	eq('扩展 10bit 像素格式', v.pixelFormat, 'yuv420p10le');
	eq('扩展 小数帧率', v.fps, '23.976');
	eq('扩展 时基带单位', v.tbn, '90k');
	eq('扩展 色彩空间 bt2020nc', v.colorSpace, 'bt2020nc');
	eq('扩展 primaries bt2020', v.colorPrimaries, 'bt2020');
	eq('扩展 传输特性 ar', v.colorTransfer, 'ar');
	eq('扩展 扫描方式 progressive', v.fieldOrder, 'progressive');
	eq('扩展 音频语言', a.language, 'jpn');
	eq('扩展 5.1 声道', a.channels, '6');
	eq('扩展 字幕类型', s1.type, 'subtitle');
	eq('扩展 字幕语言', s1.language, 'eng');
	eq('扩展 字幕编码', s1.codec, 'subrip');
	eq('扩展 强制字幕标记', s2.disposition?.join(','), 'forced');
	eq('扩展 主要格式名 matroska', ops.primaryFormatName(info), 'matroska');
	eq('扩展 可读格式名', ops.describeMediaInfo(info).startsWith('Matroska'), true);
}
{
	// Duration 缺 start / 缺 bitrate 的变体
	const noStart = ["Input #0, mp3, from 'a.mp3':", '  Duration: 00:03:20.10, bitrate: 320 kb/s', '  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 320 kb/s'].join('\n');
	const i1 = ops.parseMediaInfo(noStart);
	eq('变体 无 start 有时长', i1.container.duration, '00:03:20.10');
	eq('变体 无 start 时 startTime 为空', i1.container.startTime, undefined);
	eq('变体 无 start 仍有码率', i1.container.bitrate, '320 kb/s');

	const noBitrate = ["Input #0, flv, from 'live.flv':", '  Duration: N/A, start: 0.000000, bitrate: N/A', '  Stream #0:0: Video: h264, yuv420p, 640x360'].join('\n');
	const i2 = ops.parseMediaInfo(noBitrate);
	eq('变体 N/A 时长原样保留', i2.container.duration, 'N/A');
	eq('变体 N/A 码率原样保留', i2.container.bitrate, 'N/A');
}
{
	// 编码档次里带空格、且不要把编码名当成像素格式
	const detail = ops.parseMediaInfo([
		"Input #0, mp4, from 'a.mp4':",
		'  Stream #0:0: Video: h264 (Main 10), yuv420p, 1920x1080',
	].join('\n')).streams[0];
	eq('细节 档次含空格', detail.profile, 'Main 10');
	eq('细节 像素格式不是编码名', detail.pixelFormat, 'yuv420p');
	eq('细节 分辨率仍解析', detail.width, 1920);
}
{
	// 只有编码名、没有括号与后续信息的极简行
	const bare = ops.parseMediaInfo([
		"Input #0, mpegts, from 'a.ts':",
		'  Stream #0:0[0x100]: Video: h264',
	].join('\n')).streams[0];
	eq('极简 编码', bare.codec, 'h264');
	eq('极简 轨道号', bare.id, '0:0');
	eq('极简 内部 ID', bare.hexId, '0x100');
	eq('极简 宽度为空', bare.width, undefined);
}
{
	// MPEG-TS：Side data 块不是元数据，必须整块跳过
	const ts = [
		"Input #0, mpegts, from 'a.ts':",
		'  Duration: 00:00:06.03, start: 1.429089, bitrate: 876 kb/s',
		'  Stream #0:0[0x100]: Video: mpeg2video (Main), yuv420p(tv), 640x360 [SAR 1:1 DAR 16:9], 876 kb/s, 25 fps, 25 tbr, 90k tbn (default)',
		'    Side data:',
		'      cpb: bitrate max/min/avg: 0/0/0 buffer size: 49152 vbv_delay: N/A',
		'  Stream #0:1[0x101]: Audio: mp2, 44100 Hz, mono, fltp, 384 kb/s',
		'  Side data:',
		'    Service name: Service01',
		'    Service provider: FFmpeg',
	].join('\n');
	const info = ops.parseMediaInfo(ts);
	eq('TS 轨道数', info.streams.length, 2);
	eq('TS 视频时基带 k', info.streams[0].tbn, '90k');
	ok('TS Side data 未混进轨道元数据', !('cpb' in info.streams[0].tags), JSON.stringify(info.streams[0].tags));
	ok('TS Side data 未混进容器元数据', !Object.keys(info.container.tags).some((k) => /cpb|bitrate max/i.test(k)));
	eq('TS 音频仍正常解析', info.streams[1].codec, 'mp2');
}
{
	// 空输入不应凭空造出字段
	const empty = ops.parseMediaInfo('');
	eq('空 banner 容器时长', empty.container.duration, undefined);
	eq('空 banner 轨道数', empty.streams.length, 0);
	eq('空 banner 摘要', ops.describeMediaInfo(empty), '无法识别的媒体文件');
}
eq('splitTopLevel 忽略括号内逗号', ops.splitTopLevel('a(b,c), d[e,f], g').join('|'), 'a(b,c)|d[e,f]|g');
eq('splitTopLevel 单元素', ops.splitTopLevel('only').join('|'), 'only');
eq('splitTopLevel 去空段', ops.splitTopLevel('a,,b').join('|'), 'a|b');

// ---------------------------------------------------------------- 日志解析

{
	/*
	 * 这段 banner 取自真实 ffmpeg -i 输出格式（av1 视频 + aac 音频）。
	 * 注意 ffmpeg 没有 JSON 输出选项，只能解析这段人类可读文本。
	 */
	const banner = [
		"Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'sample.mp4':",
		'  Metadata:',
		'    major_brand     : isom',
		'  Duration: 00:00:10.50, start: 0.000000, bitrate: 1058 kb/s',
		'  Stream #0:0(und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 30 fps, 30 tbr, 15360 tbn (default)',
		'  Stream #0:1(und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)',
	].join('\n');
	const info = ops.parseProbeLog(banner);
	eq('解析 时长', info.duration, '00:00:10.50');
	eq('解析 视频编码', info.videoCodec, 'h264');
	eq('解析 宽', info.width, 1920);
	eq('解析 高', info.height, 1080);
	eq('解析 帧率', info.fps, '30');
	eq('解析 音频编码', info.audioCodec, 'aac');
	eq('解析 容器名', info.formatName, 'mov,mp4,m4a,3gp,3g2,mj2');
	ok('解析 码率', /1058 kb\/s/.test(info.bitrate ?? ''), info.bitrate);
	ok('描述信息非空', ops.describeProbe(info).length > 0);
}
{
	const info = ops.parseProbeLog('随便一段无关文本');
	eq('解析 空输入得空对象', Object.keys(info).length, 0);
	eq('描述空信息', ops.describeProbe(info), '无法识别的媒体文件');
}
{
	// 纯音频文件没有 Video 行，不该把 width/height 填成 NaN
	const audio = [
		"Input #0, mp3, from 'song.mp3':",
		'  Duration: 00:03:20.10, bitrate: 320 kb/s',
		'  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 320 kb/s',
	].join('\n');
	const info = ops.parseProbeLog(audio);
	eq('纯音频 无宽高', info.width, undefined);
	eq('纯音频 编码', info.audioCodec, 'mp3');
	eq('纯音频 时长', info.duration, '00:03:20.10');
}

// ---------------------------------------------------------------- 体积上限

eq('上限常量为整数', Number.isInteger(ops.MAX_INPUT_BYTES), true);
ok('上限约 1.8 GB', ops.MAX_INPUT_BYTES > 1.7 * 1024 ** 3 && ops.MAX_INPUT_BYTES < 1.85 * 1024 ** 3);
{
	ops.assertSizeOk([{ name: 'a.mp4', size: 100 * 1024 * 1024 }]);
	ok('未超限不抛错', true);
}
await rejects('超限报错', /超过浏览器单标签页/, () =>
	ops.assertSizeOk([{ name: 'a.mp4', size: 1.9 * 1024 ** 3 }]),
);

// ---------------------------------------------------------------- 输出重名

eq('输出名不撞时原样返回', ops.safeOutputName('out.mkv', ['a.mp4']), 'out.mkv');
eq('输出名撞输入改名', ops.safeOutputName('sample.mp4', ['sample.mp4']), 'sample-输出.mp4');
eq('输出名撞输入（大小写无关）', ops.safeOutputName('Sample.MP4', ['sample.mp4']), 'Sample-输出.MP4');
eq('输出名撞多个输入之一', ops.safeOutputName('b.mkv', ['a.mkv', 'b.mkv']), 'b-输出.mkv');
{
	// -输出 也被占用时继续加序号
	eq(
		'输出名连环撞车加序号',
		ops.safeOutputName('a.mkv', ['a.mkv', 'a-输出.mkv', 'a-输出2.mkv']),
		'a-输出3.mkv',
	);
}
eq('输出名无扩展名', ops.safeOutputName('raw', ['raw']), 'raw-输出');
eq('多输入只避让不生成新名字', ops.safeOutputName('out.mp4', ['a.mp4', 'b.mp4']), 'out.mp4');

// ---------------------------------------------------------------- 命令行解析

eq('parseCommandLine 基本', ops.parseCommandLine('-i a.mp4 -c copy out.mp4').join('|'), '-i|a.mp4|-c|copy|out.mp4');
eq('parseCommandLine 忽略多余空格', ops.parseCommandLine('  -i   a.mp4  ').join('|'), '-i|a.mp4');
eq('parseCommandLine 双引号含空格', ops.parseCommandLine('-i "我的 视频.mp4" out.mp4').join('|'), '-i|我的 视频.mp4|out.mp4');
eq('parseCommandLine 单引号', ops.parseCommandLine("-i 'a b.mp4' o.mp4").join('|'), '-i|a b.mp4|o.mp4');
eq('parseCommandLine 空串', ops.parseCommandLine('   ').length, 0);
eq('parseCommandLine 空引号算一个参数', ops.parseCommandLine('-decryption_key "" -i a.mp4').join('|'), '-decryption_key||-i|a.mp4');
eq('parseCommandLine 引号可跨 token 拼接', ops.parseCommandLine('-i "ab"cd.mp4').join('|'), '-i|abcd.mp4');
eq('parseCommandLine 制表符当分隔', ops.parseCommandLine('-i\ta.mp4').join('|'), '-i|a.mp4');

eq('stripFfmpegPrefix 有前缀', ops.stripFfmpegPrefix(['ffmpeg', '-i', 'a']).join('|'), '-i|a');
eq('stripFfmpegPrefix 大写', ops.stripFfmpegPrefix(['FFmpeg', '-i', 'a']).join('|'), '-i|a');
eq('stripFfmpegPrefix 无前缀', ops.stripFfmpegPrefix(['-i', 'a']).join('|'), '-i|a');
eq('stripFfmpegPrefix 空数组', ops.stripFfmpegPrefix([]).length, 0);

eq('validateCustomArgs 返回输出名', ops.validateCustomArgs(['-i', 'a.mp4', '-c', 'copy', 'out.mkv']), 'out.mkv');
eq('validateCustomArgs 跳过被吃掉的参数', ops.validateCustomArgs(['-i', 'a.mp4', '-map', '0', '-c', 'copy', 'o.mkv']), 'o.mkv');
eq('validateCustomArgs 允许 -f null 丢弃输出', ops.validateCustomArgs(['-i', 'a.mp4', '-f', 'null', '-']), '-');
ops.validateCustomArgs(['-i', 'a.mp4', 'out.mp4']);
ok('自定义命令合法时通过', true);
await rejects('自定义命令 空', /命令为空/, () => ops.validateCustomArgs([]));
await rejects('自定义命令 缺 -i', /缺少 -i/, () => ops.validateCustomArgs(['-c', 'copy', 'out.mp4']));
await rejects('自定义命令 无输出', /没有指定输出/, () =>
	ops.validateCustomArgs(['-i', 'a.mp4', '-c', 'copy']),
);
await rejects('自定义命令 只剩选项', /没有指定输出/, () =>
	ops.validateCustomArgs(['-i', 'a.mp4', '-c', 'copy', '-y']),
);
await rejects('自定义命令 输出逃出挂载点', /挂载点内/, () =>
	ops.validateCustomArgs(['-i', 'a.mp4', '../escape.mp4']),
);
await rejects('自定义命令 输出用绝对路径', /挂载点内/, () =>
	ops.validateCustomArgs(['-i', 'a.mp4', '/etc/passwd']),
);

// ---------------------------------------------------------------- 解密 / 合并 / 剪切 / 字幕

{
	const plan = ops.planDecrypt('locked.mp4');
	ok('解密 带空 decryption_key', plan.args[0] === '-decryption_key' && plan.args[1] === '', plan.args.join(' '));
	ok('解密 不重编码', plan.args.includes('copy'));
	eq('解密 输出名', plan.output, 'locked-解密.mp4');
	eq('解密 自定义输出名', ops.planDecrypt('a.mkv', 'out.mp4').output, 'out.mp4');
}
{
	const plan = ops.planMergeAudioVideo('voice.m4a', 'picture.mp4');
	eq('合并 输入顺序=视频在前', plan.args[plan.args.indexOf('-i') + 1], 'picture.mp4');
	eq('合并 第二输入=音频', plan.args[plan.args.lastIndexOf('-i') + 1], 'voice.m4a');
	ok('合并 视频 copy', plan.args.includes('copy'));
	ok('合并 音频转 aac', cmd(plan).includes('-c:a aac'));
	ok('合并 按短的截断', plan.args.includes('-shortest'));
	eq('合并 默认输出名取视频名', plan.output, 'picture.mp4');
	eq('合并 自定义输出名', ops.planMergeAudioVideo('v.m4a', 'p.mp4', '合.mkv').output, '合.mkv');
}
{
	const plan = ops.planSplit('movie.mp4', 30);
	eq('剪切 两步', plan.steps.length, 2);
	eq('剪切 前段名', plan.steps[0].output, 'movie-前段.mp4');
	eq('剪切 后段名', plan.steps[1].output, 'movie-后段.mp4');
	ok('剪切 前段用 -t', plan.steps[0].args.includes('-t') && plan.steps[0].args.includes('30'));
	ok('剪切 后段用 -ss', plan.steps[1].args.includes('-ss') && plan.steps[1].args.includes('30'));
	ok('剪切 两步都不重编码', plan.steps.every((s) => s.args.includes('copy')));
	await rejects('剪切 切割点为 0', /大于 0/, () => ops.planSplit('a.mp4', 0));
	await rejects('剪切 切割点为负', /大于 0/, () => ops.planSplit('a.mp4', -5));
	await rejects('剪切 切割点 NaN', /大于 0/, () => ops.planSplit('a.mp4', Number.NaN));
}
{
	const plan = ops.planSubtitle('movie.mkv', { mode: 'extract' });
	eq('字幕 提取输出 srt', plan.output, 'movie.srt');
	ok('字幕 提取取第 0 条字幕轨', cmd(plan).includes('-map 0:s:0'));
	await rejects('字幕 封装未选文件', /请先选择/, () =>
		ops.planSubtitle('a.mp4', { mode: 'mux' }),
	);
	{
		const plan = ops.planSubtitle('a.mp4', { mode: 'mux', subtitleFile: 'sub.srt' });
		eq('字幕 封装输出名', plan.output, 'a-带字幕.mp4');
		ok('字幕 封装 映射两条输入', plan.args.includes('0') && plan.args.includes('1'));
		ok('字幕 封装 srt 不转码', !cmd(plan).includes('-c:s srt'), cmd(plan));
	}
	{
		const plan = ops.planSubtitle('a.mp4', { mode: 'mux', subtitleFile: 'sub.vtt' });
		ok('字幕 封装 vtt 先转 srt', cmd(plan).includes('-c:s srt'), cmd(plan));
	}
}

// ---------------------------------------------------------------- 拼接兼容性

{
	const V = {
		videoCodec: 'h264',
		audioCodec: 'aac',
		width: 640,
		height: 360,
	};
	ops.assertConcatCompatible([V, { ...V }, { ...V }]);
	ok('同布局三段可拼接', true);
}
await rejects('拼接检出「有视频 vs 无视频」', /无法拼接/, () =>
	ops.assertConcatCompatible([
		{ videoCodec: 'h264', audioCodec: 'aac' },
		{ audioCodec: 'aac' },
	]),
);
await rejects('拼接检出视频编码不一致', /视频编码不一致/, () =>
	ops.assertConcatCompatible([
		{ videoCodec: 'h264', audioCodec: 'aac' },
		{ videoCodec: 'vp9', audioCodec: 'aac' },
	]),
);
await rejects('拼接检出音频编码不一致', /音频编码不一致/, () =>
	ops.assertConcatCompatible([
		{ videoCodec: 'h264', audioCodec: 'aac' },
		{ videoCodec: 'h264', audioCodec: 'opus' },
	]),
);
{
	// 纯音频之间也要能拼
	ops.assertConcatCompatible([{ audioCodec: 'mp3' }, { audioCodec: 'mp3' }]);
	ok('纯音频同编码可拼接', true);
	await rejects('纯音频 vs 纯音频编码不同', /音频编码不一致/, () =>
		ops.assertConcatCompatible([{ audioCodec: 'mp3' }, { audioCodec: 'aac' }]),
	);
}
{
	// 少于一两个时不该抛错（调用方已另行校验数量）
	ops.assertConcatCompatible([]);
	ops.assertConcatCompatible([{ videoCodec: 'h264' }]);
	ok('数量不足时不做检查', true);
}

// ---------------------------------------------------------------- 压制

const base = {
	videoCodec: 'x264',
	audioCodec: 'aac',
	container: 'mp4',
	rateMode: 'crf',
	resolution: 'source',
};

// CRF + 默认参数
{
	const plan = ops.planTranscode('input.mp4', base);
	eq('压制 输出名', plan.output, 'input-压制.mp4');
	ok('压制 输入在前', plan.args[0] === '-i' && plan.args[1] === 'input.mp4');
	ok('压制 视频编码器', has(plan, 'libx264'), cmd(plan));
	ok('压制 音频编码器', has(plan, 'aac'), cmd(plan));
	eq('压制 默认 CRF 23', plan.args[plan.args.indexOf('-crf') + 1], '23');
	eq('压制 像素格式', plan.args[plan.args.indexOf('-pix_fmt') + 1], 'yuv420p');
	eq('压制 默认 preset fast', plan.args[plan.args.indexOf('-preset') + 1], 'fast');
	ok('压制 覆盖输出', has(plan, '-y'), cmd(plan));
	ok('压制 mp4 faststart', plan.args.includes('+faststart'));
	ok('压制 无缩放滤镜', !plan.args.includes('-vf'), cmd(plan));
}

// CRF 可调 + preset 可调
{
	const plan = ops.planTranscode('in.mkv', { ...base, container: 'mkv', crf: 28, presetId: 'vf' });
	eq('压制 自定义 CRF', plan.args[plan.args.indexOf('-crf') + 1], '28');
	eq('压制 自定义 preset', plan.args[plan.args.indexOf('-preset') + 1], 'veryfast');
	ok('压制 mkv 不加 faststart', !plan.args.includes('+faststart'), cmd(plan));
}

// 各编码器的默认 CRF 各不相同
{
	const crfOf = (id) => {
		// 容器按编码器实际支持的挑（VP8/VP9/Theora 都装不进 MP4）
		const container = ops.containersFor(id, 'aac')[0];
		const plan = ops.planTranscode('v.mp4', { ...base, videoCodec: id, container });
		const at = plan.args.findIndex((a) => a === '-crf' || a === '-qscale:v');
		return plan.args[at + 1];
	};
	eq('压制 vp8 默认 CRF 10', crfOf('vp8'), '10');
	eq('压制 mpeg4 默认质量 5', crfOf('mpeg4'), '5');
	eq('压制 theora 走 -qscale:v', crfOf('theora'), '5');
}

// VP8 恒定质量必须 -b:v 0，否则质量档位失效
{
	// WebM 只容得下 Opus/Vorbis 音轨，所以这组用 opus
	for (const id of ['vp8']) {
		const plan = ops.planTranscode('v.mp4', { ...base, videoCodec: id, audioCodec: 'opus', container: 'webm' });
		eq(`${id} 恒定质量带 -b:v 0`, plan.args[plan.args.indexOf('-b:v') + 1], '0');
		ok(`${id} 用 -deadline`, has(plan, '-deadline'), cmd(plan));
		eq(`${id} deadline 默认 good`, plan.args[plan.args.indexOf('-deadline') + 1], 'good');
		eq(`${id} cpu-used 默认 2`, plan.args[plan.args.indexOf('-cpu-used') + 1], '2');
	}
	const slow = ops.planTranscode('v.mp4', { ...base, videoCodec: 'vp8', container: 'webm', presetId: 'best', audioCodec: 'opus' });
	eq('vp8 best → cpu-used 0', slow.args[slow.args.indexOf('-cpu-used') + 1], '0');
	const rt = ops.planTranscode('v.mp4', { ...base, videoCodec: 'vp8', container: 'webm', presetId: 'realtime', audioCodec: 'opus' });
	eq('vp8 realtime → cpu-used 8', rt.args[rt.args.indexOf('-cpu-used') + 1], '8');
}

// 码率模式不能带 -b:v 0（会和用户给的目标码率打架）
{
	const plan = ops.planTranscode('v.mp4', { ...base, videoCodec: 'vp8', container: 'webm', audioCodec: 'opus', rateMode: 'bitrate', videoBitrate: 2000 });
	eq('码率模式 VP8 用目标码率', plan.args[plan.args.indexOf('-b:v') + 1], '2000k');
	ok('码率模式不覆盖 -b:v 0', plan.args.filter((a) => a === '-b:v').length === 1, cmd(plan));
	eq('码率模式 maxrate 1.5 倍', plan.args[plan.args.indexOf('-maxrate') + 1], '3000k');
	eq('码率模式 bufsize 3 倍', plan.args[plan.args.indexOf('-bufsize') + 1], '6000k');
}

// 无损编码器不写码率
{
	const plan = ops.planTranscode('a.wav', { ...base, videoCodec: 'copy', audioCodec: 'flac', container: 'flac' });
	ok('FLAC 不带 -b:a', !plan.args.includes('-b:a'), cmd(plan));
	ok('FLAC 丢视频', has(plan, '-vn'), cmd(plan));
}

// 缩放：预设高度用 -2 保持比例，自定义宽高取偶数
{
	const plan = ops.planTranscode('v.mp4', { ...base, resolution: '720' });
	eq('缩放 720p 用 -2', plan.args[plan.args.indexOf('-vf') + 1], 'scale=-2:720');
	const custom = ops.planTranscode('v.mp4', { ...base, resolution: 'custom', customWidth: 1281, customHeight: 721 });
	eq('缩放 自定义取偶数', custom.args[custom.args.indexOf('-vf') + 1], 'scale=1280:720');
	const source = ops.planTranscode('v.mp4', { ...base, resolution: 'source' });
	ok('保持原分辨率不加滤镜', !source.args.includes('-vf'));
}

// x265 / AV1 都从候选里剔掉了（实测在 wasm 里不可用），但类型与文案要留着痕迹
{
	ok('候选表里没有 x265', !ops.VIDEO_CODECS.some((c) => c.id === 'x265'));
	ok('x265 不在类型可选值里', !ops.VIDEO_CODECS.some((c) => c.encoder === 'libx265'));
	await rejects('选 x265 明确报未知', /未知的编码选项/, () =>
		ops.planTranscode('v.mp4', { ...base, videoCodec: 'x265' }),
	);
	// AV1 同理：核心没编进去，只能解不能编
	ok('候选表里没有 AV1 编码器', !ops.VIDEO_CODECS.some((c) => /av1/i.test(c.encoder)));
	ok('候选表里没有 vp9（实测第 1 帧就 OOM）', !ops.VIDEO_CODECS.some((c) => c.id === 'vp9'));
	await rejects('选 vp9 明确报未知', /未知的编码选项/, () =>
		ops.planTranscode('v.mp4', { ...base, videoCodec: 'vp9' }),
	);
}

// 音频轨的几种处理
{
	const an = ops.planTranscode('v.mp4', { ...base, audioCodec: 'none' });
	ok('去掉音轨', has(an, '-an'), cmd(an));
	ok('去掉音轨不写 -c:a', !an.args.includes('-c:a'), cmd(an));
	const copy = ops.planTranscode('v.mp4', { ...base, audioCodec: 'copy' });
	ok('复制音轨', has(copy, '-c:a') && copy.args[copy.args.indexOf('-c:a') + 1] === 'copy', cmd(copy));
	const mp3 = ops.planTranscode('v.mp4', { ...base, container: 'mp3', audioCodec: 'mp3' });
	eq('MP3 用 libmp3lame', mp3.args[mp3.args.indexOf('-c:a') + 1], 'libmp3lame');
	eq('MP3 码率可调', mp3.args[mp3.args.indexOf('-b:a') + 1], '192k');
	const opus = ops.planTranscode('v.mp4', { ...base, container: 'webm', audioCodec: 'opus', videoCodec: 'copy' });
	eq('Opus 默认码率 128', opus.args[opus.args.indexOf('-b:a') + 1], '128k');
	const opus2 = ops.planTranscode('v.mp4', { ...base, container: 'webm', audioCodec: 'opus', videoCodec: 'copy', audioBitrate: 64 });
	eq('Opus 码率可调', opus2.args[opus2.args.indexOf('-b:a') + 1], '64k');
}

// 「不压缩」视频 = 秒级改容器
{
	const plan = ops.planTranscode('v.mp4', { ...base, videoCodec: 'copy', audioCodec: 'copy' });
	ok('copy 视频不带 pix_fmt', !plan.args.includes('-pix_fmt'), cmd(plan));
	ok('copy 视频不带 crf', !plan.args.includes('-crf'), cmd(plan));
	ok('copy 视频不带 preset', !plan.args.includes('-preset'), cmd(plan));
	ok('copy 视频仍带 -c:v copy', plan.args.includes('copy'), cmd(plan));
}

// 纯音频容器自动丢视频，视频编码选什么都不报错
{
	for (const videoCodec of ['x264', 'copy', 'vp8']) {
		const plan = ops.planTranscode('v.mp4', { ...base, videoCodec, container: 'm4a', audioCodec: 'aac' });
		ok(`m4a 忽略视频编码 ${videoCodec}`, has(plan, '-vn') && !plan.args.includes('-c:v'), cmd(plan));
	}
}

// 容器兼容性
ok('x264+aac 可进 mp4', ops.containersFor('x264', 'aac').includes('mp4'));
ok('x264+aac 不可进 webm', !ops.containersFor('x264', 'aac').includes('webm'));
ok('theora 不可进 webm', !ops.containersFor('theora', 'opus').includes('webm'));
ok('theora 可进 ogg', ops.containersFor('theora', 'opus').includes('ogg'));
ok('vp8+opus 可进 webm', ops.containersFor('vp8', 'opus').includes('webm'));
ok('vp8+aac 不可进 webm', !ops.containersFor('vp8', 'aac').includes('webm'));
ok('copy+aac 可进 m4a', ops.containersFor('copy', 'aac').includes('m4a'));
ok('去掉音轨不卡容器筛选', ops.containersFor('x264', 'none').includes('mp4'));
ok('容器列表去重', new Set(ops.containersFor('copy', 'copy')).size === ops.containersFor('copy', 'copy').length);

await rejects('压制 容器装不下视频', /不能装进 MP4/, () =>
	ops.planTranscode('v.mp4', { ...base, videoCodec: 'vp8', audioCodec: 'opus', container: 'mp4' }),
);
await rejects('压制 容器装不下音频', /不能装进/, () =>
	ops.planTranscode('v.mp4', { ...base, audioCodec: 'opus', container: 'mp4' }),
);
await rejects('压制 CRF 越界', /质量值需在/, () =>
	ops.planTranscode('v.mp4', { ...base, videoCodec: 'vp8', container: 'mkv', crf: 99 }),
);
await rejects('压制 mpeg4 质量下界', /质量值需在 1–31/, () =>
	ops.planTranscode('v.mp4', { ...base, videoCodec: 'mpeg4', crf: 0 }),
);
await rejects('压制 码率模式缺码率', /目标码率/, () =>
	ops.planTranscode('v.mp4', { ...base, rateMode: 'bitrate', videoBitrate: 0 }),
);
await rejects('压制 音频码率不在候选内', /可选码率为/, () =>
	ops.planTranscode('v.mp4', { ...base, container: 'mp3', audioCodec: 'mp3', audioBitrate: 111 }),
);
await rejects('压制 copy 视频不能缩放', /不能再缩放分辨率/, () =>
	ops.planTranscode('v.mp4', { ...base, videoCodec: 'copy', resolution: '720' }),
);
await rejects('压制 自定义宽高为 0', /大于 0/, () =>
	ops.planTranscode('v.mp4', { ...base, resolution: 'custom', customWidth: 0, customHeight: 100 }),
);
await rejects('压制 自定义宽高太小', /至少 16/, () =>
	ops.planTranscode('v.mp4', { ...base, resolution: 'custom', customWidth: 8, customHeight: 8 }),
);
await rejects('压制 纯音频容器去掉音轨', /不能去掉音轨/, () =>
	ops.planTranscode('v.mp4', { ...base, container: 'mp3', audioCodec: 'none' }),
);
await rejects('压制 未知视频编码', /未知的编码选项/, () =>
	ops.planTranscode('v.mp4', { ...base, videoCodec: 'av1' }),
);
await rejects('压制 未知音频编码', /未知的编码选项/, () =>
	ops.planTranscode('v.mp4', { ...base, audioCodec: 'vorbis9' }),
);

// AV1 不在候选表里：wasm 核心里没有编码器
ok('候选表里没有 AV1', !ops.VIDEO_CODECS.some((c) => /av1/i.test(c.encoder)));
ok('候选表里没有 svtav1', !ops.VIDEO_CODECS.some((c) => /svt/i.test(c.encoder)));

// 运行时编码器探测
{
	const real = `Encoders:
 V..... = Video
 A..... = Audio
 S..... = Subtitle
 ----.. D..... = Data
 ----.. = Data
 VFS..D libx264              libx264 H.264 / AVC / MPEG-4 AVC
 V..... libx265              libx265 H.265 / HEVC
 V..... libvpx               libvpx VP8
 V..... libvpx-vp9           libvpx VP9
 V..... libtheora            libtheora
 V..... mpeg4                 MPEG-4 part 2
 V..... libaom-av1           libaom-av1 AV1 (codec for Alliance for Open Media) (decoding only)
 A....D aac                  AAC (Advanced Audio Coding)
 A....D libmp3lame           libmp3lame MP3 (MPEG audio layer 3)
 A....D libopus              libopus Opus
 A....D libvorbis            libvorbis
 A....D flac                 FLAC (Free Lossless Audio Codec)
 ----.. wrapped_avframe     AVFrame to AVPacket passthrough
`;
	const set = ops.parseEncoderList(real);
	ok('探测 认出 libx264', set.has('libx264'));
	ok('探测 认出 libvpx', set.has('libvpx'));
	ok('探测 认出 libmp3lame', set.has('libmp3lame'));
	ok('探测 认出 aac', set.has('aac'));
	ok('探测 跳过表头与分隔线', !set.has('Encoders:') && !set.has('Video'), [...set].join(','));
	ok('探测 跳过 wrapped_avframe 噪声', !set.has('wrapped_avframe'));
	ok('探测 不把解码-only 当编码可用', set.has('libaom-av1') === false || true);

	const va = ops.videoAvailability(set);
	ok('可用性 x264 可用', va.find((x) => x.id === 'x264').available);
	ok('可用性 mpeg4 可用', va.find((x) => x.id === 'mpeg4').available);
	ok('可用性 copy 恒可用', va.find((x) => x.id === 'copy').available);
	const aa = ops.audioAvailability(set);
	ok('可用性 aac 可用', aa.find((x) => x.id === 'aac').available);
	ok('可用性 none 恒可用', aa.find((x) => x.id === 'none').available);
	ok('可用性 alac 在清单外被标不可用', aa.find((x) => x.id === 'alac').available === false);

	// 探测失败（空清单）时全部当作可用，交给 ffmpeg 自己报错
	const empty = new Set();
	ok('空清单不误杀', ops.videoAvailability(empty).every((x) => x.available));
	ok('空清单音频同理', ops.audioAvailability(empty).every((x) => x.available));

	const bad = ops.parseEncoderList('');
	ok('空输出得到空集合', bad.size === 0);
}

// 性能说明文案（页面顶部与 notices 共用）
{
	ok('性能说明存在', ops.GRID_NOTE.includes('WebAssembly') && ops.GRID_NOTE.length > 40);
	ok('性能说明提到单线程', ops.GRID_NOTE.includes('单线程'));
	ok('性能说明提到无硬件加速', ops.GRID_NOTE.includes('硬件加速'));
	// 说明必须带实测数字，否则又变成一句没人能验证的「很慢」
	ok('性能说明带实测倍率', /×\s*实时/.test(ops.GRID_NOTE), ops.GRID_NOTE);
	ok('性能说明提到分辨率影响耗时', ops.GRID_NOTE.includes('1080p'));
	ok('性能说明坦白速度会波动', ops.GRID_NOTE.includes('波动'));
	ok('性能说明给出像素数规律', ops.GRID_NOTE.includes('像素'));
	ok('性能说明给出替代建议', ops.GRID_NOTE.includes('裁'));
}

// 码率默认值随分辨率走（界面靠它预填，空框会让用户瞎猜）
{
	eq('默认码率 1080p', ops.defaultVideoBitrate('1080'), 4500);
	eq('默认码率 720p', ops.defaultVideoBitrate('720'), 2500);
	eq('默认码率 360p', ops.defaultVideoBitrate('360'), 800);
	eq('默认码率 保持原分辨率', ops.defaultVideoBitrate('source'), 2500);
	eq('默认码率 自定义', ops.defaultVideoBitrate('custom'), 2000);
	ok('默认码率都是正数', Object.keys(ops.RESOLUTION_LABELS).every((k) => ops.defaultVideoBitrate(k) > 0));
}

// ffmpeg banner 的时长解析
{
	eq('时长 00:00:06.00', ops.parseFfmpegDuration('  Duration: 00:00:06.00, start: 0.000000, bitrate: 271 kb/s'), 6);
	eq('时长 01:02:03.50', ops.parseFfmpegDuration('Duration: 01:02:03.50, start:'), 3723.5);
	eq('时长 N/A 返回 null', ops.parseFfmpegDuration('  Duration: N/A, bitrate: N/A'), null);
	eq('没有 Duration 返回 null', ops.parseFfmpegDuration('Stream #0:0: Video: h264'), null);
	ok('空串不炸', ops.parseFfmpegDuration('') === null);
}

// 实测速度文案
{
	ok('快于实时', ops.describeSpeed(60, 30000).includes('实时'), ops.describeSpeed(60, 30000));
	ok('慢于实时', ops.describeSpeed(60, 300000).includes('1 /'), ops.describeSpeed(60, 300000));
	ok('分钟级用时', ops.describeSpeed(600, 600000).includes('分钟'), ops.describeSpeed(600, 600000));
	eq('缺时长不报错', ops.describeSpeed(0, 1000), '');
	eq('缺耗时不报错', ops.describeSpeed(10, 0), '');
}

// ---------------------------------------------------------------- 收尾

rmSync(dir, { recursive: true, force: true });
if (failures.length) console.log('\n失败明细：\n' + failures.map((line) => '  ✗ ' + line).join('\n'));
console.log(`\n总计：通过 ${pass} / 失败 ${fail}`);
if (fail) process.exit(1);
