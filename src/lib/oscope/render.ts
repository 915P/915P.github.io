/**
 * 示波器 —— canvas 绘制。
 *
 * 三种视图共用一个画布：
 *   dual  双通道波形，CH1/CH2 基线分居中线上下，各留 2 格余量
 *   xy    李萨如图，CH1 为 X、CH2 为 Y，用来看相位与频率比
 *   fft   频谱，纵轴 dB，横轴对数频率
 *
 * 波形有两条绘制路径，判据是「采样数 vs 像素数」：
 *   n <= w  采样比像素稀疏 → 直接连线
 *   n >  w  采样远多于像素 → 每像素压成 min/max 竖线包络，保留毛刺与过冲
 */

import { DB_CEIL, DB_FLOOR, type Spectrum } from './fft';
import { fmt, fmtFrequency } from './measure';
import {
	CH_ZERO_OFFSET_DIV,
	DIVS_X,
	DIVS_Y,
	type ChannelId,
	type Measurements,
	type ViewMode,
} from './types';

export interface Theme {
	grid: string;
	axis: string;
	trace: [string, string];
	trigger: string;
	text: string;
	muted: string;
	panelBg: string;
	peak: string;
}

export function readTheme(el: HTMLElement): Theme {
	const cs = getComputedStyle(el);
	const rgb = (v: string) => `rgb(${v})`;
	return {
		grid: rgb(cs.getPropertyValue('--mdui-color-outline-variant').trim()),
		axis: rgb(cs.getPropertyValue('--mdui-color-outline').trim()),
		trace: [
			rgb(cs.getPropertyValue('--mdui-color-primary').trim()),
			rgb(cs.getPropertyValue('--mdui-color-tertiary').trim()),
		],
		trigger: rgb(cs.getPropertyValue('--mdui-color-error').trim()),
		text: rgb(cs.getPropertyValue('--mdui-color-on-surface').trim()),
		muted: rgb(cs.getPropertyValue('--mdui-color-outline').trim()),
		panelBg: rgb(cs.getPropertyValue('--mdui-color-surface-container').trim()),
		peak: rgb(cs.getPropertyValue('--mdui-color-secondary').trim()),
	};
}

export interface Frame {
	ch: Record<ChannelId, Float32Array>;
	/** 当前实际启用的通道。关闭的通道不画波形、不画读数板条目。 */
	active: ChannelId[];
	vdiv: [number, number];
	sampleRate: number;
	measure: Record<ChannelId, Measurements>;
	spectra: Record<ChannelId, Spectrum>;
	view: ViewMode;
	triggerLevel: number | null;
	recording: { elapsedMs: number; slowFactor: number } | null;
	/** 导出截图时置 true，隐藏读数板 */
	hideReadouts?: boolean;
}

const CHANNELS: ChannelId[] = ['ch1', 'ch2'];

/** 按 devicePixelRatio 调整后备缓冲区，返回 CSS 像素下的宽高 */
export function sizeCanvas(canvas: HTMLCanvasElement): { w: number; h: number } {
	const rect = canvas.getBoundingClientRect();
	const dpr = Math.min(window.devicePixelRatio || 1, 3);
	const w = Math.max(320, Math.round(rect.width));
	const h = Math.max(220, Math.round(rect.height));
	if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
		canvas.width = w * dpr;
		canvas.height = h * dpr;
	}
	const ctx = canvas.getContext('2d');
	if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	return { w, h };
}

export function draw(canvas: HTMLCanvasElement, f: Frame, theme: Theme): void {
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	const { w, h } = sizeCanvas(canvas);
	ctx.clearRect(0, 0, w, h);

	if (f.view === 'fft') {
		drawFftFrame(ctx, w, h, f, theme);
	} else {
		drawGrid(ctx, w, h, theme);
		if (f.view === 'xy') drawXy(ctx, w, h, f, theme);
		else drawDual(ctx, w, h, f, theme);
		drawTriggerLine(ctx, w, h, f, theme);
	}

	if (!f.hideReadouts) drawReadouts(ctx, w, f, theme);
	if (f.recording) drawRecBadge(ctx, f.recording, theme);
}

// ---------------------------------------------------------------- 网格

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, t: Theme): void {
	const cw = w / DIVS_X;
	const ch = h / DIVS_Y;
	const mid = h / 2;

	ctx.lineWidth = 1;
	ctx.strokeStyle = t.grid;
	ctx.beginPath();
	for (let i = 1; i < DIVS_X; i++) {
		const x = Math.round(i * cw) + 0.5;
		ctx.moveTo(x, 0);
		ctx.lineTo(x, h);
	}
	for (let i = 1; i < DIVS_Y; i++) {
		const y = Math.round(i * ch) + 0.5;
		ctx.moveTo(0, y);
		ctx.lineTo(w, y);
	}
	ctx.stroke();

	ctx.strokeStyle = t.axis;
	ctx.beginPath();
	ctx.moveTo(0, Math.round(mid) + 0.5);
	ctx.lineTo(w, Math.round(mid) + 0.5);
	ctx.moveTo(Math.round(w / 2) + 0.5, 0);
	ctx.lineTo(Math.round(w / 2) + 0.5, h);
	ctx.stroke();
}

// ---------------------------------------------------------------- 双通道

function drawDual(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	f: Frame,
	t: Theme,
): void {
	const ch = h / DIVS_Y;
	const off = (CH_ZERO_OFFSET_DIV * ch) / 2;
	const mid = h / 2;
	const base: Record<ChannelId, number> = { ch1: mid - off, ch2: mid + off };

	CHANNELS.forEach((id, idx) => {
		// 关闭的通道不画：否则会在画布上留一条没有数据的零电平虚线
		if (!f.active.includes(id)) return;
		const y = base[id];
		const scale = (mid - off) / f.vdiv[idx];

		// 零电平虚线
		ctx.strokeStyle = t.axis;
		ctx.setLineDash([2, 4]);
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, Math.round(y) + 0.5);
		ctx.lineTo(w, Math.round(y) + 0.5);
		ctx.stroke();
		ctx.setLineDash([]);

		ctx.fillStyle = t.trace[idx];
		ctx.font = 'bold 10px ui-monospace, monospace';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'bottom';
		ctx.fillText(id.toUpperCase(), 5, y - 2);

		strokeSamples(ctx, f.ch[id], w, y, scale, t.trace[idx]);
	});
}

// ---------------------------------------------------------------- XY

function drawXy(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	f: Frame,
	t: Theme,
): void {
	const a = f.ch.ch1;
	const b = f.ch.ch2;
	const n = Math.min(a.length, b.length);
	if (n < 2) return;

	const size = Math.min(w, h) - 36;
	const ox = (w - size) / 2;
	const oy = (h - size) / 2;
	const c = size / 2;

	ctx.strokeStyle = t.axis;
	ctx.lineWidth = 1;
	ctx.strokeRect(ox + 0.5, oy + 0.5, size, size);
	ctx.setLineDash([2, 4]);
	ctx.beginPath();
	ctx.moveTo(ox, oy + c);
	ctx.lineTo(ox + size, oy + c);
	ctx.moveTo(ox + c, oy);
	ctx.lineTo(ox + c, oy + size);
	ctx.stroke();
	ctx.setLineDash([]);

	ctx.strokeStyle = t.trace[0];
	ctx.lineWidth = 1.5;
	ctx.lineJoin = 'round';
	ctx.beginPath();
	for (let i = 0; i < n; i++) {
		const x = ox + c + (a[i] / f.vdiv[0]) * c;
		const y = oy + c - (b[i] / f.vdiv[1]) * c;
		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	}
	ctx.stroke();

	ctx.fillStyle = t.muted;
	ctx.font = '11px system-ui, sans-serif';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';
	ctx.fillText('X = CH1', ox + 5, oy + 5);
	ctx.textBaseline = 'bottom';
	ctx.fillText('Y = CH2', ox + 5, oy + size - 5);
}

// ---------------------------------------------------------------- 频谱

function fftGeometry(w: number, h: number) {
	return {
		top: 26,
		gx0: 44,
		gx1: w - 10,
		gh: h - 26 - 28,
	};
}

function drawFftFrame(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	f: Frame,
	t: Theme,
): void {
	const { top, gx0, gx1, gh } = fftGeometry(w, h);
	const sr = f.sampleRate;
	const fMin = 100;
	const fMax = Math.min(sr / 2, 20000);
	if (fMax <= fMin) return;

	const logMin = Math.log10(fMin);
	const logMax = Math.log10(fMax);
	const xOf = (hz: number) =>
		gx0 + ((Math.log10(Math.max(hz, fMin)) - logMin) / (logMax - logMin)) * (gx1 - gx0);

	ctx.lineWidth = 1;

	// 纵轴网格：每 20 dB 一格
	ctx.strokeStyle = t.grid;
	ctx.fillStyle = t.muted;
	ctx.font = '10px system-ui, sans-serif';
	ctx.textAlign = 'right';
	ctx.textBaseline = 'middle';
	for (let db = DB_CEIL; db >= DB_FLOOR; db -= 20) {
		const y = top + ((DB_CEIL - db) / (DB_CEIL - DB_FLOOR)) * gh;
		ctx.beginPath();
		ctx.moveTo(gx0, Math.round(y) + 0.5);
		ctx.lineTo(gx1, Math.round(y) + 0.5);
		ctx.stroke();
		ctx.fillText(`${db}`, gx0 - 6, y);
	}

	// 横轴网格：100Hz 到 20kHz 的十倍频程
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	for (const f0 of [100, 1000, 10000]) {
		if (f0 > fMax) break;
		const x = xOf(f0);
		ctx.strokeStyle = t.grid;
		ctx.beginPath();
		ctx.moveTo(Math.round(x) + 0.5, top);
		ctx.lineTo(Math.round(x) + 0.5, top + gh);
		ctx.stroke();
		ctx.fillStyle = t.muted;
		ctx.fillText(f0 >= 1000 ? `${f0 / 1000}kHz` : `${f0}Hz`, x, top + gh + 5);
	}

	ctx.fillStyle = t.muted;
	ctx.font = '10px system-ui, sans-serif';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	ctx.fillText('dB', 6, top - 8);

	// 频谱曲线
	CHANNELS.forEach((id, idx) => {
		const s = f.spectra[id];
		if (!s || !f.active.includes(id)) return;
		const yOf = (db: number) =>
			top + ((DB_CEIL - Math.max(db, DB_FLOOR)) / (DB_CEIL - DB_FLOOR)) * gh;

		ctx.strokeStyle = t.trace[idx];
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		let started = false;
		let peakHz = 0;
		let peakDb = -Infinity;
		for (let i = 1; i < s.bins; i++) {
			const hz = s.freq[i];
			if (hz < fMin) continue;
			if (hz > fMax) break;
			const x = xOf(hz);
			const y = yOf(s.db[i]);
			if (!started) {
				ctx.moveTo(x, y);
				started = true;
			} else ctx.lineTo(x, y);
			if (hz >= fMin && s.db[i] > peakDb) {
				peakDb = s.db[i];
				peakHz = hz;
			}
		}
		ctx.stroke();

		ctx.fillStyle = t.trace[idx];
		ctx.font = '10px ui-monospace, monospace';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		ctx.fillText(
			`${id.toUpperCase()} 峰值 ${fmtFrequency(peakHz)} / ${peakDb.toFixed(1)} dB`,
			gx0 + 6,
			top + 4 + idx * 14,
		);
	});

	ctx.fillStyle = t.muted;
	ctx.font = '10px system-ui, sans-serif';
	ctx.textAlign = 'right';
	ctx.textBaseline = 'bottom';
	ctx.fillText(
		`分辨率 ${f.spectra.ch1?.resolution.toFixed(1) ?? '—'} Hz（补零不提高真实分辨率）`,
		gx1,
		top - 8,
	);
}

// ---------------------------------------------------------------- 公共叠加

function drawTriggerLine(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	f: Frame,
	t: Theme,
): void {
	if (f.view !== 'dual' || f.triggerLevel === null) return;
	const ch = h / DIVS_Y;
	const off = (CH_ZERO_OFFSET_DIV * ch) / 2;
	const y = h / 2 - off + (f.triggerLevel / f.vdiv[0]) * (h / 2 - off);
	if (y <= 0 || y >= h) return;

	ctx.save();
	ctx.strokeStyle = t.trigger;
	ctx.setLineDash([6, 5]);
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(0, Math.round(y) + 0.5);
	ctx.lineTo(w, Math.round(y) + 0.5);
	ctx.stroke();
	ctx.restore();

	ctx.fillStyle = t.trigger;
	ctx.font = '10px ui-monospace, monospace';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'bottom';
	ctx.fillText(`触发 ${f.triggerLevel.toFixed(2)}`, 5, y > 12 ? y - 3 : y + 12);
}

function drawReadouts(
	ctx: CanvasRenderingContext2D, w: number, f: Frame, t: Theme): void {
	// XY 视图下画布是李萨如图，时域读数与画面无关，不要误导
	if (f.view === 'xy' || f.view === 'fft') return;

	const pad = 8;
	const lineH = 13;
	// 每通道两行：主行带通道名（用通道色），副行是次要指标（灰）
	const rows: { text: string; color: string }[] = [];
	for (const id of CHANNELS) {
		const m = f.measure[id];
		// 关闭的通道不列：CH2 关着时却显示一行 pp 0 V 是纯粹的误导
		if (!m || !f.active.includes(id)) continue;
		const color = t.trace[id === 'ch1' ? 0 : 1];
		rows.push({
			color,
			text: `${id.toUpperCase()}  ${fmtFrequency(m.frequency)} · pp ${fmt(m.pp, 'V', 3)} · Vrms ${fmt(m.rms, 'V', 3)}`,
		});
		rows.push({
			color: t.muted,
			text: `        占空 ${m.duty === null ? '—' : `${(m.duty * 100).toFixed(0)}%`} · 偏 ${fmt(m.offset, 'V', 3)}`,
		});
	}
	if (!rows.length) return;

	ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
	const texts = rows.map((r) => r.text);
	const boxW = Math.max(...texts.map((s) => ctx.measureText(s).width)) + pad * 2;
	const boxH = texts.length * lineH + pad * 2 - 3;

	ctx.fillStyle = t.panelBg;
	ctx.globalAlpha = 0.86;
	roundRect(ctx, w - boxW - 8, 8, boxW, boxH, 7);
	ctx.fill();
	ctx.globalAlpha = 1;

	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';
	rows.forEach((r, i) => {
		ctx.fillStyle = r.color;
		ctx.fillText(r.text, w - boxW, 8 + pad + i * lineH);
	});
}

function drawRecBadge(
	ctx: CanvasRenderingContext2D,
	rec: { elapsedMs: number; slowFactor: number },
	t: Theme,
): void {
	const s = Math.floor(rec.elapsedMs / 1000);
	const clock = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
	const text = `● 录制 ${clock} · ${rec.slowFactor.toFixed(1)}× 慢放`;

	ctx.font = '11px ui-monospace, monospace';
	const bw = ctx.measureText(text).width + 18;
	ctx.fillStyle = t.trigger;
	roundRect(ctx, 8, 8, bw, 20, 6);
	ctx.fill();
	ctx.fillStyle = '#fff';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, 17, 19);
}

// ---------------------------------------------------------------- 波形

function strokeSamples(
	ctx: CanvasRenderingContext2D,
	samples: Float32Array,
	w: number,
	base: number,
	scale: number,
	color: string,
): void {
	const n = samples.length;
	if (n < 2) return;

	ctx.strokeStyle = color;
	ctx.lineWidth = 1.6;
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';

	if (n <= w) {
		ctx.beginPath();
		for (let i = 0; i < n; i++) {
			const x = (i / (n - 1)) * w;
			const y = base - samples[i] * scale;
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();
		return;
	}

	// 采样远多于像素：压成每像素 min/max 竖线，保留毛刺与过冲
	const perPx = n / w;
	ctx.beginPath();
	for (let px = 0; px < w; px++) {
		const a = Math.floor(px * perPx);
		const b = Math.min(n, Math.floor((px + 1) * perPx));
		if (b <= a) continue;
		let lo = Infinity;
		let hi = -Infinity;
		for (let i = a; i < b; i++) {
			if (samples[i] < lo) lo = samples[i];
			if (samples[i] > hi) hi = samples[i];
		}
		const x = Math.round(px) + 0.5;
		ctx.moveTo(x, base - hi * scale);
		ctx.lineTo(x, base - lo * scale);
	}
	ctx.stroke();
}

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
): void {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}
