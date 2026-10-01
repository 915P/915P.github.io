# 第三方组件与许可证声明

> [English](THIRD_PARTY_NOTICES.md) | **简体中文**

本文件记录本站所使用的全部第三方开源组件及其许可证。

**本站根目录的 [LICENSE](LICENSE) 仅适用于本站原创代码**（Astro 组件、页面、样式与博客正文）。
所有第三方组件均保留其各自原有的许可证，**不会被本站的 MIT 许可证覆盖或重新授权**。

许可证已逐一对照上游仓库的 `LICENSE` 文件或 npm 包元数据核实，而非仅依据本地副本的声明。

---

## 许可类型速查

| 标识 | 含义 | 商用 | 需署名 | 传染性 |
| --- | --- | --- | --- | --- |
| MIT | 宽松 | ✅ | ✅ | 无 |
| Apache-2.0 | 宽松 | ✅ | ✅（含 NOTICE、需说明是否修改） | 无 |
| BSD-3-Clause | 宽松 | ✅ | ✅ | 无 |
| CC BY 3.0 | 内容 | ✅ | ✅（需说明是否修改） | 无（4.0 衍生需同许可） |
| Unicode License v3 | 数据 | ✅ | ✅（需保留 Unicode 版权声明、不得暗示背书） | 无 |

---

## 0. mdui 2（本站界面库）

- **位置**：`public/vendor/mdui/`（`mdui.css` + `mdui.global.js`）
- **上游**：<https://www.mdui.org> · <https://github.com/zdhxiong/mdui>
- **版本**：2.1.5（npm `mdui`，MIT）
- **许可证**：**MIT**，Copyright 2016-2026 zdhxiong
  - 核实依据：npm registry `mdui@2.1.5` 的 `license` 字段为 `MIT`；
    上游仓库 LICENSE 为 MIT
- **本站改动**：**未修改**。`mdui.css` 与 `mdui.global.js` 均按原样分发
- **说明**：
  - 本站以「CSS + 全局 JS 构建」方式引入，而非 npm 组件级导入。
    原因是 mdui 2 的组件样式由组件 JS 通过 lit 的 `CSSResult` 注入
    shadow DOM，单独引入 `mdui.css` 不会得到组件样式。
  - 全局构建内含全部组件，**体积大于按需导入**（约 363 KB 未压缩）。
    本站页面结构简单，按需引入需在每个页面重复声明，收益有限。
  - MD3 图标字体未随库分发，本站也不使用 `icon` 属性，图标改用
    `@mdui/icons`（见下节），故不涉及 Material Icons 字体文件的
    CC BY 4.0 义务。

### 0.1 @mdui/icons（本站图标库）

- **位置**：npm 依赖，`src/lib/icons.ts` 中按需导入
- **上游**：<https://github.com/zdhxiong/mdui/tree/main/packages/icons>
- **版本**：1.0.4（npm `@mdui/icons`，MIT）
- **许可证**：**MIT**，Copyright zdhxiong；核实依据为包内 `LICENSE` 与
  `package.json` 的 `license` 字段
- **说明**：图标为 SVG path 字符串，随构建产物进入 JS chunk，**不分发字体文件**。
  本站只用其中 21 个图标，均为单色 `filled` 变体。

### 0.2 站点对 mdui 的定制

- **位置**：`src/styles/global.css`
- **内容**：覆写 `--mdui-color-*-light` / `-dark` 色调板、收窄
  `--mdui-shape-corner-*` 圆角、调整中文排版字号；另含布局工具类、
  表单原语与博客正文排版。
- **性质**：仅修改 CSS 自定义属性与新增样式规则，**未修改 mdui 源码**。
  MIT 允许此类使用。

---

## 1. CeJS（纪年转换工具）

- **位置**：`public/apps/cejs-original/CeJS/`（原版完整运行时 + `testsuite/era.htm`）
- **入口**：`/tools/cejs/`（Astro 页面在构建期读取原版 `era.htm` 的 body/CSS，直接渲染原版 DOM；不是 iframe 嵌入）
- **上游**：<https://github.com/kanasimi/CeJS>（npm 包 `vimunci`）
- **版本**：4.5.6（上游最新版 4.5.10，建议更新）
- **许可证**：**BSD-3-Clause** —— *并非 GPL*
  - 核实依据：本地 `LICENSE` 与上游 `master` 分支的 `LICENSE` 逐字节一致；
    `package.json` 声明 `"license": "BSD-3-Clause"`；npm registry 元数据一致
  - 非 fork（GitHub `fork: false`）
- **再分发要求**：保留版权声明、许可条件与免责声明。不得使用作者或贡献者名义作背书，除非获得许可
- **文件**：`public/apps/cejs-original/CeJS/LICENSE`

### 1.1 本站如何改造了原版页面

本站不再维护独立的抽象数据页，也不做 iframe 嵌入。`src/pages/tools/cejs.astro`
在构建期读取原版 `testsuite/era.htm` 的 body 和 `mdui-modern-style`，
直接插入 Astro 页面；再用动态 `<script>` 加载 `ce.js` 与 `era.js`。
原版 CeJS 的农历、天文历法、批量转换、线图下钻和数据图层功能全部保留。
本站只做以下改动：

- 去掉旧的外部 MDUI CDN，改为引用站内 `/vendor/mdui/mdui.css`；
- 注入一份 MDUI 2 / MD3 风格的覆盖样式，重做页面顶部栏、表单、表格、
  按钮、进度条和分区卡片；
- `application/locale/resources/` 只保留原版页面实际请求的 2 个文件。

### 1.2 翻译文件为独立许可（保留 2 个）

CeJS 的 `application/locale/resources/` 下大部分翻译 JSON/JS 来自
translatewiki，采用 **CC BY 3.0**，不在 BSD-3-Clause 覆盖范围内。

- 本站只保留原版页面实际会请求的 2 个文件：
  - `cmn-Hans-CN.js`
  - `gettext_plural_rules.js`
- 其余 37 个翻译文件已移除。
- 保留部分仍适用 **CC BY 3.0**，版权归 translatewiki.net 贡献者所有；本站未修改文件内容。
- `application/locale.js` 本身属 BSD-3-Clause，保留。

## 2. WebGL 流体模拟

- **位置**：`public/apps/3dweb/`
- **上游**：<https://github.com/PavelDoGreat/WebGL-Fluid-Simulation>
- **许可证**：**MIT**，Copyright (c) 2017 Pavel Dobryakov
- **许可文件**：[`public/apps/3dweb/LICENSE`](public/apps/3dweb/LICENSE)
- **说明**：`script.js` 保留了完整的 MIT 许可头，署名规范。本站未对该代码作任何修改。

### 2.1 dat.GUI 为 Apache-2.0（**不是 MIT**）

- **位置**：`public/apps/3dweb/dat.gui.min.js`
- **上游**：`dataarts/dat.gui`
- **许可证**：**Apache-2.0**，Copyright 2011 Data Arts Team, Google Creative Lab
- **义务**：保留许可文本、保留 NOTICE、**声明是否修改过该文件**
- **本站改动**：**无**。该文件按原样分发

### 2.2 致谢

`README.md` 标注了以下参考项目，其代码未被复制进本仓库：

- [mharrys/fluids-2d](https://github.com/mharrys/fluids-2d)
- [haxiomic/GPU-Fluid-Experiments](https://github.com/haxiomic/GPU-Fluid-Experiments)
- [NVIDIA GPU Gems 第 38 章](http://developer.download.nvidia.com/books/HTML/gpugems/gpugems_ch38.html)

---

## 3. My Mind 思维导图

- **位置**：`public/apps/mindmap/`
- **上游**：<https://github.com/ondras/my-mind>
- **许可证**：**MIT**，Copyright (c) 2013-2019 Ondrej Zara
- **许可文件**：[`public/apps/mindmap/LICENSE.txt`](public/apps/mindmap/LICENSE.txt)
- **说明**：本仓库未对该项目作任何修改，按原样分发

### 3.1 pell 编辑器

- **位置**：`public/apps/mindmap/vendor/pell/`
- **上游**：<https://github.com/jaredreich/pell>（npm 包 `pell`）
- **许可证**：**MIT**
- **说明**：`pell.min.js` 与 `pell.min.css` 均**不含许可头**，仓库中也未附带许可文件。
  MIT 本身允许这样分发，但为清晰起见，在此声明其来源与许可。

---

## 4. 条码 / 二维码生成所用库

- **位置**：`public/vendor/barcode/`
- **说明**：本站的条码工具页基于以下两个 MIT 库构建。

| 文件 | 项目 | 许可证 | 版权 |
| --- | --- | --- | --- |
| `jsbarcode.js` | [JsBarcode 3.12.3](https://github.com/lindell/jsbarcode) | MIT | Johan Lindell |
| `qrcode.js` | [qrcode-generator 2.0.4](https://github.com/kazuhikoarase/qrcode-generator) | MIT | Kazuhiko Arase |

> `jsbarcode.js` 是 npm 包 `jsbarcode@3.12.3` 中 `dist/JsBarcode.all.js` 的原样副本。
> **3.12.3 起不再捆绑 jQuery**（旧版 3.9.0 的打包产物内含 jQuery 1.11.3，
> 本站曾据此声明 jQuery 的 MIT 义务，现已随升级一并移除）。
> 全局导出仍为 `window.JsBarcode`，工具页调用方式未变。

> `qrcode.js` 为 npm 包 `qrcode-generator@2.0.4` 中 `dist/qrcode.js` 的原样副本。
> 该库只负责生成二维码模块矩阵，本站直接据此绘制 SVG，不依赖任何 DOM 渲染扩展。

### 4.1 商标声明

`qrcode.js` 附带 **Denso Wave「QR Code」商标声明**。本站不将「QR Code」用作品牌或产品名称。

### 4.2 已移除的依赖

旧站的条码页依赖 **AngularJS 1.3.0-beta.14**（MIT，© 2010-2014 Google）与
**jQuery 1.11.3**（MIT）作为 UI 框架。由于 AngularJS 官方已于 2022 年 1 月终止支持，
且 1.3.0-beta.14 是从未正式发布的 beta 预发行版，本站**已不再使用**这两个框架，
改用 Astro 组件 + 原生 JS 重写界面。二维码与条码的生成逻辑全部由上述 MIT 库提供。

---

## 5. 汉字转拼音

- **位置**：`public/vendor/pinyin/`
- **核心库**：[sxei/pinyinjs](https://github.com/sxei/pinyinjs)
- **许可证**：**MIT** © 2019 小茗同学
- **核实方式**：`pinyinUtil.js` 与两份词库经 MD5 比对，与上游 `master` 分支逐字节一致
- **说明**：`pinyinUtil.js` 本身**不含许可头**，故在此声明

### 5.1 词库来源分两种，可靠性不同

| 文件 | 大小 | 来源 | 许可证 | 状态 |
| --- | --- | --- | --- | --- |
| `pinyin_dict_polyphone.js` | 934 KB | 派生自 [hotoo/pinyin](https://github.com/hotoo/pinyin) 的 `data/phrases-dict.js` | MIT（hotoo/pinyin） | ✅ 可追溯 |
| `pinyin_dict_withtone.js` | 124 KB | **来源不明** | **无法确定** | ⚠️ 见下 |

**`pinyin_dict_withtone.js` 的来源问题**：上游 README 原文写道「从网上找的如下结构字典文件（下面称为字典A），**具体是哪不记得了**」——作者本人已无法追溯该字典出处。

该文件虽无法署名，但经实测为**功能必需**：

- 缺失 `pinyin_dict_withtone.js` → `pinyinUtil.getPinyin()` 抛出 `抱歉，未找到合适的拼音字典文件！`，工具完全不可用
- 缺失 `pinyin_dict_polyphone.js` → 返回多音字笛卡尔积（实测同一句话产出 66 种组合），结果不可用

> **建议**：替换为可追溯来源的 MIT 词库（如 [hotoo/pinyin](https://github.com/hotoo/pinyin) 的数据），以彻底消除授权不明的问题。

---

## 6. 旧版 RT-Oscilloscope ⚠️ **已下线；授权无法确认**

- **位置**：`public/apps/oscope/` —— **已从工具列表移除**
- **许可证**：**无法确认**
- **状态**：目录内**无 LICENSE 文件**，代码中无版权头、无作者署名、无上游链接。已尝试定位上游仓库 `madnesspower/RT-Oscilloscope`，**该地址当前返回 404**，无法核实原始许可证。
- **已移除**：演示音频（`jerobeam.mp3` / `jerobeam.ogg`，源自 Demis Hassabis 1996 年的 MIDI 曲 **jerobeam**）**因授权不明已移除**。
- **2026-10-01 起状态**：已下线。工具列表中的条目改为本站自研实现 `/tools/oscope/`，适用根目录 MIT 许可（见「站点自研部分」）。旧文件留在仓库中仅作参考，任何位置都不再提及；直接猜路径仍可访问。
- **建议**：删除该目录，或取得上游书面授权后再行分发。否则应引导用户改用授权明确的同类实现（如 MIT 许可的 [x-oscilloscope](https://github.com/stagas/x-oscilloscope)）。

---

## 7. 运行时外部加载（当前无）

当前**没有任何组件在运行时从 CDN 加载**：本站的第三方资源一律本地化分发到
`public/vendor/`，或作为 npm 依赖进入构建产物。本节保留以记录旧站的做法。

| 组件 | 旧站做法 | 当前做法 |
| --- | --- | --- |
| jQuery 3.6.0（MIT） | 由示波器应用从 CDN 引入 | **已移除**。`public/apps/oscope/` 现在不含任何 jQuery 引用 |
| mdui 0.4.3（MIT） | 从 CDN 引入，作为原生应用的界面样式 | **已替换为 mdui 2.1.5**，且并非从 CDN 引入：`public/apps/oscope/index.html` 引的是站内 `/vendor/mdui/mdui.css` 与 `/vendor/mdui/mdui.global.js`（见 §0） |

> 旧站随 CDN 间接引入、本仓库未复制的资源：MDUI 的 CSS 内含 normalize.css
> （MIT, necolas），运行时字体为 Roboto（Apache-2.0）与 Material Icons（CC BY 4.0）。
> 当前站点不加载这些资源：MD3 图标字体未随 mdui 2 分发，本站改用
> `@mdui/icons` 的 SVG（见 §0.1），字体与 `icon` 属性均未使用。

## 8. 中文电报码（《标准电码本》）数据

- **位置**：`src/data/telegraph-cn.json`、`src/data/telegraph-tw.json`
- **上游**：npm [`chinese-telegraph-code`](https://www.npmjs.com/package/chinese-telegraph-code)@0.1.0
  的 `data/` 目录（由 Kirk Lin 于 2026 年整理，代码 MIT）
- **⚠️ 许可证不是 MIT**：码表数据派生自 **Unicode 字符数据库（UCD）Unihan** 的
  `kMainlandTelegraph` / `kTaiwanTelegraph` 字段（UAX #38），受
  **[Unicode License v3](https://www.unicode.org/license.txt)** 约束，
  快照为 **Unicode 17.0.0**（2025-07-24），© 2025 Unicode®, Inc.
- **本站改动**：把 CSV/JSON 的 `{code, character, codepoint}` 列表压成
  「下标即码号」的稀疏数组（`chars[n]` 为码 n 的汉字，`null` 表示未分配），
  以便一次解析同时支持码→字与字→码。**未增删任何码值。**
- **Unicode License 的义务（已履行）**：
  - 保留版权与许可声明 —— 见本节与 `src/lib/telegraph.ts` 顶部注释
  - 不得暗示 Unicode 背书 —— 本站未使用「Unicode」名称作产品标识
  - 不得单独出售数据 —— 本站不售卖任何内容

### 8.1 上层来源

按 UAX #38，两套码表最终溯源到同一份资料：

> 林進義（Lin Jinyi），《漢字電報符号変換表》，KDD Engineering and
> Consulting，Tokyo，1984。

`kMainlandTelegraph` 沿革可追溯至中华人民共和国邮电部《标准电码本》。

> 「中文电码」与「摩尔斯电码」是**两套彼此独立的体系**（前者一字一四位数，
> 后者一字一串点划），本站工具页分两个页签呈现，不可混用。

## 9. KaTeX（在线 LaTeX 编辑器）

- **位置**：`public/vendor/katex/`
- **上游**：<https://github.com/KaTeX/KaTeX>（npm 包 `katex`）
- **版本**：0.16.21
- **许可证**：**MIT**，Copyright (c) 2013-2020 Khan Academy and other contributors
- **文件**：
  - `katex.min.js`
  - `katex.min.css`
  - `fonts/*.woff2`（KaTeX 排版所需字体）
  - `LICENSE`（上游 MIT 原文）
- **本站改动**：无。工具页 `/tools/latex/` 直接调用全局 `katex.render()`，
  公式输入只在浏览器本地计算，不上传服务器。
- **版权声明**：本目录内 `LICENSE` 文件随源码一同分发，满足 MIT 的保留声明义务。

---

## 10. html-to-image（LaTeX 公式导出）

- **位置**：`public/vendor/html-to-image/`
- **上游**：<https://github.com/bubkoo/html-to-image>（npm 包 `html-to-image`）
- **版本**：1.11.13
- **许可证**：**MIT**，Copyright (c) 2017-2025 W.Y.
- **文件**：`html-to-image.js`、`LICENSE`
- **用途**：在 `/tools/latex/` 中把 KaTeX 渲染后的 DOM 导出为 SVG / PNG。
- **本站改动**：无。

---

## 站点自研部分

以下内容为本站原创，采用根目录 [LICENSE](LICENSE) 中的 MIT 许可：

- Astro 页面、组件与布局（`src/pages/`、`src/components/`、`src/layouts/`、`src/styles/`）
- 全局样式与设计令牌（`src/styles/global.css` 中覆写 `--mdui-color-*` / `--mdui-shape-*` 的 `:root` 块）
- 工具元数据（`src/data/tools.ts`）
- 字体测试页的 Unicode 符号测试数据（`src/data/symbol-blocks.json`），
  自旧站 `testtext/` 页面提取，内容为 Unicode 字符的枚举清单，不含可版权的表达性内容
- 中文编码 / CJK 扩展区的字符清单（`src/data/encoding-blocks.json`），
  由用户提供的清单整理而成，同样只是码点枚举
- GitHub 标记图标路径（`src/components/IconGithub.astro`），
  取自通用的 Octocat 16×16 路径
- 博客文章正文（`src/content/blog/*.md`）
- GitHub Actions 部署流程（`.github/workflows/deploy.yml`）
- **`/tools/oscope/` 示波器** —— 本站从零自研：`src/lib/oscope/`
  （`types.ts`、`capture.ts`、`ring.ts`、`measure.ts`、`fft.ts`、`render.ts`、
  `export.ts`、`recorder.ts`）与 `src/pages/tools/oscope.astro`。
  仅用 Web Audio API、Canvas 2D API 与浏览器内置能力
  （`captureStream` / `MediaRecorder` / `Blob` 下载），不含 §6 旧版
  RT-Oscilloscope 的任何代码；FFT 为自写的基 2 Cooley–Tukey 实现，
  因此仓库内没有捆绑任何 FFT 库。

> 站内托管的第三方项目（CeJS、3D 流体、思维导图等）**均非本站原创**，
> 各自适用上文对应章节的许可证。特别注意：
> - **CeJS 是第三方项目**（BSD-3-Clause，© kanasimi），本站仅原样托管，
>   工具页与文章中均已标注「第三方」，不得表述为自研。
> - 工具列表中的示波器是**本站自研**（`src/lib/oscope/`），不是
> `public/apps/oscope/` 里那个授权未确认、已下线的旧应用，见 §6。
