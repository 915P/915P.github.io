/**
 * 拼音词库加载器
 *
 * 词库共约 1 MB，为纯浏览器端处理，不上传任何输入内容。
 * 拆成独立模块是因为 Astro 的 <script> 会被打包，此处仍需在运行时动态
 * 注入 <script> 标签加载 public/ 下的 UMD 脚本。
 */

const BASE = '/vendor/pinyin/';

export function loadScript(src: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const s = document.createElement('script');
		s.src = src;
		s.onload = () => resolve();
		s.onerror = () => reject(new Error('加载失败: ' + src));
		document.head.appendChild(s);
	});
}

/** 加载 pinyinUtil 及两份词库，返回 pinyinUtil 对象 */
export async function loadPinyin(): Promise<PinyinUtil> {
	if ((window as unknown as { pinyinUtil?: PinyinUtil }).pinyinUtil) {
		return (window as unknown as { pinyinUtil: PinyinUtil }).pinyinUtil;
	}
	// polyphone 词库可选但推荐：缺失时多音字会返回全部候选的笛卡尔积
	await loadScript(BASE + 'pinyin_dict_withtone.js');
	await loadScript(BASE + 'pinyin_dict_polyphone.js');
	await loadScript(BASE + 'pinyinUtil.js');
	const util = (window as unknown as { pinyinUtil: PinyinUtil }).pinyinUtil;
	if (!util) throw new Error('pinyinUtil 未注册');
	return util;
}

export interface PinyinUtil {
	getPinyin(chinese: string, splitter: string, withtone?: boolean, polyphone?: boolean): string;
	/**
	 * 取每个汉字拼音的首字母。
	 * 注意：第二个参数是 polyphone（是否展开多音字），不是「是否大写」，
	 * 输出本身已是大写。与上游 pinyinUtil 实现一致。
	 */
	getFirstLetter(chinese: string, polyphone?: boolean): string;
}
