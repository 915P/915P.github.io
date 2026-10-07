import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
	site: 'https://915p.github.io',
	// 仓库为 <user>.github.io 根域部署，base 保持 '/'；若迁到子路径部署改为 '/<repo>/'
	base: '/',
	trailingSlash: 'ignore',
	// 关闭开发期页面底部的 Astro Dev Toolbar
	devToolbar: { enabled: false },
	// apps/ 与 cejs/ 下是整体拷贝的原生项目，保持目录结构原样输出
	build: { assets: 'assets' },
	integrations: [
		mdx(),
		/*
		 * /guide/ 目前只在源码里，尚未决定是否公开，
		 * 所以先不写进 sitemap —— 否则搜索引擎会把它收录，等于变相公开。
		 * 要公开时把这一行删掉即可。
		 */
		sitemap({ filter: (page) => !page.includes('/guide/') }),
	],
	vite: {
		ssr: {
			// mdui 基于 Web Components，依赖浏览器 API，SSR 阶段不参与外部化
			noExternal: ['mdui'],
		},
	},
});
