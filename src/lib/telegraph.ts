/**
 * 中文电码（《标准电码本》）查表
 *
 * 数据源：npm `chinese-telegraph-code`@0.1.0 的 data/ 目录，
 * 取自 Unicode Unihan 的 kMainlandTelegraph / kTaiwanTelegraph 字段
 * （Unicode 17.0.0）。**数据受 Unicode License 约束，不是 MIT**，
 * 义务见 THIRD_PARTY_NOTICES.md §10。
 *
 * 存储格式：把码表压成「下标即码号」的稀疏数组（`chars[n]` = 码 n 对应的汉字，
 * null 表示该码未分配）。这样一次 JSON 解析就能同时支持码→字与字→码，
 * 不用维护两份映射。cn 最大码 9694、填充率 73%，直接用数组比稀疏对象小得多。
 *
 * 两份表都用**动态 import**，只在用户真的切到电码模式时才下载。
 */

export type TelegraphVariant = 'cn' | 'tw';

export interface TelegraphTable {
	variant: TelegraphVariant;
	label: string;
	source: string;
	max: number;
	/** 下标即码号；null = 该码未分配 */
	chars: (string | null)[];
}

export const TELEGRAPH_VARIANTS: Record<TelegraphVariant, { label: string; source: string }> = {
	cn: { label: '《标准电码本》· 大陆', source: 'Unihan kMainlandTelegraph' },
	tw: { label: '《標準電碼本》· 台港', source: 'Unihan kTaiwanTelegraph' },
};

const cache = new Map<TelegraphVariant, TelegraphTable>();

/** 按需加载某套码表；同一 variant 只解析一次。 */
export async function loadTelegraph(v: TelegraphVariant): Promise<TelegraphTable> {
	const hit = cache.get(v);
	if (hit) return hit;
	const table =
		v === 'cn'
			? ((await import('../data/telegraph-cn.json')).default as TelegraphTable)
			: ((await import('../data/telegraph-tw.json')).default as TelegraphTable);
	cache.set(v, table);
	return table;
}

/** 表内已分配的字数 */
export function tableSize(t: TelegraphTable): number {
	return t.chars.reduce<number>((n, c) => n + (c ? 1 : 0), 0);
}

/** 码 → 汉字。码必须是 1–4 位数字且无前导歧义；未分配返回 null。 */
export function codeToChar(table: TelegraphTable, code: string): string | null {
	if (!/^\d{1,4}$/.test(code)) return null;
	const n = Number(code);
	if (n < 1 || n > table.max) return null;
	return table.chars[n] ?? null;
}

/** 汉字 → 4 位码（补零）。该字未收录返回 null。 */
export function charToCode(table: TelegraphTable, ch: string): string | null {
	const n = table.chars.indexOf(ch);
	return n < 0 ? null : String(n).padStart(4, '0');
}

/**
 * 电码键盘的键位。
 *
 * 经典中文电码键盘是 5×2 的 1–0 十键，每键标注「码 000N 的那个字」：
 * 1=一(0001) 2=丁(0002) 3=七(0003) 4=丈(0004) 5=三(0005)
 * 6=上(0006) 7=下(0007) 8=不(0008) 9=丐(0009) 0=丑(0010)
 *
 * 这个映射不是我编的：它就是码表 0001–0010 的自然顺序，也正是实体键盘的排法。
 */
/** 5×2 排布的十个数字键 */
export const KEYBOARD_LAYOUT: { digit: string; row: 0 | 1 }[] = [
	{ digit: '1', row: 0 },
	{ digit: '2', row: 0 },
	{ digit: '3', row: 0 },
	{ digit: '4', row: 0 },
	{ digit: '5', row: 0 },
	{ digit: '6', row: 1 },
	{ digit: '7', row: 1 },
	{ digit: '8', row: 1 },
	{ digit: '9', row: 1 },
	{ digit: '0', row: 1 },
];

/**
 * 键 digit 对应的「代表字」，即码表 0001–0010 那一行的字：
 *   1=一(0001) 2=丁(0002) 3=七(0003) 4=丈(0004) 5=三(0005)
 *   6=上(0006) 7=下(0007) 8=不(0008) 9=丐(0009) 0=丑(0010)
 *
 * 不是随手编号 —— 经典中文电码键盘就是这么排的。
 * 注意 0 键对应的是 0010 而不是 0000：0000 未分配。
 */
export function keyChar(t: TelegraphTable, digit: string): string | null {
	const n = Number(digit);
	if (!Number.isInteger(n) || n < 0 || n > 9) return null;
	return codeToChar(t, String(n === 0 ? 10 : n));
}
