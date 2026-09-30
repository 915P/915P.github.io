/**
 * 进制转换
 *
 * 覆盖整数与小数的任意进制互转。整数用 BigInt 累乘（不会因为超过
 * Number.MAX_SAFE_INTEGER 而丢精度），小数用「反复乘基数取整数部分」。
 *
 * 小数的转换在二进制里不终止（如 0.1），必须按有效位数截断，
 * 所以这里统一保留 `precision` 位并在界面上说明是近似值。
 */

/** 允许的最大进制：36 位（0-9A-Z），够覆盖常用场景又不至于让 UI 失控 */
export const MAX_RADIX = 36;
export const MIN_RADIX = 2;

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function parseRadix(v: string): number {
	const n = Number.parseInt(v, 10);
	if (!Number.isFinite(n)) throw new Error('进制必须是整数');
	return Math.min(MAX_RADIX, Math.max(MIN_RADIX, n));
}

/** 把 0..35 的数值转成显示用字符 */
function digitChar(n: number): string {
	return DIGITS[n] ?? '?';
}

/**
 * 去掉用户输入里的分隔符。
 *
 * 需求是「自动忽略输入空格」，这里连同下划线、逗号、全角空格一起忽略，
 * 因为用户从别处粘贴常带这些。全角数字也会归一化成半角。
 */
export function cleanInput(raw: string): string {
	let s = raw.normalize('NFKC'); // 全角 → 半角
	s = s.replace(/[\s_,]/g, '');
	return s.trim();
}

export interface ConvertOptions {
	/** 小数部分保留的有效位数（二进制下 0.1 这类会不终止，取前 N 位） */
	precision?: number;
	/** 输出是否插入分组空格/下划线 */
	group?: boolean;
	/** 分组大小，默认 4；group 为 'underscore' 时用 '_' 分隔 */
	groupSep?: 'space' | 'underscore';
}

/** 按指定宽度从右往左分组，如 1101 1010 → 1101 1010（8 位一组） */
export function groupDigits(digits: string, size = 4, sep = ' '): string {
	if (size <= 0) return digits;
	const out: string[] = [];
	let rest = digits;
	while (rest.length > size) {
		out.unshift(rest.slice(-size));
		rest = rest.slice(0, -size);
	}
	if (rest.length) out.unshift(rest);
	return out.join(sep);
}

/** 校验输入是否是该进制下的合法数字（允许一个小数点、可有正负号） */
export function validate(digits: string, radix: number): string | null {
	if (!digits) return '请输入数值';
	const body = digits.replace(/^[+-]/, '');
	if (!body) return '请输入数值';
	if ((body.match(/\./g) ?? []).length > 1) return '只能有一个小数点';
	const upper = body.toUpperCase();
	for (const ch of upper) {
		if (ch === '.') continue;
		if (DIGITS.indexOf(ch) < 0) return `「${ch}」不是有效字符`;
		if (DIGITS.indexOf(ch) >= radix) return `「${ch}」超出 ${radix} 进制（最大 ${digitChar(radix - 1)}）`;
	}
	return null;
}

/** 整数字符串 → BigInt */
export function intPart(digits: string, radix: number): bigint {
	let v = 0n;
	const B = BigInt(radix);
	for (const ch of digits) {
		if (ch === '.') break;
		const d = DIGITS.indexOf(ch.toUpperCase());
		if (d < 0) continue;
		v = v * B + BigInt(d);
	}
	return v;
}

/** BigInt → 目标进制字符串（不带小数点） */
export function toRadix(v: bigint, radix: number): string {
	if (v === 0n) return '0';
	const B = BigInt(radix);
	let neg = false;
	if (v < 0n) {
		neg = true;
		v = -v;
	}
	let out = '';
	while (v > 0n) {
		out = digitChar(Number(v % B)) + out;
		v /= B;
	}
	return neg ? '-' + out : out;
}

export interface Converted {
	/** 整部分 */
	int: string;
	/** 小数部分的字符序列 */
	frac: string[];
	/** 是否因达到精度上限而截断（即结果是近似值） */
	truncated: boolean;
}

/**
 * 把 digits（源进制）转成目标进制 radix。
 *
 * 小数部分反复乘目标进制取整数位，最多 precision 位；
 * 若源小数在该进制下不终止（典型是二进制下的 0.1）则截断并标记 truncated。
 */
export function convert(digits: string, from: number, to: number, precision = 16): Converted {
	const neg = digits.startsWith('-');
	const body = digits.replace(/^[+-]/, '');
	const dot = body.indexOf('.');

	const intDigits = dot < 0 ? body : body.slice(0, dot);
	const fracSrc = dot < 0 ? '' : body.slice(dot + 1);

	const i = intPart(intDigits, from);
	let intStr = toRadix(i, to);

	const fracOut: string[] = [];
	let truncated = false;

	if (fracSrc) {
		// 逐位生成：rem 表示尚未消费的小数余数
		let rem = 0n;
		const B = BigInt(from);
		for (const ch of fracSrc) {
			const d = DIGITS.indexOf(ch.toUpperCase());
			if (d >= 0) rem = rem * B + BigInt(d);
		}
		const denom = BigInt(from) ** BigInt(fracSrc.length);

		for (let k = 0; k < precision; k++) {
			rem *= BigInt(to);
			const d = rem / denom;
			rem %= denom;
			fracOut.push(digitChar(Number(d)));
			if (rem === 0n) break;
			if (k === precision - 1) truncated = true;
		}
	}

	if (neg && (intStr !== '0' || fracOut.some((c) => c !== '0'))) {
		intStr = '-' + intStr;
	}
	return { int: intStr, frac: fracOut, truncated };
}

/** 分组宽度固定 4：与位运算里习惯的四位一组一致 */
const GROUP_SIZE = 4;

/** 组装成完整字符串；truncated 时末尾加省略号表示这是近似值 */
export function format(v: Converted, opts: ConvertOptions = {}): string {
	const { group = false, groupSep = 'space' } = opts;
	const sep = groupSep === 'underscore' ? '_' : ' ';

	let s = v.int;
	if (v.frac.length) {
		const frac = v.frac.join('');
		s += '.' + (group ? groupDigits(frac, GROUP_SIZE, sep) : frac);
	}
	if (v.truncated) s += s.includes('.') ? '…' : '.…';
	if (group && !s.includes('.')) s = groupDigits(s, GROUP_SIZE, sep);
	return s;
}