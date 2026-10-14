# TikZ Editor — 许可与改动说明

本目录是 **TikZ Editor** 网页版的自托管构建产物，由本站重新编译并汉化后分发。
软件的功能介绍见同目录的 [`README.md`](README.md)。

- 上游仓库：<https://github.com/DominikPeters/tikz-editor>
- 上游版本：`0.6.0`（master 分支，commit `9ce06770a3bcbade71a7eb27f4e14e8423d02ebb`，2026-10-07）
- 在线原版：<https://tikz.dev/editor>
- 许可证：**MIT**，全文见 [`LICENSE`](LICENSE)
- 版权：Copyright (c) 2026 Dominik Peters

按 MIT 的要求，上述版权声明与许可全文随本副本一同分发，未作任何删改。
应用内的「帮助 → 关于」对话框同样保留了作者、许可证与上游网址的署名。

TikZ Editor 是一个所见即所得的 TikZ 编辑器：它自带 TeX/TikZ 解析器与渲染器，
在浏览器里把 TikZ 源码画成图形，画布上的拖拽编辑也会反向写回源码，
**不依赖服务端 LaTeX**。

## 本站的改动

产物由上游源码重新构建，构建前对源码做了以下修改：

1. **界面汉化**。上游没有任何 i18n 机制，所有文案都是硬编码的英文字面量，
   因此汉化是直接改源码。改完后源码里含中文的文案共 **932 处，分布在 78 个文件**
   （字符串字面量 791、JSX 文本节点 128、模板串 13）：
   - 菜单栏（`app-menu/default-menu.ts`）、画布右键菜单（`context-menu/canvas-context-menu.ts`）
   - 工具栏与工具提示、检查器 / 样式 / 对象 / 图形 / 叠加层 / 源码等面板
     （面板标签在 `DockLayout.tsx` 的 flexlayout `name:` 字段里）
   - 设置、各类导出对话框、示例目录的名称与说明、关于对话框
   - 撤销历史标签（`store/reducer.ts`）、状态栏、错误提示与失败原因
   - 开发者面板与能力清单

   **刻意保留英文**的部分：
   - 专有名词与产品名：TikZ Editor、PGF/TikZ、arXiv、Codex、ChatGPT、GitHub、npm、Homebrew、WSL、SVGO、TikZJax
   - 会写进 TikZ 源码的标识符：颜色名（`blue`、`teal`…）、TikZ 选项名与关键字
     （`line width`、`inner sep`、`matrix of nodes`、`on background layer`、`north east`…）、
     自动补全词表、形状名
   - CSS 字体栈、SVG path 数据、单位与快捷键字母（`选择 (V)` 里的 `V` 原样保留）
   - 导入 SVG 时「不支持的裁剪」那一类的技术原因短语（约 30 条），仍是英文

2. **资源基路径**。`apps/web/vite.config.ts` 的 `base` 由上游的 `/editor/web/`
   改为本站的 `/apps/tikz-editor/`，否则 JS/CSS/worker 全部 404。

3. **语言与标题**。`index.html` 的 `lang` 由 `en` 改为 `zh-CN`，
   标题改为「TikZ 图形编辑器」；`browser-platform.ts` 里 `document.title`
   的回退值同步改成中文名，避免运行时把标题覆盖回英文。

除此之外没有改动任何功能逻辑。

## 构建方式

上游是 npm workspaces monorepo，网页版只需要其中 6 个包：

```bash
# 根 package.json 的 workspaces 裁剪为：
#   packages/lezer-tex, packages/lezer-tikz, packages/lang-tikz,
#   packages/core, packages/app, apps/web
# apps/web 的 devDependencies 去掉 @playwright/test / playwright-core / tsx，
# 并把 build 脚本从「generate:example-previews && vite build」改为「vite build」
# ——示例预览的生成物 packages/app/src/ui/examples/generated-open-example-previews.ts
#   上游已经提交在仓库里，无需重新生成（那一步要用 Playwright 截图）。
npm install
cd apps/web && npm run build     # 产物在 apps/web/dist
```

`vite.config.ts` 用 alias 把 `@tikz-editor/*` 直接指向各包的 `src`，
所以不需要先对每个包跑 `tsc`。

⚠️ **必须经 `npm run build` 而不是直接 `npx vite build`**：配置里
`import.meta.env.TIKZ_EDITOR_VERSION` 取的是 `process.env.npm_package_version`，
只有 npm 会从 `package.json` 注入它。绕过 npm 直接调 vite 会让「关于」对话框
里的版本号退回默认的 `0.1.0`（实际应为 `0.6.0`）。

## 体积

产物约 60 MB。绝大部分来自
`packages/core/src/text/tex/fonts/data/computer-modern-ot1.generated.ts`
——一个 16.5 MB 的 Computer Modern 字体度量数据文件（TeX 文本排版必需），
它会被打进主 chunk 和两个 worker（缩略图渲染、属性清理），因此重复了三份。
这是上游的结构决定的，本站未作改动。

## 已知限制

- **Codex 助手**只在桌面版可用，网页版会提示「仅在桌面版可用」。
- **本机 LaTeX 编译**（TikZJax 之外的路径）在网页版不可用；
  「显示编译后的图形」会尝试从 CDN 加载 TikZJax，需要外网可达。
- 「从 arXiv 打开」需要访问 arxiv.org。
- 文件读写依赖 File System Access API，Firefox / Safari 下会退回浏览器下载。

## 文件

```
index.html          应用入口（lang=zh-CN，标题已汉化）
assets/             Vite 构建产物（JS / CSS / worker）
docs/               上游随包的 TikZ 键位文档 JSON（供编辑器内查询）
README.md           本站撰写的中文功能介绍（上游 README 的改写，未热链其截图）
LICENSE             上游 MIT 许可证全文，未作删改
NOTICE.md           本文件
```
