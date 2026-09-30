/**
 * 数据在内存：整数与浮点数的位模式
 *
 * 浮点部分严格按教材/习题给定的**规约化步骤**输出（步骤 a–h），
 * 而不是简单调一次 DataView 取字节 —— 那样虽然结果对，但看不到
 * 「整数部分 / 小数部分 / 规约化 / 指数 / 符号 / 指数位 / 尾数位」
 * 这些考试要填的中间量。
 *
 * 步骤与 IEEE 754 的对应：
 *   a) 二进制整数部分
 *   b) 二进制小数部分（有效位满足要求即停）
 *   c) a + b 合起来的完整二进制表示
 *   d) 规约化：小数点后保留 23 位，第 24 位 0 舍 1 入；得出阶码
 *   e) 符号位（1 位）
 *   f) 指数位（8 位，阶码 + 偏置 127）
 *   g) 尾数位（23 位，省略隐含的首位 1）
 *   h) 4 个字节的十六进制（高字节在前）
 */

export type IntKind = 'short' | 'int' | 'long' | 'longlong' | 'long';
export type FloatKind = 'float' | 'double';

export interface IntSpec {
	label: string;
	bytes: number;
	/** 该类型在 JavaScript 里没有对应写法时说明 */
	note?: string;
}

export const INT_KINDS: Record<IntKind, IntSpec> = {
	short: { label: 'short', bytes: 2 },
	int: { label: 'int', bytes: 4 },
	long: { label: 'long', bytes: 4, note: 'Windows / 32 位下占 4 字节' },
	longlong: { label: 'long long', bytes: 8 },
};

/** long 按平台宽度不同，单列出来让用户选 */
export const LONG_WIDTHS = [4, 8] as const;
export type LongWidth = (typeof LONG_WIDTHS)[number];

export interface FloatSpec {
	label: string;
	bytes: number;
	expBits: number;
	mantBits: number;
	/** 偏置值 = 2^(expBits-1) - 1 */
	bias: number;
}

export const FLOAT_KINDS: Record<FloatKind, FloatSpec> = {
	float: { label: 'float', bytes: 4, expBits: 8, mantBits: 23, bias: 127 },
	double: { label: 'double', bytes: 8, expBits: 11, mantBits: 52, bias: 1023 },
};

/** ArrayBuffer 的字节 → 二进制串 */
function binOf(buf: ArrayBuffer): string {
	return [...new Uint8Array(buf)].map((b) => b.toString(2).padStart(8, '0')).join('');
}

/**
 * 检测浮点输入是否因目标类型精度/范围而发生截断。
 *
 * JS 只能先解析成 double，所以：
 *   - float：再用 `Math.fround()` 模拟真实的 float32 舍入；
 *   - double：`Number()` 已到 double 精度，输入 1e309 会直接得到 ±∞。
 *
 * 返回的 note 说明会被截断为什么；仅在「存不进目标类型」时返回，
 * 正常的十进制舍入（例如 0.1 无法精确表示）不会触发提示。
 */
export function detectOverflow(raw: string, kind: FloatKind): FloatResult['overflow'] {
const t = raw.trim();
if (t === '') return undefined;
const n = Number(t);
if (Number.isNaN(n)) return undefined;

const spec = FLOAT_KINDS[kind];

// 字面量本身就是 0（如 0、-0、0.0e-400）才能精确表示；
// 像 1e-400 这样的非零小数会被 JS 直接下溢成 0，需要提示。
const zeroLiteral = /^[+-]?0*(?:\.0*)?(?:e[+-]?\d+)?$/i.test(t);
if (n === 0) {
if (zeroLiteral) return undefined;
const neg = t.startsWith('-');
return {
to: neg ? '−0' : '0',
note: `小于 ${spec.label} 最小次正规数，下溢为${neg ? '负' : '正'}零`,
};
}

const actual = kind === 'float' ? Math.fround(n) : n;

if (!Number.isFinite(actual)) {
const neg = n < 0 || Object.is(n, -0);
return {
to: neg ? '−∞' : '+∞',
note: `超出 ${spec.label} 可表示范围，按 IEEE 754 舍入为${neg ? '负' : '正'}无穷`,
};
}

if (actual === 0) {
const neg = n < 0 || Object.is(n, -0);
return {
to: neg ? '−0' : '0',
note: `小于 ${spec.label} 最小次正规数，下溢为${neg ? '负' : '正'}零`,
};
}

// 次正规数：可以存，但没有隐含的首位 1，教材的 a)–h) 流程不适用。
if (spec.expBits === 8 && Math.abs(actual) < 1.1754943508222875e-38) {
return {
to: '次正规数',
note: `小于 ${spec.label} 最小规格化数，落入次正规区间（尾数没有隐含的首位 1）`,
};
}
if (spec.expBits === 11 && Math.abs(actual) < 2.2250738585072014e-308) {
return {
to: '次正规数',
note: `小于 ${spec.label} 最小规格化数，落入次正规区间（尾数没有隐含的首位 1）`,
};
}

return undefined;
}

export interface Field {
	title: string;
	value: string;
	desc: string;
	/** 需要按 HTML 渲染的数学形式（数字与上下标由本文件生成，安全） */
	html?: string;
}

/* ------------------------------------------------------------------ */
/* 整数                                                                */
/* ------------------------------------------------------------------ */

/**
 * 有符号整数的补码位模式。
 *
 * JS 的位运算按 32 位截断，64 位必须用 BigInt。
 */
export function intBits(value: bigint, bytes: number, signed: boolean): string {
	const bits = BigInt(bytes) * 8n;
	const unsigned = signed && value < 0n ? (1n << bits) + value : value & ((1n << bits) - 1n);
	return unsigned.toString(2).padStart(Number(bits), '0');
}

export function intFields(value: bigint, bytes: number, signed: boolean): Field[] {
	const bits = intBits(value, bytes, signed);
	const label = signed ? '有符号' : '无符号';
	return [
		{ title: '十进制', value: value.toString(), desc: `${bytes * 8} 位 ${label}` },
		{ title: '二进制', value: bits, desc: '高位补零至完整宽度' },
		{ title: '十六进制', value: bytesHexPrefixed(bits), desc: '每字节一个 0x 前缀的十六进制数' },
		{ title: '字节数', value: `${bytes}`, desc: `${bytes * 8} 位` },
	];
}

/** 按字节把二进制串转成带 0x 前缀的十六进制 */
export function bytesHex(bits: string): string {
	return bytesHexPrefixed(bits);
}

/* ------------------------------------------------------------------ */
/* 浮点：按 a)–h) 逐步输出                                               */
/* ------------------------------------------------------------------ */

/*
	小数部分要取多少位？

	两个约束：
	1. 题目只要求「有效位满足要求则停止」（float 24 位、double 53 位），
	   但 d) 步要看**第 25 / 54 位**才能决定 0 舍 1 入 —— 只生成有效位那么
	   多个，那一位不存在，0.1 的尾数会被截成 …CC C8 而不是 …CC CD。
	2. 首个 1 出现的位置不固定。1e-40 的第一个 1 在小数第 133 位，
	   固定取 72 位会一个 1 都找不到，阶码随之算错。
	所以：先一直乘 2 直到出现首个 1，再额外取够「尾数 + 进位 + 1」位。
	上限 1100 位，覆盖 double 的最小正规数 2⁻¹⁰²² 所需。
*/
const MAX_FRAC_DIGITS = 1100;

function fracBinary(fraction: number, needAfterFirst: number): { bits: string; exact: boolean } {
	let bits = '';
	let f = fraction;
	let firstOneAt = -1;
	for (let i = 0; i < MAX_FRAC_DIGITS; i++) {
		f *= 2;
		if (f >= 1) {
			bits += '1';
			f -= 1;
			if (firstOneAt < 0) firstOneAt = i;
			// 已有首个 1，且其后位数够判进位，就可以停
			if (i - firstOneAt >= needAfterFirst) return { bits, exact: false };
		} else {
			bits += '0';
		}
		if (f === 0) return { bits, exact: true };
	}
	return { bits, exact: false };
}

export interface Segment {
	label: string;
	bits: string;
	/** 该段占的显示位宽（含分组用的空格不算） */
	width: number;
	/** 可选备注，例如指数移码值 */
	note?: string;
}

export interface FloatResult {
	fields: Field[];
	/**
	 * 「大总结果」：把 32/64 位按 IEEE 的字段分段拼成一行，
	 * 供界面上色。空格只是分组分隔，不属于位。
	 */
	segments: Segment[];
	/** 是否因为超出类型范围而被截断 */
	overflow?: { to: string; note: string };
	/** 浮点数是否可精确表示 */
	exact: boolean;
	/** 是否为规格化数（非 0 且非无穷/NaN） */
	normalized: boolean;
	special: 'normal' | 'zero' | 'inf' | 'nan';
}

export function floatFields(value: number, kind: FloatKind): FloatResult {
	const spec = FLOAT_KINDS[kind];
	const neg = Object.is(value, -0) || value < 0;
	const abs = Math.abs(value);

	// 非有限值：±∞ 与 NaN
	if (!Number.isFinite(value)) {
		const isNaN = Number.isNaN(value);
		const expAll = '1'.repeat(spec.expBits);
		const signBit = neg ? '1' : '0';
		const mantField = isNaN ? '1'.padEnd(spec.mantBits, '0') : '0'.repeat(spec.mantBits);
		const fullBits = signBit + expAll + mantField;
		return {
			exact: false,
			normalized: false,
			special: isNaN ? 'nan' : 'inf',
			segments: [
				{ label: '符号位', bits: signBit, width: 1, note: neg ? '负' : '正' },
				{ label: '指数位', bits: expAll, width: spec.expBits, note: '全 1' },
				{
					label: '尾数位',
					bits: mantField,
					width: spec.mantBits,
					note: isNaN ? 'quiet NaN' : '全 0',
				},
			],
			fields: [
				{ title: '数值', value: isNaN ? 'NaN' : value > 0 ? '+∞' : '−∞', desc: 'IEEE 754 特殊值' },
				{ title: '符号位', value: signBit, desc: neg ? '1 表示负数' : '0 表示正数' },
				{ title: '指数位', value: group4(expAll), desc: `${spec.expBits} 位全 1，表示无穷/NaN` },
				{
					title: '尾数位',
					value: group4(mantField, spec.mantBits),
					desc: isNaN ? '首位 1 置起，表示 quiet NaN' : `${spec.mantBits} 位全 0`,
				},
				{
					title: '字节十六进制',
					value: bytesHexPrefixed(fullBits),
					desc: `${spec.bytes} 字节，高字节在前`,
				},
			],
		};
	}

	if (abs === 0) {
		const width = spec.bytes * 8;
		// 零只有符号位为 1 时才是 −0，其余全 0
		const zeroBits = (neg ? '1' : '0') + '0'.repeat(width - 1);
		return {
			exact: true,
			normalized: false,
			special: 'zero',
			segments: [
				{
					label: '符号位',
					bits: zeroBits[0]!,
					width: 1,
					note: neg ? '−0' : '+0',
				},
				{
					label: '指数位',
					bits: '0'.repeat(spec.expBits),
					width: spec.expBits,
					note: '全 0',
				},
				{
					label: '尾数位',
					bits: '0'.repeat(spec.mantBits),
					width: spec.mantBits,
					note: '全 0',
				},
			],
			fields: [
				{
					title: '符号位',
					value: neg ? '1' : '0',
					desc: neg
						? '1 表示 −0：零没有阶码与尾数，符号位是它与 +0 的**唯一**区别'
						: '0 表示 +0',
				},
				{ title: '尾数转换为十进制小数形式', value: '0', desc: '零的尾数为 0。' },
				{ title: '完整的十进制小数形式', value: '0', desc: '0 × 2^任意次方都是 0。' },
				{ title: '指数位', value: '0'.repeat(spec.expBits), desc: '全 0' },
				{ title: '尾数位', value: '0'.repeat(spec.mantBits), desc: '全 0' },
				{
					title: '字节十六进制',
					value: bytesHexPrefixed(zeroBits),
					desc: `${spec.bytes} 字节，高字节在前`,
				},
			],
		};
	}

	/* --- a) 整数部分 --- */
	const intPart = Math.floor(abs);
	const intBitsStr = intPart.toString(2);

	/* --- b) 小数部分：有效位满足要求就停 --- */
	const frac = abs - intPart;
	const fracRes = fracBinary(frac, spec.mantBits + 3);

	/* --- c) 完整二进制 --- */
	const allBits = intBitsStr + fracRes.bits;
	const full = intBitsStr + '.' + fracRes.bits;

	/*
	 * 阶码：最高位 1 的位置必须**从右往左**数。
	 *
	 * 值的真指数 = （最高位 1 到最低位的距离）− 小数位数。
	 * 写成 intBitsStr.length + lead 是「从左往右」数，
	 * 0.5 会算出 0 而非 −1 —— 0.5 应规格化成 1.0 × 2⁻¹。
	 */
	const firstOne = allBits.indexOf('1');
	const shift = allBits.length - 1 - firstOne - fracRes.bits.length;

	/* --- d) 规约化：保留 mantBits 位，第 mantBits+1 位 0 舍 1 入 --- */
	// 规格化后形如 1.xxxx；从最高位 1 起取，含该 1 本身
	const sig = allBits.slice(firstOne);
	const keep = sig.slice(0, 1 + spec.mantBits).padEnd(1 + spec.mantBits, '0');
	const roundBit = sig.charAt(1 + spec.mantBits) ?? '0';
	// 「四舍六入五成双」：舍入位为 1 时还要看后面有没有非零位；
	// 如果后面全 0（刚好一半），只在保留位末位为 1 时进位。
	const stickyBit = sig.slice(2 + spec.mantBits).includes('1');
	const lsbOne = keep.charAt(keep.length - 1) === '1';
	const roundUp = roundBit === '1' && (stickyBit || lsbOne);
	const mantissa = roundUp ? incBits(keep) : keep;

	const exponent = shift + spec.bias;

	/*
		次正规数（subnormal）：偏置后阶码 ≤ 0。此时规格化 1.x × 2^e 的写法
		不成立，尾数没有隐含的首位 1。教材的 a)–h) 流程默认规格化数，
		这里明确标出来而不是悄悄给一个错的十六进制。
	*/
	if (exponent <= 0) {
		const buf = new ArrayBuffer(spec.bytes);
		const dv = new DataView(buf);
		if (kind === 'float') dv.setFloat32(0, value);
		else dv.setFloat64(0, value);
		const subBits = binOf(buf);
		const subSign = subBits[0]!;
		const subExp = subBits.slice(1, 1 + spec.expBits);
		const subMant = subBits.slice(1 + spec.expBits);
		const subMantInt = BigInt('0b' + (subMant || '0'));
		const subMantissaDecimal = Number(subMantInt) / 2 ** spec.mantBits;
		const subExponent = 1 - spec.bias;
		const subDigits = kind === 'float' ? 9 : 17;
		const showSubDecimal = (n: number) => Number(n.toPrecision(subDigits)).toString();
		return {
			exact: fracRes.exact,
			normalized: false,
			special: 'normal',
			segments: [
				{ label: '符号位', bits: subSign, width: 1, note: neg ? '负' : '正' },
				{ label: '指数位', bits: subExp, width: spec.expBits, note: '全 0' },
				{ label: '尾数位', bits: subMant, width: spec.mantBits, note: '无隐含 1' },
			],
			fields: [
				{ title: '整数部分', value: intBitsStr, desc: `${intPart} 的二进制` },
				{
					title: '小数部分',
					value: '0.' + (fracRes.bits.slice(0, 64) || '0'),
					desc: '次正规数的小数部分；为避免界面过长，只展示前 64 位',
				},
				{
					title: '完整转换',
					value: full.length > 128 ? full.slice(0, 128) + '…' : full,
					desc: '整数部分 + 小数部分（超长时截断显示）',
				},
				{
					title: '尾数转换为十进制小数形式',
					value: showSubDecimal(subMantissaDecimal),
					desc: '次正规尾数 0.xxxx… 转成十进制小数。',
				},
				{
					title: '完整的十进制小数形式',
					value: `${showSubDecimal(subMantissaDecimal)} * 2^${subExponent}`,
					html: `${showSubDecimal(subMantissaDecimal)} × 2<sup>${subExponent}</sup>`,
					desc: '次正规数 = 十进制尾数 × 2^(1 − 偏置)。',
				},
				{
					title: '⚠️ 次正规数',
					value: '偏置后阶码 ≤ 0',
					desc: '尾数没有隐含的首位 1，不能写成 1.x × 2^e；这里按 IEEE 754 实际存储位输出。',
				},
				{
					title: '真指数（移码）',
					value: `${shift} + ${spec.bias} = ${exponent}（≤ 0）`,
					desc: `真指数为 ${shift}，加偏置 ${spec.bias} 后已无法用规格化阶码表示`,
				},
				{ title: '符号位', value: subSign, desc: neg ? '1 表示负数' : '0 表示正数' },
				{ title: '指数位', value: group4(subExp), desc: `${spec.expBits} 位全 0` },
				{
					title: '尾数位',
					value: group4(subMant, spec.mantBits),
					desc: `${spec.mantBits} 位，**从后往前**每 4 位一组（末尾不足时前补 0）`,
				},
				{
					title: '字节十六进制',
					value: bytesHexPrefixed(subBits),
					desc: `${spec.bytes} 字节，高字节在前`,
				},
			],
		};
	}

	const expField = exponent.toString(2).padStart(spec.expBits, '0');
	const mantField = mantissa.slice(1); // 去掉隐含的首位 1
	const sign = neg ? '1' : '0';
	const fullBits = sign + expField + mantField;

	// 尾数与完整值的十进制形式（供习题对照）
	const mantInt = BigInt('0b' + (mantField || '0'));
	const mantissaDecimal = 1 + Number(mantInt) / 2 ** spec.mantBits;
	const decimalDigits = kind === 'float' ? 9 : 17;
	const showDecimal = (n: number) => Number(n.toPrecision(decimalDigits)).toString();

	return {
		exact: fracRes.exact,
		normalized: true,
		special: 'normal',
		segments: [
			{ label: '符号位', bits: sign, width: 1, note: neg ? '负' : '正' },
			{
				label: '指数位',
				bits: expField,
				width: spec.expBits,
				note: `移码 ${exponent}`,
			},
			{
				label: '尾数位',
				bits: mantField,
				width: spec.mantBits,
				note: '隐含首位 1',
			},
		],
		fields: [
			{ title: '整数部分', value: intBitsStr, desc: `${intPart} 的二进制` },
			{
				title: '小数部分',
				value: '0.' + fracRes.bits,
				desc: fracRes.exact
					? '余数归零，此数在二进制下可精确表示'
					: `有效位满足要求（第 ${spec.mantBits + 2} 位用于判断进位）`,
			},
			{
				title: '完整转换',
				value: full,
				desc: `整数部分 ${intBitsStr} + 小数部分（有效位满足要求即停）`,
			},
			{
				title: '规约化表示（四舍六入五成双）',
				value: mantissa,
				desc:
					`保留 ${spec.mantBits} 位；舍入位 ${roundBit}，后续位${stickyBit ? '有 1' : '全 0'}，` +
					`${roundUp ? '入' : '舍'}（四舍六入五成双：舍入位为 1 且后有 1 入；刚好一半时看末位，末位 1 才入）`,
			},
			{
				title: '尾数转换为十进制小数形式',
				value: showDecimal(mantissaDecimal),
				desc: '把规格化尾数 1.xxxx… 转成十进制小数。',
			},
			{
				title: '完整的十进制小数形式',
				value: `${showDecimal(mantissaDecimal)} * 2^${shift}`,
				html: `${showDecimal(mantissaDecimal)} × 2<sup>${shift}</sup>`,
				desc: `完整值 = 十进制尾数 × 2^真指数；真指数为 ${shift}。`,
			},
			{
				title: `指数（移码 ${exponent}）`,
				value: `${exponent}  →  ${group4(expField)}`,
				desc: `真值 ${shift} + 偏置 ${spec.bias} = ${exponent}，二进制移码如上；这就是实际存入的阶码`,
			},
			{ title: '符号位', value: sign, desc: neg ? '1 表示负数' : '0 表示正数' },
			{
				title: '指数位',
				value: group4(expField),
				desc: `${spec.expBits} 位，从后往前每 4 位一组`,
			},
			{
				title: '尾数位',
				value: group4(mantField, spec.mantBits),
				desc: `${spec.mantBits} 位，**从后往前**每 4 位一组（末组不足时前补 0）`,
			},
			{
				title: '字节十六进制',
				value: bytesHexPrefixed(fullBits),
				desc: `${spec.bytes} 个字节，高字节在前`,
			},
		],
	};
}

/** 定点二进制串加 1（用于第 24 位 1 入） */
function incBits(bits: string): string {
	const arr = bits.split('');
	let i = arr.length - 1;
	while (i >= 0) {
		if (arr[i] === '0') {
			arr[i] = '1';
			return arr.join('');
		}
		arr[i] = '0';
		i--;
	}
	return '1' + arr.join(''); // 溢出，理论上一个有效位 1 不会走到这
}

/** 从右往左每 4 位一组（低位在前，符合「尾数位第 23 位到第 0 位」的读法） */
export function group4(bits: string, total?: number): string {
	const pad = total && bits.length < total ? bits.padStart(total, '0') : bits;
	const out: string[] = [];
	for (let i = pad.length; i > 0; i -= 4) out.unshift(pad.slice(Math.max(0, i - 4), i));
	return out.join(' ');
}

/**
 * 字节十六进制，逐字节写 0x 前缀。
 * float → 0x3F 0x80 0x00 0x00；double → 0x3F 0xF0 …
 */
export function bytesHexPrefixed(bits: string): string {
	return (bits.match(/.{8}/g) ?? [])
		.map((b) => '0x' + parseInt(b, 2).toString(16).toUpperCase().padStart(2, '0'))
		.join(' ');
}