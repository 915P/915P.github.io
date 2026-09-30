/**
 * C/C++ 表达式求值 —— 双栈法逐步演示。
 *
 * 支持算术、关系、逻辑与位运算子集，并用操作数栈 + 运算符栈
 * 逐步展示每一步的读取、入栈、弹栈和计算。
 */

export interface Step {
index: number;
token: string;
operands: number[];
operators: string[];
action: string;
}

export interface EvalResult {
ok: boolean;
result?: number;
steps: Step[];
error?: string;
}

const PRECEDENCE: Record<string, number> = {
'||': 1,
'&&': 2,
'|': 3,
'^': 4,
'&': 5,
'==': 6,
'!=': 6,
'<': 7,
'<=': 7,
'>': 7,
'>=': 7,
'<<': 8,
'>>': 8,
'+': 9,
'-': 9,
'*': 10,
'/': 10,
'%': 10,
'u+': 11,
'u-': 11,
'!': 11,
'~': 11,
'(': 0,
};

const RIGHT_ASSOC = new Set(['u+', 'u-', '!', '~']);
const MULTI_OPS = ['<<', '>>', '<=', '>=', '==', '!=', '&&', '||'];
const SINGLE_OPS = new Set('+-*/%()!~<>&|^'.split(''));

function fmt(n: number): string {
if (!Number.isFinite(n)) return String(n);
if (Number.isInteger(n)) return String(n);
return Number(n.toPrecision(12)).toString();
}

function truthy(v: unknown): number {
return v ? 1 : 0;
}

function isInt(n: number): boolean {
return Number.isInteger(n);
}

interface Token {
token: string;
kind: 'number' | 'op';
}

function tokenize(input: string): Token[] | string {
const out: Token[] = [];
let i = 0;
while (i < input.length) {
const ch = input[i]!;
if (/\s/.test(ch)) {
i++;
continue;
}
// 数字
if (/[0-9.]/.test(ch)) {
let j = i;
let seenDot = false;
while (j < input.length && /[0-9.eE+\-]/.test(input[j]!)) {
const c = input[j]!;
if (c === '.') {
if (seenDot) break;
seenDot = true;
}
if ((c === '+' || c === '-') && !/[eE]/.test(input[j - 1] ?? '')) break;
j++;
}
const token = input.slice(i, j);
if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)) {
return `无法识别的数字：${token}`;
}
out.push({ token, kind: 'number' });
i = j;
continue;
}
// 多字符运算符
const multi = MULTI_OPS.find((op) => input.startsWith(op, i));
if (multi) {
out.push({ token: multi, kind: 'op' });
i += multi.length;
continue;
}
if (SINGLE_OPS.has(ch)) {
out.push({ token: ch, kind: 'op' });
i++;
continue;
}
return `不支持的字符：${ch}`;
}
return out;
}

function applyOperator(values: number[], operators: string[]): { action: string } | string {
const op = operators.pop();
if (!op) return '运算符栈为空，无法计算';

const unaryOps = new Set(['u+', 'u-', '!', '~']);
if (unaryOps.has(op)) {
if (values.length < 1) return `一元运算符 ${op} 缺少操作数`;
const a = values.pop()!;
let r: number;
switch (op) {
case 'u+': r = a; break;
case 'u-': r = -a; break;
case '!': r = a ? 0 : 1; break;
case '~': r = ~Math.trunc(a); break;
default: return `不支持的一元运算符：${op}`;
}
values.push(r);
return { action: `一元 ${op}：对 ${fmt(a)} 计算得 ${fmt(r)} 并压回操作数栈` };
}

if (values.length < 2) return `运算符 ${op} 缺少操作数`;
const b = values.pop()!;
const a = values.pop()!;
let r: number;
switch (op) {
case '+': r = a + b; break;
case '-': r = a - b; break;
case '*': r = a * b; break;
case '/':
if (b === 0) return '除数为 0';
r = isInt(a) && isInt(b) ? Math.trunc(a / b) : a / b;
break;
case '%':
if (b === 0) return '取模的除数为 0';
if (!isInt(a) || !isInt(b)) return '% 只支持整数操作数';
r = Math.trunc(a) % Math.trunc(b);
break;
case '<<': r = Math.trunc(a) << (Math.trunc(b) & 31); break;
case '>>': r = Math.trunc(a) >> (Math.trunc(b) & 31); break;
case '<': r = truthy(a < b); break;
case '<=': r = truthy(a <= b); break;
case '>': r = truthy(a > b); break;
case '>=': r = truthy(a >= b); break;
case '==': r = truthy(a === b); break;
case '!=': r = truthy(a !== b); break;
case '&': r = Math.trunc(a) & Math.trunc(b); break;
case '^': r = Math.trunc(a) ^ Math.trunc(b); break;
case '|': r = Math.trunc(a) | Math.trunc(b); break;
case '&&': r = truthy(a) && truthy(b) ? 1 : 0; break;
case '||': r = truthy(a) || truthy(b) ? 1 : 0; break;
default: return `不支持的运算符：${op}`;
}
values.push(r);
return {
action: `弹出 ${fmt(a)} ${op} ${fmt(b)}，计算得 ${fmt(r)} 并压回操作数栈`,
};
}

function snap(
steps: Step[],
token: string,
values: number[],
operators: string[],
action: string,
): void {
steps.push({
index: steps.length + 1,
token,
operands: [...values],
operators: [...operators],
action,
});
}

export function evaluateExpression(input: string): EvalResult {
const steps: Step[] = [];
const values: number[] = [];
const operators: string[] = [];

const tokens = tokenize(input.trim());
if (typeof tokens === 'string') return { ok: false, steps, error: tokens };
if (!tokens.length) return { ok: false, steps, error: '请输入表达式' };

let expectOperand = true;

const pushOp = (op: string, displayToken: string) => {
while (operators.length) {
const top = operators[operators.length - 1]!;
if (top === '(') break;
const topPrec = PRECEDENCE[top] ?? 0;
const opPrec = PRECEDENCE[op] ?? 0;
const shouldPop = RIGHT_ASSOC.has(op) ? topPrec > opPrec : topPrec >= opPrec;
if (!shouldPop) break;
const r = applyOperator(values, operators);
if (typeof r === 'string') throw new Error(r);
snap(steps, `apply ${top}`, values, operators, r.action);
}
operators.push(op);
snap(steps, displayToken, values, operators, `运算符 ${op} 入栈`);
};

try {
for (const { token, kind } of tokens) {
if (kind === 'number') {
const n = Number(token);
values.push(n);
snap(steps, token, values, operators, `数字 ${fmt(n)} 入操作数栈`);
expectOperand = false;
continue;
}

if (token === '(') {
operators.push('(');
snap(steps, token, values, operators, '左括号入运算符栈');
expectOperand = true;
continue;
}

if (token === ')') {
while (operators.length && operators[operators.length - 1] !== '(') {
const top = operators[operators.length - 1]!;
const r = applyOperator(values, operators);
if (typeof r === 'string') throw new Error(r);
snap(steps, `apply ${top}`, values, operators, r.action);
}
if (!operators.length) throw new Error('括号不匹配：缺少左括号');
operators.pop();
snap(steps, token, values, operators, '弹出左括号');
expectOperand = false;
continue;
}

// 运算符
if (expectOperand) {
if (token === '+' || token === '-') {
pushOp('u' + token, 'u' + token);
} else if (token === '!' || token === '~') {
pushOp(token, token);
} else {
throw new Error(`运算符 ${token} 缺少左操作数`);
}
continue;
}

pushOp(token, token);
expectOperand = true;
}

while (operators.length) {
if (operators[operators.length - 1] === '(') throw new Error('括号不匹配：缺少右括号');
const top = operators[operators.length - 1]!;
const r = applyOperator(values, operators);
if (typeof r === 'string') throw new Error(r);
snap(steps, `apply ${top}`, values, operators, r.action);
}

if (values.length !== 1) throw new Error('表达式不完整');
const result = values[0]!;
snap(steps, '完成', values, operators, `最终结果：${fmt(result)}`);
return { ok: true, result, steps };
} catch (err) {
return { ok: false, steps, error: (err as Error).message };
}
}
