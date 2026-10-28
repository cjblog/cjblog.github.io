---
title: Docker 原理、常用命令与单机部署
date: '2026-09-23'
tags:
  - Docker
  - 容器
  - 部署
  - 运维
---

容器这个词已经被用得太宽泛，容易掩盖一个很简单的事实：Docker 容器就是**一个被内核隔离起来的普通进程**。没有虚拟机，没有硬件模拟，没有常驻的"容器操作系统"。理解这一句，后面关于镜像分层、数据卷、网络的一切就都是它的推论。

这篇文章分三段：先讲清楚它是怎么做到的（架构与隔离），再把常用命令整理成一份能查的表，最后用一个完整的例子走一遍单机上线部署——包括更新与回滚。

<!-- more -->

## 它到底解决了什么问题

「一次构建，处处运行」这句话被说得太多，以至于没人再问它到底抹平了什么。实际抹平的是**运行环境**：解释器版本、系统库、环境变量、目录结构、依赖版本。它**没有**抹平的是一切与内核和硬件相关的东西——CPU 架构、内核特性、以及需要直接访问宿主硬件的东西。

所以一个 x86 上构建的镜像在 Apple Silicon 上跑不了（除非构建时指定目标平台），一个依赖特定内核模块的程序也容器化不了。这不是 Docker 的缺陷，是它的边界。

三个概念要分清：

| 概念 | 是什么 | 生命周期 |
| --- | --- | --- |
| 镜像 image | 只读模板，一层层叠出来的文件系统 | 构建一次，长期存放 |
| 容器 container | 镜像的一份运行实例，多了一个可写层 | 可随时创建销毁 |
| 仓库 registry | 存放与分发镜像的地方 | 独立于前两者 |

## 架构：客户端-服务端

Docker 不是一个单体程序。你敲的 `docker` 命令只是一个**客户端**，它把请求发给一个常驻的守护进程，由后者去做实际的事：

<div class="diagram-scroll">
<svg width="640" height="250" viewBox="0 0 640 250" role="img" aria-label="Docker 架构：docker CLI 把命令发给 dockerd，dockerd 通过 containerd 调用 OCI 运行时 runc 创建容器进程，镜像来自 registry">
  <g stroke="var(--line-strong)" fill="var(--surface)">
    <rect x="176" y="14" width="128" height="46" rx="9"/>
  </g>
  <g font-size="12" font-weight="600" fill="var(--ink)" text-anchor="middle">
    <text x="240" y="34">镜像仓库</text>
  </g>
  <g font-size="9.5" fill="var(--ink-muted)" text-anchor="middle">
    <text x="240" y="50">registry</text>
  </g>
  <g stroke="var(--ink-faint)" stroke-width="1" fill="none" stroke-dasharray="4 3">
    <line x1="240" y1="60" x2="240" y2="80"/>
    <path d="M 240 86 l -4 -6 l 8 0 z" fill="var(--ink-faint)" stroke="none"/>
  </g>
  <g font-size="9.5" fill="var(--ink-faint)" text-anchor="start">
    <text x="250" y="76">pull / push</text>
  </g>
  <g stroke="var(--line-strong)" fill="var(--surface)">
    <rect x="16" y="86" width="128" height="68" rx="9"/>
    <rect x="176" y="86" width="128" height="68" rx="9"/>
    <rect x="336" y="86" width="128" height="68" rx="9"/>
    <rect x="496" y="86" width="128" height="68" rx="9"/>
  </g>
  <g font-size="12" font-weight="600" fill="var(--ink)" text-anchor="middle">
    <text x="80" y="112">docker CLI</text>
    <text x="240" y="112">dockerd</text>
    <text x="400" y="112">containerd</text>
    <text x="560" y="112">runc</text>
  </g>
  <g font-size="9.5" fill="var(--ink-muted)" text-anchor="middle">
    <text x="80" y="132">你敲的命令</text>
    <text x="80" y="146">可以指向远端</text>
    <text x="240" y="132">守护进程</text>
    <text x="240" y="146">管理各种对象</text>
    <text x="400" y="132">管理容器生命周期</text>
    <text x="400" y="146">调用运行时</text>
    <text x="560" y="132">OCI 运行时</text>
    <text x="560" y="146">真正创建进程</text>
  </g>
  <g stroke="var(--ink-faint)" stroke-width="1" fill="none">
    <line x1="144" y1="120" x2="168" y2="120"/>
    <path d="M 168 120 l -6 -4 l 0 8 z" fill="var(--ink-faint)" stroke="none"/>
    <line x1="304" y1="120" x2="328" y2="120"/>
    <path d="M 328 120 l -6 -4 l 0 8 z" fill="var(--ink-faint)" stroke="none"/>
    <line x1="464" y1="120" x2="488" y2="120"/>
    <path d="M 488 120 l -6 -4 l 0 8 z" fill="var(--ink-faint)" stroke="none"/>
    <line x1="560" y1="154" x2="560" y2="182"/>
  </g>
  <g stroke="var(--line-strong)" fill="none" stroke-dasharray="5 4">
    <rect x="336" y="186" width="288" height="46" rx="9"/>
  </g>
  <g font-size="10.5" fill="var(--ink-muted)" text-anchor="middle">
    <text x="480" y="206">Linux 内核</text>
    <text x="480" y="222">namespaces 负责隔离，cgroups 负责限制</text>
  </g>
  <g font-size="10" fill="var(--ink-faint)" text-anchor="start">
    <text x="16" y="206">CLI 与服务端可以不在</text>
    <text x="16" y="221">同一台机器上：DOCKER_HOST</text>
  </g>
</svg>
</div>

分层的意义在于**责任分离**：

- `docker CLI` 只负责把命令变成 API 请求。它不关心容器怎么创建。
- `dockerd` 是常驻的那一个，管理镜像、容器、网络、数据卷这些对象，对外提供 HTTP API。因为它是服务端，所以 CLI 完全可以在另一台机器上（`DOCKER_HOST` 指向远端就是常见做法）。
- `containerd` 负责容器的生命周期，它是独立项目，Kubernetes 也直接用它。
- `runc` 是真正动手的那个：调用内核接口，创建出一个被隔离的进程。它是 OCI 运行时规范的一个实现——**换成别的运行时（如 gVisor、Kata）不改上层**，这正是分层的价值。

## 隔离与分层

### 隔离靠两类内核特性

容器不是"轻量虚拟机"，它没有模拟任何硬件。隔离和限制分别由两样东西提供：

**namespaces 管"看得见什么"。** 每个容器拥有自己的一套命名空间，于是它看到的进程列表、网络栈、挂载点、主机名都是自己的：

| namespace | 隔离的东西 | 表现 |
| --- | --- | --- |
| pid | 进程号 | 容器里第一个进程的 PID 是 1 |
| net | 网络栈 | 有独立网卡、IP、端口空间 |
| mnt | 挂载点 | 独占一套文件系统视图 |
| ipc | 进程间通信 | 独立的共享内存与信号量 |
| uts | 主机名与域名 | 可以有自己的 hostname |
| user | 用户与用户组 ID | 容器内的 root 可以映射成宿主普通用户 |

这些在 `docker run` 上都有对应的开关（`--pid`、`--ipc`、`--uts`、`--userns`、`--cgroupns`）。比如 `--pid host` 就是让容器共用宿主的进程命名空间——容器里能看见宿主的所有进程，调试时偶尔有用，但**等于放弃了这一层隔离**。

**cgroups 管"能用多少"。** 资源限制与计量，防止某个容器把机器吃干净。`--memory`、`--cpus`、`--pids-limit` 都是这一层的事。容器里 `PID 1` 特殊：它要负责回收孤儿进程，所以**镜像里那个前台进程别忘了正确处理信号**——这也是为什么推荐 exec 形式的 `ENTRYPOINT`。

### 分层：镜像与写时复制

镜像是一层层叠出来的，容器在顶上多一层可写的：

<div class="diagram-scroll">
<svg width="620" height="240" viewBox="0 0 620 240" role="img" aria-label="镜像分层：顶部是每个容器独有的可写层，下面三层是只读镜像层，由所有容器共用">
  <g stroke="var(--line-strong)" fill="var(--surface)">
    <rect x="60" y="30" width="250" height="44" rx="8"/>
    <rect x="60" y="80" width="250" height="44" rx="8"/>
    <rect x="60" y="130" width="250" height="44" rx="8"/>
    <rect x="60" y="180" width="250" height="44" rx="8"/>
  </g>
  <g stroke="var(--accent)" stroke-width="1.5" fill="none" stroke-dasharray="5 4">
    <rect x="60" y="30" width="250" height="44" rx="8"/>
  </g>
  <g font-size="11.5" font-weight="600" fill="var(--ink)" text-anchor="middle">
    <text x="185" y="57">容器可写层</text>
    <text x="185" y="107">应用代码</text>
    <text x="185" y="157">依赖</text>
    <text x="185" y="207">基础镜像</text>
  </g>
  <g font-size="10" fill="var(--ink-muted)" text-anchor="start">
    <text x="326" y="50">每个容器独有一份</text>
    <text x="326" y="65">删掉容器就没了</text>
    <text x="326" y="107">COPY . .</text>
    <text x="326" y="157">uv sync / npm ci</text>
    <text x="326" y="207">FROM python:3.12-slim</text>
  </g>
  <g stroke="var(--ink-faint)" stroke-width="1" fill="none">
    <line x1="46" y1="80" x2="46" y2="224"/>
    <line x1="40" y1="80" x2="52" y2="80"/>
    <line x1="40" y1="224" x2="52" y2="224"/>
  </g>
  <g font-size="10" fill="var(--ink-faint)">
    <text transform="translate(20 152) rotate(-90)" text-anchor="middle">只读镜像层</text>
  </g>
  <g font-size="10.5" fill="var(--ink-muted)" text-anchor="start">
    <text x="60" y="14">构建一次，所有容器共用；容器改动只在最上面那层</text>
  </g>
</svg>
</div>

读写规则是**写时复制**：容器要修改某个文件时，先把它从只读层复制到可写层，再改这一份。没被改过的文件始终只有一份，所有容器共享。

由此推出两条实践：

- **删掉容器，可写层里的东西就没了。** 数据库文件、上传的附件、日志——只要写在容器里，容器一重建就全部消失。这就是数据卷存在的唯一理由。
- **`docker commit` 把一个容器的可写层固化成新镜像，能不做就不做。** 这样得到的东西无法复现、无法审查，等同于把一个手工配好的环境打包带走。镜像应当始终来自 Dockerfile。

⚠️ 关于存储驱动：早期默认是 `overlay2`（把若干只读层和一个可写层合并成一套视图，可写层叫 `upperdir`，只读层叫 `lowerdir`）。**Docker Engine 29 起，全新安装默认改用 containerd image store，底层是 `overlayfs` snapshotter**；从旧版本升级上来的机器才继续沿用 `overlay2`。网上大量教程还在说"overlay2 是默认驱动"，那是升级机的现状，不是新装的现状。两者对使用者的影响很小，但你排查存储问题时值得知道自己在哪一套上。

## 镜像与 Dockerfile

### 常用指令与易错点

| 指令 | 作用 | 容易踩的地方 |
| --- | --- | --- |
| `FROM ... AS name` | 基础镜像 / 起一个构建阶段 | 只有 `ARG` 可以写在 `FROM` 之前 |
| `WORKDIR` | 设定后续指令的工作目录 | 相对路径是基于上一个 `WORKDIR` 叠加，不是项目根 |
| `COPY` | 拷贝文件 | 只能从构建上下文里拷，`../` 和开头的 `/` 会被规范化抹掉 |
| `ADD` | 拷贝 + 额外能力 | 支持远程 URL 与 Git 仓库，**本地 tar 会自动解包**——不想解包就用 `COPY` |
| `RUN` | 构建期执行 | exec 形式不经过 shell，变量替换、通配符都不生效 |
| `ENV` | 环境变量 | 会保留到运行期 |
| `ARG` | 构建期变量 | 不写入镜像，但**会出现在 `docker history` 里**，所以不能拿来传密钥 |
| `EXPOSE` | 声明端口 | **它并不真的发布端口**，只是文档性质的声明 |
| `USER` | 切换运行用户 | 只写用户名时组权限仍是 root 组 |
| `HEALTHCHECK` | 健康检查 | 默认 `interval 30s`、`timeout 30s`、`retries 3` |
| `CMD` / `ENTRYPOINT` | 容器启动命令 | 只有最后一个生效，见下 |

`CMD` 与 `ENTRYPOINT` 的关系值得单独说：

- 都写 exec 形式（JSON 数组）时，`docker run` 后面跟的参数会**追加在 ENTRYPOINT 之后，并覆盖 CMD**。
- **shell 形式的 `ENTRYPOINT` 会忽略 `CMD` 和 `docker run` 的参数**，而且启动的进程不是 PID 1、收不到 `SIGTERM`——容器 `stop` 时只能等超时被强杀。这是"容器停得特别慢"的常见原因，**永远用 exec 形式**。

### 多阶段构建

```dockerfile
FROM python:3.12-slim AS builder
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev

FROM python:3.12-slim
COPY --from=builder /app/.venv /app/.venv
COPY . /app
ENV PATH="/app/.venv/bin:$PATH"
CMD ["python", "-m", "app"]
```

只有被 `COPY --from` 带进最终阶段的东西才会进入结果镜像，中间阶段的编译器、缓存、源码全都不算数。**用 uv 装依赖的完整写法**（含缓存挂载与分层技巧）在[另一篇](uv-python-env.md)里，镜像分层的缓存机制本身在[这篇](docker-layer-cache.md)里。

阶段可以按名字引用，`--target` 可以停在中间某个阶段——调试"依赖装不上的问题"时很有用：`docker build --target builder -t debug .`。

### 构建上下文与 .dockerignore

`docker build` 时，**当前目录的整个内容会被打包送给构建器**，这个目录叫构建上下文。上下文越大，构建越慢；而且被 `.dockerignore` 排除的文件**根本没法被 `COPY` 进镜像**（但 Dockerfile 与 `.dockerignore` 本身仍会送达）。

语法与 `.gitignore` 类似（Unix shell glob），几个细节：`**` 匹配任意层目录，开头结尾的 `/` 会被忽略，`!` 表示例外，**多行匹配时最后匹配的那一行生效**。另外还有一个 Dockerfile 专属的忽略文件 `build.Dockerfile.dockerignore`，**它优先于**根目录的 `.dockerignore`。

## 常用命令

### 镜像

| 命令 | 说明 |
| --- | --- |
| `docker build -t app:1.0 .` | 构建并打标签（`docker build` 现在是 `docker buildx build` 的别名） |
| `docker build -f Dockerfile.prod --target builder .` | 指定 Dockerfile / 停在某个阶段 |
| `docker build --no-cache --progress=plain .` | 不用缓存；输出完整构建日志便于排查 |
| `docker build --platform linux/amd64 .` | 指定目标平台 |
| `docker images` | 本地镜像列表 |
| `docker pull nginx:1.27-alpine` | 拉取；**用具体 tag，不要用 `latest`** |
| `docker rmi <image>` | 删除镜像（同时按多个 tag 时只删这个 tag） |
| `docker image prune -a` | 清理没有被任何容器使用的镜像 |

### 容器

| 命令 | 说明 |
| --- | --- |
| `docker run -d --name app -p 8000:8000 app:1.0` | 后台运行并发布端口 |
| `docker run -it --rm alpine sh` | 前台进容器、退出即删 |
| `docker run -e KEY=value --env-file .env app` | 传环境变量 |
| `docker run -v data:/var/lib/db app` | 挂命名卷（`-v` 并未废弃，只是 `--mount` 更显式） |
| `docker run --restart unless-stopped app` | 自动重启策略 |
| `docker ps` / `docker ps -a` | 运行中 / 全部容器（`ps` 是文档化别名，没被废弃） |
| `docker stop app` / `docker start app` / `docker rm app` | 停止 / 启动 / 删除 |
| `docker exec -it app sh` | 进容器开一个 shell |
| `docker cp app:/path/file .` | 与容器互拷文件 |
| `docker stats` | 实时资源占用 |

`-p` 的写法：`-p 8080:80`（宿主:容器），`-p 127.0.0.1:8080:80`（只绑本机），`-p 8080:80/udp`。**不写 IP 时默认绑 `0.0.0.0`**——数据库、管理后台这类不该暴露的服务，务必写成 `127.0.0.1:5432:5432` 或者干脆不发布端口。

⚠️ `--restart` 与 `--rm` **不能同时用**，会直接报错。`--rm` 在删除容器时还会删掉它的匿名卷（命名卷不动）。

### 日志与排障

| 命令 | 说明 |
| --- | --- |
| `docker logs -f --tail 100 app` | 跟踪最后 100 行 |
| `docker logs --since 30m app` | 按时间筛（也收 RFC3339 时间戳） |
| `docker inspect app` | 完整配置，配合 `-f` 取字段 |
| `docker inspect -f '{{.State.Health.Status}}' app` | 看健康检查状态 |
| `docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' app` | 看容器 IP |
| `docker top app` | 容器里跑了哪些进程 |
| `docker diff app` | 容器可写层相对镜像改了什么 |
| `docker events` | 实时事件流 |

排障时可以按这个顺序走：`docker ps -a` 看状态是否是 `Exited` → `docker logs` 看它为什么退出 → `docker inspect` 看退出码与挂载 → `docker exec -it` 进去看现场。

### 卷

| 命令 | 说明 |
| --- | --- |
| `docker volume create pgdata` | 创建命名卷 |
| `docker volume ls` / `docker volume inspect pgdata` | 查看 |
| `docker volume rm pgdata` | 删除（**被容器占用的卷删不掉**） |
| `docker volume prune` | 清理未使用的卷；**默认只清匿名卷**，`-a` 才包含命名卷 |

**命名卷与绑定挂载的选择**：数据由 Docker 管理、需要备份迁移、要跨平台，用命名卷；**需要从宿主机直接访问这些文件**，用绑定挂载（`-v /host/path:/container/path`）。配置文件、证书这类"我要在旁边编辑再看效果"的东西适合绑定挂载，数据库数据适合命名卷。

卷的备份与恢复用的是"再起一个容器挂上去打包"的老办法：

```bash
# 备份
docker run --rm --volumes-from dbstore -v "$(pwd)":/backup ubuntu \
  tar cvf /backup/backup.tar /dbdata

# 恢复
docker run --rm --volumes-from dbstore2 -v "$(pwd)":/backup ubuntu \
  bash -c "cd /dbdata && tar xvf /backup/backup.tar --strip 1"
```

### 网络

| 命令 | 说明 |
| --- | --- |
| `docker network create appnet` | 创建自定义 bridge 网络 |
| `docker network ls` / `docker network inspect appnet` | 查看 |
| `docker network connect appnet app` | 把运行中的容器接进网络 |
| `docker network disconnect appnet app` | 断开 |
| `docker network prune` | 清理未使用的网络（永不删 `bridge`/`host`/`none`） |

**自定义网络与默认 bridge 的关键差别是 DNS**：在自定义网络上，容器**可以直接用服务名互相访问**；在默认 `bridge` 上只能靠 IP。默认那个 `docker0` 网桥官方明确说是遗留细节，不建议生产使用。Compose 会自动为每个项目建一个自定义网络，所以你在 `compose.yaml` 里写 `db` 就能连上数据库——这一条是 Compose 最好用的部分。

⚠️ 删除网络前必须先断开里面的容器。`docker network rm -f` 里的 `-f` 意思是"网络不存在也别报错"，**不是**强制删除。

### 系统清理

| 命令 | 清理了什么 |
| --- | --- |
| `docker system df` | 先看占用再决定清什么 |
| `docker system prune` | 停止的容器 + 未使用的网络 + **悬空**镜像 + 构建缓存 |
| `docker system prune -a` | 额外加上没有任何容器关联的镜像（**仍然不含卷**） |
| `docker system prune --volumes` | 额外清理**匿名卷** |
| `docker builder prune` | 只清构建缓存 |

⚠️ **`docker system prune -a` 不会删数据卷**，这是流传最广的误解之一。要清卷必须显式加 `--volumes`，而且它只清匿名卷——命名卷默认不动，正是为了防止误删重要数据。

## 单机 Compose 上线部署

前面都是零件，这一节把它们装成一台能上线的机器。场景：一个 Python 后端 + PostgreSQL + Nginx 反代，跑在一台普通云主机上。

选择单机 Compose 而不是 Kubernetes，理由很实际：**服务数量少于十个、没有多节点需求时，K8s 带来的运维复杂度远大于收益**。Compose 能覆盖健康检查、依赖顺序、重启策略、日志轮转、资源限制这些真正要紧的事。

### 拓扑

<div class="diagram-scroll">
<svg width="640" height="246" viewBox="0 0 640 246" role="img" aria-label="部署拓扑：只有 nginx 对外发布端口，app 与 postgres 在自定义网络中通过服务名互访，数据落在命名卷上">
  <g stroke="var(--line-strong)" fill="var(--surface)">
    <rect x="16" y="80" width="88" height="64" rx="9"/>
    <rect x="156" y="80" width="104" height="64" rx="9"/>
    <rect x="300" y="80" width="104" height="64" rx="9"/>
    <rect x="444" y="80" width="104" height="64" rx="9"/>
    <rect x="444" y="180" width="104" height="40" rx="9"/>
  </g>
  <g font-size="12" font-weight="600" fill="var(--ink)" text-anchor="middle">
    <text x="60" y="106">浏览器</text>
    <text x="208" y="106">nginx</text>
    <text x="352" y="106">app</text>
    <text x="496" y="106">postgres</text>
    <text x="496" y="205">命名卷</text>
  </g>
  <g font-size="9.5" fill="var(--ink-muted)" text-anchor="middle">
    <text x="60" y="124">公网</text>
    <text x="208" y="124">反代 + 静态</text>
    <text x="352" y="124">uvicorn</text>
    <text x="496" y="124">数据库</text>
  </g>
  <g stroke="var(--line-strong)" fill="none" stroke-dasharray="5 4">
    <rect x="142" y="54" width="420" height="112" rx="10"/>
  </g>
  <g font-size="10.5" fill="var(--ink-faint)" text-anchor="middle">
    <text x="352" y="46">自定义 bridge 网络：容器之间用服务名互访</text>
  </g>
  <g stroke="var(--ink-faint)" stroke-width="1" fill="none">
    <line x1="104" y1="112" x2="150" y2="112"/>
    <path d="M 150 112 l -6 -4 l 0 8 z" fill="var(--ink-faint)" stroke="none"/>
    <line x1="260" y1="112" x2="294" y2="112"/>
    <path d="M 294 112 l -6 -4 l 0 8 z" fill="var(--ink-faint)" stroke="none"/>
    <line x1="404" y1="112" x2="438" y2="112"/>
    <path d="M 438 112 l -6 -4 l 0 8 z" fill="var(--ink-faint)" stroke="none"/>
    <line x1="496" y1="144" x2="496" y2="180"/>
    <path d="M 496 180 l -4 -6 l 8 0 z" fill="var(--ink-faint)" stroke="none"/>
  </g>
  <g font-size="9.5" fill="var(--ink-faint)" text-anchor="middle">
    <text x="127" y="104">80/443</text>
  </g>
  <g font-size="10.5" fill="var(--ink-faint)" text-anchor="middle">
    <text x="320" y="240">只有 nginx 发布端口，app 与 postgres 只在网络内部可达</text>
  </g>
</svg>
</div>

三个设计决定值得说明：**只有 nginx 发布端口**（数据库绝不暴露到公网）、**数据落在命名卷上**（容器重建数据还在）、**app 与 db 通过服务名互访**（不需要知道对方 IP）。

### Dockerfile

```dockerfile
FROM ghcr.io/astral-sh/uv:0.12.18 AS uv

FROM python:3.12-slim

COPY --from=uv /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_DEV=1 \
    UV_PYTHON_DOWNLOADS=0

WORKDIR /app

# 只装依赖的中间层：代码天天改，依赖很少变，分开缓存
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project

COPY . /app

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked

# 不用 root 跑
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### compose.yaml

```yaml
name: blog-api

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?必须在 .env 里设置}
      POSTGRES_DB: app
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d app"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 30s
    mem_limit: 1g
    cpus: 1.0
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

  app:
    build: .
    image: registry.example.com/blog-api:${TAG:?必须指定 TAG}
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/app
    healthcheck:
      test: ["CMD", "python", "-c",
             "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz')"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 20s
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

  nginx:
    image: nginx:1.27-alpine
    restart: unless-stopped
    depends_on:
      app:
        condition: service_healthy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./nginx/certs:/etc/nginx/certs:ro
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

volumes:
  pgdata:
```

逐个说清关键决定：

- **`name:`** 给项目起个固定名字，容器名前缀、网络名都由它决定。**顶层的 `version:` 字段已经废弃**，写了会收到警告，删掉。
- **`${VAR:?错误信息}`** 在变量缺失时直接让 compose 报错退出，而不是把空字符串塞进配置。数据库密码这种东西，宁可启动失败也不要静默用空密码跑起来。变量从同目录的 `.env` 文件读。
- **`healthcheck` + `depends_on: condition: service_healthy`** 保证启动顺序：app 会等到 db 真的能接受连接才启动。⚠️ **短语法的 `depends_on` 只保证"已经启动"，不等它健康**——只写服务名列表的话，app 会在 postgres 还没就绪时就去连，然后挂掉。
- **三种 `condition` 都在用**：`service_started`、`service_healthy`、`service_completed_successfully`（最后这个适合跑数据库迁移的一次性容器）。
- **`restart: unless-stopped`** 是长期服务该用的档位。它和 `always` 的差别只在"你手动停掉之后"：`always` 会在 daemon 重启后把它拉起来，`unless-stopped` 则保持停止——**手动停掉就该一直停着**，这个语义更符合预期。
- **日志轮转必须配。** 默认驱动 `json-file` 的 `max-size` 是 `-1`（不限），意味着容器的日志会一直写下去直到撑爆磁盘。⚠️ **`max-file` 只在同时设了 `max-size` 时才生效**，两个都要写。
- **资源限制写在服务级（`mem_limit`、`cpus`）**。⚠️ 网上常见写法是 `deploy.resources.limits`，那是 Swarm 的语义——**在普通 `docker compose up` 下它没有官方文档背书**（compose 规范只说"平台需自行实现，不实现就忽略"）。单机上要用服务级属性。

### 上线步骤

```bash
# 1. 准备配置（.env 不进版本控制）
cat > .env <<'EOF'
POSTGRES_PASSWORD=<一个足够长的随机串>
TAG=v1.0.0
EOF

# 2. 构建并启动
docker compose up -d --build

# 3. 确认状态：三个服务都该是 running，db 与 app 的 STATUS 里能看到 (healthy)
docker compose ps

# 4. 看日志确认没有报错
docker compose logs -f app
```

等 `docker compose ps` 里 app 显示 `(healthy)` 再对外宣布上线——那说明健康检查真的通过了，而不只是进程还在。

### 更新与回滚

镜像用**明确的版本 tag**，绝不用 `latest`：回滚的前提是旧的镜像还在。CI 里构建时打两个 tag——`v1.2.3` 和一个可选的 `latest`——服务器上只按版本号拉。

```bash
# 更新单个服务，不影响 db
TAG=v1.2.4 docker compose pull app
TAG=v1.2.4 docker compose up -d --no-deps app

# 看新容器起没起来
docker compose ps app
docker compose logs --tail 50 app
```

`--no-deps` 的意思是"别顺手把它依赖的服务也重建了"——否则更新一次应用会把数据库容器也重启一遍。这是官方文档里针对生产的做法。

⚠️ **这严格来说不是滚动更新，也不承诺零停机。** `up -d --no-deps <svc>` 会把那个服务**停掉、销毁、按新镜像重建**，中间有一段不可用窗口。Compose 的官方文档里没有"滚动更新"这个概念——真正带 `update_config`、逐批替换的是 Swarm（`docker service update`）和 Kubernetes。单机 Compose 要想减少停机，只能靠 Nginx 反代后面的多个 app 实例（而这就该考虑换成真正的编排系统了）。

**回滚就是回到上一个 tag**：

```bash
TAG=v1.2.3 docker compose up -d --no-deps app
```

因为 `image:` 里引用了 `${TAG}`，回滚不需要改任何文件，只要换一个变量值。⚠️ 注意普通 Compose **没有**官方的 `rollback` 子命令（`docker service rollback` 是 Swarm 的），回滚就是"用旧 tag 再部署一次"。

数据库迁移这类不可逆的操作要单独考虑：**镜像能回滚，数据不能**。所以迁移脚本要么写成向后兼容的（新增字段先别删旧的），要么在部署前先备份卷。

### 日常运维

```bash
docker compose logs -f --tail 100        # 全部服务日志
docker compose restart app               # 重启单个服务
docker compose down                      # 停止并删除容器（卷保留）
docker compose down -v                   # 危险：连命名卷一起删
docker compose exec app sh               # 进容器
docker compose exec db psql -U postgres  # 进数据库
docker compose top                       # 各服务的进程
```

⚠️ `docker compose down` 不会删命名卷，但 **`down -v` 会删掉 compose 文件里声明的命名卷**——数据库文件就在那里。这个参数是给"这套环境我不要了"准备的。

## 安全与运维要点

- **用非 root 用户运行。** Dockerfile 里加 `USER`，并且**别把宿主机的 docker socket 挂进容器**——那等于给了容器 root 权限。
- **密钥不要进镜像。** `ARG` 会出现在 `docker history` 里，`ENV` 会留在镜像配置里，两者都不适合传密钥。官方推荐的是 BuildKit 的 `RUN --mount=type=secret`。运行期的密钥通过 `environment` / `env_file` 注入，配合 `.env` 不进版本控制。
- **缩小攻击面**：基础镜像用 `-slim` / `-alpine`，只装需要的东西；`--read-only` 配合 `--tmpfs` 可以让根文件系统只读；`--security-opt no-new-privileges=true` 阻止提权。
- **不要把 docker socket 暴露给不受信任的容器**，也**不要开 2375 端口**（未加密的 daemon API，等于把机器交出去）。
- **给数据卷做定时备份。** 卷不是备份——它只是"容器删了数据还在"。误删、宿主机故障、写坏数据，卷都救不了你。

## 踩坑清单

- **容器里的数据不是持久的。** 写在容器可写层的任何东西，容器一重建就消失。数据库、上传文件、日志一律挂卷。
- **`docker system prune -a` 不删卷。** 要显式 `--volumes`，且它只清匿名卷。
- **`docker network rm -f` 不能强删带容器的网络。** `-f` 只是"不存在也不报错"，得先 `disconnect`。
- **`deploy.resources.limits` 在普通 `compose up` 下不保证生效。** 单机用服务级的 `mem_limit` / `cpus`。
- **短语法 `depends_on` 不等健康。** 要等数据库真的能连，必须用长语法加 `condition: service_healthy`。
- **`json-file` 日志默认不轮转**，`max-size` 默认是"不限"。生产必配，且 `max-file` 要跟 `max-size` 一起写。
- **shell 形式的 `ENTRYPOINT` 收不到信号**，容器 `stop` 会一直等到超时才被强杀。用 exec 形式。
- **`EXPOSE` 不发布端口**，只是声明。真正发布靠 `-p`。
- **`-p` 不写 IP 时绑 `0.0.0.0`**，数据库和管理后台会直接暴露到公网。写 `127.0.0.1:5432:5432`。
- **`--restart` 与 `--rm` 不能同时用。**
- **`docker build` 发出去的是整个上下文。** 忘了 `.dockerignore`，`node_modules`、`.git`、构建产物都会被送进去，慢，而且可能把密钥打进镜像。
- **镜像 tag 别用 `latest`。** 回滚时你会找不到"上一版"是哪个。
- **容器名冲突**：同一个名字的旧容器还在（哪怕是停止状态）就会启动失败，先 `docker rm` 或改用 compose 管理生命周期。
