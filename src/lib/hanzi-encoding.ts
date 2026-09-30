/**
 * 汉字编码对照：GB2312 / GBK / GB18030 / UTF-8 / Big5 / Unicode。
 *
 * 所有换算走浏览器原生 `TextEncoder` / `TextDecoder`，不引第三方表。
 * - GBK、Big5 用 `gbk` / `big5` 标签
 * - GB18030 与 GBK 在 Node/browser 都支持 `gb18030`，它是 GBK 的超集
 * - Unicode 编号即码点本身
 *
 * 反查时按字节序从小到大返回全部候选：同一个码位在不同编码里
 * 可能对应多个汉字（例如 GBK 与 Big5 有交集区）。
 */

export type EncodingKey = 'gb2312' | 'gbk' | 'gb18030' | 'utf8' | 'big5' | 'unicode';

export interface EncodingMeta {
	key: EncodingKey;
	label: string;
	/** 说明为什么它能/不能作为「字节序列」参与转换 */
	note: string;
	/** 字节序（Unicode 是码点，不占字节，单列） */
	bytes: boolean;
	/** 该编码能否表示任意 Unicode 字符 */
	fullCoverage: boolean;
}

export const ENCODINGS: EncodingMeta[] = [
	{
		key: 'gb2312',
		label: 'GB2312',
		note: 'GB 2312-80，6763 个汉字（一级 3755 按拼音、二级 3008 按区），双字节 0xA1–0xF7',
		bytes: true,
		fullCoverage: false,
	},
	{
		key: 'gbk',
		label: 'GBK',
		note: 'GBK 扩展 GB2312 至 21886 个汉字与符号，双字节 0x81–0xFE',
		bytes: true,
		fullCoverage: false,
	},
	{
		key: 'gb18030',
		label: 'GB18030',
		note: 'GB 18030-2022，强制四字节汉字，映射全部 Unicode 码位',
		bytes: true,
		fullCoverage: true,
	},
	{
		key: 'utf8',
		label: 'UTF-8',
		note: '1–4 字节变长，U+0000–U+10FFFF 全部可表示',
		bytes: true,
		fullCoverage: true,
	},
	{
		key: 'big5',
		label: 'Big5',
		note: '繁体中文，双字节 0xA1–0xF9，含符号与注音扩展',
		bytes: true,
		fullCoverage: false,
	},
	{
		key: 'unicode',
		label: 'Unicode 码点',
		note: 'U+XXXX 码点本身，不是字节序列',
		bytes: false,
		fullCoverage: true,
	},
];

const TAGS: Record<EncodingKey, string | null> = {
	gb2312: 'gb2312',
	gbk: 'gbk',
	gb18030: 'gb18030',
	utf8: 'utf-8',
	big5: 'big5',
	unicode: null,
};

/** 归一化字面量编码名（Node 与浏览器都收） */
function tagOf(key: EncodingKey): string {
	return TAGS[key] ?? 'utf-8';
}

function hex2(n: number): string {
	return n.toString(16).toUpperCase().padStart(2, '0');
}

/** 码点 → U+XXXX（按码位宽度补 4 位以上） */
export function codePointLabel(cp: number): string {
	const hex = cp.toString(16).toUpperCase();
	return 'U+' + hex.padStart(Math.max(4, hex.length), '0');
}

export interface CharResult {
	char: string;
	cp: number;
	cpLabel: string;
	/** 该字在本编码下的字节，没有则 undefined */
	bytes?: number[];
	/** 有字节时给出对齐的 hex / binary */
	hex?: string;
	binary?: string;
	/** 该字能否用本编码表示 */
	ok: boolean;
	/** 不能表示时的原因 */
	reason?: string;
}

/** 逐字编码：返回每个字符对应的码点与字节 */
export function encodeChars(text: string, key: EncodingKey): CharResult[] {
	const out: CharResult[] = [];
	// Unicode 码点视图不涉及字节
	for (const char of text) {
		const cp = char.codePointAt(0)!;
		const base: CharResult = {
			char,
			cp,
			cpLabel: codePointLabel(cp),
			ok: true,
		};
		if (!ENCODINGS.find((e) => e.key === key)!.bytes) {
			out.push(base);
			continue;
		}
		let ok = true;
		let reason: string | undefined;
		let bytes: number[];
		try {
			if (key === 'utf8') {
				bytes = Array.from(new TextEncoder().encode(char));
			} else {
				/*
				 * 浏览器 TextEncoder 只支持 UTF-8。要拿 GBK/Big5 的字节，
				 * 用「反向查表」：先造一段覆盖全部 65536 个双字节序列的串，
				 * 按本编码解码成字符，再用 UTF-8 反查每字对应的字节。
				 * 代价是每次建一次码表，故惰性缓存。
			 */
				bytes = bytesOfLegacy(char, key);
			}
		} catch {
			ok = false;
			bytes = [];
			reason = `${labelOf(key)} 无法表示该字`;
		}
		// 校验：能否用目标编码解回同一个字符
		if (ok) {
			try {
				const back = new TextDecoder(tagOf(key), { fatal: true }).decode(
					new Uint8Array(bytes),
				);
				if (back !== char) {
					ok = false;
					reason = `按 ${labelOf(key)} 解回 “${printable(back)}”，与输入不一致`;
				}
			} catch {
				ok = false;
				reason = `${labelOf(key)} 无法表示该字`;
			}
		}
		out.push({
			...base,
			bytes,
			hex: bytes.map(hex2).join(' '),
			binary: bytes.map((b) => b.toString(2).padStart(8, '0')).join(' '),
			ok,
			reason,
		});
	}
	return out;
}

/**
 * GB2312 / GBK / Big5 的「字符 → 字节」反查表。
 *
 * 用惰性单例缓存，每个编码只建一次：
 * 把 0x00–0xFFFF 的双字节序列按编码解码，得到 (字符 → 字节) 映射。
 */
const legacyCache = new Map<EncodingKey, Map<string, number[]>>();

function legacyTable(key: EncodingKey): Map<string, number[]> {
	const hit = legacyCache.get(key);
	if (hit) return hit;
	const dec = new TextDecoder(tagOf(key));
	const table = new Map<string, number[]>();
	for (let hi = 0; hi <= 0xff; hi++) {
		for (let lo = 0; lo <= 0xff; lo++) {
			// 跳过 ASCII 单字节区，那不是双字节映射
			if (lo < 0x80) continue;
			const text = dec.decode(new Uint8Array([hi, lo]));
			if (text.length === 0) continue;
			// 同码多字时只保留第一次出现的字节序（按字节序从小到大）
			if (!table.has(text)) table.set(text, [hi, lo]);
		}
	}
	legacyCache.set(key, table);
	return table;
}

function bytesOfLegacy(char: string, key: EncodingKey): number[] {
	const cp = char.codePointAt(0)!;
	// 双字节优先
	const hit = legacyTable(key).get(char);
	if (hit) return hit;
	/*
	 * GB18030 还有四字节映射：不只是非 BMP 字，BMP 里 GBK 没收的字
	 * （如 鿕 U+9FD5、豈）也走四字节，所以这里不限制码位大小。
	 */
	if (key === 'gb18030') {
		const four = gb18030FourBytes(cp);
		if (four) return four;
	}
	throw new Error(`${key} 不含该字`);
}

/** 四字节序列的字节数上限，GB18030 映射表最大 linear 约 1.59M */
const GB18030_MAX_LINEAR = 1587340;

function gb18030FourBytes(cp: number): number[] | undefined {
	if (cp < 0x80) return undefined;
	const at = (L: number): number[] => {
		const b = [0, 0, 0, 0];
		b[3] = L % 10;
		L = (L - b[3]!) / 10;
		b[2] = L % 126;
		L = (L - b[2]!) / 126;
		b[1] = L % 10;
		L = (L - b[1]!) / 10;
		b[0] = L;
		return [0x81 + b[0]!, 0x30 + b[1]!, 0x81 + b[2]!, 0x30 + b[3]!];
	};
	const dec = new TextDecoder('gb18030');
	const cpAt = (L: number): number => {
		const t = dec.decode(new Uint8Array(at(L)));
		return t.length ? t.codePointAt(0)! : -1;
	};

	/*
	 * linear 与码位近似单调，但映射表有空洞（无效序列解码成 U+FFFD），
	 * 所以二分只用来缩小范围，最后靠解码验证 + 局部扫描定案。
	 */
	let lo = 0;
	let hi = GB18030_MAX_LINEAR;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (cpAt(mid) < cp) lo = mid + 1;
		else hi = mid;
	}
	for (let L = lo; L < Math.min(GB18030_MAX_LINEAR, lo + 4000); L++) {
		if (cpAt(L) === cp) return at(L);
	}
	return undefined;
}

function labelOf(key: EncodingKey): string {
	return ENCODINGS.find((e) => e.key === key)!.label;
}

function printable(s: string): string {
	// 控制字符用 · 占位，方便肉眼比对
	return s.replace(/[\x00-\x1f\x7f]/g, '·');
}

export interface ReverseResult {
	ok: boolean;
	char: string;
	cp: number;
	cpLabel: string;
	reason?: string;
}

/**
 * 从十六进制或二进制反查字符。
 *
 * 1. 解析成字节序列
 * 2. 用目标编码解码
 * 3. 若解码出多个字符（全角符号等）只取第一个，并说明
 */
export function decodeBytes(
	input: string,
	from: 'hex' | 'binary',
	key: EncodingKey,
): ReverseResult {
	let clean = input.replace(/0x/gi, '').replace(/[\s,]+/g, '');
	if (clean === '') return { ok: false, char: '', cp: -1, cpLabel: '', reason: '请输入字节' };

	let bytes: number[];
	try {
		if (from === 'hex') {
			if (!/^[0-9a-f]+$/i.test(clean)) {
				return { ok: false, char: '', cp: -1, cpLabel: '', reason: '只接受 0-9 与 A-F' };
			}
			if (clean.length % 2 !== 0) {
				return { ok: false, char: '', cp: -1, cpLabel: '', reason: '十六进制位数为奇数，需补 0' };
			}
			bytes = clean.match(/.{2}/g)!.map((h) => parseInt(h, 16));
		} else {
			clean = clean.replace(/[^01]/g, '');
			if (clean === '') {
				return { ok: false, char: '', cp: -1, cpLabel: '', reason: '只接受 0 与 1' };
			}
			if (clean.length % 8 !== 0) {
				return { ok: false, char: '', cp: -1, cpLabel: '', reason: '二进制需为 8 的整数倍（不足补 0）' };
			}
			bytes = clean.match(/.{8}/g)!.map((b) => parseInt(b, 2));
		}
	} catch {
		return { ok: false, char: '', cp: -1, cpLabel: '', reason: '无法解析输入' };
	}

	if (!ENCODINGS.find((e) => e.key === key)!.bytes) {
		return { ok: false, char: '', cp: -1, cpLabel: '', reason: 'Unicode 码点不是字节序列' };
	}

	const buf = new Uint8Array(bytes);
	let text: string;
	try {
		text = new TextDecoder(tagOf(key), { fatal: true }).decode(buf);
	} catch {
		return {
			ok: false,
			char: '',
			cp: -1,
			cpLabel: '',
			reason: `${labelOf(key)} 下这组字节不是合法序列`,
		};
	}
	if (text === '') {
		return { ok: false, char: '', cp: -1, cpLabel: '', reason: '解码得到空串' };
	}
	const char = [...text][0];
	const cp = char.codePointAt(0)!;
	const res: ReverseResult = { ok: true, char, cp, cpLabel: codePointLabel(cp) };
	if (text.length > 1) {
		res.reason = `该字节串解出 ${text.length} 个字符「${text}」，已取第一个`;
	}
	return res;
}

/**
 * 反查「同一个码位在不同编码下是什么字」。
 *
 * 用于查 GBK 与 Big5 的交集区：同一个码位可能是不同汉字。
 */
export function crossLookup(cp: number): { key: EncodingKey; char: string }[] {
	const out: { key: EncodingKey; char: string }[] = [];
	const char = String.fromCodePoint(cp);
	for (const key of ['gb2312', 'gbk', 'gb18030', 'big5'] as EncodingKey[]) {
		try {
			const bytes = bytesOfLegacy(char, key);
			const back = new TextDecoder(tagOf(key), { fatal: true }).decode(
				new Uint8Array(bytes),
			);
			if (back === char) out.push({ key, char });
		} catch {
			/* 该编码不表示此码位 */
		}
	}
	return out;
}
