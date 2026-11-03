---
title: MinerU 本地部署：官方 Docker 只管 N 卡，核显和网络坑都得自己填
description: 没有 NVIDIA 显卡，官方 Dockerfile 用不上，自己基于 Ubuntu 24.04 搭 ONNX 版镜像。路上撞了三个网络问题：容器里没有 IPv6、基础镜像缺 ca-certificates、pypi 直连超时。还实测了 Arc 核显跑 ONNX 小模型反而比 CPU 慢 4.76 倍。
pubDate: 2026-11-03
tags: ['技术', 'Linux', 'Docker']
---

想在本地把 PDF 转成 Markdown。最轻的方案是 Umi-OCR 自带的 PaddleOCR-json 引擎，图能出字，我拿它跑了一张中文测试图，识别正确、置信度 0.916，但它交出来的只是一行行带坐标的纯文本，标题层级、表格、公式全靠自己拼。要「文档变 Markdown」，得上有版面分析的工具，选了 MinerU。

MinerU 官方提供 Docker 部署，翻文档看到一句：通用 Docker 流程面向 NVIDIA GPU，非 NVIDIA 设备的 Docker 部署待更新。我这台机器是 Intel Core Ultra 5 225H，Arc 核显（Arrow Lake），没有 N 卡。于是自己搭 ONNX 版镜像，把过程记下来。

## 镜像怎么选

MinerU 4.x 的基础包（`pip install mineru`）自带 ONNX 运行时和 WebGPU 插件，Linux 上经 Vulkan 执行，正好对着 Intel 核显。基础镜像选 Ubuntu 24.04 而不是 Debian 12，理由只有一个：Ubuntu 24.04 仓库里的 `mesa-vulkan-drivers` 是 25.2.8，认得 Arrow Lake（PCI ID `0x7d51`），宿主机 `vulkaninfo` 能列出 `Intel(R) Graphics (ARL)`；Debian 12 的 mesa 还停在 22.x，新核显直接不认。

Dockerfile 本身只有几行：Ubuntu 打底，装 `libvulkan1 mesa-vulkan-drivers` 和 python3，再 `pip install mineru`。镜像 2GB 出头，但搭的过程耗在三个网络问题上。

## 三个网络坑

### 容器里没有 IPv6

宿主机 pip 平时走 `ipv6.mirrors.ustc.edu.cn`，那是 IPv6 专用站，IPv4 连不通。Docker 默认网桥不给容器分全球 IPv6 地址（只有 fe80 链路本地），容器里这个镜像站整个不可用。换成 USTC 主站 `mirrors.ustc.edu.cn` 的 IPv4 入口，实测 0.11 秒响应，速度不比 IPv6 差。

判断方法很直接：在容器里分别 curl 一下两个地址，谁通用谁。

### apt 报 Unable to locate package

第二版 Dockerfile 把 apt 源替换成 `https://mirrors.ustc.edu.cn`，构建时报出一排 `Unable to locate package libvulkan1`。原因很隐蔽：Ubuntu 基础镜像里没有 `ca-certificates`，https 源的证书验证整个失败，`apt-get update` 一个索引都没拉到，装包自然找不到。把源改成 `http://` 就正常了。官方源本来就是 http 开头，照抄模板反而撞不上这层。

### pypi.org 直连超时

宿主机的 pip 配置是国内镜像，但 `pip.conf` 是宿主机的文件，容器里的 pip 照样默认打 pypi.org，实测 10 秒超时。在 Dockerfile 里写一份 `/etc/pip.conf` 指向 USTC，pip 阶段从可能卡死变成 139 秒装完全部依赖。

这三处都处理完，镜像 2GB 出头，全程构建约 4 分钟。

## 核显加速实测：慢了 4.76 倍

MinerU 4.1 启动时会做 ONNX 设备校准，在 CPU 和 GPU 之间自动选。用 `mineru-kit hardware detect` 触发，它下载 OCR 识别模型后对同一输入各测几轮：

| 设备 | 中位耗时 | 输出正确性 |
|------|---------|-----------|
| CPU（14 核） | 0.129 s | 基准 |
| Arc 核显（WebGPU/Vulkan） | 0.612 s | 与 CPU 一致 |

GPU 算得没错，但慢 4.76 倍，远超 0.8 的启用阈值，判定结果 `device=cpu`。原因不难猜：被测的是 21MB 的 OCR 识别小模型，batch 6，核显跑这点算力要先过一遍 Vulkan 调度，而这颗 CPU 单核睿频 4.9GHz，小张量上调度链一来一回就输光了。官方文档写的设计正是如此：集显按需校准，收益不足就回落 CPU。

VLM 是另一回事。standard 档用的 1.2B 模型走 llama.cpp 引擎，设备独立选择，日志里它直接枚举到 `Vulkan0: Intel(R) Graphics (ARL)`。模型分量够大，核显能吃上力。这套配置最终的分工是：小模型走 CPU，大模型走核显，各自都选对了。

## 解析效果

拿一页自制的课本样式测试稿（标题、正文、编号列表、三行表格）跑 basic 档：

```markdown
## 第二章光合作用与能量转换
## 第一节叶绿体的结构与功能
光合作用是指绿色植物通过叶绿体，利用光能……
1.说明光合作用的原理和意义
| 阶段 | 场所 | 产物 |
| 光反应 | 类囊体薄膜 | ATP、NAOH |
```

标题进了 h2，列表进了有序列表，表格转成 Markdown 表格，化学式没丢。瑕疵是标题里的空格被吃掉（「第二章光合作用」）。

速度方面，模型缓存命中后单页推理 2.0 秒，整页流程约 8 秒（含打包下载）。一本 100 页的书在 basic 档是 5 分钟量级。

## 日常使用

引擎做成一个容器，WebUI 和 API 同时带：

```bash
docker start mineru-webui        # 启动，10~20 秒就绪
# 浏览器打开 http://127.0.0.1:7860
docker stop mineru-webui         # 用完停掉
```

容器挂了 `--restart unless-stopped`，开机自动恢复，多数时候直接开浏览器就行。模型约 1.9GB（OCR 小模型加 1.2B VLM）直接烤进镜像，镜像共约 5.8GB，重建容器和分发镜像都不用再下模型。烤入方式做了两版：先是从 ModelScope 下载（2.5MB/s，跑完要十几分钟），后来改成 `--build-context` 从本地模型目录 COPY，1.9GB 只花了 16 秒，Dockerfile 里两种模式都留着（`MODELS=local` / `MODELS=download`），谁用谁选。

API 在 8000 端口，任何程序按 V1 Tasks 契约就能调：POST 提交文件清单，PUT 上传原始字节，GET 轮询状态，`result_url` 下载产物 ZIP，里面 Markdown、DOCX、HTML、LaTeX 按所选格式平铺。

中途还包过一个 PySide6 桌面端，打成了 67MB 的 AppImage，能跑，但交互打磨不理想，先搁置了。容器加 WebUI 这条路对日常用量够用，部署脚本开源在 [915P/mineru-docker-onnx](https://github.com/915P/mineru-docker-onnx)，容器丢了可以 clone 下来一键重建。