# IT-Tools — 站点修改说明（NOTICE）

本目录是 [IT-Tools](https://github.com/CorentinTh/it-tools) 的**构建产物**，作为第三方应用整包分发。

- **上游**：<https://github.com/CorentinTh/it-tools>
- **上游版本**：`package.json` version `2024.10.22-7ca5933`，源码取自 `main` 分支 commit
  [`d505845f918e946ec300af7b36efc107e2f66e9e`](https://github.com/CorentinTh/it-tools/commit/d505845f918e946ec300af7b36efc107e2f66e9e)
- **许可证**：**GNU GPLv3**（全文见本目录 [`LICENSE`](./LICENSE)）
- **本目录内文件的许可证**：GPLv3。仓库根的 MIT LICENSE **不覆盖**本目录。

## 对应源码（Corresponding Source）

GPLv3 §6 要求提供本构建的对应源码，由两部分组成：

1. 上游源码：上述 commit 的仓库归档
   <https://github.com/CorentinTh/it-tools/archive/d505845f918e946ec300af7b36efc107e2f66e9e.tar.gz>
2. 本站修改补丁：[`station-mods.patch`](./station-mods.patch)（本目录同级存放）

应用方式：

```bash
tar -xzf d505845f918e946ec300af7b36efc107e2f66e9e.tar.gz
cd it-tools-d505845f918e946ec300af7b36efc107e2f66e9e
patch -p1 < station-mods.patch
pnpm install
BASE_URL=/apps/it-tools/ VITE_VERCEL_ENV=production NODE_OPTIONS=--max_old_space_size=8192 pnpm build
```

## 站点修改清单（均为 GPLv3 修改）

补丁 `station-mods.patch` 覆盖 **169 个文件（451 KB）**，按类别归纳：

| # | 范围 | 修改 |
| --- | --- | --- |
| 1 | `vite.config.ts`、`src/main.ts` | 移除 `vite-plugin-pwa` 与 `registerSW()`（站点自有根作用域 Service Worker，嵌套的自动更新 SW 会争抢导航控制）；`main.ts` 引入对齐样式 `./assets/station.css` |
| 2 | `src/router.ts` | `createWebHistory(baseUrl)` → `createWebHashHistory()`：站点是无 SPA 回退的纯静态托管（GitHub Pages），hash 路由保证深链刷新不 404 |
| 3 | 主题对齐（12 个文件） | Naive UI 主题（`src/themes.ts`：主色、圆角 8/6px、字体栈）；应用自用 `c-*` 组件令牌（`src/ui/theme/themes.ts`：light primary `#18a058` → `#006689`，dark `#1ea54c` → `#79d1ff`）、c-select / c-input-text 焦点底色；UnoCSS `theme.colors.primary` → `var(--it-primary)`；命令面板选中态 `--it-on-primary`；侧栏 logo 渐变、「赞助」按钮渐变、pin 图标由绿改站内蓝系；新增 `src/assets/station.css` 承载 `--it-primary` / `--it-on-primary` / `--it-primary-soft` 与排版、`::selection`、聚焦轮廓 |
| 4 | **中文化（i18n 双语层，非字面量）** | `locales/en.yml` + `locales/zh.yml` 新增 **901 个 `station.*` 键 + 8 个工具的 `tools.<slug>.title/description`，两边叶子键完全对称**（脚本核验 1127/1127），全源码 **1160 处** `translate()` / `$t()` 调用：<br>• `station.str.*`（448）：模板静态属性/文本改写为 `:attr="$t(...)"` / `{{ $t(...) }}`<br>• `station.lbl.*`（411）：script 层 `label/heading/title/placeholder/name` 标签、og-schemas 全部展示字段、cron 语法帮助表，以及 **http-status-codes 全量**（62 个状态短语 + 63 条描述 + 5 个分类头 + 搜索结果 + `For {type}` 模板串）<br>• `station.err.*`（28）：37 条校验 `message:` + 2 处 `throw new Error()`<br>• `station.cmd.*`（14）：命令面板 5 条命令 + 4 个分组名<br>• `tools.<slug>.title/description`：8 个此前从未有语言条目的工具接入 `translate()`（否则侧栏直接显示英文）<br>另：cronstrue 换用 `cronstrue-i18n` 全语言包（表达式说明随界面语言）；修正上游 zh 中仅有的 2 处英文残留；对 `@` 与 `{0}` 做 vue-i18n 消息语法转义（`{'@'}`、`{'{'}`），否则解析为 linked/插值消息导致构建失败；**两处结构性字段已回退**（hash-text 的 URL query 参数名 `encoding`、http-status 模糊搜索字段名 `code` —— 二者曾被标签批量替换误翻，会导致功能失效）；用脚本反向核验「源码引用的每个 i18n key 在两份 yml 中都存在」 |
| 5 | `src/plugins/i18n.plugin.ts` | 默认语言 `en` → `zh`（站点以中文为主） |
| 6 | `index.html` | `lang="zh-CN"`；加 `noindex,nofollow`（避免与上游站点重复收录）；移除指向上游 `it-tools.tech` 的 `canonical` / `og:url` / `og:image` / `twitter:image`；mask-icon 颜色改 `#006689` |

**构建环境**：`BASE_URL=/apps/it-tools/ VITE_VERCEL_ENV=production`（后者用于排除上游的
开发调试路由）。

**未修改任何工具的功能逻辑**；以下内容按原样保留：
- `src/tools/color-converter/`（颜色转换工具自身展示的色板）——属工具内容而非主题；
- 品牌字符串（IT-Tools、GitHub、作者名）与正则 flag 名（Multiline( 等）；
- 数据表：MIME 类型清单、表情符号英文名（来自 `unicode-emoji-json`）、HTTP 状态短语——属上游数据。

## 未随包分发的上游资源

上游 `public/` 下的图片与图标资源原样进入本目录（favicon、banner、mstile 等），
许可证同 GPLv3 分发口径；`humans.txt` / `robots.txt` 为上游原样保留。

---
修改记录：915P 小站维护者 · 2026-11-11