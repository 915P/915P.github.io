# 915P.github.io

> **English** | [简体中文](README.zh-CN.md)

The personal website of **915P**, built with [Astro](https://astro.build) +
[mdui 2](https://www.mdui.org) (Material Design 3) and deployed to GitHub Pages
via GitHub Actions.

## Quick start

```bash
npm install        # install dependencies
npm run dev        # local development (http://localhost:4321)
npm run check      # Astro / TypeScript diagnostics
npm run build      # build the static site into dist/
npm run preview    # preview the production build
```

## UI architecture

The interface follows the official mdui 2 / MD3 layout without any CSS
framework:

- `<mdui-layout>` contains `<mdui-top-app-bar>`, a desktop
  `<mdui-navigation-rail>` (sticky at ≥840px) and a mobile
  `<mdui-navigation-bar>`.
- Dark mode uses `mdui-theme-auto` on `<html>`; the theme control stores
  "auto / light / dark" and a single MD3 seed colour in `localStorage`.
- Icons come from `@mdui/icons` and are registered in `src/lib/icons.ts`.
  They must be imported from a client-side script, otherwise Astro
  tree-shakes the dependency away.
- mdui component styles are injected into shadow DOM by the component JS.
  The site therefore serves `mdui.global.js` from `public/vendor/mdui/`;
  `mdui.css` alone is not enough.
- All custom classes are semantic (`.panel`, `.stack`, `.tool-head`, …).
  There is no Tailwind and no hand-written atomic-class layer.

## Directory structure

```
.
├─ src/
│  ├─ pages/                      # routes
│  │  ├─ index.astro
│  │  ├─ 404.astro
│  │  ├─ rss.xml.ts
│  │  ├─ blog/                    # list + [...slug]
│  │  └─ tools/                   # built-in tool pages
│  ├─ content/blog/*.md           # blog posts (Content Collections + zod)
│  ├─ components/                 # Nav, Footer, ToolCard, ThemeControl…
│  ├─ layouts/                    # Base / Page
│  ├─ styles/global.css           # MD3 token overrides + layout classes
│  ├─ lib/                        # tool logic shared by pages
│  └─ data/                       # tool metadata and generated data
├─ public/
│  ├─ apps/                       # standalone apps: oscope / 3dweb / mindmap
│  ├─ vendor/                     # vendored third-party assets
│  ├─ favicon.svg / favicon.ico   # site icons (at the public/ root)
│  └─ images/                     # logo, OG image
├─ scripts/                       # build-time data extraction scripts
├─ THIRD_PARTY_NOTICES.md         # third-party license inventory
│                                 # (…zh-CN.md for the Chinese version)
├─ LICENSE                        # original code: MIT; third-party: see notices
└─ astro.config.mjs
```

## Write a blog post

Create `src/content/blog/YYYYMMDD-slug.md`:

```markdown
---
title: Post title
description: One-sentence summary shown in the list
pubDate: 2026-01-01
tags: ['notes']
hero: /images/cover.png   # optional
draft: false
---

Write the body in Markdown.
```

The front-matter schema lives in `src/content.config.ts`; invalid data fails
the build.

## Add a tool

1. Add a page under `src/pages/tools/` (front matter: `title`, `description`,
   `active`).
2. Register it in `src/data/tools.ts` (`builtinTools`, with an existing
   `category`).
3. Add any new icon import to `src/lib/icons.ts`.
4. Run `npm run check` and `npm run build`.

Standalone apps that do not participate in Astro's build belong in
`public/apps/<name>/`; link them from `src/data/tools.ts` as `status: 'app'`.

## Third-party components

The repository hosts and/or vendors several third-party projects. They are
**not** original work and keep their upstream licenses. Before adding or
updating one:

1. Verify the upstream license and the exact version.
2. Update `THIRD_PARTY_NOTICES.md`.
3. Keep the required copyright/license files next to the vendored copy.
4. Update the relevant `package.json` entry when applicable.

`LICENSE` applies only to original project code. The third-party inventory is
authoritative for all bundled components.

## Deployment

`.github/workflows/deploy.yml` runs on changes to `src/`, `public/`,
`astro.config.mjs` or `package.json`:

```
push → npm ci → npm run check → npm run build → deploy to GitHub Pages
```

In the repository settings choose **Settings → Pages → Build and deployment →
Source: GitHub Actions** once.
