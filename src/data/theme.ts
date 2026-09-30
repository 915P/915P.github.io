/**
 * 外观设置的可选值
 *
 * 主题色只给出**种子色**（一个 hex），由 mdui 的 setColorScheme() 生成整套
 * MD3 色调板（primary/secondary/tertiary 及其 container、on-* 变体）。
 * 不要试图手写每组色值 —— MD3 的色调映射有明确算法，手写无法保持
 * 对比度与容器色关系。
 *
 * 第一个色值必须与 global.css 里 :root 的 MD3 基色一致（indigo 40/80），
 * 它同时是「跟随站点默认」的目标值。
 */

export const THEME_MODES = [
	{ value: 'auto', label: '跟随系统' },
	{ value: 'light', label: '浅色' },
	{ value: 'dark', label: '深色' },
] as const;

export type ThemeMode = (typeof THEME_MODES)[number]['value'];

export const THEME_COLORS = [
	{ value: '#66ccff', label: '天蓝（默认）' },
	{ value: '#00696e', label: '深青' },
	{ value: '#39c5bb', label: '薄荷' },
	{ value: '#00ffcc', label: '荧光青' },
	{ value: '#3d6473', label: '灰蓝' },
	{ value: '#546ecc', label: '靛蓝' },
	{ value: '#5b5f97', label: '紫罗兰' },
	{ value: '#7d5260', label: '玫瑰' },
	{ value: '#ee0000', label: '正红' },
	{ value: '#8f4d38', label: '赭红' },
	{ value: '#8a5800', label: '琥珀' },
	{ value: '#3f6837', label: '苔绿' },
] as const;

export const DEFAULT_COLOR = THEME_COLORS[0].value;

export const STORAGE_KEYS = {
	mode: '915p-theme-mode',
	color: '915p-theme-color',
} as const;
