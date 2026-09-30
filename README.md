# 915P.github.io

> **English** | [简体中文](README.zh-CN.md)

The personal website of **915P**, built with [Astro](https://astro.build) +
[mdui 2](https://www.mdui.org) (Material Design 3) and deployed to GitHub Pages
via GitHub Actions.

## Development

```bash
npm install        # install dependencies
npm run dev        # local development (http://localhost:4321)
npm run check      # Astro / TypeScript diagnostics
npm run build      # build the static site into dist/
npm run preview    # preview the production build
```

Pushing to `main` runs `npm ci`, `npm run check`, `npm run build` and publishes
to GitHub Pages. Set **Settings → Pages → Build and deployment → Source: GitHub
Actions** once.

## Licensing

`LICENSE` (MIT) covers only this site's original code. The bundled third-party
components are not original work and keep their upstream licenses — see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the full inventory, or
[THIRD_PARTY_NOTICES.zh-CN.md](THIRD_PARTY_NOTICES.zh-CN.md) for the Chinese
version.