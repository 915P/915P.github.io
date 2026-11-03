---
title: 卸载了还会自己长回来：wine 和 PlayOnLinux 的残留清理
description: prefix 目录删了过几天又出现，打开方式里还挂着早就卸载的程序。追下来是四层残留：wine 单向导出的关联和图标、prefix 自动重建、PlayOnLinux 只管自己的两个目录、注册表里没删干净的 ProgID
pubDate: 2026-11-03
tags: ['技术', 'Linux']
---

我在 PlayOnLinux 里卸载了 Office 2010，又手动删掉了 `~/.PlayOnLinux/wineprefix/Office2010`。过几天它回来了，1.8 G，`drive_c/Program Files` 里连一行 Office 的东西都没有。打开方式列表里也一直挂着「Microsoft Word」「Microsoft Excel」，点进去什么也不发生。

我删了两次都是这个结果，第三次才去查原因。查完发现卸载本身是干净的，剩下的全是 wine 和 PlayOnLinux 自己留下的。

## 卸载器和残留物不在同一侧

wine 的一个 prefix 是个假 Windows：`drive_c` 加一份注册表。你跑卸载程序的时候，它只认得这份注册表里登记过的东西。而这些是 wine 替它写到 Linux 侧的，它根本看不见：

| 东西 | 谁创建 | 卸载器看得见吗 | 实际会被删吗 |
|---|---|---|---|
| `drive_c/Program Files/xxx` | 安装程序 | 看得见 | 会 |
| 注册表 `Uninstall` 项 | 安装程序 | 看得见 | 会 |
| `~/.local/share/applications/wine-extension-*.desktop` | wine | 在 prefix 外面 | 不会 |
| `~/.local/share/icons/hicolor/*/apps/*.png` | wine | 在 prefix 外面 | 不会 |
| `mimeinfo.cache` 里的登记 | `update-desktop-database` | 系统级缓存 | 不会 |
| 注册表里的 `Classes\xxx` ProgID | 安装程序 | 看得见 | 未必 |

表格最后一行是我在一个已经卸载的录屏软件上发现的：它的 `Uninstall` 项被自己删掉了，但 13 处 `Classes\` 下的 ProgID、`syswow64` 里四个编解码器 DLL、`users/Public` 下的日志目录全都还在。卸载器只清理自己登记过的条目，凡是它临时建的、事后忘了登记的，一概留下。

## 删了又长回来的原因

`WINEPREFIX` 指向的目录不存在时，任何一次 wine 调用都会先把整个 prefix 建出来。我实测过，随便跑一条：

```console
$ WINEPREFIX=/tmp/test-prefix wine cmd /c echo hi
hi
$ du -sh /tmp/test-prefix
1.8G    /tmp/test-prefix
```

删掉的 prefix 就是这么回来的。那 61 个指向它的 `.desktop` 还活着，每个都写死 `WINEPREFIX=.../Office2010`，里面还挂着默认打开方式。我只要碰一下这些残留项里的任何一个，wine 就把整个 prefix 重建一遍。这些 `.desktop` 是当年 prefix 首次运行时导出的，删目录不会删它们，于是下一轮又从头开始。

更直接的触发方式是 `application/xml` 的默认程序本身就是 wine handler，双击任何一个 `.xml` 都够跑一遍上面的流程：

```console
$ xdg-mime query default application/xml
wine-extension-xml.desktop
```

## PlayOnLinux 也只管自己那两个目录

POL 记录的只有 `~/.PlayOnLinux/shortcuts/<名字>` 和 prefix 目录。它没有一份清单写着「这个 prefix 导出过哪些桌面项和图标」，所以它在 POL 里删，删的就是这两样。连它自己的安装日志都不删：我这次清出了 `logs/Microsoft Office 2010` 和 `logs/Microsoft Office 2016`，后者的 prefix 当年压根没建成，日志倒留着。

## 清理清单

顺序不能反，先删目录的话孤儿关联还会把 prefix 召回来。

```bash
# 1. 备份要删的关联
cd ~/.local/share/applications
grep -l 'wineprefix/应用名' wine-extension-*.desktop wine-protocol-*.desktop \
  | tee /tmp/desk.list | xargs -I{} cp -p {} /tmp/desktop-backup/

# 2. 删掉它们（注意双斜杠写法的漏网）
grep -lF 'wineprefix/应用名' wine-extension-*.desktop wine-protocol-*.desktop | xargs rm -f

# 3. 列出 mimeapps.list 里指向已不存在 .desktop 的条目，备份后删
cp ~/.config/mimeapps.list /tmp/mimeapps.list.bak
grep -n 'wine-extension\|wine-protocol' ~/.config/mimeapps.list

# 4. 重建缓存
update-desktop-database ~/.local/share/applications

# 5. 这时才删 prefix
rm -rf ~/.PlayOnLinux/wineprefix/应用名
```

第 3 步我自己清出 66 条，全是引用了早已不存在的 `.desktop`。这类条目 GLib 查询时本来就会跳过，所以删掉不影响当前行为，但它占着位置，也让下次排查多一层噪音。

图标有两套命名，我第一次只查了一套，漏了 267 个：

| 命名 | 例子 | 来源 |
|---|---|---|
| `<4位十六进制>_<exe名>.<n>.png` | `835C_WINWORD.0.png` | 从 exe 资源里抠出来的 |
| `<MIME类型>.png`，斜杠换成点 | `application-msword.png` | 按文件类型生成的兜底图标 |

判断孤儿的依据是有没有 `.desktop` 引用它。我扫了 654 个桌面文件，两套合起来 300 多个图标没有任何引用，删完 `hicolor/*/apps` 从 363 个降到 96 个。剩下的 15 个我逐个查了引用方，只有一个孤儿。

## 打开方式里一百九十六条，其实只有五个程序

打开方式列表里一个看图软件出现 148 次，一个压缩软件 40 次，一个 PDF 阅读器 4 次。每个扩展一个桌面文件，同名不同 id，列表被刷成这样我根本分不清哪条是哪条。

XDG 的做法是一个程序一个 `.desktop`，把所有它认得的类型写进 `MimeType=`。合并之后 196 条变成 7 条，169 个 MIME 类型的应用归属一个都没变。

### 坑一：单反斜杠会让 GLib 把整行 Exec 丢掉

桌面条目规范里 `\` 是转义符。我一开始写成：

```
Exec=env "WINEPREFIX=~/.wine" wine "C:\users\<用户名>\AppData\...\SomeApp.exe" %f
```

`\u`、`\x`、`\A` 不是合法转义序列，GLib 的反应是整行拒绝：

```
g-key-file-error-quark: Key file contains key "Exec" which has a value that cannot be interpreted.
```

结果 `get_executable()` 返回 `None`，点下去没有任何命令可执行，症状就是「完全没反应」。规范要求反斜杠写四个（`C:\\\\users`），wine 自己生成的桌面文件就是这么写的。另外 `desktop-file-validate` 对这个错误一声不吭，退出码还是 0，不能拿它当验证。

### 坑二：去掉 `wine start /ProgIDOpen` 就丢了路径转换

为了让四组各留一条，我把执行方式换成了直接调 exe：

```
Exec=env "WINEPREFIX=~/.wine" wine "C:/.../SomeApp.exe" %f
```

反斜杠换成正斜杠之后 GLib 能读了，窗口也弹得出来，但打开的是默认目录，不是我给的那个文件。原因是 Windows 程序看不懂 `/tmp/xxx.png` 这种路径，原来那层 `wine start /ProgIDOpen` 干的就是转换：

| 传参方式 | 结果 |
|---|---|
| 直接把 Linux 路径喂给 exe | 窗口弹出，停在默认目录 |
| 直接给 `Z:\tmp\xxx.png` | 打开了 |
| `wine start /ProgIDOpen "<代表 ProgID>" /tmp/xxx.png` | 打开了 |

所以最终写法是保留合并，把 `start /ProgIDOpen` 加回来，用一个代表 ProgID：

```
Exec=env "WINEPREFIX=~/.wine" wine start /ProgIDOpen "<代表 ProgID>" %f
```

同一组里 148 个 ProgID 全部指向同一个 exe，用哪个代表都一样。我逐个查了注册表里 `shell\open\command` 确认这一点，比口头推断靠谱。

## 怎么确认真的干净了

拿清理前的原始 `.reg` 和 `.desktop` 做逐块逐值 diff，删掉的每一项都要能对上目标程序的模式，非目标改动数必须是 0。我这次 diff 出 4 条 `ContainerId` 变动，查下来是 wine 每次启动自己重新生成的虚拟设备标识，跟清理无关，但不查清楚就不知道是不是自己删错了。

静态对上了还得真跑。改完注册表启动一次 wine，确认输出 `PREFIX-OK`，确认目标键真的报「找不到指定的注册表」，也确认压缩软件、看图软件、PDF 阅读器的 `shell\open\command` 还在。

最后一关是走桌面文件启动一次，看窗口标题里有没有那个文件名。前两关都过了，程序照样可能弹个空窗口，上面那两个 `Exec` 的坑就是这么暴露出来的。

编辑注册表有两个容易翻车的地方。一是 wineserver 退出时会把内存里的注册表 flush 回磁盘，我有一轮改动被它悄悄回滚了，得等进程全退再改，改完先读文件确认。二是 `open(path, 'w').write(data)` 这种写法会先截断文件再计算 `data`，中间抛异常的话文件就是 0 字节。我踩了，靠备份恢复的，现在改成先在内存里拼好字符串，写临时文件再 `os.replace`。

## 还剩什么

`~/.wine` 里 6.1 G，剩下的都是还在用的程序。这次顺手回收了 380 M 垃圾，位置是 wine 的 `AppData/Local` 下的更新器安装包、安装缓存和 Temp 目录，删之前确认过没有 wine 进程在跑。

三个问题的性质是一样的：wine 把 Windows 侧的注册单向导出到 freedesktop 世界，没有任何东西负责撤销它，而 PlayOnLinux 只认自己那两个目录。Windows 上卸载器留文件关联也是常态，区别是那边至少有个集中的登记处可以去注销，这边的残留散在四个地方，没有归属方。目前能做的就是写个脚本把这条链串起来，下次卸载跑一条命令。