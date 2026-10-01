/**
 * 站点使用的 Material Icons
 *
 * 来自 @mdui/icons（MIT，Google Material Symbols）。全部本地打包，
 * 不依赖 Google Fonts CDN —— 本站面向国内访问，且 CDN 挂掉会导致整站图标消失。
 *
 * 每个图标是一个独立的 Web Components 文件，<mdui-icon-xxx> 即其注册名。
 * 命名规则为连字符（如 dark-mode.js → <mdui-icon-dark-mode>）。
 *
 * 新增图标：先在 node_modules/@mdui/icons/ 中确认文件名（连字符命名，
 * 无 fill 变体，outline 变体在文件名后加 --outlined），再在此登记。
 *
 * ⚠️ 加之前必须查重：mdui 的全局构建自带一小套图标，直接用它们定义过的名字
 * 再次 customElements.define() 会抛 NotSupportedError，且**整个图标 chunk
 * 都会执行失败**（表现为页面上所有图标一起消失，不是单个图标失效）。
 * mdui.global.js 内置的名字：
 *   arrow-right / cancel--outlined / check / check-box /
 *   check-box-outline-blank / circle / clear / error /
 *   indeterminate-check-box / radio-button-unchecked /
 *   visibility / visibility-off
 * 这些直接用 <mdui-icon-xxx> 即可，不要从 @mdui/icons 导入。
 * 查重命令：
 *   grep -o 'mdui-icon-[a-z0-9-]*' public/vendor/mdui/mdui.global.js | sort -u
 */

// 工具卡片
import '@mdui/icons/monitor-weight.js';
import '@mdui/icons/calculate.js';
import '@mdui/icons/translate.js';
import '@mdui/icons/graphic-eq.js';
import '@mdui/icons/qr-code-scanner.js';
import '@mdui/icons/font-download.js';
import '@mdui/icons/code.js';
import '@mdui/icons/functions.js';
import '@mdui/icons/account-tree.js';
import '@mdui/icons/water-drop.js';

// 导航
import '@mdui/icons/home.js';
import '@mdui/icons/article.js';
import '@mdui/icons/apps.js';
import '@mdui/icons/rss-feed.js';

// 外观设置
import '@mdui/icons/color-lens.js';

// 纪年转换
import '@mdui/icons/calendar-month.js';

// 高程作业小工具
import '@mdui/icons/swap-horiz.js';
import '@mdui/icons/memory.js';
import '@mdui/icons/light-mode.js';
import '@mdui/icons/dark-mode.js';

// 操作
import '@mdui/icons/arrow-back.js';
// mdui-select 的下拉指示（arrow-right 是 mdui 内置的 Material Icons 字形名，
// 依赖字体且本站不引 Google Fonts，故另注册一个 SVG 图标）
import '@mdui/icons/arrow-drop-down.js';
import '@mdui/icons/check-circle.js';

export {};
