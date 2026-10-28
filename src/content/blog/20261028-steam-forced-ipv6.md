---
title: 在 Linux 上强制 Steam 下载走 IPv6
description: 仅限 Linux + systemd-resolved。一个反直觉的 /etc/hosts 行为，以及我拿 0.0.0.0 打黑洞翻车的全过程
pubDate: 2026-10-28
tags: ['技术', '网络']
---

> **本篇仅适用于 Linux**，且系统必须使用 `systemd-resolved` 作为解析器。macOS、Windows，以及用 dnsmasq / unbound / bind 的发行版都不适用——在那些地方，下面这套改 `/etc/hosts` 的方法不会屏蔽 IPv4。

想让 Steam 下游戏时走 IPv6，折腾了一晚上，脚本已经开源。过程中有个反直觉的结论值得单独写一篇：**在 `/etc/hosts` 里屏蔽 IPv4，不能用 `0.0.0.0`。**

## 为什么想强制 IPv6

Steam 的下载客户端是双栈的，但它偏好 IPv4。我这边 IPv6 出口质量明显更好，所以想把下载钉死在 v6 上。

问题是 Steam 没给开关。控制台的 `download_sources` 能查看下载源，不能强制地址族；社区通行的改法是改 hosts，但多数教程只写了「加一条 AAAA」，没说清楚 IPv4 怎么办。

## 第一版：0.0.0.0 黑洞，直接翻车

常规思路是写一条 `0.0.0.0 example.com`，让 IPv4 连不上，客户端自然回退到 IPv6。我照做了，结果**连 IPv6 都没了**：

```console
$ dig +short dl.steam.clngaa.com AAAA
                                 ← 空
$ python3 -c "import socket;print(socket.getaddrinfo('dl.steam.clngaa.com',80))"
[('0.0.0.0', ...)]              ← 只剩黑洞
```

原因在 systemd-resolved 的 `ReadEtcHosts`：**只要某个域名在 `/etc/hosts` 里出现任意一条记录，它就独占接管这个域名，不再向上游 DNS 询问其它记录类型。**

写 `0.0.0.0` 等于给这个域名注册了一个 IPv4 记录，于是上游那条本来正常的 AAAA 也被一并挡掉了。双栈客户端拿到的是 `0.0.0.0` 和 `::ffff:0.0.0.0`——两个都不可用，下载必断。

## 正确写法：只写 AAAA，一条 A 都不要

利用同一条规则反过来做：

```bash
2001:db8:1234::1  dl.steam.clngaa.com
```

- **A 查询** → hosts 里有这个域名，但没有 A 记录 → 被接管后返回空 → IPv4 被屏蔽
- **AAAA 查询** → hosts 直接给出 → 正常

| 写法 | A 结果 | AAAA 结果 | 可用性 |
|---|---|---|---|
| `0.0.0.0` 黑洞 | `0.0.0.0` | **空** | ✗ 彻底断 |
| 只写 AAAA | **空** | 地址 | ✓ IPv4 被屏蔽 |

顺带的好处：AAAA 来自本地文件，不依赖上游 DNS，也不会被上游返回的 A 记录污染。

验证：

```console
$ getent ahostsv4 dl.steam.clngaa.com      # 应为空
$ getent ahosts   dl.steam.clngaa.com      # 只剩 v6
240e:...  STREAM dl.steam.clngaa.com
```

## 两个实现层面的坑

写脚本时另踩了两个，都很低级，记下来：

**一、正则匹配不了压缩形式的 IPv6。** 我写的是 `^[0-9a-f]+(:[0-9a-f]+)+$`，它要求冒号后必须紧跟十六进制。而 `240e:e9:b00c::118` 里的 `::` 中间是空的，于是**所有压缩形式的地址全部被过滤掉**，脚本一个地址都没收集到，静默退出。改用「只允许十六进制与冒号，且至少含一个冒号」才对（CNAME 含 `.`，会被自然排除）。

**二、`set -euo pipefail` 让体检功能静默失效。** `getent ahostsv4` 对一个已被屏蔽的域名**返回 1**，`pipefail` 把这个失败码带出来，命令替换 `a=$(...)` 的退出码跟着变成 1，`set -e` 立刻终止脚本。表现是 `--status` 打印了标题、下面一片空白，没有任何报错。凡是「预期会失败」的命令都得补 `|| true`。

## 速度诊断：我错了两次

这部分本来不打算写，但两次归因都错了，教训比结论有用。

配置生效后速度只有 3.9 Mbps，我先后给出两个解释：

1. **先是怪丢包。** 测出 IPv6 路径 ping 丢包 20%、IPv4 只有 3.3%，TCP 层 `cwnd` 确实被压到 4、`ssthresh` 是 4、`bytes_retrans` 有几百字节，看起来证据链完整。
2. **然后改口怪 RTT。** 因为发现三个下载源的 RTT 是 33ms / 68ms / 10ms，差了六倍多，就把 RTT 当成了主因。

两个都错了。真正的转折是 Steam 自己在 `23:46:30` 打了一行日志：

```
Moving to source priority class '6'
```

它换到了新的下载源，并发连接从 7 条涨到 16 条，速率直接跳到 **86.9 Mbps**。

而且起飞后 RTT 反而升到了 134ms——这是吞吐上去后队列堆积造成的，是**结果不是原因**。同时 16 条连接的重传加起来才 2123 字节，几乎不丢包。至于最开始那 20% 的 ping 丢包，ICMP 被限速的可能性很大，根本不能代表 TCP 路径质量——`eccdnx` 那个源 ping 丢包 16.7%，照样跑出 86 Mbps。

**协议、丢包、RTT、并发数、下载源调度，全都影响速度。** 手里只有一两个指标的时候，别急着下结论，我当时就是每拿到一组新数据就换一个说法。

## 最终状态

```
16 条下载连接，IPv4 下载连接 0 条
getent ahostsv4 对 14 个域名全部返回空
速率 3.9 → 86.9 Mbps
```

真正把速度顶上去的是 Steam 的换源，不是切 IPv6。但 hosts 那一步是地基——没有它，客户端会按自己的偏好在两个地址族之间摇摆。

## 脚本已开源

[steam-ipv6-hosts](https://github.com/915P/steam-ipv6-hosts)，MIT。两个文件，`steam-ipv6` 负责刷新和体检，`steam-v6` 在启动前顺手清掉 `http_proxy`——这个变量会让 Steam 的 IPv6 探测走代理超时，被记成 `ipv6check_http_state=bad`，反而影响下载源调度。

**适用范围要说清楚：这套方案完全依赖 systemd-resolved 的 `ReadEtcHosts` 行为，macOS、Windows、用 dnsmasq 或 unbound 的发行版都不适用**，在那些地方 AAAA-only 条目不屏蔽 IPv4，脚本等于没起作用（无害，但也没用）。另外它只覆盖 Steam 中国区的下载域名，而且 hosts 里的地址是写死的，CDN 换节点后要重跑一次。