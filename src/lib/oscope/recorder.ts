/**
 * 示波器 —— 波形视频录制。
 *
 * 原理：`canvas.captureStream(fps)` 抓取画布像素，交给 `MediaRecorder` 编码。
 * MediaRecorder 只能录 canvas / DOM 之外的媒体流，录不了 DOM，所以示波器
 * 必须画在 canvas 上（这本来也是对的）。
 *
 * **录制时的三条硬限制**（界面上必须如实告知用户）：
 *
 * 1. **时间轴会被放慢。** 30fps 下一帧只包含 30 个采样点，而 48kHz 采样率
 *    下 30 帧对应 1.6 万个采样。实时档（100µs/格）下高频信号在视频里就是
 *    一条实心带，看不出任何波形细节。因此录制时会把时基钳制到 ≥20ms/格，
 *    一屏 200ms，30fps 下正好是 6 倍慢放。
 * 2. **视频不含音频。** MediaRecorder 录的是 canvas 像素，没有音轨。
 *    要带声音得把 AudioContext 的输出接进 MediaStream，但麦克风模式会
 *    形成回授，所以默认静音。
 * 3. **需要用户在页面上点击。** 浏览器不允许无用户手势启动媒体录制，
 *    按钮本身就是那个手势。
 */

import { download, pickVideoMime, timestamp } from './export';

export interface RecorderHandle {
	stop(): Promise<{ blob: Blob; ms: number }>;
	readonly state: 'recording' | 'stopped';
}

export interface RecorderOptions {
	/** 视频帧率 */
	fps: number;
	/** 码率（bps） */
	bitrate: number;
	/** 下载文件名（不含扩展名） */
	name?: string;
}

export function isSupported(): boolean {
	return (
		typeof MediaRecorder !== 'undefined' &&
		typeof HTMLCanvasElement !== 'undefined' &&
		typeof HTMLCanvasElement.prototype.captureStream === 'function'
	);
}

export function start(canvas: HTMLCanvasElement, o: RecorderOptions): RecorderHandle {
	if (!isSupported()) throw new Error('当前浏览器不支持画布录制');

	const mimeType = pickVideoMime();
	const stream = canvas.captureStream(o.fps);

	const rec = new MediaRecorder(stream, {
		...(mimeType ? { mimeType } : {}),
		videoBitsPerSecond: o.bitrate,
	});

	const chunks: BlobPart[] = [];
	rec.ondataavailable = (e) => {
		if (e.data.size > 0) chunks.push(e.data);
	};

	const startedAt = performance.now();
	rec.start(250); // 每 250ms 吐一个分片，避免长录内存暴涨

	let state: RecorderHandle['state'] = 'recording';

	return {
		get state() {
			return state;
		},
		stop() {
			return new Promise((resolve, reject) => {
				if (state === 'stopped') {
					reject(new Error('录制已结束'));
					return;
				}
				state = 'stopped';
				const ms = performance.now() - startedAt;
				rec.onstop = () => {
					const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
					// 用 mimeType 判断容器，而不是 rec.mimeType（可能为空串）
					download(
						new Blob(chunks, { type: mimeType || 'video/webm' }),
						`${o.name ?? `oscope-${timestamp()}`}.${ext}`,
					);
					// 停止所有轨道，否则标签页会一直亮着录音指示
					for (const t of stream.getTracks()) t.stop();
					resolve({ blob: new Blob(chunks, { type: mimeType || 'video/webm' }), ms });
				};
				rec.stop();
			});
		},
	};
}

/**
 * 录制时允许的最小时基（ms/格）。
 *
 * 一屏 10 格，20ms/格 = 200ms 一屏。30fps 下每帧推进 1/30 秒的信号，
 * 200ms 的窗口意味着每帧只显示 6ms 的内容 —— 即 6 倍慢放，
 * 440Hz 能看到约 2.6 个完整周期，形状清晰可辨。
 */
export const MIN_TIMEBASE_MS = 20;

/** 录制中给用户的说明文案 */
export function slowMotionFactor(timebaseMs: number, fps: number, divsX: number): number {
	const screenMs = timebaseMs * divsX;
	return (screenMs / 1000) * fps;
}
