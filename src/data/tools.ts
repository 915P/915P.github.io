export type ToolStatus = 'live' | 'app' | 'resource' | 'planned';

export type ToolCategory = '高程' | '工具' | '开发' | '影音' | '资源';

export interface Tool {
	slug: string;
	name: string;
	desc: string;
	/** @mdui/icons 的组件名，如 'calculate' → <mdui-icon-calculate> */
	icon: string;
	category: ToolCategory;
	status: ToolStatus;
	/** 内置 Astro 页面路径；原生应用为 public 下的静态路径 */
	href: string;
}

export interface Category {
	key: ToolCategory;
	label: string;
	/** 该分类的 MD3 配色角色 */
	tone: 'primary' | 'secondary' | 'tertiary';
}

/** 内置（.astro）工具：直接渲染为页面 */
export const builtinTools: Tool[] = [
	{
		slug: 'radix',
		name: '进制转换',
		desc: '2/8/10/16 与自定义进制互转，支持小数',
		icon: 'swap-horiz',
		category: '高程',
		status: 'live',
		href: '/tools/radix/',
	},
	{
		slug: 'hanzi',
		name: '汉字编码',
		desc: '汉字在 GB2312 / GBK / GB18030 / UTF-8 / Big5 下的字节与 Unicode 码点',
		icon: 'translate',
		category: '高程',
		status: 'live',
		href: '/tools/hanzi/',
	},
	{
		slug: 'memview',
		name: '数据在内存',
		desc: '整型与浮点数的位模式、内存字节与规约化步骤',
		icon: 'memory',
		category: '高程',
		status: 'live',
		href: '/tools/memview/',
	},
	{
		slug: 'stackcalc',
		name: 'C/C++ 表达式求值',
		desc: '用双栈逐步演示算术、关系、逻辑与位运算表达式的计算过程',
		icon: 'functions',
		category: '高程',
		status: 'live',
		href: '/tools/stackcalc/',
	},
	{
		slug: 'bmi',
		name: 'BMI 计算器',
		desc: '输入身高体重，算出 BMI 与健康区间',
		icon: 'monitor-weight',
		category: '工具',
		status: 'live',
		href: '/tools/bmi/',
	},
	{
		slug: 'calculator',
		name: '智能计算器',
		desc: '支持四则运算与括号，不使用 eval',
		icon: 'calculate',
		category: '工具',
		status: 'live',
		href: '/tools/calculator/',
	},
	{
		slug: 'pinyin',
		name: '汉字转拼音',
		desc: '中文转拼音，支持多音字与声调',
		icon: 'translate',
		category: '工具',
		status: 'live',
		href: '/tools/pinyin/',
	},
	{
		slug: 'morse',
		name: '摩尔斯与中文电码',
		desc: '摩尔斯互转、音频发报，支持《标准电码本》中文四码',
		icon: 'graphic-eq',
		category: '工具',
		status: 'live',
		href: '/tools/morse/',
	},
	{
		slug: 'barcode',
		name: '条码 / 二维码',
		desc: 'QR 码与 20 种一维条码，可下载 SVG/PNG',
		icon: 'qr-code-scanner',
		category: '工具',
		status: 'live',
		href: '/tools/barcode/',
	},
	{
		slug: 'fonttest',
		name: '字体测试',
		desc: '5 种字体族 × 11 档字重，另含 33 组 Unicode 符号覆盖',
		icon: 'font-download',
		category: '工具',
		status: 'live',
		href: '/tools/fonttest/',
	},
	{
		slug: 'editor',
		name: 'HTML 在线编辑器',
		desc: '边写边预览，渲染在沙箱 iframe 中',
		icon: 'code',
		category: '开发',
		status: 'live',
		href: '/tools/editor/',
	},
	{
		slug: 'latex',
		name: 'LaTeX 编辑器',
		desc: '输入 TeX 公式，实时渲染为排版结果',
		icon: 'functions',
		category: '开发',
		status: 'live',
		href: '/tools/latex/',
	},
	{
		slug: 'pdf',
		name: 'PDF 工具箱',
		desc: '合并、拆分、页面管理与图片转 PDF，全部本地完成',
		icon: 'picture-as-pdf',
		category: '工具',
		status: 'live',
		href: '/tools/pdf/',
	},
	{
		slug: 'mindmap',
		name: '思维导图',
		desc: 'My Mind 开源思维导图编辑器',
		icon: 'account-tree',
		category: '开发',
		status: 'app',
		href: '/apps/mindmap/index.html',
	},
	{
		slug: 'cejs',
		name: '纪年转换',
		desc: '原版 CeJS 完整功能：农历、天文历法、批量转换、线图下钻与数据图层',
		icon: 'calendar-month',
		category: '开发',
		status: 'live',
		href: '/tools/cejs/',
	},
	{
		slug: 'oscope',
		name: '示波器',
		desc: '触发稳定的实时示波器，自动测量频率、峰峰值与有效值',
		icon: 'graphic-eq',
		category: '影音',
		status: 'live',
		href: '/tools/oscope/',
	},
	{
		slug: '3dweb',
		name: '3D 流体模拟',
		desc: 'WebGL 实时流体演算',
		icon: 'water-drop',
		category: '影音',
		status: 'app',
		href: '/apps/3dweb/index.html',
	},
];

/*
	分类顺序即页面呈现顺序（categories 数组在最前）。
	「高程作业小工具」按需求置顶。
	注意：tone 决定卡片配色，四个分类要互不相同，全用 tertiary 会失去区分度，
	所以新增分类时从 primary/secondary/tertiary 里挑一个还没用过的。
*/
export const categories: Category[] = [
	{ key: '高程', label: '高程作业小工具', tone: 'secondary' },
	{ key: '工具', label: '在线工具', tone: 'primary' },
	{ key: '开发', label: '开发', tone: 'tertiary' },
	{ key: '影音', label: '影音', tone: 'primary' },
];

export const allTools: Tool[] = builtinTools;

export const statusLabel: Record<Tool['status'], string> = {
	live: '在线',
	app: '应用',
	resource: '资源',
	planned: '规划中',
};
