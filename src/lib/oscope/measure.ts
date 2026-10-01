/**
 * 示波器 —— 自动测量。
 *
 * 几个容易写错的点：
 *   - Vrms 必须先扣除直流偏移，否则纯直流信号会算出虚高的有效值；
 *   - 频率取过零间距的**中位数**而非平均，单个毛刺不会带偏结果；
 *   - 窗口内不足两个周期时频率与周期无意义，返回 null 而不是硬算。
 */

import type { Measurements } from './types';

/** 过零检测：找出所有相邻上升沿的间距 */
function risingEdges(s: Float32Array): number[] {
	const edges: number[] = [];
	for (let i = 1; i < s.length; i++) {
		if (s[i - 1] < 0 && s[i] >= 0) edges.push(i);
	}
	return edges;
}

function median(values: number[]): number {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 计算一屏窗口的各项读数。
 *
 * @param samples    触发对齐后的一屏样本
 * @param sampleRate AudioContext 采样率（Hz）
 */
export function measure(samples: Float32Array, sampleRate: number): Measurements {
	let min = Infinity;
	let max = -Infinity;
	let sum = 0;
	for (let i = 0; i < samples.length; i++) {
		const v = samples[i];
		if (v < min) min = v;
		if (v > max) max = v;
		sum += v;
	}
	const offset = sum / samples.length;
	const pp = max - min;

	// 扣除直流偏移后的有效值
	let sq = 0;
	for (let i = 0; i < samples.length; i++) {
		const d = samples[i] - offset;
		sq += d * d;
	}
	const rms = Math.sqrt(sq / samples.length);

	// 频率：过零间距取中位数
	const edges = risingEdges(samples);
	let frequency: number | null = null;
	let period: number | null = null;
	if (edges.length >= 3) {
		const gaps: number[] = [];
		for (let i = 1; i < edges.length; i++) gaps.push(edges[i] - edges[i - 1]);
		const gap = median(gaps);
		if (gap > 0) {
			period = gap / sampleRate;
			frequency = 1 / period;
		}
	}

	// 占空比：高于中线的采样占比
	let duty: number | null = null;
	const mid = (min + max) / 2;
	if (pp > 1e-6) {
		let high = 0;
		for (let i = 0; i < samples.length; i++) if (samples[i] > mid) high++;
		duty = high / samples.length;
	}

	return { frequency, pp, rms, offset, period, duty };
}

/** 读数的显示格式：无效值统一显示为占位符 */
export function fmt(value: number | null, unit: string, digits = 2): string {
	if (value === null || !Number.isFinite(value)) return '—';
	if (value === 0) return `0 ${unit}`;
	const abs = Math.abs(value);
	if (abs >= 10000 || abs < 0.01) return `${value.toExponential(2)} ${unit}`;
	return `${value.toFixed(digits)} ${unit}`;
}

/** 自动选择频率显示单位，让数字落在易读区间 */
export function fmtFrequency(hz: number | null): string {
	if (hz === null || !Number.isFinite(hz)) return '—';
	if (hz >= 1e6) return `${(hz / 1e6).toFixed(3)} MHz`;
	if (hz >= 1e3) return `${(hz / 1e3).toFixed(3)} kHz`;
	return `${hz.toFixed(2)} Hz`;
}
