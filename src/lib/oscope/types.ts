/**
 * 示波器 —— 公共类型定义。
 *
 * 术语与真示波器保持一致：
 *   时基（timebase）  一格代表多少秒，决定一屏能放下几个信号周期。
 *   垂直档位（vdiv）  一格代表多少伏，决定波形高度。
 *   触发              在信号上找一个固定参考点，使波形稳定不左右乱跑。
 */

export type SourceKind = 'math' | 'oscillator' | 'local' | 'mic';

export type TriggerMode = 'auto' | 'rising' | 'falling';

export type WaveShape = 'sine' | 'square' | 'triangle' | 'sawtooth';

/** 时基档位，单位 ms/div。1-2-5 序列。 */
export interface Timebase {
	label: string;
	ms: number;
}

/** 垂直档位。div 为每格对应的满量程幅度。 */
export interface Vdiv {
	label: string;
	/** 满量程（±div 格的峰值），即 div 格的幅度 */
	full: number;
}

export interface Measurements {
	/** Hz；窗口内不足两个周期时为 null */
	frequency: number | null;
	/** 峰峰值 */
	pp: number;
	/** 有效值（已扣除直流偏移） */
	rms: number;
	/** 直流偏移 */
	offset: number;
	/** 周期 s；与 frequency 互算 */
	period: number | null;
	/** 占空比 0–1；非方波意义有限 */
	duty: number | null;
}

export interface SourceParams {
	/** math 模式：两条曲线 y = f(x, t)，x ∈ [0,1)，t 单位秒 */
	fn1: string;
	fn2: string;
	/** oscillator 模式 */
	freq: number;
	shape: WaveShape;
}

/**
 * 时基档位，1-2-5 序列。
 *
 * 下限取 20µs/格：再小一屏采到的样本数会低于画布宽度，AnalyserNode 的
 * 2048 点快照根本填不满一个时基窗口，波形只能画出插值出来的假象。
 * 20µs/格 × 10 格 = 200µs ≈ 440Hz 的 4 个周期，是能看清正弦形状的量级。
 */
export const TIMEBASES: Timebase[] = [
	{ label: '20 µs', ms: 0.02 },
	{ label: '50 µs', ms: 0.05 },
	{ label: '100 µs', ms: 0.1 },
	{ label: '200 µs', ms: 0.2 },
	{ label: '500 µs', ms: 0.5 },
	{ label: '1 ms', ms: 1 },
	{ label: '2 ms', ms: 2 },
	{ label: '5 ms', ms: 5 },
	{ label: '10 ms', ms: 10 },
	{ label: '20 ms', ms: 20 },
	{ label: '50 ms', ms: 50 },
	{ label: '100 ms', ms: 100 },
	{ label: '200 ms', ms: 200 },
	{ label: '500 ms', ms: 500 },
];

/**
 * 垂直档位。
 *
 * AnalyserNode 输出的是 [-1, 1] 的归一化幅度，物理上对应 ±1 满刻度。
 * 这里给出更细的分档，便于把小幅信号放大到看得清。
 */
export const VDIVS: Vdiv[] = [
	{ label: '±0.1', full: 0.1 },
	{ label: '±0.25', full: 0.25 },
	{ label: '±0.5', full: 0.5 },
	{ label: '±1', full: 1 },
	{ label: '±2', full: 2 },
	{ label: '±5', full: 5 },
];

/** 一屏的水平格数，与真示波器一致 */
export const DIVS_X = 10;
/** 一屏的垂直格数 */
export const DIVS_Y = 8;

/** FFT 点数。必须是 2 的幂，且 ≥ AnalyserNode 的快照长度。 */
export const FFT_SIZE = 8192;

/** 双通道时各自的零电平基线：相对画面中心上下各偏移 2 格 */
export const CH_ZERO_OFFSET_DIV = 2;

/** 视图模式：双通道波形 / XY 李萨如 / 频谱 */
export type ViewMode = 'dual' | 'xy' | 'fft';

/** 通道标识 */
export type ChannelId = 'ch1' | 'ch2';

/** 触发时波形从穿越点之前开始显示的比例 */
export const PRE_TRIGGER = 0.1;

/** 连续多少帧找不到触发点后进入 auto 强制触发 */
export const AUTO_TRIGGER_FRAMES = 8;

export const DEFAULT_PARAMS: SourceParams = {
	fn1: 'return Math.sin((x + t) * 2 * Math.PI * 2)',
	fn2: 'return Math.cos(x * 2 * Math.PI * 4)',
	freq: 440,
	shape: 'sine',
};
