/**
 * 国际摩尔斯电码表与符号风格
 *
 * TABLE 同时被构建期（渲染对照表）和运行期（转换、发报）使用，
 * 所以单独放一份，前端与页面模板共用，避免两处不同步。
 */

export const TABLE: Record<string, string> = {
	A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.',
	H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.',
	O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-',
	V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
	'0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
	'5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
	'.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--', '/': '-..-.',
	'@': '.--.-.', '-': '-....-', ':': '---...', '=': '=-...=', '(': '-.--.',
	')': '-.--.-', "'": '.----.', ';': '-.-.-.', '+': '.-.-.', '_': '..--.-',
	'"': '.-..-.', '$': '...-..-', '&': '.-...', '°': '---.-', 'À': '.--.-',
};

export const STYLES = [
	{ value: 'ascii', label: '标准 .-', dot: '.', dash: '-' },
	{ value: 'unicode', label: '圆点短划 •–', dot: '•', dash: '–' },
	{ value: 'cjk', label: '中文点划 ·－', dot: '·', dash: '－' },
] as const;

export type StyleValue = (typeof STYLES)[number]['value'];

/** 电码 → 字符的反查表（后写的覆盖先写的，取首个即可） */
export const REV: Record<string, string> = Object.fromEntries(
	Object.entries(TABLE).map(([k, v]) => [v, k]),
);

/**
 * 所有等价写法的折叠表。
 *
 * 解析时必须先把用户可能粘进来的各种点划写法统一成标准 .-，
 * 否则人家贴一串「• –」进来就全是问号。dash 的全角/破折号/减号/
 * 日文长音符一并收进来。
 */
const FOLD: Record<string, string> = {
	'.': '.', '•': '.', '·': '.', '‧': '.', '∙': '.',
	'-': '-', '–': '-', '—': '-', '－': '-', '−': '-', 'ー': '-',
};

/** 把任意风格写法折叠成标准 .- */
export function normalize(input: string): string {
	let out = '';
	for (const ch of input) out += FOLD[ch] ?? ch;
	return out;
}

/** 按指定风格把标准 .- 渲染成点划 */
export function format(code: string, style: StyleValue): string {
	const s = STYLES.find((x) => x.value === style) ?? STYLES[0];
	return normalize(code).replace(/\./g, s.dot).replace(/-/g, s.dash);
}

/**
 * 中文电码查表的最小接口。
 *
 * 传进来就能让 encode/decode 支持中文：中文先查四位商用电码，
 * 再把四位数字各自转成摩尔斯。这样「中文」与「拉丁/数字」
 * 共用一条链路，不需要为中文单开一个界面。
 */
export interface TelegraphResolver {
	charToCode(ch: string): string | null;
	codeToChar(code: string): string | null;
}

/** 中文（以及任何非拉丁字符）在此范围内才尝试查电码 */
function isCjk(ch: string): boolean {
	const c = ch.codePointAt(0)!;
	return c >= 0x2e80 && c <= 0x9fff;
}

/** 取一个字符的摩尔斯；中文经四码展开成 4 个数字的摩尔斯。 */
function charToMorse(ch: string, tc?: TelegraphResolver | null): string | null {
	const upper = ch.toUpperCase();
	const direct = TABLE[upper];
	if (direct) return direct;

	if (tc && isCjk(ch)) {
		const code = tc.charToCode(ch);
		if (!code) return null;
		// 四码每位都是一个数字，数字的摩尔斯在 TABLE 里
		return [...code].map((d) => TABLE[d]!).join(' ');
	}
	return null;
}

/** 文字 → 电码串。空格转成 / 分词符，未收录字符记为 ?。 */
export function encodeText(
	text: string,
	style: StyleValue,
	tc?: TelegraphResolver | null,
): string {
	return text
		.split('')
		.map((ch) => {
			if (ch === ' ') return ' / ';
			if (ch === '\n') return ' // ';
			const code = charToMorse(ch, tc);
			return code ? format(code, style) : ' ?';
		})
		.join('  ');
}

/**
 * 电码串 → 文字。
 *
 * 先按 / 切词、词内按空白切音符，得到含数字的文本；
 * 若给了 tc，再把**连续 4 位数字**当作中文电码解释回汉字。
 * 这一步能成立是因为数字的摩尔斯恰好都是 5 个符号，四位数字 = 20 个符号，
 * 与相邻字符不会互相粘连。
 */
export function decodeText(coded: string, tc?: TelegraphResolver | null): string {
	const text = normalize(coded)
		.trim()
		.split(/\s*\/\s*/)
		.map((word) =>
			word
				.split(/\s+/)
				.filter(Boolean)
				.map((t) => REV[t] ?? '?')
				.join(''),
		)
		.filter(Boolean)
		.join(' ');

	if (!tc) return text;

	/*
	 * 摩尔斯解码后，同一个「词」里的符号是无分隔拼接的，所以
	 * 「中文」的 8 个数字会连成 `00222429` 而不是两个 `0022 2429`。
	 * 因此不能只匹配整等于 4 位的 token —— 那永远匹配不上。
	 *
	 * 正确做法：把每段里连续的**数字串**取出来，长度是 4 的倍数就按 4 切块
	 * 逐块查表；不是 4 的倍数（例如年份 2026）说明不是电码，原样保留。
	 * 这也正是「把 4 位数字组按中文电码解释」这个开关存在的原因 ——
	 * 摩尔斯本身无法区分「2026」和两个电码字。
	 */
	return text
		.split(/\s+/)
		.map((tok) =>
			tok.replace(/\d+/g, (run) => {
				if (run.length % 4 !== 0) return run;
				let out = '';
				for (let i = 0; i < run.length; i += 4) {
					const code = run.slice(i, i + 4);
					out += tc.codeToChar(code) ?? code;
				}
				return out;
			}),
		)
		.join(' ');
}

/** 取一段文字里各字对应的四位电码，用于在界面上说明「这个字变成了哪四码」。 */
export function telegraphOf(text: string, tc: TelegraphResolver): (string | null)[] {
	return [...text]
		.filter((ch) => ch !== ' ' && ch !== '\n')
		.map((ch) => (isCjk(ch) ? tc.charToCode(ch) : null));
}

/**
 * 排出发报时间表（单位：秒，相对起点）。
 *
 * PARIS 标准：点 1 单位、划 3 单位、符内间隔 1、符间 3、词间 7。
 * 一个单位 = 1200 / WPM 毫秒 —— 20 WPM 时是 60ms，即 PARIS 恰好传 3 秒。
 */
export function buildPlan(
	text: string,
	wpm: number,
): { at: number; dur: number | null }[] {
	const u = 1200 / Math.max(1, wpm) / 1000;
	const plan: { at: number; dur: number | null }[] = [];
	let t = 0;

	for (const ch of normalize(text)) {
		if (ch === ' ' || ch === '/') {
			t += 7 * u;
			continue;
		}
		const code = TABLE[ch.toUpperCase()];
		if (!code) {
			t += 3 * u;
			continue;
		}
		for (const sym of code) {
			const dur = sym === '.' ? u : 3 * u;
			plan.push({ at: t, dur });
			t += dur + u; // 符内间隔 1
		}
		t += 2 * u; // 上面已补 1，这里再补 2，凑满符间 3
	}
	return plan;
}

export function planDuration(plan: { at: number; dur: number | null }[], wpm: number): number {
	if (!plan.length) return 0;
	const u = 1200 / Math.max(1, wpm) / 1000;
	const last = plan[plan.length - 1];
	return last.at + (last.dur ?? u) + u;
}
