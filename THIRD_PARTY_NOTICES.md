# Third-Party Components and License Notices

> **English** | [简体中文](THIRD_PARTY_NOTICES.zh-CN.md)

This file records every third-party component the site uses, together with its
license.

**The repository-root [LICENSE](LICENSE) covers only the site's own original
code** (Astro pages, components, styles and blog posts). Third-party components
keep their own licenses and are **never relicensed under this site's MIT
license**.

Licenses were verified against each upstream repository's `LICENSE` file or npm
package metadata, not merely against claims in the local copies.

---

## License quick reference

| Identifier | Kind | Commercial use | Attribution required | Copyleft |
| --- | --- | --- | --- | --- |
| MIT | Permissive | Yes | Yes | No |
| Apache-2.0 | Permissive | Yes | Yes (incl. NOTICE, state whether modified) | No |
| BSD-3-Clause | Permissive | Yes | Yes | No |
| CC BY 3.0 | Content | Yes | Yes (state whether modified) | No (4.0 derivatives must use the same license) |
| Unicode License v3 | Data | Yes | Yes (keep Unicode copyright, do not imply endorsement) | No |

---

## 0. mdui 2 (site UI library)

- **Location**: `public/vendor/mdui/` (`mdui.css` + `mdui.global.js`)
- **Upstream**: <https://www.mdui.org> · <https://github.com/zdhxiong/mdui>
- **Version**: 2.1.5 (npm `mdui`, MIT)
- **License**: **MIT**, Copyright 2016-2026 zdhxiong
  - Verified via the `license` field of `mdui@2.1.5` in the npm registry and the
    upstream repository's LICENSE
- **Site modifications**: **None.** `mdui.css` and `mdui.global.js` are
  redistributed verbatim
- **Notes**:
  - The site loads the "CSS + global JS build" rather than importing individual
    npm components. mdui 2 injects component styles into shadow DOM from the
    component JS via lit's `CSSResult`, so `mdui.css` alone yields no component
    styles.
  - The global build bundles every component and is **larger than a selective
    import** (~363 KB uncompressed). The site's pages are simple enough that
    per-page declarations would not pay for the size difference.
  - The MD3 icon font is not distributed with the library, and the site uses no
    `icon` attribute; icons come from `@mdui/icons` (next section). No CC BY 4.0
    obligation applies to Material Icons font files.

### 0.1 @mdui/icons (site icon library)

- **Location**: npm dependency, imported selectively in `src/lib/icons.ts`
- **Upstream**: <https://github.com/zdhxiong/mdui/tree/main/packages/icons>
- **Version**: 1.0.4 (npm `@mdui/icons`, MIT)
- **License**: **MIT**, Copyright zdhxiong; verified from the bundled `LICENSE`
  and the `license` field in `package.json`
- **Notes**: Icons are SVG path strings that enter the build as JS chunks, so
  **no font file is redistributed**. The site uses 21 of them, all monochrome
  `filled` variants.

### 0.2 Site customizations of mdui

- **Location**: `src/styles/global.css`
- **Contents**: overrides the `--mdui-color-*-light` / `-dark` palettes, narrows
  the `--mdui-shape-corner-*` radii, and adjusts CJK typography sizes; also adds
  layout utility classes, form primitives and blog post typography.
- **Nature**: only CSS custom properties and new style rules are changed;
  **the mdui source is not modified**. MIT permits this kind of use.

---

## 1. CeJS (era conversion tool)

- **Location**: `public/apps/cejs-original/CeJS/` (full upstream runtime +
  `testsuite/era.htm`)
- **Entry point**: `/tools/cejs/` (the Astro page reads the upstream `era.htm`
  body/CSS at build time and renders the upstream DOM directly; not an iframe)
- **Upstream**: <https://github.com/kanasimi/CeJS> (npm package `vimunci`)
- **Version**: 4.5.6 (latest upstream is 4.5.10; updating is recommended)
- **License**: **BSD-3-Clause** — *not GPL*
  - Verified by byte-for-byte comparison of the local `LICENSE` with the
    upstream `master` `LICENSE`, the `"license": "BSD-3-Clause"` field in
    `package.json`, and matching npm registry metadata
  - Not a fork (GitHub `fork: false`)
- **Redistribution requirements**: retain the copyright notice, license terms and
  disclaimer. Do not use the names of the authors or contributors for
  endorsement without permission
- **File**: `public/apps/cejs-original/CeJS/LICENSE`

### 1.1 How this site modified the upstream page

The site no longer maintains a separate abstract data page and does not embed an
iframe. `src/pages/tools/cejs.astro` reads the body and `mdui-modern-style` of
the upstream `testsuite/era.htm` at build time and inserts them into the Astro
page, then loads `ce.js` and `era.js` via dynamic `<script>` tags. All upstream
features — lunisolar calendar, astronomical calendars, batch conversion, line
chart drill-down and data layer toggles — are preserved. The site makes only
these changes:

- the old external MDUI CDN reference is replaced with the local
  `/vendor/mdui/mdui.css`;
- an MDUI 2 / MD3 stylesheet is injected, reworking the top bar, forms, tables,
  buttons, progress bars and section cards;
- `application/locale/resources/` keeps only the 2 files the upstream page
  actually requests.

### 1.2 Translation files carry a separate license (2 retained)

Most translation JSON/JS files under CeJS's `application/locale/resources/`
come from translatewiki and are **CC BY 3.0**, outside the BSD-3-Clause grant.

- The site keeps only the 2 files the upstream page actually requests:
  - `cmn-Hans-CN.js`
  - `gettext_plural_rules.js`
- The remaining 37 translation files were removed.
- The retained files remain under **CC BY 3.0**, © translatewiki.net
  contributors; the site did not modify their contents.
- `application/locale.js` itself is BSD-3-Clause and is retained.

## 2. WebGL Fluid Simulation

- **Location**: `public/apps/3dweb/`
- **Upstream**: <https://github.com/PavelDoGreat/WebGL-Fluid-Simulation>
- **License**: **MIT**, Copyright (c) 2017 Pavel Dobryakov
- **License file**: [`public/apps/3dweb/LICENSE`](public/apps/3dweb/LICENSE)
- **Notes**: `script.js` retains the complete MIT license header and
  attribution. The site made no modifications to this code.

### 2.1 dat.GUI is Apache-2.0 (**not MIT**)

- **Location**: `public/apps/3dweb/dat.gui.min.js`
- **Upstream**: `dataarts/dat.gui`
- **License**: **Apache-2.0**, Copyright 2011 Data Arts Team, Google Creative Lab
- **Obligations**: retain the license text, retain NOTICE, **state whether the
  file was modified**
- **Site modifications**: **None.** The file is redistributed verbatim

### 2.2 Credits

`README.md` names the following reference projects; none of their code was copied
into this repository:

- [mharrys/fluids-2d](https://github.com/mharrys/fluids-2d)
- [haxiomic/GPU-Fluid-Experiments](https://github.com/haxiomic/GPU-Fluid-Experiments)
- [NVIDIA GPU Gems, chapter 38](http://developer.download.nvidia.com/books/HTML/gpugems/gpugems_ch38.html)

---

## 3. My Mind mind mapping app

- **Location**: `public/apps/mindmap/`
- **Upstream**: <https://github.com/ondras/my-mind>
- **License**: **MIT**, Copyright (c) 2013-2019 Ondrej Zara
- **License file**: [`public/apps/mindmap/LICENSE.txt`](public/apps/mindmap/LICENSE.txt)
- **Notes**: the site made no modifications to this project; it is redistributed
  verbatim

### 3.1 pell editor

- **Location**: `public/apps/mindmap/vendor/pell/`
- **Upstream**: <https://github.com/jaredreich/pell> (npm package `pell`)
- **License**: **MIT**
- **Notes**: neither `pell.min.js` nor `pell.min.css` **contains a license
  header**, and the repository ships no license file for them. MIT permits such
  distribution, but its origin and license are declared here for clarity.

---

## 4. Barcode / QR code libraries

- **Location**: `public/vendor/barcode/`
- **Notes**: the site's barcode tool page is built on the two MIT libraries below.

| File | Project | License | Copyright |
| --- | --- | --- | --- |
| `jsbarcode.js` | [JsBarcode 3.12.3](https://github.com/lindell/jsbarcode) | MIT | Johan Lindell |
| `qrcode.js` | [qrcode-generator 2.0.4](https://github.com/kazuhikoarase/qrcode-generator) | MIT | Kazuhiko Arase |

> `jsbarcode.js` is a verbatim copy of `dist/JsBarcode.all.js` from npm package
> `jsbarcode@3.12.3`.
> **Starting with 3.12.3 it no longer bundles jQuery** (the older 3.9.0 bundle
> contained jQuery 1.11.3, on whose MIT terms the site previously reported; that
> obligation disappeared together with the upgrade).
> The global export is still `window.JsBarcode`, so the tool page call site is
> unchanged.

> `qrcode.js` is a verbatim copy of `dist/qrcode.js` from npm package
> `qrcode-generator@2.0.4`.
> That library only generates the QR module matrix; the site draws the SVG
> itself and depends on no DOM rendering extension.

### 4.1 Trademark notice

`qrcode.js` carries the **Denso Wave "QR Code" trademark notice**. The site does
not use "QR Code" as a brand or product name.

### 4.2 Removed dependencies

The old site's barcode page relied on **AngularJS 1.3.0-beta.14** (MIT, © 2010-2014
Google) and **jQuery 1.11.3** (MIT) as its UI framework. Because AngularJS
reached end of life in January 2022, and 1.3.0-beta.14 was an unreleased beta,
the site **no longer uses** either framework and rebuilt the interface with Astro
components and vanilla JS. All barcode and QR generation logic comes from the MIT
libraries above.

---

## 5. Chinese to Pinyin

- **Location**: `public/vendor/pinyin/`
- **Core library**: [sxei/pinyinjs](https://github.com/sxei/pinyinjs)
- **License**: **MIT** © 2019 小茗同学
- **Verification**: `pinyinUtil.js` and both dictionaries were compared by MD5
  against the upstream `master` branch and match byte-for-byte
- **Notes**: `pinyinUtil.js` itself carries **no license header**, hence this
  declaration

### 5.1 The two dictionaries have different provenance and reliability

| File | Size | Origin | License | Status |
| --- | --- | --- | --- | --- |
| `pinyin_dict_polyphone.js` | 934 KB | Derived from `data/phrases-dict.js` in [hotoo/pinyin](https://github.com/hotoo/pinyin) | MIT (hotoo/pinyin) | Traceable |
| `pinyin_dict_withtone.js` | 124 KB | **Unknown origin** | **Undetermined** | See below |

**The provenance problem with `pinyin_dict_withtone.js`**: the upstream README
states, in its own words, that the dictionary file was "found on the internet"
and that the author "does not remember exactly which one" — the author himself
can no longer trace its origin.

The file cannot be attributed, but testing shows it is **functionally required**:

- without `pinyin_dict_withtone.js` → `pinyinUtil.getPinyin()` throws
  `抱歉，未找到合适的拼音字典文件！` and the tool is entirely unusable
- without `pinyin_dict_polyphone.js` → the polyphone cartesian product is
  returned (one test sentence produced 66 combinations), which is unusable

> **Recommendation**: replace it with a traceable MIT dictionary (such as the
> data in [hotoo/pinyin](https://github.com/hotoo/pinyin)) to eliminate the
> undetermined-licence problem.

---

## 6. Legacy RT-Oscilloscope ⚠️ **offline; license cannot be confirmed**

- **Location**: `public/apps/oscope/` — **no longer listed in the tool index**
- **License**: **Cannot be determined**
- **Status**: the directory has **no LICENSE file**, and the code carries no
  copyright header, no author credit and no upstream link. The upstream
  repository `madnesspower/RT-Oscilloscope` was sought but **that URL now returns
  404**, so the original license cannot be verified.
- **Removed**: the demo audio (`jerobeam.mp3` / `jerobeam.ogg`, from Demis
  Hassabis's 1996 MIDI piece **jerobeam**) was **removed because its licensing
  was undetermined**.
- **Status since 2026-10-01**: taken offline. Its tool index entry was replaced by
  this site's own implementation at `/tools/oscope/`, which is original work under
  the root MIT license (see "The site's own work" below). The legacy files remain
  in the repository for reference but are not advertised anywhere; the path is
  still reachable if guessed directly.
- **Recommendation**: delete the directory, or obtain written permission before
  redistributing. Otherwise point users at a clearly licensed equivalent such as
  [x-oscilloscope](https://github.com/stagas/x-oscilloscope) (MIT).

---

## 7. Runtime external loading (currently none)

**No component is loaded from a CDN at runtime today**: third-party assets are
either vendored locally under `public/vendor/` or enter the build as npm
dependencies. This section is kept to record what the old site did.

| Component | Old site | Current site |
| --- | --- | --- |
| jQuery 3.6.0 (MIT) | Loaded from a CDN by the oscilloscope app | **Removed.** `public/apps/oscope/` now contains no jQuery reference |
| mdui 0.4.3 (MIT) | Loaded from a CDN as the native apps' UI styling | **Replaced by mdui 2.1.5**, and not from a CDN either: `public/apps/oscope/index.html` loads the local `/vendor/mdui/mdui.css` and `/vendor/mdui/mdui.global.js` (see §0) |

> Assets the old site pulled in indirectly via CDN and which are not copied here:
> MDUI's CSS embeds normalize.css (MIT, necolas), and its runtime fonts are
> Roboto (Apache-2.0) and Material Icons (CC BY 4.0).
> The current site loads none of these: the MD3 icon font is not distributed with
> mdui 2, and the site uses `@mdui/icons` SVGs instead (see §0.1), with no font
> files and no `icon` attribute.

## 8. Chinese telegraph code data

- **Location**: `src/data/telegraph-cn.json`, `src/data/telegraph-tw.json`
- **Upstream**: the `data/` directory of npm
  [`chinese-telegraph-code`](https://www.npmjs.com/package/chinese-telegraph-code)@0.1.0
  (curated by Kirk Lin in 2026; code MIT)
- **⚠️ The data is not MIT**: the code tables derive from the
  `kMainlandTelegraph` / `kTaiwanTelegraph` fields of the **Unicode Character
  Database (UCD) Unihan** (UAX #38), governed by the
  **[Unicode License v3](https://www.unicode.org/license.txt)**. The snapshot is
  **Unicode 17.0.0** (2025-07-24), © 2025 Unicode®, Inc.
- **Site modifications**: the CSV/JSON `{code, character, codepoint}` lists are
  compressed into sparse arrays where "index equals code" (`chars[n]` is the
  character for code n, `null` means unassigned), so a single parse supports both
  code→character and character→code. **No code value was added or removed.**
- **Unicode License obligations (fulfilled)**:
  - Retain copyright and license notice — see this section and the header comment
    in `src/lib/telegraph.ts`
  - Do not imply Unicode endorsement — the site does not use "Unicode" as a
    product name
  - Do not sell the data standalone — the site sells nothing

### 8.1 Underlying source

Per UAX #38, both tables ultimately trace to the same reference:

> 林進義 (Lin Jinyi), 《漢字電報符号変換表》, KDD Engineering and Consulting,
> Tokyo, 1984.

The history of `kMainlandTelegraph` traces to the PRC Ministry of Posts and
Telecommunications' 《标准电码本》.

> The Chinese telegraph code and Morse code are **two entirely separate
> systems** (the former assigns one four-digit number per character, the latter
> one string of dots and dashes). The site's tool page presents them as separate
> tabs and they must not be mixed.

## 9. KaTeX (online LaTeX editor)

- **Location**: `public/vendor/katex/`
- **Upstream**: <https://github.com/KaTeX/KaTeX> (npm package `katex`)
- **Version**: 0.16.21
- **License**: **MIT**, Copyright (c) 2013-2020 Khan Academy and other
  contributors
- **Files**:
  - `katex.min.js`
  - `katex.min.css`
  - `fonts/*.woff2` (fonts required for KaTeX typesetting)
  - `LICENSE` (upstream MIT text)
- **Site modifications**: none. The `/tools/latex/` tool page calls the global
  `katex.render()` directly; formula input is computed in the browser only and
  never uploaded to a server.
- **Copyright notice**: the `LICENSE` file in this directory is distributed
  alongside the source, satisfying MIT's notice-retention requirement.

## 9a. XITS (math font for the LaTeX editor)

- **Location**: `public/fonts/math/`
- **Upstream**: <https://ctan.org/pkg/xits> (STIX fonts by STI Pub Companies,
  MicroPress, Elsevier, (URW)++, Khaled Hosny and Daniel Benjamin Miller)
- **Version**: 2019 release (files dated 2020-07-02)
- **License**: **SIL Open Font License 1.1**
- **Files**:
  - `XITS-Main-Regular.woff2`, `XITS-Main-Italic.woff2`,
    `XITS-Main-Bold.woff2`, `XITS-Main-BoldItalic.woff2` (~104 KB total)
  - `XITS-OFL.txt` (upstream license text)
- **Modifications**: the upstream OTF files were subsetted with `fontTools`
  (`pyftsubset`) to a Latin-only character set — ASCII, Latin-1 Supplement,
  Greek, Mathematical Alphanumeric Symbols (U+1D400–U+1D7FF) and common math
  operators — then converted to WOFF2. No glyph outlines were modified, only
  the character set was narrowed. The upstream `XITSMath-*` files were dropped
  because their italic variants are the same glyphs as `XITS-Italic`.
- **Usage**: optional math typeface for `/tools/latex/`, selectable in the page
  header of the “渲染结果” panel, and persisted in `localStorage` under
  `915p-latex-math-font`.
  It replaces KaTeX's `KaTeX_Main` and `KaTeX_Math` families only; the symbol
  families (`KaTeX_Size1/2/3/4`, `KaTeX_AMS`, …) remain KaTeX's own.
  See `src/styles/katex-fonts.css`.
- **Copyright notice**: `XITS-OFL.txt` is distributed alongside the fonts,
  satisfying OFL's notice-retention requirement. The OFL requires that the
  Reserved Font Names (`STIX Fonts`, `TM Math`) not be used for modified
  versions; the family is referenced as `XITS` and no modified build is
  redistributed under a reserved name.

---

## 10. html-to-image (LaTeX formula export)

- **Location**: `public/vendor/html-to-image/`
- **Upstream**: <https://github.com/bubkoo/html-to-image> (npm package
  `html-to-image`)
- **Version**: 1.11.13
- **License**: **MIT**, Copyright (c) 2017-2025 W.Y.
- **Files**: `html-to-image.js`, `LICENSE`
- **Purpose**: in `/tools/latex/`, exports the DOM rendered by KaTeX as SVG or
  PNG.
- **Site modifications**: none.

---

## 11. @cantoo/pdf-lib (PDF toolbox: page assembly and metadata)

- **Location**: `public/vendor/pdf/`
- **Upstream**: <https://github.com/cantoo-scribe/pdf-lib> (npm package
  `@cantoo/pdf-lib`), a maintained fork of <https://github.com/Hopding/pdf-lib>
- **Version**: 2.11.1
- **License**: **MIT**, Copyright (c) 2019 Andrew Dillon
- **Files**: `pdf-lib.min.js` (UMD build, 617 KB), `LICENSE.md`
- **Purpose**: in `/tools/pdf/`, merges, splits, reorders, rotates, deletes and
  duplicates pages, converts images into PDF pages, and reads/writes document
  metadata. Loaded lazily on first use.
- **Site modifications**: none (unmodified upstream UMD build).
- **Note**: the package is also present in `devDependencies` purely so that
  `src/lib/pdf-ops.ts` can use its TypeScript types and so that
  `scripts/pdf-test.mjs` can run the regression tests in Node; the browser loads
  the vendored UMD build above, never the npm copy.

---

## 12. pdf.js (PDF toolbox: page preview rendering)

- **Location**: `public/vendor/pdfjs/`
- **Upstream**: <https://github.com/mozilla/pdf.js> (npm package `pdfjs-dist`)
- **Version**: 6.4.299
- **License**: **Apache-2.0**, Copyright Mozilla Foundation and pdf.js contributors
- **Files**: `build/pdf.min.mjs` + `build/pdf.worker.min.mjs` (vendored as
  `pdf.min.mjs` / `pdf.worker.min.mjs`), `cmaps/` (1.7 MB, character maps for
  CJK encodings), `standard_fonts/` (820 KB, metrics and program files for the
  14 standard fonts), `LICENSE`
- **Purpose**: in `/tools/pdf/`, renders page thumbnails and reports the page
  count; also handles password-protected documents (`password` option).
- **Site modifications**: none. Not vendored: `wasm/`, `legacy/`, `web/`,
  `image_decoders/`, `iccs/` (the page sets `useWasm: false`, so the WASM
  decoders for JPEG 2000 / JBIG2 are not shipped; such images render blank).
- **Trademarks**: "Mozilla" and the pdf.js logo are trademarks of the Mozilla
  Foundation. This project is not affiliated with or endorsed by them.

---

## 13. fflate (PDF toolbox: ZIP packaging for split output)

- **Location**: `public/vendor/fflate/`
- **Upstream**: <https://github.com/101arrowz/fflate> (npm package `fflate`)
- **Version**: 0.8.3
- **License**: **MIT**, Copyright (c) 2026 Arjun Barrett
- **Files**: `fflate.umd.js` (UMD build), `LICENSE`
- **Purpose**: in `/tools/pdf/`, packs the single-page PDFs produced by the split
  tool into one ZIP archive (`level: 0`, i.e. stored without re-compression).
- **Site modifications**: none (file copied from the package's `umd/index.js`).

---

## 14. @cantoo/fontkit (PDF toolbox: font embedding engine)

- **Location**: `public/vendor/fontkit/`
- **Upstream**: <https://github.com/cantoo-scribe/fontkit> (npm package
  `@cantoo/fontkit`), a maintained fork of <https://github.com/foliojs/fontkit>
- **Version**: 2.0.12
- **License**: **MIT**, Copyright (c) 2017 foliojs
- **Files**: `fontkit.umd.min.js` (UMD build, 378 KB), `LICENSE`
- **Purpose**: in `/tools/pdf/`, parses the embedded CJK font so that pdf-lib can
  subset and embed it when drawing watermarks and page numbers. Loaded lazily,
  only when a text watermark or a page number is actually drawn.
- **Site modifications**: none (unmodified upstream UMD build).
- **Note**: the package is also present in `devDependencies` so that
  `scripts/pdf-test.mjs` can exercise the same code path in Node. Do **not**
  substitute the older `@pdf-lib/fontkit` 1.1.1 here: it crashes on this font
  with `Cannot read properties of undefined (reading 'pos')`.

---

## 15. Noto Sans SC (subset, PDF toolbox watermark and page numbers)

- **Location**: `public/fonts/pdf/`
- **Upstream**: Noto Sans SC, <https://github.com/notofonts/noto-cjk>
  (Copyright 2014-2021 Adobe, with Reserved Font Name `Source`)
- **License**: **SIL Open Font License 1.1** — full text in
  [`NotoSansSC-OFL.txt`](public/fonts/pdf/NotoSansSC-OFL.txt)
- **Files**: `NotoSansSC-PDF.ttf` (2.2 MB), `NotoSansSC-OFL.txt`
- **Purpose**: the only CJK-capable font shipped with the site, so that the
  PDF toolbox can draw Chinese watermarks and page numbers entirely in the
  browser, without uploading anything. Embedded and subset per output document
  by pdf-lib, so produced PDFs stay self-contained.
- **Site modifications**: this is a **modified version**. Glyphs were subset
  from the upstream font: the 6763 hanzi of GB 2312 plus common symbols and
  Latin/digits, 7782 glyphs in total. The family name was changed to
  `Noto Sans SC Subset` so that the Reserved Font Name `Source` is not used by
  a derivative work, as OFL clause 3 requires. No glyph outlines were altered.
  Because it is a subset, characters outside that coverage (rare hanzi,
  traditional-only forms, Japanese and Korean kana) will not render.
- **Note**: the subsetting is reproducible but not scripted; the build step is
  documented in `AGENT.md` rather than in `package.json`.

---

## The site's own work

The following is original to this site and is covered by the MIT license in the
root [LICENSE](LICENSE):

- Astro pages, components and layouts (`src/pages/`, `src/components/`,
  `src/layouts/`, `src/styles/`)
- Global styles and design tokens (the `:root` blocks overriding
  `--mdui-color-*` / `--mdui-shape-*` in `src/styles/global.css`)
- Tool metadata (`src/data/tools.ts`)
- Unicode symbol test data for the font test page (`src/data/symbol-blocks.json`),
  extracted from the old site's `testtext/` page; it is an enumeration of Unicode
  characters and contains no copyrightable expressive content
- Chinese encoding / CJK Extension character lists
  (`src/data/encoding-blocks.json`), compiled from a user-supplied list and
  likewise only a codepoint enumeration
- The GitHub mark icon path (`src/components/IconGithub.astro`), taken from the
  generic Octocat 16×16 path
- Blog post bodies (`src/content/blog/*.md`)
- The GitHub Actions deployment flow (`.github/workflows/deploy.yml`)
- **The PDF toolbox at `/tools/pdf/`** — written from scratch for this site:
  `src/lib/pdf-ops.ts` (page assembly, metadata, image conversion, cropping and
  size normalization, text/image watermarks, page numbers, form filling,
  encryption, PDF/A and embedded-image extraction on top of pdf-lib),
  `src/lib/pdf-loader.ts` (lazy loading of the four vendored libraries and the
  CJK font) and `src/pages/tools/pdf.astro`, plus the Node regression test
  `scripts/pdf-test.mjs`. It bundles no third-party code; pdf-lib, pdf.js,
  fflate and fontkit are used as unmodified upstream builds (§11–§14).
- **The oscilloscope at `/tools/oscope/`** — written from scratch for this site:
  `src/lib/oscope/` (`types.ts`, `capture.ts`, `ring.ts`, `measure.ts`, `fft.ts`,
  `render.ts`, `export.ts`, `recorder.ts`) and `src/pages/tools/oscope.astro`.
  It uses only the Web Audio API, the Canvas 2D API and built-in browser APIs
  (`captureStream` / `MediaRecorder` / `Blob` download); it contains no code from
  the legacy RT-Oscilloscope covered in §6. The FFT is a self-written radix-2
  Cooley–Tukey implementation, so no FFT library is bundled.

> The third-party projects hosted on this site (CeJS, the 3D fluid simulation, the
> mind mapping app) are **not original to this site** and are governed by the
> licenses in the sections above. In particular:
> - **CeJS is a third-party project** (BSD-3-Clause, © kanasimi), hosted verbatim;
>   the tool page and posts label it as third-party and it must not be presented
>   as original work.
> - The oscilloscope listed in the tool index is **this site's own work**
>   (`src/lib/oscope/`), not the legacy app in `public/apps/oscope/`, whose
>   licensing remains unconfirmed and which is offline; see §6.