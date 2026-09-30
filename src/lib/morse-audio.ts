/**
 * 摩尔斯电码音频发报
 *
 * 用 Web Audio 实时合成正弦音，不加载任何音频文件。
 *
 * 调度方式：先把整段文本展开成「音/静」时间表，再用 AudioContext 的
 * 绝对时间一次性排完。若改用 setTimeout 逐个发声，长文本会明显漂移，
 * 而且页面切到后台时浏览器会节流定时器。
 */

import { buildPlan, planDuration } from '../data/morse-table';

export interface PlayHandle {
	/** Promise 在发报结束或被中止时 resolve；参数为是否完整播完 */
	done: Promise<boolean>;
	abort(): void;
}

const FREQ = 600; // Hz，标准发报音
const PEAK = 0.09; // 增益，避免刺耳也确保可闻

export function playMorse(text: string, wpm: number, onProgress?: (p: number) => void): PlayHandle {
	const Ctor =
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Ctor) throw new Error('当前浏览器不支持 Web Audio');

	const ac = new Ctor();
	if (ac.state === 'suspended') void ac.resume();

	const plan = buildPlan(text, wpm);
	const total = planDuration(plan, wpm);

	let aborted = false;

	const gain = ac.createGain();
	gain.gain.value = PEAK;
	gain.connect(ac.destination);

	const t0 = ac.currentTime + 0.08; // 留一点起振余量
	for (const ev of plan) {
		const osc = ac.createOscillator();
		osc.type = 'sine';
		osc.frequency.value = FREQ;
		osc.connect(gain);
		osc.start(t0 + ev.at);
		osc.stop(t0 + ev.at + (ev.dur ?? 0));
	}
	// 统一在末尾断开，省掉逐个 osc 的 onended
	setTimeout(() => gain.disconnect(), (total + 0.5) * 1000);

	const done = new Promise<boolean>((resolve) => {
		if (!onProgress) return;
		const tick = () => {
			if (aborted) return resolve(false);
			const el = ac.currentTime - t0;
			const p = total > 0 ? Math.min(1, el / total) : 1;
			onProgress(p);
			if (p >= 1) return resolve(true);
			setTimeout(tick, 40);
		};
		setTimeout(tick, 40);
	});

	// 没有任何音符（例如输入的是纯空格）时直接结束
	if (!plan.length) {
		onProgress?.(1);
		setTimeout(() => void ac.close(), 100);
	}

	return {
		done,
		abort() {
			aborted = true;
			void ac.close();
		},
	};
}
