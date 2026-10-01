/**
 * 示波器 —— 频谱分析（FFT）。
 *
 * 用 Cooley–Tukey 基 2 FFT。三个必须做对的处理：
 *
 *   1. **加 Hann 窗**：直接对截断的信号做 FFT 会有严重的谱泄漏，
 *      边频上会拖出一大片毛刺，看起来像有很多谐波。
 *   2. **补零**：AnalyserNode 的快照只有 2048 点，对应 48000/2048 ≈ 23.4 Hz
 *      的频率分辨率。补零到 8192 只为让曲线更平滑，**不提高真实分辨率**——
 *      这一点在界面上要说清楚，否则会误判「能分辨 5.86 Hz 的音」。
 *   3. **只取前半谱**：实信号的频谱共轭对称，后半段是冗余的。
 *
 * 幅度换算用 20*log10(X/N)，单边幅度不做 ×2（那是在算总功率时才需要的）。
 */

import { FFT_SIZE } from './types';

export interface Spectrum {
	/** 每个 bin 对应的频率（Hz），长度 = FFT_SIZE / 2 */
	freq: Float32Array;
	/** 每个 bin 的幅度（dB，20log10） */
	db: Float32Array;
	/** bin 数 */
	bins: number;
	/** 真实频率分辨率（Hz）——由输入长度决定，补零不会提高它 */
	resolution: number;
}

/** 就地迭代版基 2 FFT，re/im 长度必须是 2 的幂 */
function fftInPlace(re: Float32Array, im: Float32Array): void {
	const n = re.length;

	// 位反转置换
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			const tr = re[i];
			re[i] = re[j];
			re[j] = tr;
			const ti = im[i];
			im[i] = im[j];
			im[j] = ti;
		}
	}

	for (let len = 2; len <= n; len <<= 1) {
		const ang = (-2 * Math.PI) / len;
		const wr = Math.cos(ang);
		const wi = Math.sin(ang);
		for (let i = 0; i < n; i += len) {
			let cr = 1;
			let ci = 0;
			const half = len >> 1;
			for (let k = 0; k < half; k++) {
				const ur = re[i + k];
				const ui = im[i + k];
				const vr = re[i + k + half] * cr - im[i + k + half] * ci;
				const vi = re[i + k + half] * ci + im[i + k + half] * cr;
				re[i + k] = ur + vr;
				im[i + k] = ui + vi;
				re[i + k + half] = ur - vr;
				im[i + k + half] = ui - vi;
				const ncr = cr * wr - ci * wi;
				ci = cr * wi + ci * wr;
				cr = ncr;
			}
		}
	}
}

/**
 * 计算一屏样本的频谱。
 *
 * @param samples     时域样本（通常一屏，长度不一定等于 FFT_SIZE）
 * @param sampleRate  采样率 Hz
 */
export function analyse(samples: Float32Array, sampleRate: number): Spectrum {
	const usable = Math.min(samples.length, FFT_SIZE);
	const n = usable || 1;

	const re = new Float32Array(FFT_SIZE);
	const im = new Float32Array(FFT_SIZE);

	// Hann 窗 + 补零（不足部分自然为 0）
	for (let i = 0; i < usable; i++) {
		const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
		re[i] = samples[i] * w;
	}

	fftInPlace(re, im);

	const bins = FFT_SIZE / 2;
	const freq = new Float32Array(bins);
	const db = new Float32Array(bins);
	const binHz = sampleRate / FFT_SIZE;
	// 窗函数的相干增益约为 0.5，补偿后才与输入幅度同量级
	const norm = 2 / (n * 0.5);

	for (let i = 0; i < bins; i++) {
		const mag = Math.hypot(re[i], im[i]) * norm;
		freq[i] = i * binHz;
		// 下限 -160 dB，避免 log(0) 产生 -Infinity 把画布撑破
		db[i] = Math.max(20 * Math.log10(Math.max(mag, 1e-8)), -160);
	}

	return { freq, db, bins, resolution: sampleRate / n };
}

/**
 * 在频谱中找峰值所在频率与幅度（用于「峰值频率」读数）。
 *
 * 起点必须从 -Infinity 开始而不是 -1：全零或纯直流信号的 bin 都在 -160 dB
 * 附近，若初值取 -1 会导致一个峰也找不到。
 */
export function peak(s: Spectrum, minHz = 20): { hz: number; db: number } | null {
	let best = -Infinity;
	let bestHz = 0;
	for (let i = 1; i < s.bins; i++) {
		if (s.freq[i] < minHz) continue;
		if (s.db[i] > best) {
			best = s.db[i];
			bestHz = s.freq[i];
		}
	}
	return Number.isFinite(best) ? { hz: bestHz, db: best } : null;
}

/**
 * 频谱纵轴范围（dB）。
 *
 * 上限留 +10dB 余量：归一化后满幅度正弦正好落在 0dB，若把上限压到 0，
 * 所有正常强度的信号峰顶都会被削平（看起来像方波）。
 */
export const DB_FLOOR = -80;
export const DB_CEIL = 10;
