/**
 * 双栈表达式求值器的回归测试。
 *
 * 运行：npm run test:eval
 * （会先用 esbuild 把 src/lib/stack-eval.ts 打成临时 ESM 再跑）
 *
 * 覆盖：建库前的 20 条基线、变量、赋值（11 种含复合）、前置/后置 ++--、
 * 逗号、条件 ?:、幂 **，以及各种组合场景。
 * 求值器的行为只由这份测试锁定 —— 改 stack-eval.ts 前先跑一遍。
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'stack-eval-'));
const bundle = join(dir, 'stack-eval.mjs');
execFileSync(
  'npx',
  [
    'esbuild',
    'src/lib/stack-eval.ts',
    '--bundle',
    '--format=esm',
    `--outfile=${bundle}`,
    '--log-level=error',
  ],
  { stdio: 'inherit' },
);
const { evaluateExpression } = await import(pathToFileURL(bundle).href);

let pass = 0;
let fail = 0;

/** cases: [表达式, 变量表, 期望结果]；期望为 null 表示只验证不报错（取实际值） */
function check(label, input, vars, expected) {
  const r = evaluateExpression(input, vars ? { ...vars } : {});
  if (typeof expected === 'function') {
    if (expected(r)) { pass++; return; }
    fail++;
    console.log(`FAIL ${label}: ${JSON.stringify(input)} => ${r.ok ? r.result : 'ERR ' + r.error}`);
    return;
  }
  if (expected === null) {
    if (r.ok) { pass++; return; }
    fail++;
    console.log(`FAIL ${label}: ${JSON.stringify(input)} => ERR ${r.error}`);
    return;
  }
  if (r.ok && r.result === expected) { pass++; return; }
  fail++;
  console.log(`FAIL ${label}: ${JSON.stringify(input)} => ${r.ok ? r.result : 'ERR ' + r.error} (期望 ${expected})`);
}

/** 期望报错 */
function checkErr(label, input, vars, fragment) {
  const r = evaluateExpression(input, vars ? { ...vars } : {});
  if (!r.ok && r.error.includes(fragment)) { pass++; return; }
  fail++;
  console.log(`FAIL ${label}: ${JSON.stringify(input)} => ${r.ok ? 'ok=' + r.result : r.error} (期望报错含「${fragment}」)`);
}

// ── 旧基线：20 条，行为必须完全不变 ──
console.log('--- 旧基线 ---');
check('基线1', '1 + 2 * 3 - (4 - 1)', {}, 4);
check('基线2', '(1+2)*3', {}, 9);
check('基线3', '7 / 2', {}, 3);
check('基线4', '-7 / 2', {}, -3);
check('基线5', '7 % -2', {}, 1);
check('基线6', '5 >> 1', {}, 2);
check('基线7', '~5', {}, -6);
check('基线8', '1 && 0', {}, 0);
check('基线9', '3 < 4', {}, 1);
check('基线10', '1 < 2 == 1', {}, 1);
check('基线11', '2.5 * 2', {}, 5);
check('基线12', '1 << 33', {}, 2);
check('基线13', '5 & 3 | 8 ^ 1', {}, 9);
checkErr('基线14a', 'a', {}, '未定义的变量：a');
checkErr('基线14b', '', {}, '请输入表达式');
checkErr('基线15', '1 +', {}, '缺少操作数');
checkErr('基线16', '(1+2', {}, '缺少右括号');
checkErr('基线17', '1 @ 2', {}, '不支持的字符：@');
checkErr('基线18', '% 5', {}, '缺少左操作数');
checkErr('基线19', '1.2.3', {}, '缺少运算符');
check('基线20-变量', 'a + b * 2', { a: 5, b: 3 }, 11);

// ── 变量（上一轮已有）──
console.log('--- 变量 ---');
check('变量-后缀名', '_u1 + a', { _u1: 7, a: 5 }, 12);
checkErr('变量-大小写', 'A', { a: 1 }, '未定义的变量：A');
checkErr('变量-未定义', 'missing + 1', {}, '未定义的变量：missing');
check('变量-一元负', '-x', { x: -2 }, 2);
check('变量-取反', '!n', { n: 0 }, 1);

// ── 赋值 ──
console.log('--- 赋值 ---');
check('赋值-简单', 'a = 5', { a: 1 }, 5);
check('赋值-返回表', 'a = 9', { a: 1 }, (r) => r.variables?.a === 9);
check('赋值-链式', 'a = b = 3', { a: 0, b: 0 }, 3);
check('赋值-右结合', 'a = b + 1', { a: 0, b: 4 }, 5);
check('赋值-加', 'a += 3', { a: 4 }, 7);
check('赋值-减', 'a -= 3', { a: 4 }, 1);
check('赋值-乘', 'a *= 3', { a: 4 }, 12);
check('赋值-除', 'a /= 2', { a: 9 }, 4);
checkErr('赋值-除零', 'a /= 0', { a: 9 }, '除数为 0');
check('赋值-模', 'a %= 3', { a: 10 }, 1);
check('赋值-位与', 'a &= 6', { a: 15 }, 6);
check('赋值-位或', 'a |= 8', { a: 3 }, 11);
check('赋值-异或', 'a ^= 3', { a: 10 }, 9);
check('赋值-左移', 'a <<= 2', { a: 3 }, 12);
check('赋值-右移', 'a >>= 1', { a: 12 }, 6);
check('赋值-表达式内', 'b + (a = 5)', { a: 0, b: 1 }, 6);
check('赋值-条件赋值', 'a = b > 0 ? 1 : -1', { a: 0, b: 5 }, 1);
checkErr('赋值-字面量目标', '5 = 3', {}, '左边必须是变量');
checkErr('赋值-表达式目标', 'a + b = 3', { a: 1, b: 2 }, '左边必须是变量');

// ── 自增自减 ──
console.log('--- ++ / -- ---');
check('递增-前缀值', '++a', { a: 1 }, 2);
check('递增-前缀写回', '++a', { a: 1 }, (r) => r.variables?.a === 2);
check('递增-后缀值', 'a++', { a: 1 }, 1);
check('递增-后缀写回', 'a++', { a: 1 }, (r) => r.variables?.a === 2);
check('递减-前缀', '--a', { a: 3 }, 2);
check('递减-后缀', 'a--', { a: 3 }, 3);
check('递增-混合', 'a++ + ++a', { a: 1 }, 4);
check('递增-赋值结合', 'a = ++b + 1', { a: 0, b: 4 }, 6);
checkErr('递增-字面量', '5++', {}, '左边必须是变量');
checkErr('递增-缺少操作数', '++', {}, '缺少操作数');

// ── 逗号运算符 ──
console.log('--- 逗号 ---');
check('逗号-基本', '1, 2, 3', {}, 3);
check('逗号-带副作用', 'a = 1, a + 1', { a: 0 }, 2);
check('逗号-优先级最低', '1 + 2, 3 * 4', {}, 12);
check('逗号-变量', 'a, b', { a: 1, b: 9 }, 9);
checkErr('逗号-缺右', '1,', {}, '缺少右操作数');

// ── 条件运算符 ──
console.log('--- 条件 ---');
check('三元-真', '1 ? 10 : 20', {}, 10);
check('三元-假', '0 ? 10 : 20', {}, 20);
check('三元-比较', 'a > b ? a - b : b - a', { a: 1, b: 5 }, 4);
check('三元-变量', 'n ? a : b', { n: 1, a: 7, b: 9 }, 7);
check('三元-嵌套', 'a ? (b ? 1 : 2) : 3', { a: 1, b: 0 }, 2);
check('三元-运算结合', 'a + (b ? 1 : 2)', { a: 10, b: 0 }, 12);
checkErr('三元-缺真分支', 'a ? : 2', { a: 1 }, '?: 缺少操作数');
checkErr('三元-缺假分支', 'a ? 1', { a: 1 }, '缺少 : 分支');

// ── 幂运算（扩展，非 C 标准）──
console.log('--- 幂 ** ---');
check('幂-基本', '2 ** 3', {}, 8);
check('幂-右结合', '2 ** 3 ** 2', {}, 512);
check('幂-优先级高于乘', '2 * 3 ** 2', {}, 18);

// ── 追加：赋值声明新变量 ──
console.log('--- 赋值声明 ---');
check('声明-赋值新变量', 'c = 1 + 2', {}, 3);
check('声明-回写', 'c = 7', {}, (r) => r.variables?.c === 7);
check('声明-链式新变量', 'd = e = 2', {}, 2);
checkErr('声明-只读拼写', 'zzz + 1', {}, '未定义的变量：zzz');
checkErr('声明-只读仍报错', 'zzz + 1', {}, '未定义的变量：zzz');
check('声明-三元内赋值', 'f = g > 0 ? 1 : 2', { g: 5 }, 1);
check('声明-逗号内赋值', 'h = 0, i = h + 1', {}, 1);

console.log('--- 组合场景 ---');
check('组合-累加循环式', 'a = 0, a + 1, a + 2, a + 3', { a: 0 }, 3);
check('组合-混合赋值三元', 'a = b > 0 ? (a += 10, a) : 0', { a: 1, b: 1 }, 11);
check('组合-嵌套赋值', 'a = (b = 2) + (c = 3)', {}, 5);
check('组合-短路配合赋值', '0 && (a = 9)', { a: 1 }, 0);
// C 标准里 assignment 不能直接出现在 ?: 的分支（须加括号），求值器照此拒绝
checkErr('组合-条件裸赋值', 'a > 0 ? a *= 2 : a = 0', { a: 3 }, '左边必须是变量');
check('组合-条件括号赋值', 'a > 0 ? (a *= 2) : (a = 0)', { a: 3 }, 6);
check('组合-逗号返回赋值', 'a = (a = 3, a + 1)', {}, 4);
check('组合-位运算赋值', 'a = 6, a ^= 3, a', {}, 5);
check('组合-移位赋值', 'a = 1, a <<= 4, a', {}, 16);
check('组合-嵌套三元', 'a ? b ? 1 : 2 : 3', { a: 1, b: 0 }, 2);
check('组合-括号保护', '(a = 1) + (a = 2)', {}, 3);



// ── 字面量与类型转换 ──
console.log('--- 字面量 ---');
check('十六进制', '0x1F', {}, 31);
check('十六进制大写', '0XFF', {}, 255);
check('二进制', '0b1010', {}, 10);
check('八进制', '017', {}, 15);
check('八进制零', '010', {}, 8);
checkErr('八进制含8', '08', {}, '无效的八进制数字');
checkErr('字面量溢出', '1e400', {}, '超出双精度');
checkErr('除零', '5 / 0', {}, '除数为 0');

console.log('--- 后缀 ---');
check('long后缀', '10L', {}, 10);
check('unsigned后缀', '10u', {}, 10);
check('ULL后缀', '100ULL', {}, 100);
check('float后缀', '1.5f', {}, 1.5);
check('后缀与八进制', '017L', {}, 15);
check('后缀与十六进制', '0x1FUL', {}, 31);
check('后缀参与运算', '2 * 10u', {}, 20);

console.log('--- 类型转换 ---');
check('转int', '(int)3.7', {}, 3);
check('转int负数', '(int)-3.9', {}, -3);
check('转double', '(double)5', {}, 5);
check('转char', '(char)65', {}, 65);
check('转bool', '(bool)3', {}, 1);
check('转unsigned long', '(unsigned long)5.7', {}, 5);
check('转换参与运算', '(int)3.7 + 1', {}, 4);
check('连续转换', '(int)(char)65 + 1', {}, 66);
checkErr('转换缺操作数', '(int)', {}, '缺少操作数');
check('括号分组不受影响', '(a) + 1', { a: 4 }, 5);
checkErr('裸括号仍报错', '(foo)1', {}, '未定义的变量');

console.log('--- 溢出保护 ---');
checkErr('浮点溢出', '1e300 * 1e300', {}, '超出双精度');
checkErr('幂溢出', '1e200 ** 10', {}, '超出双精度');


// ── 整数 / 浮点类型规则 ──
console.log('--- 除法按类型 ---');
check('整除截断', '10 / 3', {}, 3);
check('左侧浮点', '10.0 / 3', {}, 10 / 3);
check('右侧浮点', '10 / 3.0', {}, 10 / 3);
check('两侧浮点', '10.0 / 3.0', {}, 10 / 3);
check('f后缀浮点', '10.0f / 3', {}, 10 / 3);
check('科学计数浮点', '1e1 / 4', {}, 2.5);
check('l后缀仍按整数', '10L / 3', {}, 3);
check('转int后整除', '(int)7 / 2', {}, 3);
check('混合运算', '7 / 2 * 2.0', {}, 6);
check('浮点取模链', '10.5 - 0.5', {}, 10);

console.log('--- 整数运算符拒绝浮点 ---');
checkErr('模遇浮点', '10 % 3.0', {}, '% 只能作用于整数');
checkErr('左移遇浮点', '1 << 1.5', {}, '<< 只能作用于整数');
checkErr('右移遇浮点', '8 >> 1.5', {}, '>> 只能作用于整数');
checkErr('位与遇浮点', '5 & 2.5', {}, '& 只能作用于整数');
checkErr('位或遇浮点', '5 | 2.5', {}, '| 只能作用于整数');
checkErr('异或遇浮点', '5 ^ 2.5', {}, '^ 只能作用于整数');
checkErr('取反遇浮点', '~3.7', {}, '~ 只能作用于整数');
check('显式转换后可移位', '1 << (int)1.5', {}, 2);
check('显式转换后可取模', '(int)10.5 % 3', {}, 1);
checkErr('复合赋值遇浮点', 'a %= 1.5', { a: 10 }, '%= 只能作用于整数');
check('一元负号保类型', '-2.5 / 1', {}, -2.5);
check('浮点变量参与', 'x / 2', { x: 7.5 }, 3.75);
check('整数变量参与', 'x / 2', { x: 7 }, 3);
check('三元浮点', 'a > 0 ? 1.5 : 2', { a: 1 }, 1.5);
check('逗号取右值类型', 'a = 1, 3.0 / 2', {}, 1.5);



// ── 整型位宽回绕（C 语义）──
console.log('--- 位宽回绕 ---');
check('char回绕', '(char)300', {}, 44);
check('char负值', '(char)-1', {}, -1);
check('unsigned char回绕', '(unsigned char)-1', {}, 255);
check('short回绕', '(short)70000', {}, 4464);
check('short负值', '(short)-1', {}, -1);
check('unsigned int回绕', '(unsigned int)-1', {}, 4294967295);
check('unsigned等价unsigned int', '(unsigned)-1', {}, 4294967295);
check('int取低32位', '(int)1e18', {}, -1486618624);
check('long在安全范围', '(long)1e15', {}, 1e15);
checkErr('size_t越界', '(size_t)-1', {}, '超出双精度');
checkErr('unsigned long long越界', '(unsigned long long)-1', {}, '超出双精度');
checkErr('long越界', '(long)1e18', {}, '超出双精度');
check('回绕后仍是整数', '(char)300 % 2', {}, 0);

console.log('--- 三种 cast 写法 ---');
check('C风格', '(int)3.7', {}, 3);
check('函数式', 'int(3.7)', {}, 3);
check('static_cast', 'static_cast<int>(3.7)', {}, 3);
check('三种等价-char', 'static_cast<char>(300)', {}, 44);
check('三种等价-函数式', 'short(70000)', {}, 4464);
check('函数式带空格', 'int (3.7)', {}, 3);
check('unsigned单独', 'unsigned(-1)', {}, 4294967295);
check('long long', 'long long(5.9)', {}, 5);
check('bool函数式', 'bool(2)', {}, 1);
check('static_cast bool', 'static_cast<bool>(9)', {}, 1);
check('函数式含表达式', 'int(1 + 2)', {}, 3);
check('转换后参与运算', 'static_cast<int>(3.9) + 1', {}, 4);
check('嵌套转换', 'int(int(3.7))', {}, 3);
check('混合写法', 'static_cast<int>(int(2.9)) + 1', {}, 3);

console.log(`\n总计：通过 ${pass} / 失败 ${fail}`);
if (fail) process.exit(1);
