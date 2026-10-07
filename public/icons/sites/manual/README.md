# 手动补图目录

有些站点**真的**没有任何可用图标：没有 `/favicon.ico`、没有 `apple-touch-icon`、
首页 HTML 里没声明 `<link rel="icon">`，CSS 和最大的那个 JS bundle 里也搜不到任何品牌图。
抓取解决不了，只能人工放图。

## 怎么用

把图片按 `<id>.<后缀>` 命名丢进这个目录即可，`npm run icons:sites` 会优先采用，
**且重跑脚本不会覆盖它**。支持 `png` / `jpg` / `webp` / `svg` / `gif` / `ico`。

文件按原样引用（不做尺寸归一），所以**优先放 SVG**，任意尺寸都锐利。

## id 从哪来

见 `src/data/links.ts` 里 `navLinks[].id`，或跑 `npm run icons:sites`
看输出末尾「没有可用图标」那份清单。

## 建议

- 正方形或接近正方形（宽高比别超过 2:1），磁贴里显示尺寸约 36px。
- 透明底最好；深色主题下白底方块会很扎眼。
- 别用横版字标：压进方格后看不清（之前试过校名字标，5.6:1 的宽图缩进去只剩一条线）。

## logo.png —— 统一的同济校徽

`logo.png` 是从 `logo.pdf`（Inkscape 导出的矢量校徽）渲染来的，509×512、透明底。
所有校内系统的磁贴都共用它，因为它们自己的 favicon 基本都是同一个校徽，
只是抓回来的清晰度参差（有些是矢量级清晰版，有些是 16×16 放大的糊版），
缩到磁贴尺寸里很脏。

原先它由一份矢量 PDF 渲染而来，但那份 PDF 已随无用文件一起清掉 ——
`logo.png` 现在就是唯一版本，要改样式得直接改这个 PNG。

共用关系写在 `scripts/fetch-site-icons.mjs` 的 `SHARED_MANUAL` 里，
增删校徽磁贴改那张表。

## 关于主题自适应

`chatgpt.svg` 这类图标内部带 `@media (prefers-color-scheme: dark)`，
但用 `<img>` 加载时那个媒体查询是按**操作系统**配色算的，跟页面主题无关。
抓取脚本会自动识别并记进 `siteIconMasks`，页面改用 CSS mask 渲染，
颜色交给 `currentColor`，深浅主题就都对了。放进来的 SVG 不用额外处理。
