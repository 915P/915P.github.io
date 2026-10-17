# 贡献指南 · Contributing Guide

> 每节先中文、后英文。
> Each section gives Chinese first, English second.

感谢参与。本仓库是 Astro + **mdui 2** 的静态站，原创代码与第三方组件分开授权。
Thanks for contributing. This is an Astro static site built on **mdui 2**; original code and third-party components are licensed separately.

---

## 0. 强制前置：先读 mdui v2 文档 · Mandatory prerequisite: read the mdui v2 docs

**中文** — **任何人在动手改这个仓库之前，都必须先取得并阅读 mdui v2 文档**，尤其是你打算改动的那几个组件：

- 文档地址：<https://github.com/zdhxiong/mdui/tree/v2/docs>
- 取得方式：`git clone --branch v2 https://github.com/zdhxiong/mdui.git`，然后取其中的 `docs/` 目录（也可只下载该目录）。
- 放到仓库根的 `docs/`（与本地既有约定一致）；**`/docs/` 已在 `.gitignore` 中，不要提交**。
- 没读过相应组件文档的改动，会被直接退回。理由：本站界面完全建立在这套组件之上，大量「看起来对、其实不生效」的写法都源自误用（例如分段按钮单选要 `selects="single"`、等宽要 `full-width`、颜色变量是 `R, G, B` 三元组）。凭印象写 mdui，几乎必错。

**English** — **Before changing anything in this repo, you MUST obtain and read the mdui v2 docs**, especially for the components you intend to touch:

- Docs: <https://github.com/zdhxiong/mdui/tree/v2/docs>
- How to get them: `git clone --branch v2 https://github.com/zdhxiong/mdui.git` and use its `docs/` directory (or download just that folder).
- Put them under the repo-root `docs/` to match the local convention; **`/docs/` is gitignored — do not commit it**.
- Changes made without reading the relevant component docs will be rejected outright. Rationale: this site's UI is built entirely on mdui 2, and most "looks right but silently does nothing" mistakes come from misusing the API (e.g. single-select segmented groups need `selects="single"`, equal widths need `full-width`, colour tokens are `R, G, B` triplets). Guessing at mdui almost always fails.

---

## 1. 开始之前 · Before you start

**中文** — 需要 Node **>= 22.12.0**（见 `package.json` 的 `engines`）。克隆后安装依赖：

**English** — Node **>= 22.12.0** is required (see `engines` in `package.json`). After cloning, install dependencies:

```bash
npm ci          # 用锁文件精确安装 / install exactly from the lockfile
npm run dev     # 本地开发，http://localhost:4321 / local dev server
npm run preview # 预览 dist/ / preview the built output
```

主要目录 / Main directories:

| 目录 / Path | 内容 / Contents |
| --- | --- |
| `src/pages/` | Astro 页面（路由）/ Astro pages (routes) |
| `src/components/` `src/layouts/` | 组件与布局（`Base` 管 head/meta，`Page` 管站内骨架）/ components and layouts |
| `src/data/` | 站点数据，**`tools.ts` 是工具导航的单一数据源** / site data; `tools.ts` is the single source of truth for the tool index |
| `src/lib/` | 纯逻辑层（可在 Node 里测）/ pure logic, testable in Node |
| `src/styles/global.css` | 全站样式与设计令牌的唯一入口 / the single global style & token entry |
| `public/apps/` | 独立原生应用，**原样分发、不参与 Astro 构建** / standalone apps, not built by Astro |
| `public/vendor/` | 本地分发的第三方库 / locally distributed third-party libraries |
| `scripts/` | 回归测试与维护脚本 / regression tests and maintenance scripts |

---

## 2. 合并前必过 · Must pass before merge

**中文** — CI（`.github/workflows/ci.yml`）会在 PR 上跑下列命令。**本地请先跑通再提交**：

**English** — CI (`.github/workflows/ci.yml`) runs the following on every pull request. **Run them locally before you push:**

```bash
npm run check       # astro check，必须 0 error / must be 0 errors
npm run build       # astro build + 生成 PWA 的 sw.js / version.json，必须成功 / must succeed
npm run test:eval
npm run test:pdf
npm run test:media
npm run test:guide
```

**中文** — 只改到某一模块时，至少跑通与该模块相关的 `test:*`，并在 PR 描述里写明跑了哪些。发布前至少 `npm run check && npm run build`。

**English** — If your change touches only one module, at minimum run the matching `test:*` and state in the PR description which ones you ran. Before publishing, at least run `npm run check && npm run build`.

---

## 3. 提交信息与 PR · Commits and pull requests

**中文**

- **先 rebase 到最新 `main`** 再提 PR，避免基于过期提交、减少冲突。
- **一个 PR 只做一件事**。不要把重构和功能、格式化和修 bug 混在一起。
- 标题用前缀：`fix:` / `feat:` / `refactor:` / `docs:` / `chore:`（例：`fix: 修正遮罩在浅色主题下失效`）。
- 描述里说清 **为什么** 这么改、**怎么验证** 的；涉及界面的附截图。
- 不要把「纯重构」和「改变行为」混为一谈：若改动了可见行为，请在标题/正文点明（例如日期格式变化）。

**English**

- **Rebase onto the latest `main`** before opening a PR — do not build on a stale commit.
- **One logical change per PR.** Do not mix refactors with features, or formatting with bug fixes.
- Prefix the title: `fix:` / `feat:` / `refactor:` / `docs:` / `chore:`.
- Explain **why** the change is needed and **how you verified** it; include a screenshot for UI changes.
- Never label a behavior change as a "pure refactor": call it out explicitly (e.g. a date-format change).

---

## 4. 代码风格 · Code style

**中文**

- 缩进用 **Tab**，与现有文件保持一致。
- **非必要不加注释**；确需注释时写清「为什么」而不是「做了什么」。
- 文案与注释沿用仓库既有的**中文**风格。
- 优先复用 `src/lib/` 里的现有工具，不要复制粘贴一份新的。
- 只用**语义类**，不用 Tailwind / 原子类；页面私有样式写在该页的 `<style is:global>` 中。

**English**

- Indent with **tabs**, matching the surrounding files.
- **Do not add comments unless necessary**; when you do, explain *why*, not *what*.
- Keep copy and comments in **Chinese**, consistent with the rest of the repo.
- Reuse existing helpers in `src/lib/` instead of copy-pasting a second copy.
- Use **semantic classes only** — no Tailwind/utility classes; page-private styles go in that page's `<style is:global>`.

---

## 5. 改动应该落在哪里 · Where changes belong

**中文**

- **新增/修改工具**：`src/data/tools.ts` 的 `builtinTools` 是唯一入口；页面逻辑尽量放 `src/lib/`，页面只做 DOM 接线。
  - 内置 Astro 工具：在 `src/pages/tools/` 新建页面（用 `Page.astro`，front matter 写 `title`/`description`/`active="tools"`），并在 `tools.ts` 登记 `slug`/`name`/`desc`/`icon`/`category`（必须是已有分类）/`status: 'live'`/`href: '/tools/<slug>/'`。
  - **原生应用**：放 `public/apps/<name>/index.html`，`tools.ts` 用 `status: 'app'` + `href: '/apps/<name>/index.html'`。**链接必须带 `index.html`** —— Astro dev 不会做目录索引，否则 dev 下 404（Pages 静态托管才会）。
  - 新增图标要加进 `src/lib/icons.ts`，并注意**别和 mdui 内置图标重名**（重名会静默失效）。
- **样式**：`src/styles/global.css` 是全站唯一入口；别新建第二套全局样式表。
- **博客**：`src/content/blog/YYYYMMDD-slug.md`，front matter 必须符合 `src/content.config.ts` 的 zod schema；列表与 RSS 自动读取，不用手改。
- **`public/` 下是原样分发的第三方/独立应用**，不参与 Astro 构建，改动要落到上游文件本身。

**English**

- **Adding/changing a tool**: `builtinTools` in `src/data/tools.ts` is the single entry point; keep logic in `src/lib/` and let the page only wire up the DOM.
  - Built-in Astro tool: create a page under `src/pages/tools/` (use `Page.astro`, with `title`/`description`/`active="tools"`), then register `slug`/`name`/`desc`/`icon`/`category` (must be an existing category)/`status: 'live'`/`href` in `tools.ts`.
  - **Native app**: put it at `public/apps/<name>/index.html`, use `status: 'app'` and `href: '/apps/<name>/index.html'`. **The link must include `index.html`** — `astro dev` performs no directory-index resolution, so it 404s otherwise (only static hosting like Pages resolves directories).
  - Register new icons in `src/lib/icons.ts`, and **avoid name clashes with mdui's built-in icons** (clashes fail silently).
- **Styles**: `src/styles/global.css` is the only global entry; do not add a second global stylesheet.
- **Blog**: `src/content/blog/YYYYMMDD-slug.md`; front matter must match the zod schema in `src/content.config.ts`. The list and RSS pick it up automatically.
- **`public/` holds verbatim third-party/standalone apps** that Astro does not build — edit the upstream files there directly.

---

## 6. mdui 2 使用规范 · Working with mdui 2

**中文** — 动手前请先完成 §0（读文档）。以下为本站已知的硬性约束：

- `mdui-theme-auto` 必须挂在 `<html>` 上，**不能挂 `<body>`**（暗色令牌只对 `<html>` 的类名生效）。
- 组件样式由 `mdui.global.js` 注入 shadow DOM；**只引 `mdui.css` 拿不到任何组件样式**，两者都要引。
- **颜色变量是 `R, G, B` 三元组**，必须 `rgb(var(--mdui-color-…))`；直接 `var(...)` 当颜色用会整条声明失效。
- 组件属性按文档来：分段按钮组单选要 `selects="single"`、等宽要 `full-width`；`mdui-select` 的下拉指示要显式 `slot="end-icon"`。别凭印象。
- **别假设组件自带内边距**，需要自己在语义类里补。
- 图标是自定义元素，`@mdui/icons` 必须在**客户端**注册（`src/lib/icons.ts`），不要在 front matter 里 import。
- **删除任何类名前先 grep 全站**，否则会静默丢样式。
- **不要用 `Astro.site`**：`Base.astro` 里用的是硬编码 `SITE` 常量。
- 对话框：**不要给 `mdui-dialog` 自身写 `display`**（会破坏显隐），排版用 `::part(panel)` / `::part(body)` 或 slotted 内容自己的类；注意 body 默认是 `display:block`，`gap` 不生效。
- 改完在 **dev 与 preview 都打开看一遍**，并覆盖移动端 / 暗色。

**English** — Do §0 (read the docs) first. Known hard constraints on this site:

- `mdui-theme-auto` must be on `<html>`, **never `<body>`** (the dark tokens only apply to the `<html>` class).
- Component styles are injected into shadow DOM by `mdui.global.js`; **`mdui.css` alone yields no component styles** — load both.
- **Colour tokens are `R, G, B` triplets** — wrap them in `rgb(var(--mdui-color-…))`; using `var(...)` directly as a colour drops the whole declaration.
- Follow the docs for attributes: segmented groups need `selects="single"` for single-select and `full-width` for equal widths; `mdui-select` needs an explicit `slot="end-icon"` for the dropdown arrow. Don't guess.
- **Don't assume components bring their own padding** — add it in your semantic classes.
- Icons are custom elements registered **client-side** via `@mdui/icons` (`src/lib/icons.ts`); never import them in front matter.
- **Grep the whole repo before deleting any class name**, or styles vanish silently.
- **Do not use `Astro.site`** — `Base.astro` uses a hard-coded `SITE` constant.
- Dialogs: **never set `display` on `mdui-dialog` itself** (it breaks show/hide); lay out via `::part(panel)` / `::part(body)` or slotted classes. Note the body is `display:block`, so `gap` does nothing.
- Verify in **both dev and preview**, on mobile and in dark mode.

---

## 7. 许可与第三方 · Licensing and third-party code

**中文**

- 仓库根 `LICENSE` 的 **MIT 只覆盖本站原创代码**。第三方组件各自保留其许可证，**绝不可按 MIT 重新许可**。
- 新增或更新任何第三方组件（库、字体、数据、整包应用）时，必须：
  1. **先核对上游 `LICENSE`**，不要凭本地副本想当然；
  2. 在 `THIRD_PARTY_NOTICES.md` **与** `THIRD_PARTY_NOTICES.zh-CN.md` 两处登记：位置、上游、版本、许可证、署名义务；
  3. 保留其原始 `LICENSE`/版权声明（vendored 目录里也留一份）；
  4. 若你修改了上游文件，明确写出「本站改了什么」。
- 注意许可证**不是单一的**：有些组件是混合许可（例如 GeoGebra：源码 EUPL-1.2、语言与界面文件 CC BY-NC-SA 4.0、整包仅限非商业）。以 `THIRD_PARTY_NOTICES` 为准。
- 站内托管的第三方项目对外文案必须标「第三方」，**不得写成原创**。
- **不要把大体积第三方整包或压缩包塞进 Git**；确有必要时先在 PR 里讨论体积与替代方案。

**English**

- The root `LICENSE` (MIT) covers **only this site's original code**. Third-party components keep their own licenses and **must never be relicensed under MIT**.
- When adding or updating any third-party component:
  1. **Check the upstream `LICENSE` first** — do not trust the local copy;
  2. register it in **both** `THIRD_PARTY_NOTICES.md` and `THIRD_PARTY_NOTICES.zh-CN.md` (location, upstream, version, license, attribution);
  3. keep its original `LICENSE` / copyright notices (keep a copy in the vendored directory too);
  4. state explicitly what this site changed if you modified upstream files.
- Licenses are **not always single**: some components are mixed (e.g. GeoGebra — EUPL-1.2 for source, CC BY-NC-SA 4.0 for language/UI files, non-commercial for the bundle). `THIRD_PARTY_NOTICES` is authoritative.
- Third-party projects hosted here must be labelled **"third-party"** in user-facing copy — never presented as original work.
- **Do not commit large third-party bundles or archives**; discuss size and alternatives in the PR first.

---

## 8. 不要提交的东西 · Do not commit

**中文** — 以下内容已在 `.gitignore` 中，请勿强行加入 / **English** — These are gitignored; never force-add them:

- 构建与依赖产物：`node_modules/`、`dist/`、`.astro/`
- 环境与密钥：`.env`、`.env.*`、任何 token
- 私有内容：`private/`（含内网地址的链接配置）
- 维护者本地笔记与文档：`AGENT.md`、`AGENTS.md`、`CLAUDE.md`、`STATION-GUIDE.md`、`/docs/`（含你要读的 mdui 文档）
- 压缩包、大文件、浏览器「另存为」产物

---

## 9. 内容边界 · Content boundaries

**中文**

- 不出售友链、不出租二级目录、不接下载器 / 捆绑广告。
- **不重新分发来源不明或许可证不明的资源**（包括字体、图标、数据）。
- 隐私清理过的姓名、头像、文档元数据不要重新带回来。
- 所有工具都在浏览器本地运行，**不上传用户输入**。

**English**

- No selling friend links, no renting subdirectories, no downloaders or bundled ads.
- **Do not redistribute resources of unknown provenance or unclear license** (fonts, icons, data included).
- Do not re-add content that was deliberately removed: MSDN, IPTV, VIP parsing, Snapdrop, unlicensed fonts, etc.
- Do not reintroduce scrubbed personal data (names, avatars, document metadata).
- Every tool runs locally in the browser and **never uploads user input**.

---

## 10. 自查清单 · Self-review checklist

**中文** — 提交前逐条对照（多数来自真实踩过的坑）：

**English** — Go through these before pushing (most come from real regressions):

- [ ] **已下载并阅读 mdui v2 文档**（§0），改动未偏离文档 / **downloaded and read the mdui v2 docs (§0)** and stayed within them
- [ ] 已 rebase 到最新 `main` / rebased onto latest `main`
- [ ] `npm run check` 0 error、`npm run build` 成功 / 0 check errors and a successful build
- [ ] 相关 `test:*` 通过 / relevant `test:*` pass
- [ ] 新工具已登记 `tools.ts`；原生应用链接带 `index.html` / new tools registered in `tools.ts`; native-app links include `index.html`
- [ ] dev 与 preview 都能打开，移动端 / 暗色粗看一遍 / opens in both dev and preview; glanced at mobile and dark mode
- [ ] **`export { x } from './y'` 不会产生本地绑定** —— 若该模块自己也用到 `x`，必须另外 `import { x }`。
      A re-export does not create a local binding — `import { x }` separately if the module also uses `x`.
- [ ] **Astro 具名插槽要逐层转发** —— 布局链上少转一层，插槽内容会被静默丢弃。
      Astro named slots must be forwarded at every layer — miss one and the content is silently dropped.
- [ ] **mdui 颜色变量是 `R, G, B` 三元组**，必须 `rgb(var(--mdui-color-…))`。
      mdui colour tokens are `R, G, B` triplets — wrap them in `rgb(var(--mdui-color-…))`.
- [ ] **去构建产物里核对功能真的生效**，而不是「能编译」就当通过（例如 `noindex` 是否真的进了 HTML）。
      Verify the feature in the build output, not merely that it compiles (e.g. did `noindex` actually land in the HTML?).
- [ ] 改动若为「重构」，确认没有夹带行为变化 / if labelled a refactor, confirm no behavior changed
- [ ] 改了 `package.json` 的 `name`/依赖，同步更新了 `package-lock.json` / lockfile updated in sync
- [ ] 新增/升级第三方已同步两个 notices，且标注为「第三方」 / new/updated third-party recorded in both notices files and labelled "third-party"

---

有疑问请在 PR 里直接问，或先开一个 draft PR。
If anything is unclear, ask in the PR or open a draft PR first.
