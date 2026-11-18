---
title: 437 KB 的字节里只有 201 个字是写给你的：一封钓鱼邮件的完整解剖
description: 一封伪装成学校通知的钓鱼邮件，四层伪装、三个客户端看到三封不一样的信、二维码背后三屏假登录，以及普通人在四步之内能做的防范
pubDate: 2026-11-18
tags: ['安全', '网络']
---

今天 19:41，我收到一封邮件。主题是 `51 View Row, Colorado Springs`，发件人叫「Titan Bio」，正文却自称学校校务部，说要办「2026 年教育专项个人学籍信息变更」。主题、发件人、正文三者互不相干，一看就是批量套模板发的。

我当然知道是骗子，但当我看到邮件源代码，实在是叹为观止。技术之“精湛”，前所未有。在此记录，也警示各位，谨防上当受骗。

我把整封信拆开看了一遍，结论是：**正文 437,491 字节，真正写给我看的只有 201 个字**；剩下的 99.95% 全是写给机器看的。

<mdui-card variant="outlined" style="margin-top:1.2rem">
<div style="display:flex;align-items:center;justify-content:space-between;gap:.9rem;flex-wrap:wrap;padding:.85rem 1.1rem">
  <div><div style="font-weight:600">喜欢看数字和源码？</div><div style="font-size:.85rem;color:rgb(var(--mdui-color-on-surface-variant))">同一件事的完整技术分析：邮件头逐字段、体积拆解、kit 源码、检测脚本、IOC 与时间线，写多长都行</div></div>
  <mdui-button variant="tonal" href="/blog/20261118-phishing-email-forensics/">读技术分析</mdui-button>
</div>
</mdui-card>

<mdui-card variant="elevated" style="margin-top:1.4rem;padding:1.1rem 1.2rem">
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.9rem">
  <div><div style="font:700 1.7rem/1.2 ui-monospace,monospace;color:rgb(var(--mdui-color-error))">437 KB</div><div style="font-size:.82rem;color:rgb(var(--mdui-color-on-surface-variant));margin-top:.25rem">这封邮件正文的体积，其中约 400 KB 是重复的空样式</div></div>
  <div><div style="font:700 1.7rem/1.2 ui-monospace,monospace;color:rgb(var(--mdui-color-primary))">201 字</div><div style="font-size:.82rem;color:rgb(var(--mdui-color-on-surface-variant));margin-top:.25rem">剥掉全部伪装后，真正写给你的全部内容</div></div>
  <div><div style="font:700 1.7rem/1.2 ui-monospace,monospace;color:rgb(var(--mdui-color-secondary))">1 张图</div><div style="font-size:.82rem;color:rgb(var(--mdui-color-on-surface-variant));margin-top:.25rem">唯一的行动指令：二维码，指向一个高仿 QQ 登录页</div></div>
</div>
</mdui-card>

下面这版可以直接点开玩（**本地演示，零网络请求**，输入不会离开你的浏览器）：

<mdui-card variant="outlined" style="margin-top:1.2rem;padding:0;overflow:hidden">
<div style="display:flex;align-items:center;justify-content:space-between;gap:.9rem;flex-wrap:wrap;padding:.85rem 1.1rem;background:rgb(var(--mdui-color-surface-container))">
  <div><div style="font-weight:600">交互解剖页</div><div style="font-size:.85rem;color:rgb(var(--mdui-color-on-surface-variant))">四层伪装开关 · 三屏仿 QQ 登录 · 编码演示，全部在一个 HTML 文件里</div></div>
  <mdui-button variant="outlined" href="/apps/phishing-email/" target="_blank" rel="noopener">新窗口打开</mdui-button>
</div>
<iframe src="/apps/phishing-email/" title="钓鱼邮件交互解剖（本地演示，零网络请求）" loading="lazy" style="display:block;width:100%;height:760px;border:0;background:#0e1116"></iframe>
</mdui-card>

<mdui-card variant="filled" style="margin-top:.9rem">
<div style="display:flex;align-items:center;justify-content:space-between;gap:.9rem;flex-wrap:wrap;padding:.9rem 1.1rem">
  <div><div style="font-weight:600">🧭 不想看细节？</div><div style="font-size:.85rem;color:rgb(var(--mdui-color-on-surface-variant))">四件事，按性价比排序，第一条就能让这封信作废</div></div>
  <mdui-button variant="tonal" href="#防骗指南">点此看防骗指南</mdui-button>
</div>
</mdui-card>

## 认证全绿，也不等于安全

这封信的 SPF、DKIM、DMARC 三项检查**全部通过**——因为它确实是从一个域名正大光明发出来的，而那个域名是攻击者自己注册的，从注册到发信只用了 7 周。

<mdui-card variant="filled" style="margin-top:1rem">
<p style="margin:0"><mdui-icon-error style="width:1.15em;height:1.15em;color:rgb(var(--mdui-color-error));vertical-align:-.22em"></mdui-icon-error> <strong>认证只证明「信确实是这个域名发的」，不证明「这个域名是好人」。</strong>「已通过验证」那几个字，骗子也一样拿得到。</p>
</mdui-card>

## 正文里的四层伪装

一半骗机器（垃圾邮件过滤器、内容检测、搜索引擎），一半骗人：

- **顶开首屏的一大片空白**：正文最前面塞了 382 个空格与零宽字符交替的垫片，HTML 本该把连续空格折叠成一个，攻击者每两个空格之间夹一个零宽字符，引擎就一个都不敢吞——首屏被顶出约 810px，还顺带干扰复制和框选。
- **肉眼看不见的一整版网页**：一个 1 像素高、被裁剪掉的隐藏层里，塞着整版「开云体育」赌博网站、两张业务表格和一封伪造的日文邮件。人看不见，**爬虫看得见**——这个域名就能在搜索结果里蹭到关键词。
- **400 KB 的空样式**：1,485 个 `<style>` 标签，同一段规则重复了 4,452 次。除了撑大体积，它还把正文的关键词密度稀释到检测阈值以下。
- **和中文逐字交替的日文**：2,284 字日文敬语，与那 201 个汉字**一个字一个字地夹着**，全部 `font-size:0` 藏起来。机器读到的「正文」是一封正常的商务日信，真话被淹在里面。

## 同一份 HTML，三个客户端三封信

剥掉全部伪装，真正写给人看的就是这 9 句话：

```text
请及时查阅下方文档
-----原始邮件----- 发件人: … 主题:
新学期，通知
校务部：陈老师通知
关于2026年教育专项个人学籍信息变更告知
如文件过大导致图片模糊看不清，请扫描下方二维码打开
请务必及时查看不再另行发送！
教导处
收到的同学请务必及时查看
```

配两张图：一张二维码，一张「文档预览」缩略图（就是那句「图片模糊看不清」所指的东西）。



**但同一封信，在不同软件里长得完全不一样**：

| 打开方式 | 你会看到 |
|---|---|
| QQ 邮箱 / 微信 / 网页邮箱 | 201 字中文 + 二维码 —— 攻击者想让你看到的样子 |
| 切换到「纯文本」视图 | 满屏日文垃圾与汉字粘在一起，二维码没了，伪造的引用头也现形 |
| Thunderbird | **只剩一个「请」字**，图片全被拦下 —— 骗局直接断在这里 |

第三行最邪门。原因说穿了很简单：**它那些藏日文的标签根本没写闭合**（开了 244 个，只关了 123 个）。QQ、微信这类净化器会自动帮你补全，所以照常显示；老老实实按规范解析的 Thunderbird 则被那个没关上的标签一路吞到文件末尾，**后面所有字都被判了隐形**。
<style>
/* 黑幕（moegirl .heimu 同款）：文字与背景同色，鼠标悬停才显形 */
.heimu{--heimu-bg:#181a1b;--heimu-fg:#fff;background-color:var(--heimu-bg);color:var(--heimu-bg);
  border-radius:4px;padding:.1em .4em;transition:color .13s linear;text-shadow:none}
.heimu:hover,.heimu:active{color:var(--heimu-fg)}
.heimu a{color:inherit}
:root.mdui-theme-dark .heimu{--heimu-bg:#4e5558;--heimu-fg:#e8e6e3}
:root.mdui-theme-light .heimu{--heimu-bg:#181a1b;--heimu-fg:#fff}
@media (prefers-color-scheme:dark){:root.mdui-theme-auto .heimu{--heimu-bg:#4e5558;--heimu-fg:#e8e6e3}}
</style>

<span class="heimu">~~骗子的灵感来源：[偽中国語 / 重音テト × 足立レイ - 音無あふ](https://www.bilibili.com/video/BV1x5jmzTEJf)~~</span>
<mdui-card variant="filled" style="margin-top:1rem">
<p style="margin:0">同一封信，解析方式不同，看到的就是两封信。这也给出了一条最省事的防骗建议：<strong>重要的通知，以纯文本为准</strong>——伪装在纯文本视图里全都会掉光。</p>
</mdui-card>

## 邮件头上的收件人，不是写给你的那个

这封信的 `To:` 里写的是**别人家的地址**，真正投给我靠的是另一套字段；回复地址还单独指向了 `163.com` 一个陌生信箱——你要是点了「回复」，信就进了骗子手里。

协议上这两者**完全不要求一致**，而这是批量模板的常见残留：整封信是从上一封被收割的真邮件复刻的，连正文里那段伪造的「原始邮件」都还挂着两个地址和一个写死的日期。

顺带更正我一开始的误判：我原以为那两个地址是真实受害者，查完才发现其中 `@edu.cn` 那个**根本是个不收邮件的域**——地址是编的，纯属模板里的死文字。

## 二维码后面：三屏假登录

二维码指向 `zx.xmbjia.com`，那是个高仿 QQ 登录页，流程和真站一样分三屏：

1. 账号 + 密码
2. 验证手机号
3. 短信验证码（也就是它真正想要的东西）

三个值得知道的实情：

- **它只检查格式，不检查密码**。长度、非空、不能全是同一个字符——6 条规则全在浏览器本地跑，一个字节都不外发。密码对不对它当场根本不知道，得等凭据交出去之后拿去真站试，所以「密码错误」的提示同样是它编的。（[逐条规则与源码见技术篇](/blog/20261118-phishing-email-forensics/#kit-前端6-道初检与-state-状态机)）
- **它自称的「高级加密」只是把账号密码编码了两遍**，没有密钥、公开可逆，任何人拿到都能直接还原；叠两层唯一的作用是骗过「扫到编码就解开一层」的垃圾邮件过滤器。而且**点「登录」的瞬间，凭据就已经发出去了**，比页面跳转还早。
- **页面一直转圈，是它在后台一边审你、一边决定下一屏骗你什么**：要手机号？要验证码？还是直接给你一句「验证通过」，然后拿你刚交的号码和验证码去登你的真账号。整个过程里没有一个分支是「密码错了」。（[完整状态表与轮询源码见技术篇的 C&C 一节](/blog/20261118-phishing-email-forensics/#cc转圈的那几秒服务器在替你做决定)）

## 防骗指南

四件事，按性价比排序。

1. **用靠谱的邮件客户端 —— 最省事的一条**
   - 推荐 Thunderbird、系统自带邮件客户端，或网页邮箱的「纯文本 / 简洁」模式。关键是两点：**默认拦截远程图片**（这封信的二维码与缩略图全是外链，拦下就看不到扫码入口），以及**支持纯文本视图**。
   - 这封信在 Thunderbird 里只剩一个「请」字，四层伪装全部失效——工具选对，攻击者一半的功夫直接白费。同理，网页邮箱里被「净化」过的样子未必是真相，重要通知以纯文本为准。
2. **会看纯文本和源码**
   - 切到纯文本视图或按 `Ctrl+U`：这封信立刻变成 2,284 字日文垃圾 + 两张表 + 400 KB 废样式。看三个地方：**发件域名**、**回复地址**、**收件人里有没有你**。
   - 正文出现「扫描下方二维码打开」就先当诈骗处理——正式通知不会用二维码把你送去第三方域名。纯文本里出现「汉字夹日文」「引用头多出陌生地址」「开头一大片空白」，都是伪造痕迹。
3. **警惕伪造的登录界面**
   - **在 QQ / 微信里点开的链接突然要你重新登录，基本可以判定是钓鱼**——腾讯系 App 内部早就持有登录态，官方页面不会再问你要一次账号密码。
   - 钓鱼页通常粗制滥造：域名乱码、字体与间距不对、按钮样式山寨、logo 发糊；它会在页面里挂 `aq.qq.com`、`zc.qq.com` 的真链接当门面——**门面是真的，登录框是假的**。手机上长按链接看真实地址，不要看显示文字。
   - 还有一招试探法，两个前提：**不填真密码**——反正它当场也验不出对错；**格式要合规**——只填 3 位或 `666666` 会被它本地弹回，你就测不出它到底验不验密码了。
   - 格式合法的假账号密码照样被放行、还往下一步要你的手机号，那就说明它压根不校验密码，是钓鱼无疑，直接关页面。
4. **查验发件人身份 —— 邮箱地址全都能伪造**
   - **不只是显示名，发件人地址本身也能任意改写**：把 From 写成 `jwc@某大学.edu.cn` 也做得到，收件箱里看着就是学校发的。地址长得像，不等于真是它发的。
   - 所以「看发件人是不是学校邮箱」只能排除最懒的骗子，排不掉会伪造的。真正要看的是三样：**认证结果**（SPF / DKIM / DMARC）、**这个域名本身是不是学校的官方域**、**回复地址和发件人是不是同一个**。而连「认证全 pass」也不等于可信——本例三项全绿，只证明信是那个 7 周前才注册的域名发的。
   - 再加两条：不认识的人发来的「急件 / 中奖 / 缴费 / 学籍变更」一律先当不存在；要核实就**换一条渠道**（打学校公开电话、登校内内网、当面问），不要用信里的链接、二维码、电话。时间压力（「请务必及时查看」「不再另行发送」）本身就是骗术的一部分。

<mdui-card variant="filled" style="margin-top:1.6rem;padding:1.15rem 1.25rem">
<p style="margin:0;font-size:1.05rem;line-height:1.9"><strong>口诀：</strong>发件人地址、显示名，全都能伪造——名字再像、地址再像学校，域名不是官方域就是假的；App 里让你重新登录就是假的；让你扫码进第三方域的校方通知就是假的；可疑登录页先输错的试试，照样放行就是假的。</p>
</mdui-card>

这封信用 437 KB 的字节骗过机器，用 201 个字骗人；可它那些自保手段（明文源码、可逆编码、写死的模板、错配的收件人），谁肯看一眼纯文本、按一下 `Ctrl+U`，就全露出来了。

---

<mdui-card variant="outlined" style="margin-top:1.4rem">
<p style="margin:0;font-size:.9rem;line-height:1.85;color:rgb(var(--mdui-color-on-surface-variant))"><mdui-icon-info style="width:1.15em;height:1.15em;color:rgb(var(--mdui-color-primary));vertical-align:-.22em"></mdui-icon-info> <strong>关于交互版</strong>：<code>/apps/phishing-email/</code> 是本地教学仿制品，整段登录与校验逻辑就写在那一个 HTML 文件里，<strong>没有任何网络请求</strong>，输入只存在于你自己的浏览器内存中，刷新即清空；已加 <code>noindex,nofollow</code>，搜索引擎不索引。想看字节数、原始头字段、kit 源码、检测脚本、IOC 与时间线，都在<a href="/blog/20261118-phishing-email-forensics/">技术篇</a>。</p>
</mdui-card>