import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
	const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
		(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
	);

	return rss({
		title: '915P的小站',
		description: '折腾笔记与小工具',
		site: context.site!,
		items: posts.map((p) => ({
			title: p.data.title,
			description: p.data.description ?? '',
			pubDate: p.data.pubDate,
			link: `/blog/${p.id}/`,
		})),
		customData: '<language>zh-cn</language>',
	});
}
