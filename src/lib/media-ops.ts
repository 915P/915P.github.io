/*
 * 音视频工具箱的纯逻辑层。
 *
 * 与 pdf-ops.ts 同构：不碰 DOM，只把「表单选择」翻译成 ffmpeg 参数数组，
 * 因此可以在 Node 里跑 scripts/media-test.mjs。
 *
 * 设计取向：**只做不重新编码的操作**。
 * ffmpeg.wasm 是纯软件编解码，1080p 转码常常比视频本身还慢，
 * 而改容器（-c copy）只是搬运字节，秒级完成。转码能力仍在参数层留着
 * （kind: 'transcode'），但页面默认不暴露，避免用户点一下等半小时。
 */

/* ------------------------------------------------------------------ 类型 */

export type MediaKind = 'video' | 'audio' | 'image' | 'unknown';

export interface MediaFile {
	name: string;
	size: number;
	kind: MediaKind;
}

export type RemuxContainer = 'mp4' | 'webm' | 'mkv' | 'mov' | 'm4a' | 'mp3' | 'wav' | 'ogg' | 'flac';

export type ExtractMode = 'audio' | 'video' | 'cover';

export type ConcatMode = 'concat' | 'ts';

export interface TrimOptions {
	/** 起始秒；留空 = 从头 */
	start?: string;
	/** 结束秒；留空 = 到尾 */
	end?: string;
}

export interface RemuxOptions {
	container: RemuxContainer;
	/** HEVC 在部分播放器里需要 hvc1 盒标签才能播放 */
	fixHevcTag?: boolean;
	/** 把音轨挪到最前，便于老设备解码 */
	fastStart?: boolean;
}

export interface ExtractOptions {
	mode: ExtractMode;
	/** cover 模式下取第几帧 */
	frameIndex?: number;
	format?: 'jpg' | 'png';
}

export interface ConcatOptions {
	mode: ConcatMode;
	outputName: string;
}

export interface ProbeResult {
	duration?: string;
	videoCodec?: string;
	audioCodec?: string;
	width?: number;
	height?: number;
	fps?: string;
	bitrate?: string;
	formatName?: string;
}

/* ------------------------------------------------------------------ 常量 */

export const CONTAINERS: Record<RemuxContainer, { ext: string; label: string; hint: string }> = {
	mp4: { ext: 'mp4', label: 'MP4', hint: '兼容性最好，几乎所有设备都能播' },
	webm: { ext: 'webm', label: 'WebM', hint: 'VP8/VP9 + Opus，适合网页嵌入' },
	mkv: { ext: 'mkv', label: 'MKV', hint: ' Matroska，什么都能塞，适合存档' },
	mov: { ext: 'mov', label: 'MOV', hint: 'QuickTime，剪辑软件友好' },
	m4a: { ext: 'm4a', label: 'M4A（AAC 音频）', hint: '纯音频，AAC 编码' },
	mp3: { ext: 'mp3', label: 'MP3', hint: '纯音频，最大兼容性' },
	wav: { ext: 'wav', label: 'WAV', hint: '未压缩音频，体积很大' },
	ogg: { ext: 'ogg', label: 'Ogg', hint: 'Vorbis/Opus 音频' },
	flac: { ext: 'flac', label: 'FLAC', hint: '无损压缩音频' },
};

/** 哪些容器是纯音频（不需要视频流） */
const AUDIO_ONLY: RemuxContainer[] = ['m4a', 'mp3', 'wav', 'ogg', 'flac'];

/** 改动文件名的非法字符（ffmpeg 的输出路径与文件名共用一套） */
const ILLEGAL = /[\\/:*?"<>|]/g;

export function sanitizeName(name: string): string {
	const cleaned = name.replace(ILLEGAL, '_').replace(/^\.+/, '_').trim();
	return cleaned || '未命名';
}

/** 去掉目录与扩展名 */
export function stem(name: string): string {
	const base = name.split(/[\\/]/).pop() ?? name;
	const dot = base.lastIndexOf('.');
	return sanitizeName(dot > 0 ? base.slice(0, dot) : base);
}

/** 只留扩展名，不含点，小写 */
export function extOf(name: string): string {
	const base = name.split(/[\\/]/).pop() ?? name;
	const dot = base.lastIndexOf('.');
	return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/* ------------------------------------------------------------------ 嗅探 */

/*
 * 扩展名白名单。
 *
 * 这份表**只影响原生文件对话框的 accept 过滤**，不是准入门槛 ——
 * 拖放与「读取信息」都不拦（ffmpeg 自己会报错，拦了反而看不到真实原因）。
 * 所以宁可列全一点：漏一个 .m4s，用户在对话框里根本看不见那个文件，
 * 而 ffmpeg 其实完全支持。
 *
 * 命名有歧义的几处：
 * - .m4s / .m4p / .m4b 都是 MP4 家族（fMP4 分片 / 保护内容 / 有声书），
 *   放在视频类，因为它们常常是带视频轨的 DASH 分片。
 * - .ts/.m2t/.mts/.m2ts 都是 MPEG-TS；.mts 在相机厂商那里也用来指 AVCHD。
 * - .ogv/.ogx 是视频 Ogg；.oga/.opus/.spx 是音频 Ogg。
 * - .mp2 既是 MPEG-1 音频层也可能是裸 MPEG-2 视频流，这里归音频
 *   （裸视频流少见，且用户更常见的是拿它当音频）。
 */
const VIDEO_EXT = new Set([
	// MP4 家族
	'mp4', 'm4v', 'm4s', 'm4p', 'mp4v', 'mov', 'qt', '3gp', '3g2', '3gpp', 'mj2',
	// Matroska / WebM
	'mkv', 'mk3d', 'mks', 'webm',
	// 微软 /  avi / flash
	'avi', 'wmv', 'asf', 'flv', 'f4v', 'swf',
	// MPEG
	'mpg', 'mpeg', 'mpe', 'm1v', 'm2v', 'mpv', 'm2p',
	// 传输流
	'ts', 'm2t', 'mts', 'm2ts', 'ts2', 'mts2',
	// 其他容器
	'vob', 'ogv', 'ogx', 'rm', 'rmvb', 'ram', 'mxf', 'dv', 'divx', 'nsv', 'amv',
	'ivf', 'y4m', 'mjpg', 'mjpeg', 'h261', 'h263', 'dvr-ms', 'msv', 'ptv',
]);

const AUDIO_EXT = new Set([
	// 常见有损
	'mp3', 'mp2', 'mpga', 'm4a', 'm4b', 'aac', 'adts', 'adif', 'wma', 'ape', 'wv', 'wvc',
	// 无损 / 未压缩
	'flac', 'wav', 'wave', 'aiff', 'aif', 'aifc', 'caf', 'w64', 'rf64', 'bwf', 'tta', 'tak',
	// 流媒体 / 回放
	'ogg', 'oga', 'opus', 'spx', 'aax', 'ra', 'rmj', 'mka', 'ac3', 'ec3', 'eac3',
	'dts', 'dtshd', 'thd', 'truehd', 'mlp', 'flp', 'amr', 'awb', '3ga',
	// 调制解调器 / 原始 PCM
	'mpc', 'mp+', 'mpp', 'dsf', 'dff', 's3m', 'mod', 'it', 'xm', '669', 'amf', 'midi', 'mid', 'kar', 'smf',
	// 语音信箱
	'sln', 'vox', 'vmd',
]);

const IMAGE_EXT = new Set([
	/*
	 * .gif 放这里而不是视频：ffmpeg 两种都能处理（gif 也有 demuxer），
	 * 但界面上把动图标成「视频」会让用户困惑，按直觉归图片。
	 */
	'jpg', 'jpeg', 'jpe', 'jfif', 'png', 'apng', 'gif', 'webp', 'bmp', 'dib',
	'tif', 'tiff', 'avif', 'heic', 'heif', 'jxl', 'jp2', 'j2k', 'jpf', 'jpx',
	'pbm', 'pgm', 'ppm', 'pnm', 'pam', 'tga', 'icns', 'exr', 'hdr', 'dpx',
	'sgi', 'xbm', 'xpm',
]);

/** 字幕：给「字幕」标签页的外挂文件用 */
const SUBTITLE_EXT = new Set([
	'srt', 'sub', 'ass', 'ssa', 'vtt', 'webvtt', 'sami', 'smi', 'lrc', 'jacosub', 'mpl2', 'txt',
]);

/** 按扩展名猜文件类型；猜不出时返回 unknown（不拦截，让 ffmpeg 说话） */
export function sniffMediaKind(name: string): MediaKind {
	const ext = extOf(name);
	if (VIDEO_EXT.has(ext)) return 'video';
	if (AUDIO_EXT.has(ext)) return 'audio';
	if (IMAGE_EXT.has(ext)) return 'image';
	return 'unknown';
}

/** 字幕文件单独判定 —— 它们只在「字幕」标签页的「封装外挂字幕」里用 */
export function isSubtitleFile(name: string): boolean {
	return SUBTITLE_EXT.has(extOf(name));
}

export function isAcceptedMedia(name: string): boolean {
	return sniffMediaKind(name) !== 'unknown';
}

/** 前端 accept 属性用。带点号的扩展名列表由三张表拼出来，别再手写一遍 */
const withDots = (list: Set<string>): string =>
	[...list].sort().map((ext) => `.${ext}`).join(',');

export const MEDIA_ACCEPT = `video/*,audio/*,image/*,${withDots(VIDEO_EXT)},${withDots(AUDIO_EXT)},${withDots(IMAGE_EXT)}`;

/** 字幕标签页的 accept */
export const SUBTITLE_ACCEPT = `text/vtt,.${[...SUBTITLE_EXT].sort().join(',.')}`;

/** 界面上「支持哪些格式」折叠列表用，按类别分组 */
export const SUPPORTED_FORMATS: { label: string; exts: string[] }[] = [
	{ label: '视频 / 容器', exts: [...VIDEO_EXT].sort() },
	{ label: '音频', exts: [...AUDIO_EXT].sort() },
	{ label: '图片', exts: [...IMAGE_EXT].sort() },
	{ label: '字幕（仅封装外挂字幕时可用）', exts: [...SUBTITLE_EXT].sort() },
];

/** 猜不出类型时给用户的一句话提示，别让文件白选一次 */
export function unknownKindHint(name: string): string {
	const ext = extOf(name);
	if (!ext) return '没有扩展名，ffmpeg 可能认不出来';
	if (SUBTITLE_EXT.has(ext)) return '这是字幕文件，请在「字幕」标签页选「封装外挂字幕」';
	if (ext.length === 1) return '单字母扩展名，ffmpeg 通常认不出来';
	return `不认识的扩展名 .${ext}，仍可尝试处理 —— ffmpeg 会自己判断，不行会报错`;
}

/* ------------------------------------------------------------------ 校验 */

function parseSeconds(text: string | undefined, label: string): number | undefined {
	if (text === undefined || text.trim() === '') return undefined;
	const value = Number(text.trim());
	if (!Number.isFinite(value) || value < 0) {
		throw new Error(`「${label}」必须是不小于 0 的秒数`);
	}
	return value;
}

/** 把 1:23.5 / 90 / 1.5 这类写法统一成秒 */
export function parseTimecode(text: string): number {
	const trimmed = text.trim();
	const clock = /^(\d+):([0-5]?\d(?:\.\d+)?)$/.exec(trimmed);
	if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
	const value = Number(trimmed);
	if (!Number.isFinite(value) || value < 0) throw new Error(`无法识别的时长「${text}」`);
	return value;
}

/* ------------------------------------------------------------------ 拼装命令 */

function quote(name: string): string {
	// ffmpeg 的 argv 数组不需要 shell 引号，但 concat 协议的路径分隔符要保留
	return name;
}

export interface MediaPlan {
	/** 交给 ffmpeg.exec() 的参数数组，首项就是输入 */
	args: string[];
	/** 输出文件名（相对挂载点） */
	output: string;
}

export type RemuxPlan = MediaPlan;
export type ExtractPlan = MediaPlan;
export type TrimPlan = MediaPlan;
export type ConcatPlan = MediaPlan;

/** 改容器（不重新编码） */
export function planRemux(input: string, options: RemuxOptions): RemuxPlan {
	const spec = CONTAINERS[options.container];
	if (!spec) throw new Error(`不支持的目标格式 ${options.container}`);
	const audioOnly = AUDIO_ONLY.includes(options.container);

	const args = ['-i', quote(input)];
	// 纯音频目标丢视频流；其余整体 copy，即只换封装不重编码
	args.push('-c', 'copy');
	if (audioOnly) args.push('-vn');
	if (options.fixHevcTag) args.push('-tag:v', 'hvc1');
	// moov 前置，播放器才能边下边播
	if (options.fastStart && spec.ext === 'mp4') args.push('-movflags', '+faststart');
	const output = `${stem(input)}.${spec.ext}`;
	args.push('-y', quote(output));
	return { args, output };
}

/** 提取音频 / 视频 / 封面帧 */
export function planExtract(input: string, options: ExtractOptions): ExtractPlan {
	const args = ['-i', quote(input)];
	let output: string;

	if (options.mode === 'cover') {
		const frame = Math.max(1, Math.floor(options.frameIndex ?? 1));
		const format = options.format === 'png' ? 'png' : 'jpg';
		output = `${stem(input)}-封面.${format}`;
		/*
		 * copy 模式下封面帧要重新编码一次（单帧 JPEG 不贵）。
		 * select=eq(n\,N) 取第 N 帧；\ 是 ffmpeg 过滤器里逗号的转义。
		 */
		args.push('-vf', `select=eq(n\\,${frame - 1})`, '-vsync', '0', '-frames:v', '1');
	} else if (options.mode === 'audio') {
		/*
		 * 直接 copy 音频流，但容器必须容得下原编码：
		 * AAC 进 .m4a、Opus/Vorbis 进 .ogg 之类。这里统一输出 m4a，
		 * 非 AAC 源会报错，此时由页面提示改用「改格式」里的音频目标。
		 */
		output = `${stem(input)}.m4a`;
		args.push('-vn', '-c:a', 'copy');
	} else {
		const ext = extOf(input) || 'mp4';
		output = `${stem(input)}-无音频.${ext}`;
		args.push('-an', '-c:v', 'copy');
	}

	args.push('-y', quote(output));
	return { args, output };
}

/** 裁剪时间区间 */
export function planTrim(input: string, options: TrimOptions): TrimPlan {
	const start = parseSeconds(options.start, '起始时间');
	const end = parseSeconds(options.end, '结束时间');
	if (start !== undefined && end !== undefined && end <= start) {
		throw new Error('结束时间必须大于起始时间');
	}
	const args: string[] = [];
	/*
	 * -ss 放在 -i **之前**走关键帧快速定位，快但起点可能差几帧；
	 * 放在 -i 之后是逐帧精确但慢。copy 模式下只能接受关键帧精度，
	 * 所以选前者——这是「不重编码」的固有代价，页面上要写明。
	 */
	if (start !== undefined) args.push('-ss', String(start));
	args.push('-i', quote(input));
	if (end !== undefined) args.push('-t', String(end - (start ?? 0)));
	args.push('-c', 'copy');
	// 时间戳归零，否则部分播放器会显示错位
	args.push('-avoid_negative_ts', 'make_zero');
	const ext = extOf(input) || 'mp4';
	const output = `${stem(input)}-片段.${ext}`;
	args.push('-y', quote(output));
	return { args, output };
}

/** 拼接多个文件 */
export function planConcat(inputs: string[], options: ConcatOptions): ConcatPlan {
	if (inputs.length < 2) throw new Error('拼接至少需要两个文件');
	const output = sanitizeName(options.outputName || `${stem(inputs[0])}-合并.mkv`);
	const args: string[] = [];

	if (options.mode === 'ts') {
		// concat 协议对 TS 最稳：mpegts 允许在任意位置切分
		args.push('-i', `concat:${inputs.map(quote).join('|')}`);
	} else {
		/*
		 * 通用拼接靠 concat demuxer 读清单文件。这里由调用方先 writeFile
		 * 写入 CONCAT_LIST 文件名（见 CONCAT_LIST），清单里是原文件名。
		 * 注意：各片编码参数不一致时 concat 会静默错位或花屏，
		 * 真正稳妥要先统一参数，那属于重编码，页面不提供。
		 */
		args.push('-f', 'concat', '-safe', '0', '-i', CONCAT_LIST);
	}
	args.push('-c', 'copy', '-y', quote(output));
	return { args, output };
}

/** concat demuxer 清单在挂载点里的固定文件名 */
export const CONCAT_LIST = 'concat-list.txt';

/**
 * 输出名与输入名相撞时改名。
 *
 * 为什么必须改：文件是通过 WORKERFS **只读**挂到 /in 的，ffmpeg 若往输入
 * 的同一路径写，Emscripten 会抛 `ErrnoError: FS error`。
 * 而「输出名 = 输入名去掉扩展名 + 目标扩展名」在同容器转换时必然撞车 ——
 * `sample.mp4` 转 mp4 想输出 `sample.mp4`（bmmmd 那站的第 1 号常用命令就是
 * 「转 mp4 / 修正视频」，正是这个场景）。
 */
export function safeOutputName(preferred: string, inputs: string[]): string {
	const taken = new Set(inputs.map((name) => name.toLowerCase()));
	if (!taken.has(preferred.toLowerCase())) return preferred;
	const dot = preferred.lastIndexOf('.');
	const base = dot > 0 ? preferred.slice(0, dot) : preferred;
	const ext = dot > 0 ? preferred.slice(dot) : '';
	let candidate = `${base}-输出${ext}`;
	let n = 2;
	while (taken.has(candidate.toLowerCase())) candidate = `${base}-输出${n++}${ext}`;
	return candidate;
}

/**
 * concat demuxer 清单的内容（裸文件名形式）。
 *
 * ffmpeg 按**清单文件所在目录**解析每行路径。浏览器里清单只能写在内存 FS
 * 根目录、影片挂在 /in，所以实际调用时要换成 `/in/xxx` 绝对路径
 * 并配合 `-safe 0`（planConcat 已加）。写裸文件名会报 FS error。
 */
export function concatListContent(inputs: string[]): string {
	return inputs.map((name) => `file '${sanitizeName(name)}'`).join('\n');
}

/**
 * 判断若干文件的轨道布局是否一致（能否安全拼接）。
 *
 * 为什么需要它：**编码不一致时 concat demuxer 不报错，而是静默产出错乱的结果**。
 * 实测踩过：一个 3 秒的 H.264+AAC 片段拼一个「只有音轨」的 MP4，
 * ffmpeg 正常退出、文件也能打开，但时长从 6 秒变成 20.7 秒（末尾被撑长）。
 * 拿完整 banner 逐个对比太贵，这里只比最要命的「有没有视频 / 音频编码是什么」。
 */
export function assertConcatCompatible(infos: ProbeResult[]): void {
	if (infos.length < 2) return;
	const first = infos[0];
	for (let i = 1; i < infos.length; i++) {
		const other = infos[i];
		const sameVideo = Boolean(first.videoCodec) === Boolean(other.videoCodec);
		if (!sameVideo) {
			throw new Error(
				`第 1 个文件有${first.videoCodec ? '视频' : '无视频'}轨道，` +
					`第 ${i + 1} 个${other.videoCodec ? '有' : '无'}视频轨道，无法拼接。` +
					'请只拼接轨道结构一致的片段。',
			);
		}
		if (first.videoCodec && other.videoCodec && first.videoCodec !== other.videoCodec) {
			throw new Error(
				`视频编码不一致：第 1 个是 ${first.videoCodec}，第 ${i + 1} 个是 ${other.videoCodec}。` +
					'拼接必须同编码。',
			);
		}
		if (first.audioCodec !== other.audioCodec) {
			throw new Error(
				`音频编码不一致：第 1 个是 ${first.audioCodec ?? '无'}，第 ${i + 1} 个是 ${other.audioCodec ?? '无'}。` +
					'拼接必须同编码。',
			);
		}
	}
}

/**
 * 解密受保护的媒体文件。
 *
 * 一些流媒体/在线视频的 mp4 用 CENC（Common Encryption）加密，播放器需要
 * 许可证才能播。对这类文件加 `-decryption_key ""` 让 ffmpeg 以空密钥重封装，
 * 有机会得到可播放的副本 —— 对 DRM 合规性由使用者自行判断，本站只做技术演示。
 */
export function planDecrypt(input: string, outputName = ''): MediaPlan {
	const ext = extOf(input) || 'mp4';
	const output = sanitizeName(outputName || `${stem(input)}-解密.${ext}`);
	return {
		args: ['-decryption_key', '', '-i', quote(input), '-c', 'copy', '-y', quote(output)],
		output,
	};
}

/**
 * 把分离的音频与视频合成一个文件。
 *
 * 与 planConcat 的区别：那边拼的是**同一条轨道链的多个片段**，
 * 这边合的是「只有音轨的文件 + 只有视频轨的文件」，必须先各自转成
 * 中间文件（这里用 aac / h264，copy 不重编码），再合成，
 * 否则 ffmpeg 会因为输入流类型不匹配直接失败。
 */
export function planMergeAudioVideo(
	audio: string,
	video: string,
	outputName = '',
): MediaPlan {
	const output = sanitizeName(outputName || `${stem(video)}.mp4`);
	return {
		args: [
			'-i', quote(video),
			'-i', quote(audio),
			'-c:v', 'copy',
			'-c:a', 'aac',
			// 音频比视频长时按视频长度截断，避免结尾出现一段静音
			'-shortest',
			'-y', quote(output),
		],
		output,
	};
}

/**
 * 在指定时间点把文件切成两段。
 *
 * 与 planTrim 的区别：那边输出一个区间，这边输出**两个**文件。
 * 两次 exec 共用一次挂载，所以返回 steps 数组。
 */
export function planSplit(input: string, atSeconds: number): { steps: MediaPlan[] } {
	if (!Number.isFinite(atSeconds) || atSeconds <= 0) {
		throw new Error('切割点必须大于 0 秒');
	}
	const ext = extOf(input) || 'mp4';
	const head = `${stem(input)}-前段.${ext}`;
	const tail = `${stem(input)}-后段.${ext}`;
	return {
		steps: [
			{
				args: ['-t', String(atSeconds), '-i', quote(input), '-c', 'copy', '-y', quote(head)],
				output: head,
			},
			{
				args: ['-ss', String(atSeconds), '-i', quote(input), '-c', 'copy', '-y', quote(tail)],
				output: tail,
			},
		],
	};
}

/**
 * 处理字幕轨：取出、或把外挂字幕（srt/ass/vtt）封装进容器。
 *
 * 字幕 copy 不重编码，所以 WebVTT（vtt）与 MP4 的 mov_text 之间**不能**直接转，
 * 需要 -c:s srt 先落到 SRT。这个坑在页面上写明。
 */
export type SubtitleMode = 'extract' | 'mux' | 'burn-free';

export function planSubtitle(
	input: string,
	options: { mode: SubtitleMode; subtitleFile?: string },
): MediaPlan {
	if (options.mode === 'extract') {
		const output = `${stem(input)}.srt`;
		return { args: ['-i', quote(input), '-map', '0:s:0', '-c:s', 'srt', '-y', quote(output)], output };
	}
	if (!options.subtitleFile) throw new Error('请先选择要封装的字幕文件');
	const ext = extOf(input) || 'mp4';
	const output = `${stem(input)}-带字幕.${ext}`;
	const args = ['-i', quote(input), '-i', quote(options.subtitleFile), '-map', '0', '-map', '1'];
	// mov_text 只认 SRT/ASS，VTT 需先转码成 SRT
	if (extOf(options.subtitleFile) === 'vtt') args.push('-c:s', 'srt');
	args.push('-c', 'copy', '-y', quote(output));
	return { args, output };
}

/**
 * 把用户输入的命令行拆成 argv 数组。
 *
 * 自己写而不是 `split(/\s+/)`：文件名与参数里可能有空格（"我的 视频.mp4"），
 * 朴素切分会把一个文件名劈成两半，ffmpeg 报「No such file」。
 * 只认双引号与单引号，跟 shell 的常见子集一致，不处理转义与变量展开。
 */
export function parseCommandLine(text: string): string[] {
	const args: string[] = [];
	let current = '';
	let started = false;
	let quote: '"' | "'" | null = null;

	for (const char of text.trim()) {
		if (quote) {
			if (char === quote) quote = null;
			else current += char;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			// 引号本身即使内容为空也算「这个参数存在」
			started = true;
			continue;
		}
		if (/\s/.test(char)) {
			if (started) args.push(current);
			current = '';
			started = false;
			continue;
		}
		current += char;
		started = true;
	}
	if (started) args.push(current);
	return args;
}

/** 去掉命令里的 `ffmpeg` 前缀（用户习惯会带上，ffmpeg.exec() 只需要参数） */
export function stripFfmpegPrefix(args: string[]): string[] {
	return args[0]?.toLowerCase() === 'ffmpeg' ? args.slice(1) : args;
}

/**
 * ffmpeg 里「后面跟一个值」的选项。
 *
 * 只用来判断命令末尾那个 token 到底是不是输出文件：
 * `-i a.mp4 -c copy` 的最后一个 token 是 `copy`，它是 `-c` 的值，不是输出，
 * 所以这条命令其实缺输出（ffmpeg 会报 "At least one output file"）。
 * 不看这张表就会把 `copy` 当成输出名放过去。
 * 覆盖的是常用选项；遇到没收录的选项时判断会偏保守（宁可少拦）。
 */
const FLAGS_WITH_VALUE = new Set([
	'-i', '-c', '-c:v', '-c:a', '-codec', '-vcodec', '-acodec', '-codec:v', '-codec:a',
	'-f', '-ss', '-sseof', '-t', '-to', '-vf', '-af', '-filter_complex', '-filter_script',
	'-b', '-b:v', '-b:a', '-crf', '-q', '-q:v', '-preset', '-pix_fmt', '-tag', '-tag:v', '-tag:a',
	'-movflags', '-metadata', '-map', '-r', '-s', '-aspect', '-ar', '-ac', '-sample_fmt',
	'-decryption_key', '-maxrate', '-bufsize', '-frames:v', '-vframes', '-threads', '-re',
]);

/**
 * 自定义命令的输入输出检查，**返回解析出的输出文件名**。
 *
 * 命令整体在 wasm 沙箱里跑，碰不到宿主机，真正的风险是**用户写错却以为成功了**，
 * 所以这里挡两类：
 * - 缺输出（等一次 wasm 启动后才报 At least one output file，不划算）
 * - 输出写到挂载点之外（那是内存 FS 根目录，写进去也读不回来）
 *
 * 返回 `-` 表示 ffmpeg 的「丢弃输出」约定（配 `-f null` 看统计信息用），
 * 调用方要据此跳过下载。
 */
export function validateCustomArgs(args: string[]): string {
	if (args.length === 0) throw new Error('命令为空');
	if (!args.includes('-i')) throw new Error('命令里缺少 -i 输入参数');

	// 从末尾往前扫：跳过纯选项，以及被「带值选项」吃掉的参数，剩下的第一个是输出名
	let index = args.length - 1;
	while (index >= 0) {
		// 裸的 `-` 是 ffmpeg 的「丢弃输出」标记，不是选项，别把它当 flag 跳过
		if (args[index] === '-') break;
		const prev = index - 1;
		if (prev >= 0 && args[prev].startsWith('-') && FLAGS_WITH_VALUE.has(args[prev])) {
			index = prev;
			continue;
		}
		if (args[index].startsWith('-')) {
			index = prev;
			continue;
		}
		break;
	}
	const output = index >= 0 ? args[index] : '';
	if (!output) {
		throw new Error('命令没有指定输出文件（最后一个参数应是输出文件名）');
	}
	if (output !== '-' && (output.includes('..') || output.startsWith('/'))) {
		throw new Error('输出文件必须写在挂载点内，不要用 ../ 或绝对路径');
	}
	return output;
}


/* ------------------------------------------------------------------ 压制 */

/*
 * 重新编码（压制）。
 *
 * ⚠️ 这一页的能力和站内其它标签页是**反过来**的：别处都刻意只做「不重编码」
 * 的操作（快，因为 WebAssembly 纯软件搬运字节），这里是真跑编码器，
 * 慢到可能比视频时长还慢。见 GRID_NOTE，页面顶部也有同样的警示。
 *
 * 编码器不是写死的清单，而是**运行时探测**：`@ffmpeg/core` 的编解码器集合
 * 由官方构建配置决定，不同版本会变。实测 0.12.10 有 libx264 / libx265 /
 * libvpx / libtheora / mpeg4，但**没有 libsvtav1 与 libaom-av1**
 * （也就是 AV1 压制在这套 wasm 里根本做不到，AV1 只能解不能编）。
 * 所以下面的表只是「候选」，最终由 parseEncoderList() 与 ffmpeg 自己说话。
 */

/** 页面顶部的性能说明。改了这里记得同步 notices 里的措辞 */
export const GRID_NOTE =
	'压制是真跑编码器：WebAssembly 没有硬件加速，而且这个 ffmpeg 核心是 ' +
	'--disable-pthreads 编的，单线程。实测同一台机器、640×360 的 6 秒素材：' +
	'H.264 极快档 3–6× 实时，MPEG-4 6× 实时，Theora 28× 实时，VP8 在 3× 到 1/8× 之间' +
	'大幅波动（受可用内存影响很大）；换成 720p + 很快档的 H.264 就掉到 1/1.2 实时。' +
	'规律是耗时基本与像素数成正比，1080p 大约是 360p 的 9 倍，所以高分辨率长视频' +
	'会按分钟甚至小时计，而且同一段素材每次跑的快慢都可能差几倍。' +
	'应急可用，但它替代不了桌面端；先裁出需要的片段再压制会快很多。';

export type VideoCodecId = 'x264' | 'vp8' | 'theora' | 'mpeg4' | 'copy';

export interface SpeedPreset {
	id: string;
	label: string;
	/** ffmpeg 参数值；空字符串表示该编码器没有速度概念 */
	value: string;
	/** VP8/VP9 的 -cpu-used 档位 */
	cpuUsed?: number;
}

export interface VideoCodecSpec {
	id: VideoCodecId;
	label: string;
	/** -c:v 的值；copy 表示不重编码 */
	encoder: string;
	/** 写进 MP4/MKV 时最好用的容器标签 */
	tag?: string;
	/** 质量值区间（含两端） */
	crf: [number, number];
	crfDefault: number;
	crfHint: string;
	presets: SpeedPreset[];
	presetDefault: string;
	pixFmt?: string;
	containers: RemuxContainer[];
	note: string;
}

/*
 * 速度档位按编码器各自的参数体系给，不能一套通用：
 * x264 用 -preset 名字；VP8/VP9 用 -deadline + -cpu-used；
 * Theora 用 -qscale；MPEG-4 Part 2 没有速度概念。
 */
const X26X_PRESETS: SpeedPreset[] = [
	{ id: 'uf', label: '极快（ultrafast）', value: 'ultrafast' },
	{ id: 'vf', label: '很快（veryfast）', value: 'veryfast' },
	{ id: 'f', label: '快（fast，默认）', value: 'fast' },
	{ id: 'm', label: '中（medium）', value: 'medium' },
	{ id: 's', label: '慢（slow）', value: 'slow' },
	{ id: 'vs', label: '很慢（veryslow）', value: 'veryslow' },
];

const VPX_PRESETS: SpeedPreset[] = [
	{ id: 'realtime', label: '最快（realtime）', value: 'realtime', cpuUsed: 8 },
	{ id: 'good', label: '快（good，默认）', value: 'good', cpuUsed: 2 },
	{ id: 'best', label: '慢（best）', value: 'best', cpuUsed: 0 },
];

const NO_SPEED: SpeedPreset[] = [{ id: 'fixed', label: '固定', value: '' }];

const ALL_CONTAINERS: RemuxContainer[] = [
	'mp4', 'mkv', 'mov', 'm4a', 'webm', 'ogg', 'wav', 'mp3', 'flac',
];

export const VIDEO_CODECS: VideoCodecSpec[] = [
	{
		id: 'x264',
		label: 'H.264 / AVC（libx264）',
		encoder: 'libx264',
		tag: 'avc1',
		crf: [0, 51],
		crfDefault: 23,
		crfHint: '0 = 无损，51 = 最差。18–28 是常用区间，23 接近「看不出损失」。',
		presets: X26X_PRESETS,
		presetDefault: 'f',
		pixFmt: 'yuv420p',
		containers: ['mp4', 'mkv', 'mov', 'm4a'],
		note: '兼容性最好，几乎所有设备与浏览器都能播。首选。',
	},
	{
		id: 'vp8',
		label: 'VP8（libvpx）',
		encoder: 'libvpx',
		crf: [0, 63],
		crfDefault: 10,
		crfHint: '0–63，约 4–10 为常用区间（这里用的是 -crf，越小越好）。',
		presets: VPX_PRESETS,
		presetDefault: 'good',
		pixFmt: 'yuv420p',
		containers: ['webm', 'mkv'],
		// 同机实测波动很大：一次 3.2× 实时，一次 1/8× 实时，受可用内存影响
		note: '想要 WebM 就选它。速度波动很大，同一段素材实测从 3× 实时到 1/8× 都有。VP9 在这套 wasm 里用不了，见 GRID_NOTE。',
	},
	{
		id: 'theora',
		label: 'Theora（libtheora）',
		encoder: 'libtheora',
		crf: [0, 10],
		crfDefault: 5,
		crfHint: '0–10，约 4–7 为常用区间（这里用的是 -qscale 的等价档位，越小越好）。',
		presets: NO_SPEED,
		presetDefault: 'fixed',
		pixFmt: 'yuv420p',
		// 不能是 webm：WebM 规范只允许 VP8/VP9/AV1 视频，实测 ffmpeg 会直接
		// "Only VP8 or VP9 or AV1 video ... are supported for WebM" 然后失败
		containers: ['ogg', 'mkv'],
		note: '很老的编码，体积表现一般，只能装进 OGG 或 MKV。',
	},
	{
		id: 'mpeg4',
		label: 'MPEG-4 Part 2',
		encoder: 'mpeg4',
		crf: [1, 31],
		crfDefault: 5,
		crfHint: '1–31，越小越好，3–6 为常用区间。',
		presets: NO_SPEED,
		presetDefault: 'fixed',
		pixFmt: 'yuv420p',
		containers: ['mp4', 'mkv', 'mov', 'm4a'],
		note: '兼容性极好，但同画质体积比 H.264 大。只在老设备上找不到 H.264 解码时才用。',
	},
	{
		id: 'copy',
		label: '不压缩（直接复制视频轨）',
		encoder: 'copy',
		crf: [0, 0],
		crfDefault: 0,
		crfHint: '',
		presets: NO_SPEED,
		presetDefault: 'fixed',
		containers: ALL_CONTAINERS,
		note: '不重新编码视频，只改容器/音轨，秒级完成。',
	},
];

export type AudioCodecId = 'copy' | 'aac' | 'mp3' | 'opus' | 'vorbis' | 'flac' | 'alac' | 'wma' | 'none';

export interface AudioCodecSpec {
	id: AudioCodecId;
	label: string;
	encoder: string;
	/** 可选码率（kbps）；没有则不限 */
	bitrates?: number[];
	bitrateDefault?: number;
	containers: RemuxContainer[];
	note: string;
}

export const AUDIO_CODECS: AudioCodecSpec[] = [
	{
		id: 'copy',
		label: '不处理（直接复制音轨）',
		encoder: 'copy',
		containers: ['mp4', 'mkv', 'mov', 'm4a', 'webm', 'ogg', 'wav', 'mp3', 'flac'],
		note: '不重新编码，快。目标容器必须容得下原编码。',
	},
	{
		id: 'aac',
		label: 'AAC（通用，MP4/M4A 首选）',
		encoder: 'aac',
		bitrates: [96, 128, 160, 192, 256, 320],
		bitrateDefault: 192,
		containers: ['mp4', 'mkv', 'mov', 'm4a'],
		note: '兼容性最好，MP4/M4A 里唯一稳妥的选择。',
	},
	{
		id: 'mp3',
		label: 'MP3（libmp3lame）',
		encoder: 'libmp3lame',
		bitrates: [128, 160, 192, 256, 320],
		bitrateDefault: 192,
		containers: ['mp3', 'mkv', 'ogg', 'flac'],
		note: '到处都能播。注意 wasm 版没有原生 mp3 编码器，ffmpeg 会自动选 libmp3lame。',
	},
	{
		id: 'opus',
		label: 'Opus（libopus）',
		encoder: 'libopus',
		bitrates: [64, 96, 128, 160, 192],
		bitrateDefault: 128,
		containers: ['webm', 'ogg', 'mkv'],
		note: '同码率音质最好，只能装进 WebM / Ogg / MKV。',
	},
	{
		id: 'vorbis',
		label: 'Vorbis（libvorbis）',
		encoder: 'libvorbis',
		bitrates: [128, 160, 192, 256],
		bitrateDefault: 160,
		containers: ['ogg', 'webm', 'mkv', 'flac'],
		note: '老牌有损格式，兼容性一般。',
	},
	{
		id: 'flac',
		label: 'FLAC（无损）',
		encoder: 'flac',
		containers: ['flac', 'mkv', 'ogg'],
		note: '无损，体积比原始 PCM 小很多但比有损大。',
	},
	{
		id: 'alac',
		label: 'ALAC（Apple 无损）',
		encoder: 'alac',
		containers: ['m4a', 'mkv', 'mov', 'mp4'],
		note: 'Apple 无损，装进 M4A/MP4。',
	},
	{
		id: 'wma',
		label: 'WMA',
		encoder: 'wmav2',
		bitrates: [128, 192, 256],
		bitrateDefault: 192,
		containers: ['mkv'],
		note: '只在需要兼容老 Windows 设备时用，容器支持有限。',
	},
	{
		id: 'none',
		label: '去掉音轨',
		encoder: 'none',
		containers: ['mp4', 'mkv', 'mov', 'webm'],
		note: '输出纯画面。',
	},
];

export type RateMode = 'crf' | 'bitrate';
export type ResolutionPreset = 'source' | '2160' | '1440' | '1080' | '720' | '480' | '360' | '240' | 'custom';

export interface TranscodeOptions {
	videoCodec: VideoCodecId;
	audioCodec: AudioCodecId;
	container: RemuxContainer;
	rateMode: RateMode;
	crf?: number;
	/** 码率模式下生效（视频 kbps） */
	videoBitrate?: number;
	/** 码率模式下生效（音频 kbps） */
	audioBitrate?: number;
	presetId?: string;
	resolution: ResolutionPreset;
	customWidth?: number;
	customHeight?: number;
}

const RESOLUTION_HEIGHTS: Record<Exclude<ResolutionPreset, 'source' | 'custom'>, number> = {
	'2160': 2160,
	'1440': 1440,
	'1080': 1080,
	'720': 720,
	'480': 480,
	'360': 360,
	'240': 240,
};

export const RESOLUTION_LABELS: Record<ResolutionPreset, string> = {
	source: '保持原分辨率',
	'2160': '2160p（4K）',
	'1440': '1440p（2K）',
	'1080': '1080p',
	'720': '720p',
	'480': '480p',
	'360': '360p',
	'240': '240p',
	custom: '自定义宽高',
};

function pickSpec<T extends { id: string }>(list: T[], id: string): T {
	const found = list.find((item) => item.id === id);
	if (!found) throw new Error(`未知的编码选项 ${id}`);
	return found;
}

/** 向下取到偶数：yuv420p 要求宽高都能被 2 整除 */
function toEven(value: number): number {
	const rounded = Math.round(value);
	return rounded % 2 === 0 ? rounded : rounded - 1;
}

/**
 * 缩放滤镜。
 * 只给高度、宽度写 -2 —— ffmpeg 的 scale 滤镜原生支持，会自动按比例算并取偶数，
 * 比自己算宽高更不容易错（源分辨率奇数时自己算会差几个像素）。
 */
function scaleFilter(options: TranscodeOptions): string | null {
	if (options.resolution === 'source') return null;
	if (options.resolution === 'custom') {
		const width = Number(options.customWidth ?? 0);
		const height = Number(options.customHeight ?? 0);
		if (!(width > 0) || !(height > 0)) throw new Error('自定义宽高都必须大于 0');
		const w = toEven(width);
		const h = toEven(height);
		if (w < 16 || h < 16) throw new Error('自定义宽高太小（至少 16×16）');
		return `scale=${w}:${h}`;
	}
	const height = RESOLUTION_HEIGHTS[options.resolution];
	if (!height) return null;
	return `scale=-2:${height}`;
}

/** 某个编码选项在当前 wasm 核心里能不能用 */
export interface CodecAvailability {
	id: string;
	available: boolean;
	/** 不可用时的原因，用于界面提示 */
	reason?: string;
}

/**
 * 解析 `ffmpeg -encoders` 的输出。
 *
 * 输出形如：
 *   V....D libx264              libx264 H.264 / AVC ...
 *   ----.. aac                  AAC (Advanced Audio Coding)
 * 标志位里第一个字母 V/A/S 表示编码类型。
 *
 * 之所以要解析而不是写死：编解码器集合随 @ffmpeg/core 的构建配置变化，
 * 换版本就可能多一个少一个（比如 AV1 只有解码没有编码）。
 * 拿到真实清单后，界面才能诚实地把不可用的选项标出来，而不是让用户
 * 点了才吃一个 "Unknown encoder" 的报错。
 */
export function parseEncoderList(text: string): Set<string> {
	const names = new Set<string>();
	// 标志位固定 6 个字符：类型(V/A/S) + 5 位能力位（字母或点）。
	// 名字里允许连字符：libvpx-vp9、libaom-av1 都是这种写法。
	const row = /^[VAS][.A-Z]{5}\s+([a-z0-9_-]+)/;
	for (const raw of text.split(/\r?\n/)) {
		const match = row.exec(raw.trim());
		// 表头与说明行（'Encoders:'、'------'、' V..... = Video'）都匹配不上，自动跳过
		if (!match) continue;
		names.add(match[1]);
	}
	return names;
}

/** copy 不是编码器，ffmpeg -encoders 里不会有它，但对任何核心里都成立 */
const ALWAYS_OK = new Set(['copy', 'none']);

/** 视频编码可用性。encoders 为空（探测失败）时一律当作可用，让用户试了再说 */
export function videoAvailability(encoders: Set<string>): CodecAvailability[] {
	return VIDEO_CODECS.map((spec) => {
		if (ALWAYS_OK.has(spec.encoder) || encoders.size === 0 || encoders.has(spec.encoder)) {
			return { id: spec.id, available: true };
		}
		return { id: spec.id, available: false, reason: `当前 ffmpeg 核心没有 ${spec.encoder}` };
	});
}

/** 音频编码可用性 */
export function audioAvailability(encoders: Set<string>): CodecAvailability[] {
	return AUDIO_CODECS.map((spec) => {
		if (ALWAYS_OK.has(spec.encoder) || encoders.size === 0 || encoders.has(spec.encoder)) {
			return { id: spec.id, available: true };
		}
		return { id: spec.id, available: false, reason: `当前 ffmpeg 核心没有 ${spec.encoder}` };
	});
}

/** 界面上应该列出哪些容器：按 CONTAINERS 的顺序，只留装得下当前组合的 */
export function containersFor(video: VideoCodecId, audio: AudioCodecId): RemuxContainer[] {
	const v = pickSpec(VIDEO_CODECS, video);
	const a = pickSpec(AUDIO_CODECS, audio);
	return (Object.keys(CONTAINERS) as RemuxContainer[]).filter((container) => {
		// 纯音频容器会丢视频，视频编码不参与筛选
		if (AUDIO_ONLY.includes(container)) return a.containers.includes(container);
		if (!v.containers.includes(container)) return false;
		// 去掉音轨时音轨编码不参与筛选
		if (a.id === 'none') return true;
		return a.containers.includes(container);
	});
}

/** 这个组合在静态规则上能不能跑（不依赖运行时探测） */
export function assertTranscodePossible(options: TranscodeOptions): void {
	const video = pickSpec(VIDEO_CODECS, options.videoCodec);
	const audio = pickSpec(AUDIO_CODECS, options.audioCodec);

	// 纯音频容器：视频编码选什么都不对（会被 -vn 丢掉），只剩音轨约束
	if (AUDIO_ONLY.includes(options.container)) {
		if (audio.id === 'none') throw new Error('纯音频容器里不能去掉音轨，请换个音频编码');
		if (!audio.containers.includes(options.container)) {
			throw new Error(`${audio.label} 不能装进 ${options.container.toUpperCase()}`);
		}
		return;
	}

	if (!video.containers.includes(options.container)) {
		throw new Error(`${video.label} 不能装进 ${options.container.toUpperCase()}`);
	}
	if (audio.id !== 'none' && !audio.containers.includes(options.container)) {
		throw new Error(`${audio.label} 不能装进 ${options.container.toUpperCase()}`);
	}
	if (video.id === 'copy' && options.resolution !== 'source') {
		throw new Error('视频选了「不压缩」就不能再缩放分辨率，二者只能选一个');
	}
}

/**
 * 各分辨率档位下建议的视频码率（kbps）。
 *
 * 码率模式下界面用它预填：留空的话用户面对一个没有内容的输入框，
 * 只能自己猜该填多少 —— 而猜错了（比如给 1080p 填 500）出来的画面会很糟，
 * 这种错误又很难自己看出来。
 */
const BITRATE_BY_RESOLUTION: Record<ResolutionPreset, number> = {
	'2160': 16000,
	'1440': 10000,
	'1080': 4500,
	'720': 2500,
	'480': 1200,
	'360': 800,
	'240': 500,
	source: 2500,
	custom: 2000,
};

export function defaultVideoBitrate(resolution: ResolutionPreset): number {
	return BITRATE_BY_RESOLUTION[resolution] ?? 2500;
}

/**
 * 拼装压制命令。
 *
 * 输出名固定带 `-压制` 后缀，方便和源文件区分；页面再用 safeOutputName 兜底防重名。
 */
export function planTranscode(input: string, options: TranscodeOptions): MediaPlan {
	assertTranscodePossible(options);

	const audioOnly = AUDIO_ONLY.includes(options.container);
	const video = pickSpec(VIDEO_CODECS, audioOnly ? 'copy' : options.videoCodec);
	const audio = pickSpec(AUDIO_CODECS, options.audioCodec);

	const args = ['-i', quote(input)];

	// ---- 缩放
	const filter = video.id === 'copy' ? null : scaleFilter(options);
	if (filter) args.push('-vf', filter);

	// ---- 视频轨
	if (audioOnly) {
		args.push('-vn');
	} else {
		args.push('-c:v', video.encoder);
		if (video.id !== 'copy') {
			// yuv420p 是兼容性底线：很多浏览器/电视解码 yuv444p 会有问题
			if (video.pixFmt) args.push('-pix_fmt', video.pixFmt);

			if (options.rateMode === 'crf') {
				const crf = options.crf ?? video.crfDefault;
				if (!Number.isFinite(crf) || crf < video.crf[0] || crf > video.crf[1]) {
					throw new Error(`${video.label} 的质量值需在 ${video.crf[0]}–${video.crf[1]} 之间`);
				}
				// Theora 用 -qscale:v（0–10，越小越好），语义与 CRF 一致但参数名不同
				if (video.id === 'theora') args.push('-qscale:v', String(crf));
				else args.push('-crf', String(crf));
				/*
				 * libvpx 系（VP8/VP9）在恒定质量模式下必须显式 -b:v 0，
				 * 否则 ffmpeg 会退回按目标码率跑，质量档位形同虚设。
				 * 只在 crf 模式加：bitrate 模式下的 -b:v 是用户给的目标码率。
				 */
				if (video.id === 'vp8') args.push('-b:v', '0');
			} else {
				const bitrate = Number(options.videoBitrate ?? 0);
				if (!(bitrate > 0)) throw new Error('请填写视频目标码率（kbps）');
				args.push('-b:v', `${Math.round(bitrate)}k`);
				// 限一下码率波动，否则简单画面会被压得很难看
				args.push('-maxrate', `${Math.round(bitrate * 1.5)}k`, '-bufsize', `${Math.round(bitrate * 3)}k`);
			}

			// 速度档位
			const wanted = options.presetId ?? video.presetDefault;
			const preset = video.presets.find((p) => p.id === wanted) ?? video.presets[0];
			if (preset.value) {
				if (video.id === 'vp8') {
					args.push('-deadline', preset.value, '-cpu-used', String(preset.cpuUsed ?? 2));
				} else {
					args.push('-preset', preset.value);
				}
			}

			// HEVC 写进 MP4/MOV 时补 hvc1 标签，iOS/Safari 才肯播
			if (video.tag && (options.container === 'mp4' || options.container === 'mov')) {
				args.push('-tag:v', video.tag);
			}
		}
	}

	// ---- 音频轨
	if (audio.id === 'none') {
		if (audioOnly) throw new Error('纯音频容器里不能去掉音轨，请换个音频编码');
		args.push('-an');
	} else if (audio.id === 'copy') {
		/*
		 * 这里必须显式写 -c:a copy。什么都不写的话 ffmpeg 会按输出容器挑「默认」
		 * 音频编码器，音频就被偷偷重编码了 —— 和用户选的「不处理」相反。
		 */
		args.push('-c:a', 'copy');
	} else {
		args.push('-c:a', audio.encoder);
		if (audio.bitrateDefault !== undefined) {
			const bitrate = Number(options.audioBitrate ?? audio.bitrateDefault);
			const allowed = audio.bitrates ?? [audio.bitrateDefault];
			if (!allowed.includes(bitrate)) {
				throw new Error(`${audio.label} 的可选码率为 ${allowed.join(' / ')} kbps`);
			}
			args.push('-b:a', `${bitrate}k`);
		}
	}

	// MP4 加 faststart：moov 前置才能边下边播（纯音频目标同理）
	if (options.container === 'mp4' || options.container === 'm4a') {
		args.push('-movflags', '+faststart');
	}

	const output = `${stem(input)}-压制.${options.container}`;
	args.push('-y', quote(output));
	return { args, output };
}


/**
 * 解析 ffmpeg banner 里的时长。
 * 格式是 `Duration: 00:01:23.45`，流媒体或损坏文件可能是 `N/A`。
 * 注意跟 parseTimecode 区分：那个吃的是用户输入的 `1:23`，这里是 `HH:MM:SS.ss`。
 */
export function parseFfmpegDuration(text: string): number | null {
	const match = /Duration:\s*(\d+):([0-5]?\d):([0-5]?\d(?:\.\d+)?)/.exec(text);
	if (!match) return null;
	return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/**
 * 压制完成后汇报实测速度。
 *
 * 比预估更有价值：用户能拿这个数字判断自己的机器/素材能不能扛住，
 * 也让「很慢」这件事从警告变成可验证的事实。
 */
export function describeSpeed(durationSeconds: number, elapsedMs: number): string {
	if (!(durationSeconds > 0) || !(elapsedMs > 0)) return '';
	const ratio = durationSeconds / (elapsedMs / 1000);
	const speed = ratio >= 1 ? `${ratio.toFixed(1)}× 实时` : `1 / ${(1 / ratio).toFixed(1)} 实时`;
	const took = elapsedMs < 60000
		? `${Math.round(elapsedMs / 1000)} 秒`
		: `${Math.round(elapsedMs / 60000)} 分钟`;
	return `视频 ${durationSeconds.toFixed(1)} 秒，用了 ${took}（${speed}）`;
}

/* ------------------------------------------------------------------ 日志解析 */

/*
 * ffmpeg 没有 JSON 输出选项（-print_format json 只在部分滤镜里可用），
 * 想拿结构化信息只能解析 `ffmpeg -i` 打印的 banner。
 *
 * 那段文本长这样（缩进是有意义的，见 parseMediaInfo）：
 *   Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'sample.mp4':
 *     Metadata:
 *       major_brand     : isom
 *       encoder         : Lavf60.16.100
 *     Duration: 00:00:06.00, start: 0.000000, bitrate: 277 kb/s
 *     Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709), 640x360 [SAR 1:1 DAR 16:9], 174 kb/s, 25 fps, 25 tbr, 12800 tbn (default)
 *       Metadata:
 *         handler_name    : VideoHandler
 *     Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 96 kb/s (default)
 */

export type StreamType = 'video' | 'audio' | 'subtitle' | 'data' | 'attachment' | 'unknown';

export type Tags = Record<string, string>;

export interface StreamInfo {
	/** ffmpeg 里的 #0:0 形式 */
	id: string;
	/** 十六进制 stream id（[0x1] 里的那个） */
	hexId?: string;
	type: StreamType;
	/** ffmpeg 给的原始类型名（Video / Audio / Subtitle …） */
	rawType?: string;
	codec?: string;
	/** 编码档次，如 h264 的 High、aac 的 LC */
	profile?: string;
	/** 容器里的四字符标签，如 avc1 / mp4a */
	tag?: string;
	tagHex?: string;
	/** 编码级别，如 h264 的 31 */
	level?: string;
	language?: string;

	// 视频
	width?: number;
	height?: number;
	/** sample aspect ratio */
	sar?: string;
	/** display aspect ratio */
	dar?: string;
	pixelFormat?: string;
	colorRange?: string;
	colorSpace?: string;
	colorTransfer?: string;
	colorPrimaries?: string;
	fieldOrder?: string;
	fps?: string;
	/** real base framerate */
	tbr?: string;
	/** time base */
	tbn?: string;

	// 音频
	sampleRate?: string;
	sampleFormat?: string;
	/** mono / stereo / 5.1 等 */
	channels?: string;
	channelLayout?: string;

	// 通用
	bitrate?: string;
	startTime?: string;
	duration?: string;
	nbFrames?: string;
	/** (default) / (forced) / (copy) 等 */
	disposition?: string[];
	/** 流自带的 Metadata 键值 */
	tags: Tags;
}

export interface ContainerInfo {
	formatName?: string;
	formatLongName?: string;
	fileName?: string;
	startTime?: string;
	duration?: string;
	bitrate?: string;
	nbStreams?: number;
	/** 容器层的 Metadata 键值 */
	tags: Tags;
}

export interface MediaInfo {
	/** ffmpeg 自身的版本行，只在 banner 开头出现 */
	version?: string;
	container: ContainerInfo;
	streams: StreamInfo[];
}

/**
 * 按顶层逗号切分，忽略括号与方括号内的逗号。
 *
 * 视频流的细节部分长这样：
 *   h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709), 640x360 [SAR 1:1 DAR 16:9], 174 kb/s
 * 里面 `yuv420p(tv, bt709)` 自带逗号，朴素 split(', ') 会把它劈成两半。
 */
export function splitTopLevel(text: string, separator = ','): string[] {
	const parts: string[] = [];
	let current = '';
	let depth = 0;
	for (const char of text) {
		if (char === '(' || char === '[') depth++;
		else if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
		if (char === separator && depth === 0) {
			parts.push(current.trim());
			current = '';
			continue;
		}
		current += char;
	}
	parts.push(current.trim());
	return parts.filter((part) => part !== '');
}

/** 取末尾括号组的内容：`yuv420p(tv, bt709)` → `tv, bt709`，`(High)` → `High` */
function parenGroup(token: string): string | undefined {
	const match = /^[^()]*\(([\s\S]*)\)$/.exec(token.trim());
	return match ? match[1] : undefined;
}

/**
 * ffmpeg 用在流尾部的标记，出现在 `(...)` 里的**单词**。
 * 只有这些才算 disposition，`(avc1 / 0x31637661)`、`(tv, bt709)` 不是。
 */
const DISPOSITION_MARKS = new Set([
	'default', 'dub', 'original', 'comment', 'lyrics', 'karaoke', 'forced',
	'hearing_impaired', 'visual_impaired', 'clean_effects', 'attached_dub',
	'caption', 'description', 'dependent', 'metadata', 'still_image',
	'timed_thumbnails', 'non_diegetic', 'copy', 'unknown',
]);

/**
 * 剥掉 token 尾部的标记组。
 *
 * ffmpeg 把 `(default)`、`(copy)` 直接用空格跟在值后面、前面没有逗号，
 * 所以 `128 kb/s (default)` 是**一个** token；不剥掉码率就变成
 * `128 kb/s (default)`。
 *
 * 但不能见到 `)` 就剥 —— `(avc1 / 0x31637661)` 和 `yuv420p(tv, bt709)` 也以 `)` 结尾，
 * 剥了会把编码标签和像素格式信息丢掉。所以要求括号里**全是**已知的标记单词。
 */
function splitTailMarks(token: string): { head: string; marks: string[] } {
	const match = /\s*\(([^()]*)\)\s*$/.exec(token);
	if (!match) return { head: token, marks: [] };
	const parts = match[1]
		.split('/')
		.map((part) => part.trim())
		.filter(Boolean);
	if (!parts.length || !parts.every((part) => DISPOSITION_MARKS.has(part.toLowerCase()))) {
		return { head: token, marks: [] };
	}
	const head = token.slice(0, match.index).trim();
	// 整个 token 就是个标记（`(default)` 单独出现）时 head 为空，也算标记
	return { head, marks: parts };
}

/** `25 fps` / `25 tbr` / `90k tbn` → '25' / '25' / '90k' */
const RATE = /^([\d.]+[kKmM]?)\s*(fps|tbr|tbn)$/;
const CHANNEL_MAP: Record<string, string> = {
	mono: '1',
	stereo: '2',
	'2.1': '3',
	'3.0': '3',
	'3.0(back)': '3',
	'4.0': '4',
	'quad': '4',
	'5.0': '5',
	'5.1': '6',
	'6.1': '7',
	'7.1': '8',
};

/**
 * 解析 `Stream #0:0[0x1](und): Video: <detail>` 里的 detail 部分。
 *
 * detail 是一串逗号分隔的 token，顺序基本固定但**并不保证**，
 * 所以逐个 token 按形态判断，而不是按下标取。
 */
function parseStreamDetail(stream: StreamInfo, detail: string): void {
	for (const raw of splitTopLevel(detail)) {
		/*
		 * 尾部标记先剥掉。ffmpeg 把 `(default)`、`(copy)` 直接用空格跟在值后面、
		 * 前面没有逗号，所以 `128 kb/s (default)` 是**一个** token。
		 */
		const { head: token, marks } = splitTailMarks(raw);
		if (marks.length) stream.disposition = [...(stream.disposition ?? []), ...marks];
		if (!token) continue;

		/*
		 * 分辨率与 `[SAR … DAR …]` 常常连在同一个 token 里（中间只有空格、没有逗号）：
		 *   1920x1080 [SAR 1:1 DAR 16:9]
		 * 所以先把方括号部分摘出来单独处理。
		 */
		let bracket = '';
		let main = token;
		const bracketAt = token.indexOf('[');
		if (bracketAt >= 0) {
			bracket = token.slice(bracketAt);
			main = token.slice(0, bracketAt).trim();
		}
		if (bracket) {
			const sar = /SAR\s+([\d:.]+)/.exec(bracket);
			const dar = /DAR\s+([\d:.]+)/.exec(bracket);
			if (sar) stream.sar = sar[1];
			if (dar) stream.dar = dar[1];
		}

		// 第一个 token 一定是编码名。解析完就 continue —— 这个 token 里不会再有别的信息，
		// 不 continue 的话 `h264 (Main 10)` 会被后面的像素格式分支当成
		// `名称(参数)` 格式，pixelFormat 变成 'h264'。
		if (!stream.codec) {
			const codecHead = /^([\w\d]+)\s*([\s\S]*)$/.exec(main);
			if (codecHead) {
				stream.codec = codecHead[1];
				let rest = codecHead[2].trim();
				const tagMatch = /\(([\w\d]+)\s*\/\s*(0x[\da-f]+)\)/i.exec(rest);
				if (tagMatch) {
					stream.tag = tagMatch[1];
					stream.tagHex = tagMatch[2];
					rest = rest.replace(tagMatch[0], ' ').trim();
				}
				const profile = parenGroup(rest);
				if (profile && !/^[\d.]+$/.test(profile)) stream.profile = profile;
			}
			continue;
		}
		if (!main) continue;

		// 编码级别：跟在档次后面的裸数字，如 h264 (High) 31
		if (/^\d{1,3}$/.test(main) && !stream.level) {
			stream.level = main;
			continue;
		}
		// 分辨率
		const size = /^(\d{2,5})x(\d{2,5})$/.exec(main);
		if (size) {
			stream.width = Number(size[1]);
			stream.height = Number(size[2]);
			continue;
		}
		// yuv420p(tv, bt709, progressive) / yuv420p10le(...) / gbrp
		if (stream.type === 'video' && !stream.pixelFormat) {
			const pix = /^([^(]+)\(([\s\S]*)\)$/.exec(main);
			if (pix) {
				stream.pixelFormat = pix[1].trim();
				applyColorInfo(stream, splitTopLevel(pix[2]));
				continue;
			}
			if (/^[\w\d]+$/.test(main)) {
				stream.pixelFormat = main;
				continue;
			}
		}
		// 44100 Hz
		const rate = /^([\d.]+)\s*Hz$/.exec(main);
		if (rate) {
			stream.sampleRate = rate[1];
			continue;
		}
		// 位率
		if (/kb\/s|Mb\/s|bit\/s/i.test(main) && /^[\d.]/.test(main)) {
			if (!stream.bitrate) stream.bitrate = main;
			continue;
		}
		// 帧率三兄弟。时基可能带 k/M 后缀（`90k tbn`）
		const fpsMatch = RATE.exec(main);
		if (fpsMatch) {
			if (fpsMatch[2] === 'fps') stream.fps = fpsMatch[1];
			else if (fpsMatch[2] === 'tbr') stream.tbr = fpsMatch[1];
			else stream.tbn = fpsMatch[1];
			continue;
		}
		// 声道：mono / stereo / 5.1 …
		const lowered = main.toLowerCase();
		if (CHANNEL_MAP[lowered]) {
			stream.channels = CHANNEL_MAP[lowered];
			continue;
		}
		if (/^\d\.\d$/.test(lowered)) {
			stream.channels = lowered;
			continue;
		}
		// 采样格式 fltp / s16 / s24
		if (/^(?:fltp|flts|s16|s32|s24|u8|f64|f32)$/i.test(main)) {
			stream.sampleFormat = main;
			continue;
		}
		// 其余零散 token（subtitle 的 0x00000000 之类）不硬塞
	}
}

/** 像素格式括号里的色彩信息。顺序按 ffmpeg 的紧凑写法，不固定，按内容判断 */
const FIELD_ORDERS = new Set([
	'progressive', 'interlaced', 'tt', 'bb', 'tb', 'bt', 'top', 'bottom',
]);

function applyColorInfo(stream: StreamInfo, items: string[]): void {
	for (const item of items) {
		const text = item.trim();
		if (!text) continue;
		if (text.includes('/')) {
			/*
			 * 紧凑写法：色彩空间/primaries/传输特性，如
			 *   bt2020nc/bt2020/ar   （HDR10 常见）
			 * 只有一段时（如 `yuv/jpeg`）就当色彩空间。
			 */
			const parts = text.split('/').map((p) => p.trim()).filter(Boolean);
			if (parts.length >= 1) stream.colorSpace = parts[0];
			if (parts.length >= 2) stream.colorPrimaries = parts[1];
			if (parts.length >= 3) stream.colorTransfer = parts[2];
			continue;
		}
		if (FIELD_ORDERS.has(text.toLowerCase())) {
			stream.fieldOrder = text;
			continue;
		}
		if (['tv', 'pc', 'jpeg', 'full', 'unknown'].includes(text.toLowerCase())) {
			stream.colorRange = text;
			continue;
		}
		if (!stream.colorSpace) {
			stream.colorSpace = text;
			continue;
		}
		if (!stream.colorPrimaries) {
			stream.colorPrimaries = text;
			continue;
		}
		if (!stream.colorTransfer) stream.colorTransfer = text;
	}
}

const STREAM_TYPE_MAP: Record<string, StreamType> = {
	video: 'video',
	audio: 'audio',
	subtitle: 'subtitle',
	data: 'data',
	attachment: 'attachment',
};

/**
 * 解析 ffmpeg 的 -i banner，返回结构化的容器与轨道信息。
 *
 * 靠缩进区分「容器 Metadata」（4 空格）与「轨道 Metadata」（6 空格）——
 * ffmpeg 的 banner 格式很稳定，用缩进判断比猜更可靠。
 */
export function parseMediaInfo(text: string): MediaInfo {
	const info: MediaInfo = { container: { tags: {} }, streams: [] };
	let current: StreamInfo | null = null;
	let inVersion = false;
	/** `Side data:` 块的缩进；块内内容不是元数据，跳过 */
	let sideDataIndent = -1;

	for (const rawLine of text.split('\n')) {
		const line = rawLine.replace(/\r$/, '');
		if (!line.trim()) continue;
		const indent = line.length - line.trimStart().length;

		// Side data 块整体跳过（H.264 的 cpb / mp4a 的对齐填充等，不是元数据）
		if (/^\s*Side data:\s*$/.test(line)) {
			sideDataIndent = indent;
			continue;
		}
		if (sideDataIndent >= 0) {
			if (indent > sideDataIndent) continue;
			sideDataIndent = -1;
		}

		const version = /^ffmpeg version (\S+)/.exec(line);
		if (version) {
			info.version = version[1];
			inVersion = true;
			continue;
		}
		if (inVersion) {
			// 版本块下面缩进的 configuration / libav* 行不是我们要的信息
			if (/^\s{2,}\S/.test(line)) continue;
			inVersion = false;
		}

		// Input #0, <格式列表>, from '<文件名>':
		const input = /^Input #(\d+),\s*(.*?),?\s*(?:from\s*'(.*)')?:\s*$/.exec(line);
		if (input) {
			info.container.formatName = input[2].replace(/,$/, '').trim();
			if (input[3]) info.container.fileName = input[3];
			current = null;
			continue;
		}

		/*
		 * Duration: 00:00:10.50, start: 0.000000, bitrate: 1058 kb/s
		 * 码率带单位且含空格，所以不能用 \S+ —— 要一直吃到行尾。
		 * 另有两种变体：`start:` 可能缺席（部分音频格式），
		 * `bitrate:` 也可能缺席（流媒体的 live 输入）。
		 */
		const duration = /^\s{2}Duration:\s*([^,]+?)(?:,\s*start:\s*([^,]+?))?(?:,\s*bitrate:\s*(.+?))?\s*$/.exec(line);
		if (duration && duration[1]) {
			info.container.duration = duration[1].trim();
			info.container.startTime = duration[2]?.trim();
			info.container.bitrate = duration[3]?.trim();
			continue;
		}

		// Stream #0:0[0x1](und): Video: <detail>
		const stream = /^\s{2}Stream #(\d+:\d+)(?:\[(0x[\da-f]+)\])?(?:\((\w+)\))?:\s*(\w+):\s*(.*)$/i.exec(line);
		if (stream) {
			const rawType = stream[4].toLowerCase();
			current = {
				id: stream[1],
				hexId: stream[2],
				type: STREAM_TYPE_MAP[rawType] ?? 'unknown',
				rawType: stream[4],
				language: stream[3] && stream[3] !== 'und' ? stream[3] : undefined,
				tags: {},
			};
			info.streams.push(current);
			parseStreamDetail(current, stream[5]);
			continue;
		}

		// Metadata 块的键值。缩进 ≤4 归容器，≥6 归当前轨道
		const colon = line.indexOf(':');
		const tag = /^(\s+)([\w][\w ._-]*?)\s*:\s*([\s\S]*)$/.exec(line);
		if (tag && colon > 0) {
			const indent = tag[1].length;
			const key = tag[2].trim();
			const value = tag[3].trim();
			/*
			 * 跳过 `Side data:` 块。那块里的行长得像键值但不是元数据：
			 *   Side data:
			 *     cpb=bitrate max/min/avg: 0/0/0 buffer size: 49152 vbv_delay: N/A
			 * 第一个冒号之前含 `=`（mp4a 为对齐码流还会给整段十六进制），
			 * 用这一点把它挡掉，比维护 Side data 的专用语法省事。
			 */
			if (line.slice(0, colon).includes('=')) continue;
			if (!/^Metadata$/.test(key)) {
				if (current && indent >= 6) current.tags[key] = value;
				else info.container.tags[key] = value;
			}
			continue;
		}
	}

	// 某些封装（如 wav）不给总码率，用各轨道的加起来补一个参考值
	if (!info.container.nbStreams) info.container.nbStreams = info.streams.length;
	return info;
}

/** 容器格式名到可读名称（ffmpeg 的格式列表是逗号分隔的别名） */
const FORMAT_LABELS: Record<string, string> = {
	matroska: 'Matroska (MKV / WebM)',
	webm: 'WebM',
	mov: 'QuickTime / MP4',
	'mp4': 'MP4',
	mpegts: 'MPEG-TS',
	asf: 'ASF / WMV',
	avi: 'AVI',
	flv: 'FLV',
	mp3: 'MP3',
	flac: 'FLAC',
	ogg: 'Ogg',
	wav: 'WAV',
	aac: 'AAC (ADTS)',
	'3gp': '3GP',
};

/** 取格式列表里的第一个作为主要名称 */
export function primaryFormatName(info: MediaInfo): string {
	const list = (info.container.formatName ?? '').split(',').map((s) => s.trim()).filter(Boolean);
	if (!list.length) return '';
	for (const candidate of list) {
		if (FORMAT_LABELS[candidate]) return candidate;
	}
	return list[0] ?? '';
}

/** 主要格式的可读名称，如 `QuickTime / MP4`；不认识就返回原名 */
export function formatLabel(info: MediaInfo): string {
	const key = primaryFormatName(info);
	if (!key) return '';
	return FORMAT_LABELS[key] ?? key;
}

/** 人话摘要，用于标签页顶部那一行 */
export function describeMediaInfo(info: MediaInfo): string {
	const parts: string[] = [];
	const fmt = formatLabel(info);
	if (fmt) parts.push(fmt);

	const video = info.streams.find((s) => s.type === 'video');
	if (video?.width && video.height) {
		parts.push(`${video.width}×${video.height}`);
		if (video.fps) parts.push(`${video.fps} fps`);
		if (video.codec) parts.push(video.codec);
	}
	const audio = info.streams.find((s) => s.type === 'audio');
	if (audio?.codec) {
		parts.push(audio.codec);
		if (audio.sampleRate) parts.push(`${audio.sampleRate} Hz`);
		if (audio.channels) parts.push(`${audio.channels} 声道`);
	}
	if (info.container.duration && info.container.duration !== 'N/A') {
		parts.push(info.container.duration);
	}
	if (info.container.bitrate && info.container.bitrate !== 'N/A') {
		parts.push(info.container.bitrate);
	}
	return parts.join(' · ') || '无法识别的媒体文件';
}

/**
 * 兼容旧接口：从结构化信息里抽出少量常用字段。
 * assertConcatCompatible() 与单行摘要仍用它。
 */
export function parseProbeLog(text: string): ProbeResult {
	const info = parseMediaInfo(text);
	const video = info.streams.find((s) => s.type === 'video');
	const audio = info.streams.find((s) => s.type === 'audio');
	// 只写有值的字段，调用方用 Object.keys() 判断「有没有解析到东西」
	const result: ProbeResult = {};
	if (info.container.duration) result.duration = info.container.duration;
	if (info.container.bitrate) result.bitrate = info.container.bitrate;
	if (info.container.formatName) result.formatName = info.container.formatName;
	if (video) {
		if (video.codec) result.videoCodec = video.codec;
		if (video.width !== undefined) result.width = video.width;
		if (video.height !== undefined) result.height = video.height;
		if (video.fps) result.fps = video.fps;
	}
	if (audio?.codec) result.audioCodec = audio.codec;
	return result;
}

export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return '—';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** ProbeResult 的简要摘要（拼接前的编码核对、兼容旧调用点用） */
export function describeProbe(info: ProbeResult): string {
	const parts: string[] = [];
	const fmt = (info.formatName ?? '').split(',').map((s) => s.trim()).filter(Boolean);
	if (fmt.length) parts.push(FORMAT_LABELS[fmt[0]] ?? fmt[0]);
	if (info.width && info.height) parts.push(`${info.width}×${info.height}`);
	if (info.videoCodec) parts.push(info.videoCodec);
	if (info.audioCodec) parts.push(info.audioCodec);
	if (info.duration) parts.push(info.duration);
	if (info.bitrate) parts.push(info.bitrate);
	return parts.join(' · ') || '无法识别的媒体文件';
}

/**
 * Chrome 单标签页对单个 ArrayBuffer 有 2 GB 上限，留一点余量。
 * 取整数常量，避免出现 1929849781.6 这种小数字节数。
 */
export const MAX_INPUT_BYTES = 1_929_000_000;

export function assertSizeOk(files: { name: string; size: number }[]): void {
	const total = files.reduce((sum, file) => sum + file.size, 0);
	if (total > MAX_INPUT_BYTES) {
		throw new Error(
			`所选文件合计 ${formatBytes(total)}，超过浏览器单标签页约 ${formatBytes(MAX_INPUT_BYTES)} 的上限。` +
				'请分批处理或先裁短。',
		);
	}
}
