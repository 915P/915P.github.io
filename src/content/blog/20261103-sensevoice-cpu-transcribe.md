---
title: 纯 CPU 转录 2 小时 16 分录音：9 分钟跑完，线程数设成物理核反而最慢
description: 没有 NVIDIA 显卡，选了 SenseVoice-Small + fsmn-vad + cam++ 搭纯 CPU 转录管线，实测 RTF 0.061，2 小时 16 分录音 8 分 43 秒转完。路上推翻了三个先入为主的结论：所谓的"解码丢 11.7 秒"、97.6% 的 VAD 覆盖率、以及"14 核就该开 14 线程"。最后打包进 Docker，模型用 `--build-context` 从本地 COPY 进镜像。
pubDate: 2026-11-03
tags: ['技术', 'Linux', 'Docker']
---

手上有段 2 小时 16 分的课堂录音，想变成带时间戳和说话人标签的文本。这台机器是 Intel Core Ultra 5 225H，14 核（4 个 4.9GHz 性能核、8 个 4.4GHz 能效核、2 个 2.5GHz 低功耗核），有 Arc 140T 核显和 NPU，但**没有 NVIDIA CUDA**，核显和 NPU 也没有能用的推理后端。

whisper 类的现成方案在纯 CPU 上要么转得慢，要么得自己拼说话人分离。FunASR 里那套 SenseVoice-Small + fsmn-vad + cam++ 是 CTC 非自回归模型，234M 参数，自带标点，正好对上需求。搭完之后 2 小时 16 分录音 8 分 43 秒转完，2356 段，35490 字，分出 4 个说话人，语义上是自洽的：主讲人、主持人，加两个各提问一次的学生。

## 三个被推翻的结论

过程里我有三个判断一开始是对的，后来都被数据推翻了。

**"源文件比解码出来多 11.7 秒"** —— 8165.32 秒这个数是按 320kbps 乘文件大小算出来的，文件尾部还拖着 469,191 字节的 ASCII 索引数据，被一起算进了时长。按 mp3 帧数重新算，源是 8153.59 秒，跟解码结果差 0.00 秒。没有任何丢失，是我在用一个错误的口径去核对另一个。

**"VAD 覆盖率 97.6%"** —— 这个数字虚高。我在每段前后各补了 150ms 的 padding，段数一多，padding 累加起来把覆盖率抬了 8.5 个百分点。去掉 padding 之后真实值是 **89.1%**，这也是日志里 `coverage=` 该看的区间（85%~95% 属正常，低于 70% 才要怀疑音频质量）。

**"有 1566 秒是静音"** —— `silencedetect` 阈值设成 -35dB 得出的结论。这录音的底噪就在 -40dB 左右，阈值比底噪还高，自然整片都被判成静音。放宽到 -45dB，全片真正无声的只有 1.1 秒。

## 线程数：10 最优，14 最差

FunASR 默认 `ncpu=4`，我本以为既然有 14 个核就该全用上。同一输入从 1 扫到 14：

| 线程数 | 耗时 | 相对 10 线程 |
|--------|------|--------------|
| 1 | 92 s | 3.4× |
| 2 | 52 s | 1.9× |
| 4 | 32.7 s | 1.2× |
| 8 | 27.7 s | 1.04× |
| **10** | **26.7 s** | **1.0×（最优）** |
| 12 | 36.4 s | 1.4× |
| 14 | 51.6~83 s | 1.9~3.1× |

到 12 个就开始变慢，14 个直接崩到 51.6 秒，最差一次 83 秒。这台 CPU 是异构的，性能核、能效核、低功耗核频率差了近一半，线程一多就被拖到慢核上，再加上超订，反而不如 10 个。**默认的 4 偏保守，10 才是甜点。**

这里还有个教训：我第一次测出"14 比 10 慢 5.85 倍"，写下来之后才发现当时后台有个 ffmpeg 在跑，把测量污染了。干净环境下重测是 2.45 倍。**跑性能数据之前先 `top` 看一眼有没有别的东西在抢核。**

## 标点的唯一开关

SenseVoice 自己会输出标点，但触发条件是 `use_itn=True`。FunASR 官方 CLI 没暴露这个参数，所以直接用官方命令行跑出来是整篇无标点的——这也是我在自己的 `transcribe.py` 里显式传它的原因，删掉它就退化了。

顺带省掉一个模型：`iic/ct-punc` 那个标点模型不需要，SenseVoice 自带，装了白占 1.2GB。

## 打包进 Docker

镜像三层构成，加起来 3.22GB（容器内 `du -sx /` 实测）：

| 层 | 体积 | 构成 |
|----|------|------|
| Python 环境 | 1847 MB | torch 809M、llvmlite 173M、transformers 120M、scipy 111M、sympy 74M |
| apt 装的 ffmpeg | 451 MB | 205 个包 |
| 模型权重 | 929 MB | SenseVoice + vad + cam++ |

有个数字值得说清楚：`docker images` 显示的是 **5.11GB**，比实际大了 1.9GB。这台 Docker 用 containerd 镜像存储，压缩副本（`docker save | gzip` 实测 1.53GB）和解包副本（3.22GB）**同时留在磁盘上**，`inspect .Size` 把两者加起来：3.22 + 1.53 = 4.75GB ≈ 4.76GiB。不是记错账，是真占了两份。

路上还有两处网络坑：

- **apt 直连 Debian 源慢到没法用**，实测 5~8 秒一个包，205 个包要半小时。换成 USTC 之后 38 秒装完。
- **pip 得用 USTC 的 IPv4 入口**。宿主机 `pip.conf` 配的是 `ipv6.mirrors.ustc.edu.cn`，Docker 默认网桥不给容器分全球 IPv6 地址，容器里这个地址直接 `Network is unreachable`。容器内两个地址分别 curl 一下就分得清。

torch 也钉死了 `==2.15.0+cpu`。不钉的话 pip 会选到 PyPI 上的 CUDA 构建，把 2.5GB 的 nvidia 依赖一起拉进来。

### 模型怎么进镜像

`.dockerignore` 是白名单，只放构建必需的几个文件（防止 1.8G 的虚拟环境被打进 build context），模型在 context 之外，`COPY` 够不着。解法是 BuildKit 的命名 build context：

```bash
docker build --build-context models=$HOME/.local/share/asr/modelscope -t asr:latest .
```

```dockerfile
COPY --from=models --chown=1000:1000 . /home/asr/.local/share/asr/modelscope/
```

929MB 从本地复制，不走网络。写成 `RUN modelscope download` 虽然也行，但重建一次就要重下一遍。

### 停止即清理

WebUI 上传的任务目录如果放在容器可写层，试了三次上传就涨到 789MB。改成 tmpfs 之后，`docker stop`、重启、整机关机时由内核直接丢弃，可写层稳定在 32.8kB：

```bash
docker run -d --name asr-webui --restart unless-stopped \
  -p 7870:7870 --tmpfs /home/asr/jobs:rw,size=4g,mode=1777 asr:latest
```

`mode=1777` 不能省。tmpfs 默认属主是 root，而容器以 uid 1000 运行，漏了这个参数上传接口直接 500，日志里是 `PermissionError: Permission denied`。

## 日常使用

```bash
docker start asr-webui     # 启动，几秒就绪
docker stop  asr-webui     # 停止，任务目录同时清空
```

浏览器开 `http://127.0.0.1:7870` 拖文件进去就行。命令行走一次性容器，跑完自动消失，产出文件属主是 uid 1000，宿主直接可读：

```bash
docker run --rm -v 音频所在目录:/data asr:latest /data/录音.mp3
```

也有 REST，三个接口轮询即可，适合写进脚本：`POST /api/upload` 拿 `id`，`GET /api/job/{id}` 看进度，`GET /api/result/{id}` 取文本。

端口选 7870 是为了跟 MinerU 的 7860 错开，两个可以同时开着。

速度参考：60 秒音频约 7 秒，10 分钟约 47 秒，2 小时 16 分 8 分 43 秒，全程 RTF 0.061。

代码和部署文档开源在 [915P/asr-docker-webui](https://github.com/915P/asr-docker-webui)，模型不随仓库分发，README 里列了三个完整模型 ID 和各自的许可。