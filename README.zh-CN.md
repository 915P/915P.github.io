# 915P.github.io

> [English](README.md) | **简体中文**

> 维护者说明另见本地 `STATION-GUIDE.md`（已加入 `.gitignore`）。

915P 个人网站，使用 [Astro](https://astro.build) + [mdui 2](https://www.mdui.org)（Material Design 3）构建，
通过 GitHub Actions 自动部署到 GitHub Pages。

## 快速开始

```bash
npm install        # 安装依赖
npm run dev        # 本地开发（默认 http://localhost:4321）
npm run build      # 构建静态产物到 dist/
npm run preview    # 预览构建结果
```

## UI 架构

界面完全按 mdui 2 官方文档的 MD3 结构搭建，没有 CSS 框架：

- `<mdui-layout>` 内放 `<mdui-top-app-bar>`（顶栏）+ 桌面端
  `<mdui-navigation-rail>`（≥840px 常驻左侧）+ 移动端
  `<mdui-navigation-bar>`（<840px 底部）。这两个导航组件在
  `mdui-layout` 内均为 absolute 定位，因此不给 `body` 加 padding。
- 暗色模式用 `mdui-theme-auto`，必须挂在 `<html>` 上（挂 `body` 会导致
  组件区域仍是亮色）。
- 顶栏的外观按钮可切换**跟随系统 / 浅色 / 深色**与**主题色**，选择存入
  `localStorage`。主题色只保存一个种子色，由 `mdui.setColorScheme()` 生成
  整套 MD3 色调板；`Base.astro` 的 `<head>` 有一段同步内联脚本在首帧前应用，
  避免刷新闪烁。
- 图标来自 `@mdui/icons`（Material Symbols，MIT），在
  `src/lib/icons.ts` 集中注册，**必须由客户端 script 导入**，
  否则会被 Astro 当作服务端依赖 tree-shake 掉。
- mdui 的组件样式由组件 JS 注入 shadow DOM，只引 `mdui.css` 不会有样式，
  所以本站分发 `mdui.global.js`（见 `public/vendor/mdui/`）。
- 样式只有语义类（`.panel`、`.stack`、`.canvas`、`.tool-head` 等），
  没有 Tailwind，也没有手写原子类。

本地文档副本在 `docs/zh-cn/`，改 UI 前建议先查对应组件文档。

## 目录结构

```
.
├─ src/
│  ├─ pages/
│  │  ├─ index.astro              # 首页
│  │  ├─ 404.astro                # 404 页
│  │  ├─ rss.xml.ts               # RSS 订阅源
│  │  ├─ blog/
│  │  │  ├─ index.astro           # 博客列表
│  │  │  └─ [...slug].astro       # 文章详情（含自动目录）
│  │  └─ tools/
│  │     ├─ index.astro           # 工具中心
│  │     ├─ radix.astro           # 进制转换
│  │     ├─ memview.astro         # 数据在内存
│  │     ├─ hanzi.astro           # 汉字编码
│  │     ├─ latex.astro           # LaTeX 编辑器（KaTeX）
│  │     ├─ cejs.astro            # 纪年转换（原版 CeJS 功能，Astro 集成）
│  │     ├─ stackcalc.astro       # C/C++ 表达式求值（双栈过程）
│  │     ├─ bmi.astro
│  │     ├─ pinyin.astro
│  │     ├─ morse.astro
│  │     ├─ editor.astro
│  │     ├─ calculator.astro
│  │     ├─ barcode.astro         # QR 码 + 20 种一维条码
│  │     └─ fonttest.astro        # 字体族 × 字重 + Unicode 符号覆盖
│  ├─ content/
│  │  └─ blog/*.md                # 博客 Markdown（Content Collections）
│  ├─ components/                 # Nav / Footer / ToolCard
│  ├─ layouts/                    # Base / Page
│  ├─ styles/global.css           # MD3 色调板覆盖 + 设计令牌 + 版式
│  └─ data/
│     ├─ tools.ts                 # 工具元数据（导航与列表共用）
│     ├─ theme.ts                 # 主题模式与主题色预设
│     ├─ symbol-blocks.json       # 字体测试页的 Unicode 符号数据
│     └─ encoding-blocks.json     # 中文编码与 CJK 扩展区字符数据
├─ public/                        # 原样拷贝到 dist 根目录
│  ├─ apps/                       # oscope / 3dweb / mindmap 原生应用
│  ├─ cejs/                       # 第三方 CeJS（BSD-3-Clause）
│  ├─ vendor/
│  │  ├─ mdui/                    # mdui 2（CSS + 全局 JS 构建）
│  │  ├─ pinyin/                  # 拼音词库（约 1 MB）
│  │  ├─ katex/                   # KaTeX（LaTeX 编辑器）
│  │  └─ barcode/                 # JsBarcode 3.12.3 + qrcode-generator
│  ├─ favicon.svg / favicon.ico   # 站点图标（在 public/ 根）
│  └─ images/                     # logo、og 图
└─ astro.config.mjs
```

## 写一篇新文章

在 `src/content/blog/` 新建 `YYYYMMDD-slug.md`：

```markdown
---
title: 文章标题
description: 一句话摘要，显示在列表页
pubDate: 2024-01-01
tags: ['随笔']
hero: /images/cover.png   # 可选
draft: false
---

正文用 Markdown 书写。
```

front matter 字段在 `src/content.config.ts` 中定义（含 zod 校验，写错会在构建时报错）。

## 添加一个新工具

1. 在 `src/pages/tools/` 新建页面，front matter 中写 `title` / `description` / `active`
2. 在 `src/data/tools.ts` 的 `builtinTools` 数组里加一条（`category` 需在 `categories` 中已存在）
3. 工具中心与首页会自动收录

## 部署

`.github/workflows/deploy.yml` 在源码有变更时触发（`src/`、`public/`、`astro.config.mjs`、`package.json`）：

```
push → 安装依赖(npm ci) → 类型检查 → 构建 → 上传产物 → 部署到 GitHub Pages
```

首次启用需要在仓库 **Settings → Pages → Build and deployment → Source** 选择
**GitHub Actions**，之后每次 push `main` 会自动发布。

## 设计令牌

站点颜色、圆角、排版全部使用 mdui 2 的 MD3 CSS 变量，没有 Tailwind 或
自定义 `@theme`。默认色调板覆写在 `src/styles/global.css` 的 `:root` 块里；
要换默认种子色时，同步 `src/data/theme.ts` 与 `global.css` 里的
`--mdui-color-*-light` / `-dark` 变量，不要手写 `on-*` 对比色。

## 注意事项

- `public/apps/` 下的原生应用不参与 Astro 构建。3D 流体与思维导图保持
  原样；示波器已把界面改为站内 `/vendor/mdui/` 的 mdui 2 / MD3 外观。
- 拼音词库约 1 MB，在浏览器端按需加载，首屏有加载提示。
- 计算器使用递归下降解析，**不使用 `eval`**，只接受数字与四则运算。
- HTML 编辑器的预览跑在 `sandbox` iframe 中，内容不会离开浏览器。
