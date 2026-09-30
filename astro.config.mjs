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
	integrations: [mdx(), sitemap()],
	vite: {
		ssr: {
			// mdui 基于 Web Components，依赖浏览器 API，SSR 阶段不参与外部化
			noExternal: ['mdui'],
		},
	},
});
