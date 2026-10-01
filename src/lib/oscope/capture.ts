/**
 * 示波器 —— 音频输入源。
 *
 * 四种输入（数学函数 / 振荡器 / 本地文件 / 麦克风）统一收敛成同一个
 * AnalyserNode，对下游完全一致。
 *
 * 数学函数无法用 OscillatorNode 表达（只能出四种标准波形），做法是把
 * f(x, t) 逐样本算成一个循环 AudioBuffer 来播。
 */

import type { SourceKind, SourceParams, WaveShape } from './types';

export interface Source {
	/** 接到 AnalyserNode 的输出端 */
	readonly node: AudioNode;
	/** 仅供 UI 显示 */
	readonly label: string;
	dispose(): void;
}

type Ctor = typeof AudioContext;

function audioContextCtor(): Ctor {
	const w = window as unknown as {
		AudioContext?: Ctor;
		webkitAudioContext?: Ctor;
	};
	const C = w.AudioContext ?? w.webkitAudioContext;
	if (!C) throw new Error('当前浏览器不支持 Web Audio');
	return C;
}

/** 供 Oscilloscope 复用的 AudioContext，避免每个源各建一个 */
export function ensureContext(): AudioContext {
	const C = audioContextCtor();
	const ctx = new C();
	if (ctx.state === 'suspended') void ctx.resume();
	return ctx;
}

const SHAPES: WaveShape[] = ['sine', 'square', 'triangle', 'sawtooth'];

/**
 * 把 `return <expr>` 形式的源码编译成 (x, t) => number。
 *
 * x 是归一化相位 [0, 1)，t 是秒。不使用 eval，改用 Function 构造器在
 * 受限作用域内执行 —— 与本站计算器、LaTeX 工具的既有做法一致。
 */
export function compileExpr(src: string): (x: number, t: number) => number {
	const m = /^\s*return\b\s*([\s\S]*?);?\s*$/.exec(src);
	if (!m) throw new Error('请写成 return 表达式; 的形式');
	const body = m[1];
	if (!body.trim()) throw new Error('表达式为空');
	try {
		// eslint-disable-next-line no-new-func
		const fn = new Function('x', 't', body);
		return (x: number, t: number) => {
			const v = fn(x, t);
			return typeof v === 'number' && Number.isFinite(v) ? v : 0;
		};
	} catch (e) {
		throw new Error(`表达式无法求值：${(e as Error).message}`);
	}
}

/** 振荡器源 */
export function createOscillator(
	ctx: AudioContext,
	params: { freq: number; shape: WaveShape },
): Source {
	const osc = ctx.createOscillator();
	osc.type = params.shape;
	osc.frequency.value = params.freq;
	osc.connect(ctx.destination);
	osc.start();
	return {
		node: osc,
		label: `${params.freq} Hz ${params.shape}`,
		dispose() {
			try {
				osc.stop();
			} catch {
				/* 已停止 */
			}
			osc.disconnect();
		},
	};
}

/** 数学函数源：把 f(x, t) 逐样本算成循环缓冲 */
export function createMath(
	ctx: AudioContext,
	params: { fn1: string; fn2: string },
): Source {
	const f1 = compileExpr(params.fn1);
	const f2 = compileExpr(params.fn2);
	const len = Math.floor(ctx.sampleRate * 1);

	const buf = ctx.createBuffer(1, len, ctx.sampleRate);
	const ch = buf.getChannelData(0);
	for (let i = 0; i < len; i++) {
		const x = i / len;
		// 两路相加，各占一半增益，避免叠加后削顶
		ch[i] = (f1(x, 0) + f2(x, 0)) * 0.5;
	}

	const src = ctx.createBufferSource();
	src.buffer = buf;
	src.loop = true;
	src.connect(ctx.destination);
	src.start();

	return {
		node: src,
		label: '数学函数',
		dispose() {
			try {
				src.stop();
			} catch {
				/* 已停止 */
			}
			src.disconnect();
		},
	};
}

/** 本地音频文件源 */
export async function createLocal(ctx: AudioContext, file: File): Promise<Source> {
	const buf = await ctx.decodeAudioData(await file.arrayBuffer());
	const src = ctx.createBufferSource();
	src.buffer = buf;
	src.loop = true;
	src.connect(ctx.destination);
	src.start();
	return {
		node: src,
		label: `${file.name} · ${buf.duration.toFixed(2)}s`,
		dispose() {
			try {
				src.stop();
			} catch {
				/* 已停止 */
			}
			src.disconnect();
		},
	};
}

/** 麦克风源 */
export async function createMic(ctx: AudioContext): Promise<Source> {
	const stream = await navigator.mediaDevices.getUserMedia({
		audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
	});
	const src = ctx.createMediaStreamSource(stream);
	return {
		node: src,
		label: '麦克风',
		dispose() {
			src.disconnect();
			for (const t of stream.getTracks()) t.stop();
		},
	};
}

/** 按类型创建输入源 */
export function createSource(
	kind: SourceKind,
	ctx: AudioContext,
	params: SourceParams,
	file: File | null,
): Promise<Source> {
	switch (kind) {
		case 'math':
			return Promise.resolve(createMath(ctx, params));
		case 'oscillator':
			return Promise.resolve(createOscillator(ctx, { freq: params.freq, shape: params.shape }));
		case 'local':
			if (!file) throw new Error('请先选择一个音频文件');
			return createLocal(ctx, file);
		case 'mic':
			return createMic(ctx);
	}
}

export { SHAPES };
