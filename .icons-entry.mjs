// 图标 bundle 入口：apps/ 下的静态页面不经过 Astro 构建，无法直接 import 裸说明符
// （tslib / lit / @mdui/icons-shared），故用 esbuild 把这些依赖与图标一起打成单文件。
// 生成：node_modules/.bin/esbuild .icons-entry.mjs --bundle --format=esm --minify --outfile=public/apps/moping/icons.bundle.js
import './public/apps/moping/icons/brush.js';
import './public/apps/moping/icons/photo-camera.js';
import './public/apps/moping/icons/photo-library.js';
import './public/apps/moping/icons/menu-book.js';
import './public/apps/moping/icons/cloud-upload.js';
import './public/apps/moping/icons/crop.js';
import './public/apps/moping/icons/close.js';
import './public/apps/moping/icons/edit.js';
import './public/apps/moping/icons/download.js';
import './public/apps/moping/icons/arrow-forward.js';
import './public/apps/moping/icons/play-arrow.js';
import './public/apps/moping/icons/restart-alt.js';
import './public/apps/moping/icons/expand-more.js';
import './public/apps/moping/icons/add.js';
import './public/apps/moping/icons/filter-alt-off.js';