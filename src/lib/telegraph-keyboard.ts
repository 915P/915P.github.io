/**
 * 电码键盘的状态机
 *
 * 单独拆出来是为了让「满 4 位 → 出字」这条规则可单测，
 * 不必在 DOM 里点按键。UI 只负责把 press() 的结果画出来。
 */

import { codeToChar, type TelegraphTable } from './telegraph';

export const CODE_LEN = 4;

export interface KeyboardState {
	/** 已输入的数字，不足 4 位时长度 < 4 */
	buf: string;
	/** 满 4 位时对应的字；未分配为 null */
	char: string | null;
	/** 本次满 4 位后是否有效 */
	complete: boolean;
}

export const EMPTY: KeyboardState = { buf: '', char: null, complete: false };

/** 按下一个数字键。已满则忽略（返回原状态，便于链式）。 */
export function press(state: KeyboardState, digit: string, table: TelegraphTable): KeyboardState {
	if (state.buf.length >= CODE_LEN) return state;
	if (!/^\d$/.test(digit)) return state;

	const buf = state.buf + digit;
	if (buf.length < CODE_LEN) return { buf, char: null, complete: false };

	const char = codeToChar(table, buf);
	return { buf, char, complete: true };
}

export function clear(): KeyboardState {
	return { ...EMPTY };
}

/** 把 buf 渲染成「已输入加粗 + 未输入置灰」的 4 位串 */
export function renderBuf(state: KeyboardState): string {
	let html = '';
	for (let i = 0; i < CODE_LEN; i++) {
		const ch = i < state.buf.length ? state.buf[i]! : '0';
		html += i < state.buf.length ? `<b>${ch}</b>` : `<b class="kbd-pending">${ch}</b>`;
	}
	return html;
}
