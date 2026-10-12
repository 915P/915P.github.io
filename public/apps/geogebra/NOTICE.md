# GeoGebra Math Apps — license notice

This directory is a self-hosted copy of the **GeoGebra Math Apps bundle**,
version **5.4.931.2**, redistributed by this site for **non-commercial** use.

- Upstream: <https://www.geogebra.org>
- Download: <https://www.geogebra.org/download>
- License terms: <https://www.geogebra.org/license>
- Copyright: © GeoGebra GmbH, Linz, Austria

## Not a single license

GeoGebra is **not** published under one uniform license. Per
<https://www.geogebra.org/license>, its component parts are licensed as follows:

| Part | License |
| --- | --- |
| GeoGebra **source code** (of which this bundle is a compiled build) | **EUPL-1.2** — European Union Public Licence v. 1.2. Full text: [`LICENSE-EUPL-1.2.txt`](LICENSE-EUPL-1.2.txt) |
| GeoGebra **language files** (the `*_keys_*.js` translation files) and **user-interface image and style files** (logos, icons, stylesheets) | **CC BY-NC-SA 4.0** — Creative Commons Attribution-NonCommercial-ShareAlike 4.0. <https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.en> |
| The **installers / web services / "Materials"** — i.e. this redistributed bundle *as a whole* | GeoGebra **Non-Commercial License Agreement** (<https://www.geogebra.org/license>) |

Consequences that apply here:

- The **code** part is open source under the EUPL-1.2 (a copyleft licence).
- Because this bundle also contains the language files and UI assets, **the
  bundle as a whole may be used for non-commercial purposes only**. Any
  commercial use of GeoGebra (or of this copy) requires a separate agreement
  with GeoGebra GmbH — contact <mailto:office@geogebra.org>.
- Attribution is required: **Made with GeoGebra®**, with an appropriate
  copyright notice and a link to <https://www.geogebra.org>.

This notice mirrors the upstream statement as of the version above; the
upstream license page is authoritative.

## Site modification

The upstream `GeoGebra.html` (shipped here as `index.html`) registers a service
worker from the absolute path `/sworker.js`, which only exists at
`geogebra.org`'s site root. That registration block has been **removed** so the
app does not emit a 404 registration error under this site's `/apps/geogebra/`
path (and cannot attempt to control this site's origin). No other change was
made to the downloaded files.

## Files

```
index.html                 upstream GeoGebra.html (Classic app, module web3d)
deployggb.js               upstream embed/deploy loader
css/ web/ webSimple/ web3d/  upstream compiled app modules
README.txt                 upstream readme
NOTICE.md                  this file
LICENSE-EUPL-1.2.txt       full text of the EUPL-1.2
```
