/**
 * 示波器 —— 导出。
 *
 * 全部在浏览器本地生成，不上传任何数据。
 */

import type { Measurements } from './types';

/**
 * 导出当前窗口的采样数据为 CSV。
 *
 * 两列采样值 + 一列相对时间（毫秒），便于在表格软件或 Python 里重画波形。
 * 时间原点取触发点之前，因此 t 会从负数开始 —— 这与示波器的预触发一致。
 */
export function buildCsv(
	ch1: Float32Array,
	ch2: Float32Array | null,
	sampleRate: number,
	preSamples: number,
): string {
	const rows: string[] = ['time_ms,ch1' + (ch2 ? ',ch2' : '')];
	const n = ch1.length;
	for (let i = 0; i < n; i++) {
		const t = ((i - preSamples) / sampleRate) * 1000;
		const a = ch1[i].toFixed(6);
		const b = ch2 ? `,${ch2[i].toFixed(6)}` : '';
		rows.push(`${t.toFixed(4)},${a}${b}`);
	}
	return rows.join('\n');
}

/** 测量结果转 CSV（便于留档对比） */
export function buildMeasureCsv(
	m1: Measurements,
	m2: Measurements | null,
	labels: { ch1: string; ch2: string },
): string {
	const rows = ['channel,metric,value,unit'];
	const push = (ch: string, k: string, v: number | null, unit: string) => {
		rows.push(`${ch},${k},${v === null ? '' : String(v)},${unit}`);
	};
	push(labels.ch1, 'frequency', m1.frequency, 'Hz');
	push(labels.ch1, 'period', m1.period, 's');
	push(labels.ch1, 'pp', m1.pp, 'V');
	push(labels.ch1, 'rms', m1.rms, 'V');
	push(labels.ch1, 'offset', m1.offset, 'V');
	push(labels.ch1, 'duty', m1.duty, 'ratio');
	if (m2) {
		push(labels.ch2, 'frequency', m2.frequency, 'Hz');
		push(labels.ch2, 'period', m2.period, 's');
		push(labels.ch2, 'pp', m2.pp, 'V');
		push(labels.ch2, 'rms', m2.rms, 'V');
		push(labels.ch2, 'offset', m2.offset, 'V');
		push(labels.ch2, 'duty', m2.duty, 'ratio');
	}
	return rows.join('\n');
}

/** 触发下载一个 Blob。用完即 revoke，避免内存泄漏 */
export function download(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.append(a);
	a.click();
	a.remove();
	// 立刻 revoke 会让部分浏览器下载失败，延迟一拍更稳
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 时间戳文件名，如 20261001-142530 */
export function timestamp(): string {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	return (
		`${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
		`-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
	);
}

/** 浏览器支持的视频 MIME，按画质与兼容性排序 */
export function pickVideoMime(): string {
	const candidates = [
		'video/webm;codecs=vp9',
		'video/webm;codecs=vp8',
		'video/webm',
		'video/mp4',
	];
	for (const m of candidates) {
		if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
	}
	return '';
}

/** canvas → PNG Blob */
export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((b) => {
			if (b) resolve(b);
			else reject(new Error('截图失败'));
		}, 'image/png');
	});
}
