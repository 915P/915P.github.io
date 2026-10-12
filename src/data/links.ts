/**
 * /guide/ 起始页的链接数据。
 *
 * 说明：
 * - 描述文字均为本站自行撰写，只做功能说明，不抄原文案。
 * - icon 是历史遗留的 emoji 字段，**已不参与渲染**：磁贴图标一律走本地
 *   favicon（构建期抓，见 scripts/fetch-site-icons.mjs）或 materialIcon，
 *   留着只是为了导入旧配置时字段对得上。
 * - 本站刻意不引 Google Fonts、不依赖外部图标服务，热链别人的图标也不合适。
 */

export type LinkGroup = 'frequent' | 'official' | 'course' | 'academic' | 'ai' | 'tools' | 'toolbox' | 'software';

export interface NavLink {
	/** 稳定 id，用于收藏的 localStorage key */
	id: string;
	title: string;
	/** 一句话说明这个服务是干什么的 */
	desc: string;
	url: string;
	/** emoji 图标 */
	icon: string;
	group: LinkGroup;
	/** 需要校内网 / VPN 才能访问 */
	intranet?: boolean;
	/** 需要统一身份认证登录 */
	auth?: boolean;
	/**
	 * 校外**根本解析不出**的校内站点（对 223.5.5.5 / 119.29.29.29 查询无 A 记录）。
	 * 与 intranet 的区别：intranet 只是可能要 VPN，这种是压根连不上，
	 * 所以界面要给出更明确的提示。
	 */
	campusOnly?: boolean;
	/** 境外站点，国内可能打不开或很慢 */
	intl?: boolean;
	/**
	 * 需要图书馆订购权限才能拿到全文。
	 *
	 * 刻意跟 auth 分开：`auth` 是校内统一身份认证（1 系统、Canvas 那种，
	 * 校内网一通就能登），`subscription` 是「图书馆花钱买了、你得用机构
	 * 账号解锁」的资源 —— 校外就算能打开网页，全文也下不来。
	 * 弹窗文案要分开说，所以这个标记单独存在。
	 */
	subscription?: boolean;
	/**
	 * 用 Material Icons 的组件名（如 'swap-horiz' → <mdui-icon-swap-horiz>），
	 * 有值时磁贴渲染这个图标而**不是** favicon。
	 *
	 * 主站自己的工具就是这么画的（见 src/data/tools.ts 的 icon 字段）。
	 * 小工具磁贴必须这么做：它们都指向同一个主站域名，按 host 取 favicon
	 * 会让十几个磁贴显示成同一个站点图标（实测一排金色奖杯）。
	 */
	materialIcon?: string;
}

export interface LinkCategory {
	key: LinkGroup;
	label: string;
	/** MD3 配色角色，用于分类标题 */
	tone: 'primary' | 'secondary' | 'tertiary';
}

/*
 * 标签页顺序就是这里的数组顺序。
 *
 * 「正版申请」这个分类去掉了：AutoCAD 与 Origin 已按要求移进「学术资源」，
 * 那边的两个条目移走后分类就空了，页面上会多出一个点开什么都没有的标签页。
 * 真要加回来，把 software 补进这个数组即可。
 */
export const linkCategories: LinkCategory[] = [
	{ key: 'frequent', label: '常用网站', tone: 'primary' },
	{ key: 'official', label: '学校官网', tone: 'secondary' },
	{ key: 'course', label: '课程常用', tone: 'tertiary' },
	{ key: 'academic', label: '学术资源', tone: 'primary' },
	{ key: 'ai', label: '人工智能', tone: 'secondary' },
	{ key: 'tools', label: '同济工具', tone: 'tertiary' },
	{ key: 'toolbox', label: '小工具', tone: 'primary' },
];

export const navLinks: NavLink[] = [
	// ───────────────────────────────────────────── 学校官网
	{
		id: 'tj-1',
		title: '1 系统',
		desc: '教学一体化系统：课表、选课、成绩、评教',
		url: 'https://1.tongji.edu.cn',
		icon: '📋',
		group: 'official',
		auth: true,
	},
	{
		id: 'tj-canvas',
		title: 'Canvas',
		desc: '课程公告、作业提交与批改',
		url: 'http://canvas.tongji.edu.cn/',
		icon: '🎨',
		group: 'official',
		auth: true,
	},
	{
		id: 'tj-portal',
		title: '移动门户',
		desc: '同名微信小程序的网页入口',
		url: 'https://all4u.tongji.edu.cn/tj-portal/page/mobile',
		icon: '📱',
		group: 'official',
	},
	{
		id: 'tj-power',
		title: '宿舍购电',
		desc: '交电费、查余额',
		url: 'http://goudian.tongji.edu.cn/',
		icon: '⚡',
		group: 'official',
		auth: true,
	},
	{
		id: 'tj-agent',
		title: 'AI 应用创新平台',
		desc: '试用与创建各类智能体',
		url: 'http://agent.tongji.edu.cn/',
		icon: '⭐',
		group: 'official',
		auth: true,
	},
	{
		id: 'tj-ywtb',
		title: '一网通办',
		desc: '奖学金、助学金、勤工助学等各类申请',
		url: 'http://myportal.tongji.edu.cn/',
		icon: '📋',
		group: 'official',
		auth: true,
	},
	{
		id: 'tj-mail',
		title: '同济邮箱',
		desc: '教育邮箱',
		url: 'https://mail.tongji.edu.cn/',
		icon: '📧',
		group: 'official',
		auth: true,
	},
	{
		id: 'tj-look',
		title: '智慧教学媒体',
		desc: '看录播课、课件下载',
		url: 'https://look.tongji.edu.cn',
		icon: '🎥',
		group: 'official',
		auth: true,
		// 原来这里标了 intranet: true，是错的：对 223.5.5.5 与 119.29.29.29
		// 查询都能拿到公网 A 记录 202.120.189.63，校外照常访问。
		// 标成校内会让它在起始页上被直接过滤掉、根本不显示。
	},
	{
		id: 'tj-v',
		title: '云媒体平台',
		desc: '上一套看录播的系统，资料更全但界面较旧',
		url: 'http://v.tongji.edu.cn',
		icon: '📺',
		group: 'official',
		auth: true,
	},
	{
		id: 'tj-rank',
		title: '自助服务（查排名）',
		desc: '先登录，再回到这个页面点一次才会跳转',
		url: 'https://zzfw.tongji.edu.cn/wec-self-print-app-console/mobile.html#/mobile/orderDetail?id=1798312171055091713',
		icon: '🛎️',
		group: 'official',
		auth: true,
	},
	{
		id: 'tj-phy',
		title: '物理实验中心',
		desc: '实验预约与报告；账号密码默认都是学号',
		url: 'http://phyvr.tongji.edu.cn',
		icon: '🔬',
		group: 'official',
		auth: true,
		campusOnly: true,
	},
	{
		id: 'tj-second',
		title: '第二课堂',
		desc: '劳动学时与活动发布',
		url: 'https://itongjis.tongji.edu.cn/',
		icon: '🎡',
		group: 'official',
		auth: true,
		campusOnly: true,
	},
	{
		id: 'tj-lib',
		title: '图书馆',
		desc: '馆藏检索、论文数据库、座位与预约',
		url: 'http://www.lib.tongji.edu.cn/',
		icon: '📚',
		group: 'official',
	},
	{
		id: 'tj-software',
		title: '正版软件平台',
		desc: '校内授权软件下载',
		url: 'https://software.tongji.edu.cn/',
		icon: '💻',
		group: 'official',
		auth: true,
		campusOnly: true,
	},
	{
		id: 'tj-yunpan',
		title: '同济云盘',
		desc: '校内云盘',
		url: 'https://yunpan.tongji.edu.cn/',
		icon: '☁️',
		group: 'official',
		auth: true,
	},
	{
		id: 'tj-hq',
		title: '后勤服务',
		desc: '报修、宽带、投诉',
		url: 'https://tjhq.tongji.edu.cn',
		icon: '🔨',
		group: 'official',
	},
	{
		id: 'tj-qgzx',
		title: '勤工助学',
		desc: '岗位申请与在岗管理',
		url: 'http://myportal.tongji.edu.cn/xsfwdt/sys/qgzxapp/*default/index.do?EMAP_LANG=zh',
		icon: '💼',
		group: 'official',
		auth: true,
	},
	{
		id: 'tj-cxcy',
		title: '创新创业',
		desc: '大学生创新创业项目（SITP 等）',
		url: 'https://cxcy.tongji.edu.cn/',
		icon: '💡',
		group: 'official',
		auth: true,
		campusOnly: true,
	},
	{
		id: 'tj-stadium',
		title: '体育场馆预约',
		desc: '羽毛球、乒乓球、篮球场等',
		url: 'https://stadium.tongji.edu.cn',
		icon: '🏓',
		group: 'official',
		auth: true,
	},
	{
		id: 'tj-gaoshu',
		title: '高数同步课堂',
		desc: '往年真题与同步练习',
		url: 'https://gaoshutongbu.tongji.edu.cn/index.htm',
		icon: '🔢',
		group: 'official',
	},
	{
		id: 'tj-freshman',
		title: '新生任务指引',
		desc: '入学后要办的事都列在这里',
		url: 'https://1.tongji.edu.cn/welcome',
		icon: '✅',
		group: 'official',
	},
	{
		id: 'tj-pay',
		title: '财务处缴费',
		desc: '学费、住宿费等在线缴费',
		url: 'https://paycwc.tongji.edu.cn/payment/',
		icon: '💰',
		group: 'official',
	},
	{
		id: 'tj-vpn',
		title: 'VPN 下载',
		desc: '连校内网络用；校外访问图书馆资源也需要',
		url: 'https://nic.tongji.edu.cn/xzzq/VPNkhdxz.htm',
		icon: '🔒',
		group: 'official',
	},
	{
		id: 'tj-nic',
		title: '信息化办公室',
		desc: '校园网与信息化相关通知',
		url: 'https://nic.tongji.edu.cn/',
		icon: '🖥️',
		group: 'official',
	},

	// ───────────────────────────────────────────── 课程常用
	{
		id: 'icourse163',
		title: '中国大学 MOOC',
		desc: '国内高校慕课平台',
		url: 'https://www.icourse163.org/',
		icon: '📖',
		group: 'course',
	},
	{
		id: 'chaoxing',
		title: '超星学习通',
		desc: '多数通识课在这里签到与提交',
		url: 'http://www.chaoxing.com/',
		icon: '🌲',
		group: 'course',
	},
	{
		id: 'zhihuishu',
		title: '智慧树',
		desc: '另一套教学平台，看课程视频',
		url: 'http://online.zhihuishu.com/onlineSchool/student/index',
		icon: '🌳',
		group: 'course',
	},
	{
		id: 'ketangpai',
		title: '课堂派',
		desc: '作业与随堂练习',
		url: 'https://www.ketangpai.com/#/main',
		icon: '🧮',
		group: 'course',
	},
	{
		id: 'ilab',
		title: 'iLab 虚拟实验',
		desc: '线上虚拟实验平台',
		url: 'https://www.ilab-x.com/',
		icon: '🧑🏻‍🔬',
		group: 'course',
	},


	/*
	 * ⚠️ 校内裸 IP（10.x / 192.168.x.x）**刻意不写进这个文件**。
	 *
	 * 这份数据会随站点一起公开发布。在公开仓库里列出内网地址 + 端口 +
	 * 系统路径，等于给扫描者一份现成的目标清单；托管到校内服务器上时
	 * 更是会直接撞上学校的信息网络安全管理规定。
	 *
	 * 改用「导出 / 导入」（见 data/guide.ts 的 serializeConfig / parseConfig）：
	 * 需要的人把配置导出成 JSON，自己发给需要的人，全程不经过服务器，
	 * 仓库里也就只剩公开可达的那部分。
	 */

	// ───────────────────────────────────────────── 学术资源
	{
		id: 'scholar',
		title: 'Google Scholar',
		desc: '谷歌学术，查文献与引用',
		url: 'https://scholar.google.com',
		icon: '🎓',
		intl: true,
		group: 'academic',
	},
	{
		id: 'semanticscholar',
		title: 'Semantic Scholar',
		desc: '偏 AI 的英文学术检索与分析',
		url: 'https://www.semanticscholar.org',
		icon: '🔬',
		group: 'academic',
	},
	{
		id: 'cnki',
		title: '中国知网',
		desc: '中文学术期刊与学位论文',
		url: 'https://www.cnki.net',
		icon: '📗',
		group: 'academic',
		subscription: true,
		auth: true,
	},
	{
		id: 'wos',
		title: 'Web of Science',
		desc: '权威英文引文检索平台',
		url: 'https://www.webofscience.com',
		icon: '🌐',
		group: 'academic',
		subscription: true,
		auth: true,
	},
	{
		id: 'wanfang',
		title: '万方数据',
		desc: '中文文献与期刊数据库',
		url: 'https://www.wanfangdata.com.cn',
		icon: '📙',
		group: 'academic',
		subscription: true,
		auth: true,
	},
	/*
	 * 从同济图书馆「数据库导航」(classid=11981) 里挑出来的计算机 / 电子信息方向常用库，
	 * 并把原先「正版申请」里的 AutoCAD、Origin 一并挪到这里。
	 *
	 * ⚠️ 网址用的是各库的**官方公开入口**，不是图书馆详情页里的订阅地址 ——
	 * 那个「链接地址」要统一身份认证登录后才显示，静态 HTML 里取不到
	 * （页面本身写着「如需在校外使用，请通过学校网络中心的 VPN 访问」），
	 * 所以全文下载仍需校内网或 VPN，这里标了 auth。
	 *
	 * 挑选依据是另一个来源：http://198.51.100.10:8080/ 同济电子音像资源系统。
	 * 它是按中国图书馆分类法检索**期刊**的，按「计算机 / 电子电气 / 通信」
	 * 分类查出来的「来源数据库」字段里，出现最频繁的就是下面这几个
	 * （ACM、IEL/IEEE、INSPEC、ProQuest、ABI）。
	 */
	{
		id: 'acm-dl',
		title: 'ACM 数字图书馆',
		desc: '计算机领域顶会顶刊全文',
		url: 'https://dl.acm.org/',
		icon: '🖥️',
		group: 'academic',
		subscription: true,
		auth: true,
	},
	{
		id: 'ieee-xplore',
		title: 'IEEE Xplore',
		desc: '电气电子与计算机期刊会议',
		url: 'https://ieeexplore.ieee.org/',
		icon: '⚡',
		group: 'academic',
		subscription: true,
		auth: true,
	},
	{
		id: 'inspec',
		title: 'INSPEC',
		desc: '科学文摘，电气电子检索利器',
		url: 'https://www.inspec.com/',
		icon: '🔌',
		group: 'academic',
		subscription: true,
		auth: true,
	},
	{
		id: 'proquest',
		title: 'ProQuest',
		desc: '外文期刊与博硕士论文',
		url: 'https://www.proquest.com/',
		icon: '📚',
		group: 'academic',
		subscription: true,
		auth: true,
	},
	{
		id: '51cto',
		title: '51CTO 学堂',
		desc: 'IT 实战课程与教学视频',
		url: 'https://edu.51cto.com/',
		icon: '🎬',
		group: 'academic',
	},
	{
		id: 'autodesk',
		title: 'AutoCAD 教育版',
		desc: '教育授权免费申请，进页面选对应的教育版',
		url: 'https://www.autodesk.com.cn/education/edu-software/overview?sorting=featured&filters=individual',
		icon: '📐',
		group: 'academic',
	},
	{
		id: 'origin',
		title: 'Origin 学生版',
		desc: '科研绘图软件，填基本信息即可申请',
		url: 'https://www.originlab.com/OriginProLearning.aspx',
		icon: '📊',
		group: 'academic',
	},
	{
		id: 'arxiv',
		title: 'arXiv',
		desc: '物理、数学、计算机预印本',
		url: 'https://arxiv.org/',
		icon: '📄',
		group: 'academic',
	},

	{
		id: 'course-filter',
		title: '通济 - 模拟选课系统',
		desc: '课程筛选工具',
		url: 'https://course.f1justin.com/',
		icon: '😸',
		group: 'tools',
	},
	{
		id: 'xk-schedule',
		title: '同济排课助手',
		desc: '仿真模拟选课流程',
		url: 'https://xk.xialing.icu/',
		icon: '😼',
		group: 'tools',
	},
	{
		id: 'onetj-webapp',
		title: '一块钱第三方',
		desc: '适合手机用的一块钱app',
		url: 'https://flowerblackg.github.io/onetj-webapp',
		icon: '🪙',
		group: 'tools',
	},

	// ───────────────────────────────────────────── 人工智能
	/*
	 * 常用的三个国产大模型放最前面：它们是国内直接可用的，不需要科学上网，
	 * 日常问问题的频率也远高于 NotebookLM 之类。
	 * 放在组首是有意的 —— 磁贴按数组顺序渲染，靠前就排在前面。
	 */
	{
		id: 'deepseek',
		title: 'DeepSeek',
		desc: '国产大模型，推理与代码都不错',
		url: 'https://chat.deepseek.com/',
		icon: '🐋',
		group: 'ai',
	},
	{
		id: 'qwen',
		title: 'Qwen',
		desc: '阿里的大模型对话',
		url: 'https://chat.qwen.ai/',
		icon: '🀄',
		group: 'ai',
	},
	{
		id: 'doubao',
		title: '豆包',
		desc: '字节的 AI 助手',
		url: 'https://www.doubao.com/chat/',
		icon: '🫘',
		group: 'ai',
	},
	{
		id: 'notebooklm',
		title: 'NotebookLM',
		desc: '拿自己的资料做问答与摘要',
		url: 'https://notebooklm.google/',
		icon: '📓',
		intl: true,
		group: 'ai',
	},
	{
		id: 'gemini',
		title: 'Gemini',
		desc: '谷歌的模型，长上下文比较稳',
		url: 'https://gemini.google.com/',
		icon: '♊',
		intl: true,
		group: 'ai',
	},
	{
		id: 'chatgpt',
		title: 'ChatGPT',
		desc: '通用对话与写作',
		url: 'https://chat.openai.com',
		icon: '💬',
		intl: true,
		group: 'ai',
	},
	{
		id: 'grok',
		title: 'Grok',
		desc: 'xAI 的模型',
		url: 'https://grok.com',
		icon: '🛰️',
		intl: true,
		group: 'ai',
	},

	// ───────────────────────────────────────────── 实用工具
	{
		id: 'github',
		title: 'GitHub',
		desc: '代码托管',
		url: 'https://github.com',
		icon: '🐙',
		intl: true,
		group: 'frequent',
	},
	{
		id: 'yourtj',
		title: 'YourTJ 社区',
		desc: '不记名的选课交流社区',
		url: 'https://f.yourtj.de/',
		icon: '📋',
		group: 'tools',
	},
	{
		id: 'tj-car',
		title: '拼车',
		desc: '校内拼车信息',
		url: 'http://pinche.tj.hainuo.wang/',
		icon: '🚗',
		group: 'tools',
	},


	// ───────────────────────────────────────────── 小工具
	/*
	 * 主站 /tools 上的工具，这里只放**入口链接**。
	 *
	 * 为什么指过去而不是把工具搬过来：工具依赖主站那一整套（layout、样式、
	 * @mdui/icons 注册），搬过来等于复制半个仓库；而起始页的职责是
	 * 「去哪里」，不是「什么都能做」。
	 *
	 * 两条要注意的：
	 * - 用**根相对路径**（/tools/radix/），同源访问，站点部署在哪都能用。
	 * - 必须给 materialIcon。这些工具全在同一个域名下，按 host 取 favicon
	 *   会让十几个磁贴显示成同一个站点图标（实测一排金色奖杯）。
	 */
	{
		id: 'tool-radix',
		title: '进制转换',
		desc: '2/8/10/16 与自定义进制互转，支持小数',
		url: '/tools/radix/',
		icon: '🔧',
		materialIcon: 'swap-horiz',
		group: 'toolbox',
	},
	{
		id: 'tool-stackcalc',
		title: '表达式求值',
		desc: '用双栈逐步演示 C/C++ 表达式的计算过程',
		url: '/tools/stackcalc/',
		icon: '🔧',
		materialIcon: 'functions',
		group: 'toolbox',
	},
	{
		id: 'tool-memview',
		title: '数据在内存',
		desc: '整型与浮点数的位模式、内存字节与规约化',
		url: '/tools/memview/',
		icon: '🔧',
		materialIcon: 'memory',
		group: 'toolbox',
	},
	{
		id: 'tool-hanzi',
		title: '汉字编码',
		desc: 'GB2312 / GBK / GB18030 / UTF-8 / Big5 的字节与码点',
		url: '/tools/hanzi/',
		icon: '🔧',
		materialIcon: 'translate',
		group: 'toolbox',
	},
	{
		id: 'tool-pinyin',
		title: '汉字转拼音',
		desc: '中文转拼音，支持多音字与声调',
		url: '/tools/pinyin/',
		icon: '🔧',
		materialIcon: 'translate',
		group: 'toolbox',
	},
	{
		id: 'tool-geogebra',
		title: 'GeoGebra',
		desc: '函数作图、几何、3D、CAS 与统计的动态数学应用',
		url: '/apps/geogebra/index.html',
		icon: '🔧',
		materialIcon: 'functions',
		group: 'toolbox',
	},
	{
		id: 'tool-morse',
		title: '摩尔斯电码',
		desc: '摩尔斯互转、音频发报，含《标准电码本》中文四码',
		url: '/tools/morse/',
		icon: '🔧',
		materialIcon: 'graphic-eq',
		group: 'toolbox',
	},
	{
		id: 'tool-barcode',
		title: '条码 / 二维码',
		desc: 'QR 码与 20 种一维条码，可下载 SVG/PNG',
		url: '/tools/barcode/',
		icon: '🔧',
		materialIcon: 'qr-code-scanner',
		group: 'toolbox',
	},
	{
		id: 'tool-pdf',
		title: 'PDF 工具箱',
		desc: '合并、拆分、页面管理与图片转 PDF，全部本地完成',
		url: '/tools/pdf/',
		icon: '🔧',
		materialIcon: 'picture-as-pdf',
		group: 'toolbox',
	},
	{
		id: 'tool-latex',
		title: 'LaTeX 编辑器',
		desc: '输入 TeX 公式，实时渲染为排版结果',
		url: '/tools/latex/',
		icon: '🔧',
		materialIcon: 'functions',
		group: 'toolbox',
	},
	{
		id: 'tool-editor',
		title: 'HTML 编辑器',
		desc: '边写边预览，渲染在沙箱 iframe 中',
		url: '/tools/editor/',
		icon: '🔧',
		materialIcon: 'code',
		group: 'toolbox',
	},
	{
		id: 'tool-cejs',
		title: '纪年转换',
		desc: '农历、天文历法、批量转换与线图',
		url: '/tools/cejs/',
		icon: '🔧',
		materialIcon: 'calendar-month',
		group: 'toolbox',
	},
	{
		id: 'tool-fonttest',
		title: '字体测试',
		desc: '5 种字体族 × 11 档字重 + Unicode 覆盖检查',
		url: '/tools/fonttest/',
		icon: '🔧',
		materialIcon: 'font-download',
		group: 'toolbox',
	},
	{
		id: 'tool-media',
		title: '音视频处理',
		desc: '改容器、提取音轨、裁剪拼接与压制，纯本地',
		url: '/tools/media/',
		icon: '🔧',
		materialIcon: 'video-file',
		group: 'toolbox',
	},
	{
		id: 'tool-oscope',
		title: '示波器',
		desc: '触发稳定的实时示波器，自动测量频率与峰峰值',
		url: '/tools/oscope/',
		icon: '🔧',
		materialIcon: 'graphic-eq',
		group: 'toolbox',
	},
	{
		id: 'tool-mindmap',
		title: '思维导图',
		desc: '单文件应用，浏览器里直接画',
		url: '/apps/mindmap/index.html',
		icon: '🔧',
		materialIcon: 'account-tree',
		group: 'toolbox',
	},
];

/** 取出用于搜索的纯文本（小写），避免每次输入都重新拼 */
export function linkSearchText(link: NavLink): string {
	// 站内小工具是根相对路径，没有 hostname；取不到就只搜标题和描述
	let host = '';
	try {
		host = new URL(link.url).hostname;
	} catch {
		host = '';
	}
	return `${link.title} ${link.desc} ${host}`.toLowerCase();
}
