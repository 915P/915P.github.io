/**
 * C/C++ 表达式求值 —— 双栈法逐步演示。
 *
 * 支持算术、关系、逻辑与位运算子集，并用操作数栈 + 运算符栈
 * 逐步展示每一步的读取、入栈、弹栈和计算。
 */

/**
 * 操作数栈的一个元素。
 *
 * `name` 只在元素由**变量**压入时存在（`{ value: 5, name: 'a' }`），
 * 用来在栈图上显示成「a（5）」；字面量与中间结果没有名字。
 */
export interface Operand {
value: number;
/** 来源变量名，缺省表示不是变量 */
name?: string;
/**
 * 这个操作数是不是**浮点**。
 *
 * 必须按**写法**判定，不能用 `Number.isInteger(value)`：JS 里 10.0 === 10、
 * 1e1 === 10，光看值会把 `10.0 / 3` 误判成整数除法（算成 3，而 C 是 3.333…）。
 * 字面量按写法标记；变量没有声明类型，按值判。
 */
floating?: boolean;
}

export interface Step {
index: number;
token: string;
operands: Operand[];
operators: string[];
action: string;
}

export interface EvalResult {
ok: boolean;
result?: number;
steps: Step[];
/** 求值结束后的变量表（赋值、++、-- 会改变它） */
variables?: Record<string, number>;
error?: string;
}

/*
 * 运算符优先级（数字越大越紧），自低到高对齐 C/C++：
 *
 *   ,  <  赋值(右结合)  <  ?:  <  ||  <  &&  <  |  <  ^  <  &
 *     <  == !=  <  < <= > >=  <  << >>  <  + -  <  * / %  <  **
 *     <  前缀一元  <  后缀 ++ --
 *
 * `**`（幂）是本站为教学演示加的扩展，C/C++ 标准里没有。
 */
const PRECEDENCE: Record<string, number> = {
',': 1,
'=': 2,
'+=': 2,
'-=': 2,
'*=': 2,
'/=': 2,
'%=': 2,
'&=': 2,
'|=': 2,
'^=': 2,
'<<=': 2,
'>>=': 2,
'?:': 3,
'||': 4,
'&&': 5,
'|': 6,
'^': 7,
'&': 8,
'==': 9,
'!=': 9,
'<': 10,
'<=': 10,
'>': 10,
'>=': 10,
'<<': 11,
'>>': 11,
'+': 12,
'-': 12,
'*': 13,
'/': 13,
'%': 13,
'**': 14,
'u+': 15,
'u-': 15,
'!': 15,
'~': 15,
'cast': 15,
'pre++': 15,
'pre--': 15,
'post++': 16,
'post--': 16,
'(': 0,
};

/*
 * 右结合：赋值链（a = b = 1）与幂（2 ** 3 ** 2）。
 * 一元运算符天然右结合，保留原有写法。
 */
/** 运算符优先级；cast 在栈里是 `cast:int` 形式，按前缀查回 'cast' */
function precOf(op: string): number {
if (op.startsWith('cast')) return PRECEDENCE['cast'] ?? 0;
return PRECEDENCE[op] ?? 0;
}

const RIGHT_ASSOC = new Set([
'cast',
'u+',
'u-',
'!',
'~',
'=',
'+=',
'-=',
'*=',
'/=',
'%=',
'&=',
'|=',
'^=',
'<<=',
'>>=',
'**',
]);

/** 赋值运算符：'=' 或 '<op>='，用于拆分 base / op */
const ASSIGN_OPS = new Set([
'=',
'+=',
'-=',
'*=',
'/=',
'%=',
'&=',
'|=',
'^=',
'<<=',
'>>=',
]);

const MULTI_OPS = [
'<<=',
'>>=',
'<<',
'>>',
'<=',
'>=',
'==',
'!=',
'&&',
'||',
'+=',
'-=',
'*=',
'/=',
'%=',
'&=',
'|=',
'^=',
'**',
'++',
'--',
];
const SINGLE_OPS = new Set('+-*/%()!~<>&|^,=?:'.split(''));

/**
 * 数值显示格式 —— 页面与步骤快照必须用同一个，否则两处显示不一致。
 *
 * 直接 `String(10 / 3)` 会得到 `3.3333333333333335`：double 只有 53 位有效数字，
 * 能存的只是无限小数 3.3333… 的最近邻居，尾巴的 5 属于精度噪声。
 * 这里按 12 位有效数字显示，既不丢信息又不暴露二进制误差。
 */
export function formatNumber(n: number): string {
if (!Number.isFinite(n)) return String(n);
if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
const abs = Math.abs(n);
// 超出双精度能「按位」读的范围时改用指数形式，免得写出一长串 0
if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) return n.toExponential();
return Number(n.toPrecision(12)).toString();
}

const fmt = formatNumber;

function truthy(v: unknown): number {
return v ? 1 : 0;
}

function isInt(n: number): boolean {
return Number.isInteger(n);
}

interface Token {
token: string;
kind: 'number' | 'ident' | 'op' | 'cast';
/** 数字字面量已解析好的值（0x1F / 017 / 10ULL 这类不能靠 Number(token) 得到） */
value?: number;
/** kind 为 cast 时，目标类型名（如 int / unsigned long） */
cast?: string;
/** 数字字面量是否为浮点写法（含小数点 / 指数 / f 后缀） */
floating?: boolean;
}

/*
 * 支持的类型及其位宽。
 *
 * 位宽决定转换后的**回绕**行为 —— C 里把 300 转成 char 得到 44，
 * 把 -1 转成 unsigned int 得到 4294967295，因为值先按目标类型存下、
 * 存不下的高位被截掉，再按有无符号解释。
 *
 * long 取 64 位（现代 Linux / macOS 的 ABI；Windows 上是 32 位，
 * 本工具按前者，因为它服务的是 Linux 部署与一般教学预期）。
 */
const TYPE_INFO: Record<string, { bits: number; unsigned: boolean }> = {
char: { bits: 8, unsigned: false },
'signed char': { bits: 8, unsigned: false },
'unsigned char': { bits: 8, unsigned: true },
short: { bits: 16, unsigned: false },
'short int': { bits: 16, unsigned: false },
'signed short': { bits: 16, unsigned: false },
'signed short int': { bits: 16, unsigned: false },
'unsigned short': { bits: 16, unsigned: true },
'unsigned short int': { bits: 16, unsigned: true },
int: { bits: 32, unsigned: false },
signed: { bits: 32, unsigned: false },
'signed int': { bits: 32, unsigned: false },
unsigned: { bits: 32, unsigned: true },
'unsigned int': { bits: 32, unsigned: true },
long: { bits: 64, unsigned: false },
'signed long': { bits: 64, unsigned: false },
'signed long int': { bits: 64, unsigned: false },
'unsigned long': { bits: 64, unsigned: true },
'unsigned long int': { bits: 64, unsigned: true },
'long long': { bits: 64, unsigned: false },
'signed long long': { bits: 64, unsigned: false },
'unsigned long long': { bits: 64, unsigned: true },
size_t: { bits: 64, unsigned: true },
};

/** 浮点类型：没有位宽回转，转换只改运行时类型 */
const FLOAT_TYPES = new Set(['float', 'double', 'long double']);

/** 归一化类型名：`  unsigned   long int ` → `unsigned long int` */
function normalizeType(raw: string): string {
return raw.replace(/\s+/g, ' ').trim();
}

/**
 * 按目标类型的位宽回绕，模拟 C 的「先存下再解释」。
 *
 * 用 BigInt 而不是 `| 0` 或 `<<`：JS 位运算固定 32 位，
 * 而 long / size_t 是 64 位，且对负数要按补码取低位。
 */
function wrapToWidth(value: number, bits: number, unsigned: boolean): number | string {
if (!Number.isFinite(value)) return value;
const truncated = Math.trunc(value);
const mask = (1n << BigInt(bits)) - 1n;
// BigInt 的 & 按无限位补码取低位，负数也能正确取到目标位宽
const masked = BigInt(truncated) & mask;
// 有符号类型里高于最高位的部分代表负数
const maxSigned = unsigned ? mask : (1n << BigInt(bits - 1)) - 1n;
const signed = masked > maxSigned ? masked - (1n << BigInt(bits)) : masked;
/*
 * 64 位类型（long / size_t / unsigned long long）的值可能超出 double 能
 * 精确表示的整数范围（±2^53）。例如 (size_t)-1 的真值是 18446744073709551615，
 * 转成 number 会变成 18446744073709552000 —— 差 390，还会被显示成一个错数。
 * 这里直接报错，不给假结果。
 */
const asNumber = Number(signed);
if (Math.abs(asNumber) > Number.MAX_SAFE_INTEGER) {
return `${bits} 位类型的值 ${signed} 超出双精度可精确表示范围（上限 ${Number.MAX_SAFE_INTEGER}）`;
}
return asNumber;
}

/** 已知类型名（含可选的 signed / unsigned 前缀与 const），用于匹配 cast 语法 */
const TYPE_NAME_BODY =
'(?:long\\s+long|long\\s+int|long|short\\s+int|short|int|char|float|double|bool|size_t)';
/** 类型名：可选 const + 可选 signed/unsigned + 基本类型 */
const TYPE_NAME =
`(?:const\\s+)?(?:(?:unsigned|signed)(?:\\s+${TYPE_NAME_BODY})?|${TYPE_NAME_BODY})`;

/**
 * 执行一次类型转换，返回值与结果类型。
 *
 * 三类目标：
 * - bool      → 0 / 1
 * - 浮点类型    → 数值不变，但运行时类型变成浮点（后续 `/` 走浮点除法）
 * - 整型      → 向零截断后按该类型位宽回绕（C 里存不下就丢高位）
 */
function applyCast(value: number, type: string): { value: number; floating: boolean } {
const t = normalizeType(type);
if (t === 'bool') return { value: value ? 1 : 0, floating: false };
if (FLOAT_TYPES.has(t)) return { value, floating: true };
const info = TYPE_INFO[t];
if (!info) return { value: Math.trunc(value), floating: false };
const wrapped = wrapToWidth(value, info.bits, info.unsigned);
if (typeof wrapped === 'string') throw new Error(wrapped);
return { value: wrapped, floating: false };
}

/*
 * 三种强制转换写法，统一归一成 `cast:<类型名>` 运算符：
 *   1. C 风格      (int)x
 *   2. 函数式      int(x)
 *   3. C++ 静态转换 static_cast<int>(x)
 * 只引入 static_cast；const_cast / reinterpret_cast 在纯数值求值里没有意义。
 */
const CAST_C_RE = new RegExp(`^\\(\\s*${TYPE_NAME}\\s*\\)`);
const CAST_STATIC_RE = new RegExp(`^static_cast\\s*<\\s*(${TYPE_NAME})\\s*>`);
const CAST_FN_RE = new RegExp(`^(${TYPE_NAME})\\s*\\(`);

interface NumberLit {
text: string;
value: number;
length: number;
/** 是否浮点写法 */
floating: boolean;
}

/**
 * 匹配一个数字字面量。
 *
 * 按 C 的写法依次尝试：
 *   0x/0X 十六进制、0b/0B 二进制（GCC 扩展）、前导 0 的八进制、
 *   十进制整数或浮点（含 1e3 / .5 / 5. 这种写法），
 *   后面可跟整数后缀 u/l/ll 或浮点后缀 f/l（10ULL、1.5f、0x1FUL）。
 */
function matchNumber(rest: string): NumberLit | string {
// 前缀型：十六进制 / 二进制
const pref = /^0[xXbB]/.exec(rest);
if (pref) {
const isHex = pref[0]!.toLowerCase() === '0x';
const body = /^0[xXbB][0-9a-fA-F]+/.exec(rest) ?? /^0[xXbB][01]+/.exec(rest);
if (!body) return `${pref[0]} 后缺少有效数字`;
const suffix = /^[uUlL]{1,3}/.exec(rest.slice(body[0].length))?.[0] ?? '';
const text = body[0] + suffix;
const value = parseInt(body[0].slice(2), isHex ? 16 : 2);
if (!Number.isFinite(value)) return `字面量 ${text} 超出可表示范围`;
return { text, value, length: text.length, floating: false };
}

// 八进制：前导 0 且后续全是 0-7，且后面不接小数点或指数
const oct = /^0[0-7]+(?![.eE])/.exec(rest);
if (oct) {
const tail = rest[oct[0].length] ?? '';
if (/[89]/.test(tail)) return `无效的八进制数字：${oct[0]}${tail[0]}`;
const suffix = /^[uUlL]{1,3}/.exec(tail)?.[0] ?? '';
const text = oct[0] + suffix;
return { text, value: parseInt(oct[0], 8), length: text.length, floating: false };
}

// 八进制位置出现 8 / 9：明确报错，别悄悄当十进制
const badOct = /^0[0-9]*[89]/.exec(rest);
if (badOct && !/^[0-9]*[.eE]/.test(rest.slice(badOct[0].length))) {
return `无效的八进制数字：${badOct[0]}`;
}

// 十进制：整数 / 浮点 / 科学计数法
const dec = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
if (!dec) return `无法识别的数字：${rest[0]}`;
const suffix = /^[fFlLuU]{1,3}/.exec(rest.slice(dec[0].length))?.[0] ?? '';
const text = dec[0] + suffix;
const value = Number(dec[0]);
if (!Number.isFinite(value)) return `字面量 ${text} 超出双精度可表示范围`;
// 含小数点或指数即为浮点写法；f/F 后缀也是（1.5f）。
// l/L 后缀（10L）不标为浮点 —— 值仍是整数，按整数处理更符合直觉。
const floating = /[.eE]/.test(dec[0]) || /[fF]/.test(suffix);
return { text, value, length: text.length, floating };
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
// 数字字面量：进制前缀 + 八进制 + 浮点 + 后缀
if (/[0-9.]/.test(ch)) {
const rest = input.slice(i);
const lit = matchNumber(rest);
if (typeof lit === 'string') return lit;
out.push({ token: lit.text, kind: 'number', value: lit.value, floating: lit.floating });
i += lit.length;
continue;
}
// 类型转换：static_cast<T>( 与 (T) 必须在普通 '(' 之前判断，否则会被当成括号分组
if (ch === '(') {
const m = CAST_C_RE.exec(input.slice(i));
if (m) {
out.push({ token: m[0], kind: 'cast', cast: normalizeType(m[0].slice(1, -1)) });
i += m[0].length;
continue;
}
}

// static_cast<int>( 与函数式 int(x)：只吃掉类型名，左括号留给普通 '(' 分支处理
if (/[A-Za-z_]/.test(ch)) {
const rest = input.slice(i);
const asStatic = CAST_STATIC_RE.exec(rest);
if (asStatic) {
const typeName = normalizeType(asStatic[1]!);
out.push({ token: typeName, kind: 'cast', cast: typeName });
i += asStatic[0].length;
continue;
}
const asFn = CAST_FN_RE.exec(rest);
if (asFn) {
const typeName = normalizeType(asFn[1]!);
out.push({ token: typeName, kind: 'cast', cast: typeName });
i += asFn[1]!.length;
continue;
}
}

// 标识符（变量名）：C/C++ 规则，字母或下划线开头
// 必须放在上面两个 cast 分支之后 —— cast 优先匹配，其余字母开头的都是变量名。
if (/[A-Za-z_]/.test(ch)) {
let j = i;
while (j < input.length && /[A-Za-z0-9_]/.test(input[j]!)) j++;
out.push({ token: input.slice(i, j), kind: 'ident' });
i = j;
continue;
}

// 多字符运算符（顺序敏感：<<= 必须排在 << 前面，++/-- 交给求值循环分前后缀）
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

/**
 * 弹栈计算一步。
 *
 * `env` 是当前变量表：赋值与 ++/-- 需要读写它，这是本求值器唯一的副作用来源。
 */
function applyOperator(
values: Operand[],
operators: string[],
env: Record<string, number>,
): { action: string } | string {
const op = operators.pop();
if (!op) return '运算符栈为空，无法计算';

const unaryOps = new Set(['u+', 'u-', '!', '~']);
if (unaryOps.has(op)) {
if (values.length < 1) return `一元运算符 ${op} 缺少操作数`;
const operandIn = values.pop()!;
const a = operandIn.value;
if (op === '~' && operandIn.floating) {
return `~ 只能作用于整数，收到浮点数 ${fmt(a)}（可写 (int)${fmt(a)} 显式转换）`;
}
let r: number;
switch (op) {
case 'u+': r = a; break;
case 'u-': r = -a; break;
case '!': r = a ? 0 : 1; break;
case '~': r = ~Math.trunc(a); break;
default: return `不支持的一元运算符：${op}`;
}
// 正负号保留操作数的类型；! 与 ~ 的结果一定是整数
const keepFloat = (op === 'u+' || op === 'u-') && !!operandIn.floating;
values.push({ value: r, floating: keepFloat });
return { action: `一元 ${op}：对 ${fmt(a)} 计算得 ${fmt(r)} 并压回操作数栈` };
}

/* 类型转换：(int)3.7 / int(3.7) / static_cast<int>(3.7) */
if (op.startsWith('cast:')) {
if (values.length < 1) return `类型转换 ${op.slice(5)} 缺少操作数`;
const type = op.slice(5);
const before = values.pop()!.value;
const out = applyCast(before, type);
values.push({ value: out.value, floating: out.floating });
return { action: `转换 (${type})：${fmt(before)} → ${fmt(out.value)}` };
}

/* 前缀 ++a / --a：先改再取值，返回新值 */
if (op === 'pre++' || op === 'pre--') {
if (values.length < 1) return `${op} 缺少操作数`;
const target = values.pop()!;
if (!target.name) return `${op === 'pre++' ? '++' : '--'} 的左边必须是变量，不能是常量或表达式结果`;
const delta = op === 'pre++' ? 1 : -1;
// 读 env 的当前值而非 target.value：形如 a++ + ++a 时，栈上留着的是
// 后缀运算留下的旧值，而 a 已经被后缀改过了。
const cur = env[target.name] ?? target.value;
const nv = cur + delta;
env[target.name] = nv;
values.push({ value: nv, name: target.name, floating: target.floating });
return { action: `${op === 'pre++' ? '++' : '--'}：变量 ${target.name}（${fmt(cur)}）自${op === 'pre++' ? '增' : '减'}为 ${fmt(nv)}，压回新值` };
}

/* 后缀 a++ / a--：先取值再改，返回旧值 */
if (op === 'post++' || op === 'post--') {
if (values.length < 1) return `${op} 缺少操作数`;
const target = values.pop()!;
if (!target.name) return `${op === 'post++' ? '++' : '--'} 的左边必须是变量，不能是常量或表达式结果`;
const nv = target.value + (op === 'post++' ? 1 : -1);
env[target.name] = nv;
// 只压旧值（保留 name），栈顶就是后缀表达式的结果；
// name 保留是为了让后续的前缀 ++/-- 知道它对应哪个变量。
values.push({ value: target.value, name: target.name, floating: target.floating });
return { action: `${op === 'post++' ? '++' : '--'}：变量 ${target.name}（${fmt(target.value)}）变为 ${fmt(nv)}，表达式取值仍为原值 ${fmt(target.value)}` };
}

/* 逗号：丢弃左值，返回右值 */
if (op === ',') {
if (values.length < 2) return `运算符 , 缺少右操作数`;
const right = values.pop()!;
const a = values.pop()!.value;
values.push({ value: right.value, floating: right.floating });
return { action: `逗号：丢弃 ${fmt(a)}，结果取右值 ${fmt(right.value)}` };
}

/* 条件运算符 cond ? a : b —— 三个操作数 */
if (op === '?:') {
if (values.length < 3) return `运算符 ?: 缺少操作数（需要「条件 ? 真值 : 假值」三部分）`;
const fbOp = values.pop()!;
const tvOp = values.pop()!;
const cond = values.pop()!.value;
const r = cond ? tvOp.value : fbOp.value;
values.push({ value: r, floating: (cond ? tvOp : fbOp).floating });
return { action: `条件：${fmt(cond)} 为 ${cond ? '真' : '假'}，取 ${fmt(r)}` };
}

if (values.length < 2) return `运算符 ${op} 缺少操作数`;
const rhs = values.pop()!;
const lhs = values.pop()!;
const b = rhs.value;
const a = lhs.value;
/** 任一操作数是浮点，则结果按浮点算（C 的常规算术转换） */
const anyFloat = !!lhs.floating || !!rhs.floating;

/**
 * 只允许整数的运算符遇到浮点时报错，而不是悄悄截断。
 * C 里 `% & | ^ << >> ~` 对浮点操作数是未定义行为，这里给出明确提示。
 */
const badInt = (name: string) =>
anyFloat
? `运算符 ${name} 只能作用于整数，收到浮点数 ${lhs.floating ? fmt(a) : fmt(b)}（可写 (int) 显式转换）`
: null;

/* 赋值类（含复合赋值）：左边必须是变量，写回 env */
if (ASSIGN_OPS.has(op)) {
if (!lhs.name) {
return `${op} 的左边必须是变量，不能是常量或表达式结果`;
}
if (op !== '=') {
const bad = badInt(op);
if (bad) return bad;
}
const base = lhs.value;
let operand = b;
if (op !== '=') {
switch (op) {
case '+=': operand = a + b; break;
case '-=': operand = a - b; break;
case '*=': operand = a * b; break;
case '/=':
if (b === 0) return '赋值的除数为 0';
operand = isInt(a) && isInt(b) ? Math.trunc(a / b) : a / b;
break;
case '%=':
if (b === 0) return '赋值的取模除数为 0';
operand = Math.trunc(a) % Math.trunc(b);
break;
case '&=': operand = Math.trunc(a) & Math.trunc(b); break;
case '|=': operand = Math.trunc(a) | Math.trunc(b); break;
case '^=': operand = Math.trunc(a) ^ Math.trunc(b); break;
case '<<=': operand = Math.trunc(a) << (Math.trunc(b) & 31); break;
case '>>=': operand = Math.trunc(a) >> (Math.trunc(b) & 31); break;
default: operand = a;
}
}
const assignFloat = op === '=' ? !!rhs.floating : anyFloat;
env[lhs.name] = operand;
values.push({ value: operand, name: lhs.name, floating: assignFloat });
return {
action:
op === '='
? `赋值：变量 ${lhs.name}（${fmt(base)}） = ${fmt(b)}`
: `复合赋值 ${op}：变量 ${lhs.name}（${fmt(base)}） → ${fmt(operand)}`,
};
}

let r: number;
switch (op) {
case '+': r = a + b; break;
case '-': r = a - b; break;
case '*': r = a * b; break;
case '/':
if (b === 0) return '除数为 0';
// C 的规则：整数 / 整数才截断，任一为浮点则走浮点除法
r = anyFloat ? a / b : Math.trunc(a / b);
break;
case '**': r = a ** b; break;
case '%': {
const bad = badInt('%');
if (bad) return bad;
if (b === 0) return '取模的除数为 0';
r = Math.trunc(a) % Math.trunc(b);
break;
}
case '<<': {
const bad = badInt('<<');
if (bad) return bad;
r = Math.trunc(a) << (Math.trunc(b) & 31);
break;
}
case '>>': {
const bad = badInt('>>');
if (bad) return bad;
r = Math.trunc(a) >> (Math.trunc(b) & 31);
break;
}
case '<': r = truthy(a < b); break;
case '<=': r = truthy(a <= b); break;
case '>': r = truthy(a > b); break;
case '>=': r = truthy(a >= b); break;
case '==': r = truthy(a === b); break;
case '!=': r = truthy(a !== b); break;
case '&':
case '^':
case '|': {
const bad = badInt(op);
if (bad) return bad;
const t = (x: number, y: number) =>
op === '&' ? x & y : op === '^' ? x ^ y : x | y;
r = t(Math.trunc(a), Math.trunc(b));
break;
}
case '&&': r = truthy(a) && truthy(b) ? 1 : 0; break;
case '||': r = truthy(a) || truthy(b) ? 1 : 0; break;
default: return `不支持的运算符：${op}`;
}
if (!Number.isFinite(r)) {
return `运算 ${a} ${op} ${b} 的结果超出双精度可表示范围`;
}
/*
 * 结果类型（C 的常规算术转换）：
 * 算术与位运算里任一为浮点则结果是浮点；
 * 比较与逻辑运算的结果恒为整数 0/1。
 */
const resultFloat = anyFloat && '+-*/%**&|^<<>>='.includes(op);
values.push({ value: r, floating: resultFloat });
return {
action: `弹出 ${fmt(a)} ${op} ${fmt(b)}，计算得 ${fmt(r)} 并压回操作数栈`,
};
}

function snap(
steps: Step[],
token: string,
values: Operand[],
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

/**
 * @param variables 变量表（变量名 → 数值）。表达式里出现的标识符按此表取值；
 *                   未提供的标识符视为未定义并报错。
 */
export function evaluateExpression(
input: string,
variables: Record<string, number> = {},
): EvalResult {
const steps: Step[] = [];
const values: Operand[] = [];
const operators: string[] = [];
/** 求值过程中的变量表：赋值与 ++/-- 直接改它 */
const env: Record<string, number> = { ...variables };

const tokens = tokenize(input.trim());
if (typeof tokens === 'string') return { ok: false, steps, variables: env, error: tokens };
if (!tokens.length) return { ok: false, steps, variables: env, error: '请输入表达式' };

let expectOperand = true;
/** 上一个读到的标识符，用于把后缀 ++/-- 绑定到它（`a++` vs `++a`） */
let lastIdent = '';

/*
 * 预声明赋值左值。
 *
 * `c = 1 + 2` 里的 c 之前不在变量表里，按 C 的规则会报「未定义」，
 * 但这是给人用的教学工具 —— 允许赋值顺手声明变量更符合直觉。
 * 因此先把「后面紧跟赋值运算符」的标识符补进 env（初值 0）。
 * 只读的拼写错误仍然照常报「未定义的变量」。
 */
for (let i = 0; i < tokens.length - 1; i++) {
const t = tokens[i]!;
if (t.kind !== 'ident') continue;
const next = tokens[i + 1]!.token;
if (!ASSIGN_OPS.has(next)) continue;
if (!(t.token in env)) {
env[t.token] = 0;
steps.push({
index: steps.length + 1,
token: t.token,
operands: [],
operators: [],
action: `赋值目标 ${t.token} 尚未定义，按初值 0 声明`,
});
}
}

const pushOp = (op: string, displayToken: string, label?: string) => {
while (operators.length) {
const top = operators[operators.length - 1]!;
if (top === '(') break;
const topPrec = precOf(top);
const opPrec = precOf(op);
// cast 运算符在栈里是 `cast:int` 这种形式，逐个登记不现实，用前缀判断
const isRightAssoc = RIGHT_ASSOC.has(op) || op.startsWith('cast');
const shouldPop = isRightAssoc ? topPrec > opPrec : topPrec >= opPrec;
if (!shouldPop) break;
const r = applyOperator(values, operators, env);
if (typeof r === 'string') throw new Error(r);
snap(steps, `apply ${top}`, values, operators, r.action);
}
operators.push(op);
snap(steps, displayToken, values, operators, label ?? `运算符 ${op} 入栈`);
};

try {
for (const t of tokens) {
const { token, kind } = t;
if (kind === 'number') {
const n = t.value ?? Number(token);
values.push({ value: n, floating: t.floating });
snap(steps, token, values, operators, `数字 ${token} = ${fmt(n)} 入操作数栈`);
expectOperand = false;
continue;
}

// 类型转换 (int)3.7 —— 与一元运算符同优先级、右结合
if (kind === 'cast') {
const ty = t.cast ?? 'int';
pushOp(`cast:${ty}`, `(${ty})`, `类型转换 → (${ty})`);
expectOperand = true;
continue;
}

if (kind === 'ident') {
if (!(token in env)) {
throw new Error(`未定义的变量：${token}`);
}
lastIdent = token;
const v = env[token]!;
// 变量没有声明类型，按值判：整数值按整数用，非整数值按浮点用
values.push({ value: v, name: token, floating: !Number.isInteger(v) });
snap(steps, token, values, operators, `变量 ${token}（${fmt(v)}） 入操作数栈`);
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
const r = applyOperator(values, operators, env);
if (typeof r === 'string') throw new Error(r);
snap(steps, `apply ${top}`, values, operators, r.action);
}
if (!operators.length) throw new Error('括号不匹配：缺少左括号');
operators.pop();
snap(steps, token, values, operators, '弹出左括号');
expectOperand = false;
continue;
}

// 条件运算符的 '?' 与 ':'
if (token === '?') {
// 条件部分（如 a > b）必须先算完：把优先级高于 ? 的运算符弹出求值，
// 这样 cond 会作为 ?: 的第一个操作数留在栈底。
while (operators.length) {
const top = operators[operators.length - 1]!;
if (top === '(' || top === '?') break;
if (precOf(top) <= (PRECEDENCE['?:'] ?? 0)) break;
const r = applyOperator(values, operators, env);
if (typeof r === 'string') throw new Error(r);
snap(steps, `apply ${top}`, values, operators, r.action);
}
operators.push('?');
snap(steps, token, values, operators, '条件分支起点 ? 入栈，等待 :');
expectOperand = true;
continue;
}
if (token === ':') {
if (!operators.includes('?')) {
throw new Error('运算符 : 没有对应的 ?');
}
// 真分支内部的运算符（如 a ? b + c : …）属于 '?' 之上但优先级更高，
// 先弹出求值，真值随后作为 ?: 的第二个操作数留在栈上。
const deferred: string[] = [];
let sawQuestion = false;
while (operators.length) {
const top = operators.pop()!;
if (top === '?') {
sawQuestion = true;
break;
}
if (top === '(') throw new Error('括号不匹配：: 前缺少右括号');
deferred.push(top);
}
if (!sawQuestion) throw new Error('运算符 : 没有对应的 ?');
for (let i = deferred.length - 1; i >= 0; i--) {
const d = deferred[i]!;
operators.push(d);
const r = applyOperator(values, operators, env);
if (typeof r === 'string') throw new Error(r);
snap(steps, `apply ${d}`, values, operators, r.action);
}
operators.push('?:');
snap(steps, token, values, operators, '遇到 :，合并 ? 与 : 为条件运算符 ?:');
expectOperand = true;
continue;
}

// ++ / --：位置决定前缀还是后缀
if (token === '++' || token === '--') {
if (expectOperand) {
pushOp('pre' + token, 'pre' + token);
expectOperand = false;
} else if (lastIdent) {
pushOp('post' + token, 'post' + token);
// 后缀已经把「值」放进栈里了，后面期待的仍是运算符而非操作数
expectOperand = false;
} else {
throw new Error(`${token} 的左边必须是变量`);
}
continue;
}

// 运算符
if (expectOperand) {
if (token === '+' || token === '-') {
pushOp('u' + token, 'u' + token);
} else if (token === '!' || token === '~') {
pushOp(token, token);
} else if (token === ',') {
throw new Error('运算符 , 缺少左操作数');
} else {
throw new Error(`运算符 ${token} 缺少左操作数`);
}
continue;
}

pushOp(token, token);
expectOperand = true;
}

while (operators.length) {
const top0 = operators[operators.length - 1]!;
if (top0 === '?') throw new Error('条件运算符缺少 : 分支（写法应为「条件 ? 真值 : 假值」）');
if (top0 === '(') throw new Error('括号不匹配：缺少右括号');
const top = operators[operators.length - 1]!;
const r = applyOperator(values, operators, env);
if (typeof r === 'string') throw new Error(r);
snap(steps, `apply ${top}`, values, operators, r.action);
}

if (values.length !== 1) {
throw new Error(
values.length > 1
? '表达式不完整：相邻的标识符或数字之间缺少运算符'
: '表达式不完整：缺少操作数',
);
}
const result = values[0]!.value;
snap(steps, '完成', values, operators, `最终结果：${fmt(result)}`);
return { ok: true, result, steps, variables: env };
} catch (err) {
return { ok: false, steps, variables: env, error: (err as Error).message };
}
}
