/**
 * 示波器 —— 环形缓冲与触发搜索。
 *
 * Web Audio 的 AnalyserNode 每次只给出「当前这一刻起」的固定长度快照，
 * 无法回溯历史。所以要实现稳定的波形显示，必须自己维护一个环形缓冲，
 * 在里面反寻找触发点，再从该点抽取一屏的窗口。
 *
 * 这与真示波器的工作方式一致：触发的作用就是把「随时都在流动的信号」
 * 钉在一个固定的参考点上，使波形静止可读。
 */

import { AUTO_TRIGGER_FRAMES, type TriggerMode } from './types';

export class RingBuffer {
	readonly capacity: number;
	private readonly buf: Float32Array;
	/** 下一个写入位置 */
	private write = 0;
	/** 已写入的累计样本数，用于处理环绕 */
	private total = 0;
	/** 上一次触发点的绝对索引（用于 auto 模式强制推进） */
	private lastAnchor = -1;
	/** 连续找不到触发的帧数 */
	private missFrames = 0;

	constructor(capacity: number) {
		this.capacity = capacity;
		this.buf = new Float32Array(capacity);
	}

	/** 已缓冲的样本数 */
	get filled(): number {
		return Math.min(this.total, this.capacity);
	}

	/** 累计写入的总样本数（单调递增） */
	get written(): number {
		return this.total;
	}

	reset(): void {
		this.buf.fill(0);
		this.write = 0;
		this.total = 0;
		this.lastAnchor = -1;
		this.missFrames = 0;
	}

	push(samples: Float32Array): void {
		const n = Math.min(samples.length, this.capacity);
		for (let i = 0; i < n; i++) {
			this.buf[this.write] = samples[samples.length - n + i];
			this.write = (this.write + 1) % this.capacity;
		}
		this.total += n;
	}

	/**
	 * 读取绝对索引 idx 处的样本。
	 *
	 * 绝对索引 0 是第一次写入的样本；负数或超出缓冲区的返回 0，
	 * 这样触发点靠近缓冲区边缘时也不会越界崩溃。
	 */
	at(idx: number): number {
		if (idx < 0 || idx >= this.total) return 0;
		// 缓冲区只保留最近 capacity 个样本
		const start = Math.max(0, this.total - this.capacity);
		if (idx < start) return 0;
		const off = (idx - start) % this.capacity;
		return this.buf[off];
	}

	/**
	 * 从后往前搜索触发点。
	 *
	 * @param mode    auto 表示未找到时也能继续显示
	 * @param level   触发电平，归一化幅度（-1…1）
	 * @param span    搜索范围（样本数），至少要覆盖一次穿越
	 * @param reserve 锚点之后必须保留的样本数（即一屏窗口的长度）。
	 *                不留余量的话锚点总落在缓冲区末尾，窗口取不到数据。
	 * @returns 触发点的绝对索引；auto 模式下永远返回一个可用位置
	 */
	findTrigger(mode: TriggerMode, level: number, span: number, reserve: number): number {
		// 锚点最多只能到 newest - reserve，否则窗口会越界
		const newest = Math.max(0, this.total - 1 - reserve);
		const from = Math.max(0, newest - span);
		const rising = mode !== 'falling';

		for (let i = newest; i > from; i--) {
			const prev = this.at(i - 1);
			const cur = this.at(i);
			const hit = rising
				? prev < level && cur >= level
				: prev > level && cur <= level;
			if (hit) {
				this.lastAnchor = i;
				this.missFrames = 0;
				return i;
			}
		}

		this.missFrames++;

		// auto 模式：连续若干帧无穿越（如直流信号或纯噪声），
		// 按窗口长度强制推进，保证画面永远不会停住。
		// 每次只前进一屏，避免一个周期跨过整屏时触发点狂跳。
		if (mode === 'auto' && this.missFrames >= AUTO_TRIGGER_FRAMES) {
			this.missFrames = 0;
			let anchor: number;
			if (this.lastAnchor >= 0) {
				anchor = this.lastAnchor + span;
			} else {
				anchor = newest;
			}
			// 推进过头就回到最新的可用位置
			if (anchor > newest) anchor = newest;
			this.lastAnchor = anchor;
			return anchor;
		}

		// 尚未进入 auto 条件时，沿用上一次的触发点，避免波形跳动
		if (mode === 'auto' && this.lastAnchor >= 0 && this.lastAnchor <= newest) {
			return this.lastAnchor;
		}

		// 上升/下降沿模式且没找到：让调用方决定是否保留旧画面
		return -1;
	}

	/**
	 * 从触发点抽取一屏的样本。
	 *
	 * @param anchorIdx  触发点绝对索引
	 * @param preSamples 触发点之前取多少样本（预触发）
	 * @param length     窗口总长
	 */
	window(anchorIdx: number, preSamples: number, length: number): Float32Array {
		const out = new Float32Array(length);
		const start = anchorIdx - preSamples;
		for (let i = 0; i < length; i++) out[i] = this.at(start + i);
		return out;
	}

	/** 触发点是否落在可显示范围内（否则画面会空白） */
	usable(anchorIdx: number, preSamples: number, length: number): boolean {
		if (anchorIdx < 0) return false;
		const start = anchorIdx - preSamples;
		return start >= 0 && start + length <= this.written;
	}
}
