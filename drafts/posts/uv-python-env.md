---
title: uv：Python 的环境、版本与依赖管理
date: 2026-09-23
tags: [Python, uv, 包管理, 环境管理]
---

Python 的环境管理长期是五件事：装解释器用 pyenv，建虚拟环境用 virtualenv，装包用 pip，锁版本用 pip-tools，跑全局命令行工具用 pipx。uv 把五件都做了，而且它们共用同一套缓存、同一份锁文件、同一个"项目"的概念。

uv 是 Rust 写的，快是它最常被提到的优点，但**快不是它值得换掉旧流程的理由**。真正的差别在于它逼你建立一个明确的项目模型：解释器、项目、虚拟环境各归各的层，谁声明、谁锁定、谁是可抛弃的产物，分得很清楚。这篇文章按这个模型来讲。

<!-- more -->

## 三条命令先跑起来

```bash
uv init my-app
cd my-app
uv add httpx
uv run python main.py
```

对照 pip 时代的做法：

```bash
mkdir my-app && cd my-app
python3 -m venv .venv
source .venv/bin/activate
pip install httpx
python main.py
```

省掉的不只是几行命令。注意 uv 那三行里**没有 activate**——`uv run` 会自己找到项目、自己确认环境是最新的、然后用正确的解释器执行你的命令。这件事的价值在于它让"忘记 activate 导致装到系统 Python 里"这一类事故从根上消失了。

### uv init 生成了什么

```
my-app/
├── .python-version      # 这个项目钉在哪个解释器上
├── README.md
├── pyproject.toml       # 依赖声明
├── src/
│   └── my_app/
│       └── __init__.py
└── .venv/               # 第一次 uv run 时出现，不在 init 的输出里
```

⚠️ **`uv init` 的默认行为在 v0.12 变过。** 现在它默认按"可打包项目"处理，会在 `pyproject.toml` 里写上 `[build-system]`（默认后端是 `uv_build`），并把源码放进 `src/<包名>/` 布局。v0.12 之前不这样。

| 你想要 | 命令 | 结果 |
| --- | --- | --- |
| 可打包的应用（默认） | `uv init` | 带 `[build-system]`，`src/` 布局 |
| 库 | `uv init --lib` | 额外带 `py.typed`，不含脚本入口 |
| 扁平脚本项目 | `uv init --no-package` | `main.py` 放根目录，无 `[build-system]` |
| 只要一个清单 | `uv init --bare` | 只建 `pyproject.toml` |
| 单文件脚本 | `uv init --script foo.py` | 带 PEP 723 内联元数据 |

## 三层模型

后面每一节都挂在这张图的某一层上，先把层次理清：

<div class="diagram-scroll">
<svg width="640" height="176" viewBox="0 0 640 176" role="img" aria-label="uv 的三层模型：受管解释器、项目（pyproject.toml 与 uv.lock）、虚拟环境 .venv，以及层之间的衔接命令">
  <g font-size="11" fill="var(--ink-faint)" text-anchor="middle">
    <text x="92" y="18">由 uv 安装与维护</text>
    <text x="320" y="18">声明意图，锁定结果</text>
    <text x="548" y="18">由锁文件物化出来</text>
  </g>
  <g stroke="var(--line-strong)" fill="var(--surface)">
    <rect x="16" y="30" width="152" height="76" rx="10"/>
    <rect x="244" y="30" width="152" height="76" rx="10"/>
    <rect x="472" y="30" width="152" height="76" rx="10"/>
  </g>
  <g font-size="13" font-weight="600" fill="var(--ink)" text-anchor="middle">
    <text x="92" y="54">解释器</text>
    <text x="320" y="54">项目</text>
    <text x="548" y="54">环境</text>
  </g>
  <g font-size="9.5" fill="var(--ink-muted)" text-anchor="middle">
    <text x="92" y="74">uv python install</text>
    <text x="92" y="90">~/.local/share/uv/python</text>
    <text x="320" y="74">pyproject.toml</text>
    <text x="320" y="90">uv.lock</text>
    <text x="548" y="74">.venv</text>
    <text x="548" y="90">删掉可重建</text>
  </g>
  <g font-size="10" fill="var(--ink-faint)" text-anchor="middle">
    <text x="206" y="58">.python-version</text>
    <text x="434" y="58">uv sync</text>
  </g>
  <g stroke="var(--ink-faint)" stroke-width="1" fill="none">
    <line x1="174" y1="68" x2="236" y2="68"/>
    <path d="M 236 68 l -6 -4 l 0 8 z" fill="var(--ink-faint)" stroke="none"/>
    <line x1="402" y1="68" x2="464" y2="68"/>
    <path d="M 464 68 l -6 -4 l 0 8 z" fill="var(--ink-faint)" stroke="none"/>
  </g>
  <g font-size="10.5" fill="var(--ink-muted)" text-anchor="middle">
    <text x="92" y="134">从这里挑一个用</text>
    <text x="320" y="134">uv add 改的是这里</text>
    <text x="548" y="134">uv run 从这里执行</text>
  </g>
  <g font-size="10.5" fill="var(--ink-faint)" text-anchor="middle">
    <text x="320" y="158">三层里只有 .venv 可以随手删掉</text>
  </g>
</svg>
</div>

三层的分工是这篇文章的骨架：

- **解释器层**是机器级的，一个版本装一次，所有项目共用。它跟你的项目没有绑定关系。
- **项目层**是仓库级的，跟着代码走、进版本控制。`pyproject.toml` 写你想要什么，`uv.lock` 记实际解析出了什么。
- **环境层**是本地级的，**可以随时删**。它不是手工艺品，是从锁文件物化出来的产物——这是 uv 与 virtualenv 时代最大的观念差别。以前 `.venv` 是"我精心配好的那个环境"，现在它等价于构建产物。

## 版本管理

### 装解释器

```bash
uv python install 3.12          # 下载并安装，不需要 sudo
uv python list                  # 本机有哪些，哪些是 uv 装的
uv python dir                   # uv 的安装目录
uv python find 3.12             # 找一个可用的 3.12，打印路径
uv python uninstall 3.11
uv python upgrade               # 把已装的版本升到最新补丁
```

安装目录默认是数据目录下的 `python/`，在 macOS 上是 `~/.local/share/uv/python`：

```console
$ uv python dir
/Users/you/.local/share/uv/python
```

⚠️ 这里**不是** pyenv 那一套 shims。uv 装完不会去改你的 `PATH`，也不会在全局偷偷切换版本——它装的东西只有 uv 自己和它启动的进程会用。（要让 `python3.12` 直接可执行，用 `uv python update-shell`。）

### 钉住项目用哪个版本

```bash
uv python pin 3.12
```

这会在当前目录写一个 `.python-version`，内容就是 `3.12`。它有两个作用：把项目钉死在这个版本上；这个文件**应当提交进版本控制**，这样同事和 CI 拉下来用的是同一个。

```bash
uv python pin --global 3.12
```

`--global` 写的是用户配置目录下的全局 `.python-version`，作为所有没有自己 pin 的项目的兜底。查找顺序是：从当前工作目录**逐级向上**找 `.python-version`，都没找到才用全局的。

### requires-python 不是"我要用哪个版本"

这是最容易搞混的一处。`pyproject.toml` 里的

```toml
[project]
requires-python = ">=3.10"
```

是一句**兼容性声明**——"这个项目在 3.10 及以上都能跑"，而不是"请用 3.10"。它决定了解析依赖时允许选哪些包版本（比如依赖里有个包只支持 3.11+，那 `>=3.10` 就会把 3.10 排除掉）。

真正决定"跑起来用哪个解释器"的是显式请求：

| 优先级 | 来源 | 说明 |
| --- | --- | --- |
| 1（最高） | `--python` / `-p`、`UV_PYTHON` 环境变量 | 一次性覆盖，不改文件 |
| 2 | `.python-version` 文件 | 项目级钉住，应提交 |
| 3（最低） | `requires-python` | 在其中挑**第一个兼容的**版本 |

第三档是问题所在：它是"挑第一个兼容的"，意味着装了新版本 Python 之后，同一个项目的行为可能就变了。文档的原话是"会使用第一个满足要求的版本，**除非另有显式请求**"。要在各处行为一致，就 pin 一个。

```bash
uv run --python 3.11 python -V      # 临时用 3.11 跑
UV_PYTHON=3.10 uv run python -V     # 同上，环境变量形式
```

### 需要多个版本的项目

如果测试矩阵要同时跑 3.10 / 3.11 / 3.12，写一个 `.python-versions`（复数）：

```
3.10
3.11
3.12
```

`uv python install` 会把这里列出的**全部**装上。它和单数的 `.python-version` 是并存的两件事：单数决定"默认用哪个"，复数决定"要把哪些装上"。

### 相关的环境变量

| 变量 | 作用 |
| --- | --- |
| `UV_PYTHON` | 等价于 `--python`，指定用哪个解释器 |
| `UV_PYTHON_INSTALL_DIR` | 改受管解释器的安装位置 |
| `UV_PYTHON_DOWNLOADS=never` | 禁止自动下载 Python，只能用系统里已有的 |
| `UV_MANAGED_PYTHON` | 强制只用 uv 管理的版本（在 CI 里保证确定性很有用） |

CI 的常见做法就是 `UV_PYTHON_DOWNLOADS=never` 配一个预先装好的解释器，避免每次构建都去下载。

## 开发环境管理

### uv run 才是入口

很多人从 pip 迁过来时，第一反应是把 `pip install` 换成 `uv pip install`，然后继续手动 `source .venv/bin/activate`。这是把 uv 当成了"更快的 pip"，丢掉了它最有价值的部分。

`uv run` 的执行链是：

<div class="diagram-scroll">
<svg width="620" height="150" viewBox="0 0 620 150" role="img" aria-label="uv run 的执行链：读清单、检查锁文件、同步虚拟环境、执行命令，以及三种档位分别在哪一步停下">
  <g font-size="11" fill="var(--ink-faint)" text-anchor="middle">
    <text x="79" y="20">第 1 步</text>
    <text x="233" y="20">第 2 步</text>
    <text x="387" y="20">第 3 步</text>
    <text x="541" y="20">第 4 步</text>
  </g>
  <g stroke="var(--line-strong)" fill="var(--surface)">
    <rect x="20" y="34" width="118" height="68" rx="9"/>
    <rect x="174" y="34" width="118" height="68" rx="9"/>
    <rect x="328" y="34" width="118" height="68" rx="9"/>
    <rect x="482" y="34" width="118" height="68" rx="9"/>
  </g>
  <g font-size="12.5" font-weight="600" fill="var(--ink)" text-anchor="middle">
    <text x="79" y="58">读清单</text>
    <text x="233" y="58">检查锁文件</text>
    <text x="387" y="58">同步环境</text>
    <text x="541" y="58">执行命令</text>
  </g>
  <g font-size="10" fill="var(--ink-muted)" text-anchor="middle">
    <text x="79" y="78">pyproject.toml</text>
    <text x="79" y="93">与 uv.lock</text>
    <text x="233" y="78">过时了就要</text>
    <text x="233" y="93">重新解析</text>
    <text x="387" y="78">物化到</text>
    <text x="387" y="93">本地 .venv</text>
    <text x="541" y="78">在你敲的命令上</text>
    <text x="541" y="93">用这个环境</text>
  </g>
  <g stroke="var(--ink-faint)" stroke-width="1" fill="none">
    <line x1="144" y1="68" x2="168" y2="68"/>
    <path d="M 168 68 l -6 -4 l 0 8 z" fill="var(--ink-faint)" stroke="none"/>
    <line x1="298" y1="68" x2="322" y2="68"/>
    <path d="M 322 68 l -6 -4 l 0 8 z" fill="var(--ink-faint)" stroke="none"/>
    <line x1="452" y1="68" x2="476" y2="68"/>
    <path d="M 476 68 l -6 -4 l 0 8 z" fill="var(--ink-faint)" stroke="none"/>
  </g>
  <g font-size="10.5" fill="var(--ink-faint)" text-anchor="middle">
    <text x="310" y="130">默认四步全走完；三种档位让它在中途停下</text>
  </g>
</svg>
</div>

关键在于**第 2、3 步是自动的**。你改了 `pyproject.toml` 之后直接 `uv run`，它会先把环境同步好再执行——不需要记得先跑 `uv sync`。这份自动同步是 `uv run` 存在的理由，也是它比"activate 之后跑 python"更不容易出错的根本原因。

### 三种让链条停下的档位

这三个参数最容易被混着用，其实语义差别很明确：

| 参数 | 停在哪一步 | 锁文件缺失时 | 锁文件过时（与 `pyproject.toml` 不符）时 | 典型场景 |
| --- | --- | --- | --- | --- |
| （默认） | 不停 | 自动生成 | 自动更新锁文件并同步 | 日常开发 |
| `--locked` | 跳过第 3 步的写入，但**校验** | **报错** | **报错**，不修改任何文件 | CI：断言锁文件是最新的 |
| `--frozen` | 跳过第 2 步的核对 | **报错** | 不报错——按锁文件原样同步，`pyproject.toml` 的改动被无视 | 构建镜像：锁文件是唯一事实来源 |
| `--no-sync` | 直接跳到第 4 步 | 报错 | 不检查 | 确定环境已经对了，只想省时间 |

⚠️ **`--no-sync` 隐含了 `--frozen`**，不是"什么都不校验的裸跑"。这两个不要互相替代：CI 里要的是 `--locked`（它会告诉你锁文件过期了），`--frozen` 只会安静地用旧锁文件——在 CI 里这等于把问题藏起来。

另外还有一个只检查不改动的：

```bash
uv sync --check        # 环境与项目是否同步，不同步则以非零码退出
uv lock --check        # 锁文件是否最新（等价于 --locked）
uv lock --check-exists # 只断言 uv.lock 存在（等价于 --frozen）
```

### 临时依赖：--with

想试一个库，又不想污染项目的依赖清单：

```bash
uv run --with rich python -c "from rich import print; print('[bold]hi[/bold]')"
uv run --with 'pandas[excel]' python analyze.py
```

`--with` 装出来的东西在**项目环境之上叠一层临时环境**，**允许与项目依赖冲突**——这正是它适合"试一下"的原因：为了跑通一次临时命令，它可以在那一层里用另一个版本的某个包，而不动项目本身。

### 单文件脚本

不想为一个小工具建整个项目，用 PEP 723 的内联元数据：

```python
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx", "rich"]
# ///
import httpx
from rich import print

print(httpx.get("https://example.com").status_code)
```

```bash
uv run fetch.py     # 依赖自动装好、跑完即走，不留 .venv
uv add --script fetch.py rich    # 往脚本里加依赖（会改写那段注释）
```

对"一次性数据脚本"来说这是最省事的形态：脚本自己带着依赖声明，发给同事能直接跑。

### 全局命令行工具交给 uv tool

```bash
uv tool install ruff           # 装成全局可执行
uv tool list
uv tool upgrade ruff
uv tool uninstall ruff

uvx ruff check .               # 不安装，直接跑一次（等价 uv tool run）
uvx --from httpie http GET https://example.com
```

对应 pipx。「装一次常用」用 `uv tool install`，「偶尔用一次」用 `uvx`。两者的环境都与你的项目隔离，不会和项目依赖打架。

### 什么时候还需要手敲 uv venv

大部分情况不需要。剩下的场景是：要指定一个非 `.venv` 的路径、要在已有目录上建环境、要 `--system` 装到系统环境。

```bash
uv venv                          # 在当前目录建 .venv
uv venv --python 3.11 .venv311   # 指定版本与路径
```

`uv sync` 内部就是干这件事，所以日常用不到它。

### 让编辑器用对解释器

在项目里把解释器指到 `.venv/bin/python` 即可（VS Code 会自动发现 `.venv`）。因为是 `uv sync` 在管这个目录，**不要手工往 `.venv` 里 `pip install`**——下次 sync 会把它按锁文件抹平，你装的东西会消失，而且消失得很安静。

## 依赖与锁文件

### 增删依赖

```bash
uv add httpx                    # 加运行依赖
uv add --dev pytest ruff        # 加开发依赖
uv add --optional network httpx # 加可选依赖（extras）
uv add 'pandas[excel]'          # 连同它的 extra 一起要
uv remove httpx
uv tree                         # 看看依赖树
```

⚠️ `uv add httpx` 是**声明式**的：它同时更新 `pyproject.toml`、`uv.lock` 和当前的 `.venv`。而 `uv pip install httpx` 是**命令式**的，只动当前环境，不改任何文件。新项目统一用前者，后者只在对接遗留流程时用。

### 开发依赖写在哪

写在 `pyproject.toml` 的 `[dependency-groups]` 里（PEP 735）：

```toml
[dependency-groups]
dev = ["pytest", "ruff"]
lint = ["ruff"]

[tool.uv]
default-groups = ["dev"]
```

⚠️ **有一个容易踩的陷阱**：uv 早期把开发依赖放在 `[tool.uv] dev-dependencies`。这个字段**目前仍然有效**（它的内容会和 `dependency-groups.dev` 合并），但文档已经明确说它最终会被移除。麻烦之处在于——**如果你的 `pyproject.toml` 里已经有 `dev-dependencies`，`uv add --dev` 会继续往那个旧字段里写，而不是新建 `dependency-groups.dev`**。迁移时把旧字段手动搬过去，不然后面看清单会找不到东西去哪了。

组可以选择性地装：

```bash
uv sync --no-dev              # 不装 dev 组（部署时用）
uv sync --only-group lint     # 只装 lint 组
uv sync --all-groups          # 全装
uv sync --no-default-groups   # 一个默认组都不装
```

`--dev` / `--only-dev` / `--no-dev` 分别是 `--group dev` / `--only-group dev` / `--no-group dev` 的简写。

### uv.lock 的性质

```bash
uv lock                # 只更新锁文件，不动环境
uv lock --upgrade      # 在允许范围内升到最新
uv lock --upgrade-package httpx
```

几点要记住：

- **`uv.lock` 是跨平台的。** uv 做的是 universal resolution——同一份锁文件在 macOS、Linux、Windows 上都成立，各平台需要的差异（比如某个包的平台专属依赖）都在同一份文件里表达。这一点和 `uv pip compile` 不同，后者默认输出**平台特定**的结果（行为对标 pip-tools），要跨平台得加 `--universal`。
- **它要进版本控制。** 锁文件的意义就是让所有人装到同一套版本。
- **不要手改。** 它在下次 `uv lock` 时会被重写。

### 导出成别的格式

```bash
uv export --format requirements.txt -o requirements.txt
uv export --format pylock.toml -o pylock.toml
uv export --format cyclonedx1.5     # CycloneDX v1.5 JSON，用于 SBOM
```

`--format` 支持 `requirements.txt`（默认）、`pylock.toml`（PEP 751，标准化后的锁文件格式）与 `cyclonedx1.5`。不写 `--format` 时按输出文件的扩展名推断。需要把依赖交给一个还只认 requirements.txt 的环境（或者出一个软件物料清单做合规）时用得上。

## workspace：一个仓库多个包

代码多起来之后常见两种组织方式：建多个独立项目，各自一套 `pyproject.toml` 和锁文件；或者用一个 workspace 把它们串起来。后者的收益是**依赖版本统一**——所有成员共用一份锁文件，不会出现 A 包用 httpx 0.27、B 包用 0.28 的情况。

<div class="diagram-scroll">
<svg width="600" height="224" viewBox="0 0 600 224" role="img" aria-label="uv workspace 的布局：根 pyproject.toml 定义成员并持有唯一的 uv.lock，成员 hello 依赖成员 core">
  <g stroke="var(--line-strong)" fill="var(--surface)">
    <rect x="200" y="22" width="200" height="64" rx="10"/>
    <rect x="40" y="142" width="160" height="64" rx="10"/>
    <rect x="400" y="142" width="160" height="64" rx="10"/>
  </g>
  <g font-size="12.5" font-weight="600" fill="var(--ink)" text-anchor="middle">
    <text x="300" y="46">workspace 根</text>
    <text x="120" y="166">packages/core</text>
    <text x="480" y="166">packages/api</text>
  </g>
  <g font-size="10" fill="var(--ink-muted)" text-anchor="middle">
    <text x="300" y="66">pyproject.toml</text>
    <text x="300" y="80">uv.lock（只有一份）</text>
    <text x="120" y="186">自己的 pyproject.toml</text>
    <text x="480" y="186">自己的 pyproject.toml</text>
  </g>
  <g stroke="var(--ink-faint)" stroke-width="1" fill="none">
    <line x1="300" y1="86" x2="300" y2="114"/>
    <line x1="120" y1="114" x2="480" y2="114"/>
    <line x1="120" y1="114" x2="120" y2="142"/>
    <line x1="480" y1="114" x2="480" y2="142"/>
  </g>
  <g font-size="10" fill="var(--ink-faint)" text-anchor="middle">
    <text x="300" y="164">{ workspace = true }</text>
  </g>
  <g stroke="var(--ink-faint)" stroke-width="1" fill="none">
    <line x1="214" y1="182" x2="394" y2="182"/>
    <path d="M 206 182 l 8 -4 l 0 8 z" fill="var(--ink-faint)" stroke="none"/>
  </g>
  <g font-size="10.5" fill="var(--ink-muted)" text-anchor="middle">
    <text x="300" y="220">uv lock 与 uv sync 默认作用于整个 workspace</text>
  </g>
</svg>
</div>

根的 `pyproject.toml`：

```toml
[project]
name = "my-workspace"
requires-python = ">=3.11"

[tool.uv.workspace]
members = ["packages/*"]
exclude = ["packages/experiments"]
```

成员（`packages/api/pyproject.toml`）引用另一个成员：

```toml
[project]
name = "api"
dependencies = ["core"]

[tool.uv.sources]
core = { workspace = true }
```

几个要点：

- **`members` 是必填的**，`exclude` 可选，都是 glob。被 members 命中且没被 exclude 的目录必须有自己的 `pyproject.toml`，否则报错。根目录自身也算一个成员。
- **整个 workspace 只有一份锁文件**，在根目录。`uv lock` 一次作用于全部成员，成员之间不会有版本分裂——这正是用 workspace 的理由。
- **成员间依赖建议用可编辑（editable）方式**，改 `core` 的代码立刻在 `api` 里生效，不需要重装。
- **只操作某一个成员**：

```bash
uv sync --package api
uv run --package api python -m api
uv export --package api
```

不加 `--package` 时，命令作用于 workspace 根。

- ⚠️ **workspace 强制单一 `requires-python`**，取所有成员要求的**交集**。如果某个成员只能跑在 3.10 而另一个要 3.12，是配不到一起的——这种就得拆成独立项目。

判断标准很简单：**这些包要不要一起发版、能不能接受同一套依赖版本？** 能，就用 workspace；不能（比如一个是给别人的独立库、另一个是内部服务），就别硬凑。

## CI 与 Docker 里的 uv

### GitHub Actions

```yaml
- uses: astral-sh/setup-uv@v9.0.0
  with:
    version: "0.12.18"   # 钉死 uv 自身的版本
    enable-cache: true   # 缓存基于 uv.lock

- run: uv sync --locked --all-extras --dev
- run: uv run pytest
```

两点值得说：

- **`version` 要钉死。** uv 迭代很快，`uv init` 的默认行为这类东西在小版本之间都变过（见开头）。CI 里跟着 latest 走，某天会莫名其妙地构建出不一样的东西。
- **同步用 `--locked`**，锁文件一旦和 `pyproject.toml` 对不上就让 CI 红掉。这正是 `--locked` 存在的意义，别用 `--frozen` 糊过去。

### Docker 多阶段构建

官方推荐的做法是**把 uv 二进制从官方镜像里拷过来**，而不是在镜像里 `pip install uv`：

```dockerfile
FROM ghcr.io/astral-sh/uv:0.12.18 AS uv

FROM python:3.12-slim

COPY --from=uv /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_DEV=1 \
    UV_PYTHON_DOWNLOADS=0

WORKDIR /app

# 第一层：只装依赖，不装项目自己
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project

COPY . /app

# 第二层：这时才把项目代码装进去
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked

ENV PATH="/app/.venv/bin:$PATH"
CMD ["python", "-m", "my_app"]
```

逐条解释：

| 做法 | 为什么 |
| --- | --- |
| `COPY --from=... /uv /uvx /bin/` | 拷一个静态二进制，不引入安装步骤；官方镜像本身是 distroless 的 |
| `--mount=type=bind,source=uv.lock,...` | 只把清单挂进去，**不 COPY 整个项目**——否则改一行代码就让依赖层缓存失效 |
| `--no-install-project` | 这个中间层只装依赖。代码天天变、依赖很少变，把两者分开缓存，构建时间能差一个数量级 |
| `--mount=type=cache,target=/root/.cache/uv` | uv 的下载缓存跨构建复用（需要 BuildKit） |
| `UV_COMPILE_BYTECODE=1` | 构建期就编译好 `.pyc`，容器启动更快 |
| `UV_LINK_MODE=copy` | 缓存与目标在不同文件系统上时，避免 uv 打印 link 警告 |
| `UV_NO_DEV=1` | 等价于 `--no-dev`，镜像里不要装测试工具 |
| `UV_PYTHON_DOWNLOADS=0` | 用镜像自带的系统 Python，不要让 uv 在构建时去下载解释器 |

⚠️ **workspace 项目在中间层要用 `--frozen` 而不是 `--locked`**。原因很实际：那一层只挂了根的 `uv.lock` 和 `pyproject.toml`，各成员的 `pyproject.toml` 还没进来，uv 没法校验锁文件，`--locked` 会直接失败。官方文档的写法是：

```dockerfile
uv sync --frozen --no-install-workspace
```

`--no-install-workspace` 比 `--no-install-project` 更进一步，把项目**和所有 workspace 成员**都排除掉。等代码全部 COPY 进来之后，再跑正常的 `uv sync --locked`。

完整的容器化上线流程——镜像怎么构建、compose 怎么编排、更新与回滚怎么做——写在[另一篇](docker-basics.md)里。镜像分层的缓存机制本身，[这篇](docker-layer-cache.md)讲得更细。

## 和 pip / pip-tools / poetry 的对照

| 你以前做的事 | 从前 | 现在 |
| --- | --- | --- |
| 装解释器 | `pyenv install 3.12` | `uv python install 3.12` |
| 建虚拟环境 | `python -m venv .venv` | `uv venv`（通常不用手敲） |
| 激活环境 | `source .venv/bin/activate` | 不需要，用 `uv run` |
| 装依赖 | `pip install httpx` | `uv add httpx` |
| 锁版本 | `pip freeze > requirements.txt` | `uv lock`（自动维护 `uv.lock`） |
| 按锁文件装 | `pip install -r requirements.txt` | `uv sync` |
| 生成 requirements | `pip-compile` | `uv export` |
| 装命令行工具 | `pipx install ruff` | `uv tool install ruff` |
| 跑一次性工具 | `pipx run ruff` | `uvx ruff` |

已经有一套 `requirements.txt` 的项目，迁移路径是先建项目骨架再导入：

```bash
uv init
uv add -r requirements.txt
```

⚠️ 官方目前**只有** pip → uv 项目这一篇迁移指南；Poetry 与 Pipenv 的迁移指南还没有，`uv pip` 兼容接口与"已有 pyproject.toml 该怎么迁"也都标注为待写。所以从 Poetry 过来主要得手工搬——重点是 `[tool.poetry.dependencies]` 要拆成 `[project] dependencies` 与 `[dependency-groups]` 两处。

## 踩坑清单

- **`requires-python` 不等于"用哪个解释器"。** 它是兼容性约束，实际用哪个由 `.python-version` / `--python` 决定，两者都没有时才会去挑"第一个兼容的"——那是个会随环境变化的答案。要确定性就 `uv python pin`。
- **`--no-sync` 隐含 `--frozen`**，不是"什么都不检查"。CI 里要断言锁文件最新，用 `--locked`；`--frozen` 是"我知道锁文件旧了，但我就要按它来"。
- **`uv pip install` 不改任何文件。** 新项目里用它，`pyproject.toml` 和 `uv.lock` 都不会更新，下次 `uv sync` 会把装的东西抹掉。
- **别手工往 `.venv` 里 `pip install`。** 同上，它会被下次 sync 按锁文件抹平，而且不报错。
- **`uv add --dev` 会顺着旧字段走。** `pyproject.toml` 里若已有 `[tool.uv] dev-dependencies`，新加的开发依赖会继续写进那里，而不是新建 `[dependency-groups]`。先手工迁移旧字段。
- **`uv init` 的默认行为随版本变过。** v0.12 起默认按可打包项目处理（带 `[build-system]`）。本机若还是旧版本，生成的文件会与官方文档不符——`uv self update` 之后再照文档做。
- **`.venv` 不要进版本控制**，`.python-version` 和 `uv.lock` **要进**。前者是可重建的产物，后两者是复现环境的依据。
- **workspace 只认一份锁文件、一个 `requires-python`。** 成员之间要求冲突时配不到一起，这种情况该拆成独立项目而不是硬凑。
