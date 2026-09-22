---
title: 让 Docker 构建真正吃到缓存
date: 2026-08-12
tags: [Docker, 构建, 工程实践]
---

> 示例文章，用于演示分页与列表排版，请替换成你自己的内容。

镜像构建慢，多半不是机器慢，而是缓存没命中。

## 每条指令都是一层

Dockerfile 的每条指令生成一层，某一层的输入发生变化，它**以及它之后的所有层**都会失效重建。

这条规则决定了一切优化方向：把变化频率低的东西放前面，变化频繁的放后面。

## 依赖要单独 COPY

常见的错误是先把整个项目拷进去再装依赖：

```dockerfile
COPY . .
RUN pip install -r requirements.txt
```

改一行代码，依赖安装就要重跑。正确做法是先只拷依赖清单：

```dockerfile
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
```

这样只有 `requirements.txt` 变化时才重装依赖。

## 用 .dockerignore 切断无关变化

`COPY . .` 会把 `.git`、`node_modules`、日志、构建产物一起拷进去。这些文件内容天天变，等于每次都在破坏缓存，顺带还把镜像撑大。

`.dockerignore` 的写法与 `.gitignore` 类似，至少要排掉版本控制目录、依赖目录和本地构建产物。

## 排查缓存为什么没命中

构建输出里每一层都会标 `CACHED` 或重新执行。从第一个没有 `CACHED` 的层往上找，那条指令就是罪魁祸首——通常是它引用的某个文件被改了。
