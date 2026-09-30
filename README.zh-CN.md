# 915P.github.io

> [English](README.md) | **简体中文**

915P 个人网站，使用 [Astro](https://astro.build) + [mdui 2](https://www.mdui.org)（Material Design 3）构建，
通过 GitHub Actions 自动部署到 GitHub Pages。

## 开发

```bash
npm install        # 安装依赖
npm run dev        # 本地开发（默认 http://localhost:4321）
npm run check      # Astro / TypeScript 检查
npm run build      # 构建静态产物到 dist/
npm run preview    # 预览构建结果
```

推送 `main` 会依次执行 `npm ci`、`npm run check`、`npm run build` 并发布到
GitHub Pages。首次需要在仓库 **Settings → Pages → Build and deployment →
Source** 选择 **GitHub Actions**。

## 许可

`LICENSE`（MIT）仅覆盖本站原创代码。仓库内托管的第三方组件均非原创，各自保留
上游许可证 —— 完整清单见 [THIRD_PARTY_NOTICES.zh-CN.md](THIRD_PARTY_NOTICES.zh-CN.md)，
英文版见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。