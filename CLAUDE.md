# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 这个仓库是什么

`cjblog.github.io` 是 GitHub 的**用户站点仓库**，线上地址 `https://cjblog.github.io`，服务在**根路径**，因此 Astro 配置里**不需要 `base` 前缀**（这一点和项目站点仓库不同，别照搬项目站点的 `base: '/repo-name'` 写法）。

仓库正在**重建**：master 上原有的内容是 Gridea 静态博客工具生成的产物（39 个 HTML、`styles/main.css`、37 张图片、`atom.xml`），**没有任何源码或构建配置**。新的目标形态是用 Astro 实现的静态站点，包含「项目浏览」与「技术文章」两个模块。Gridea 的源码工程在本仓库之外，**本仓库从不保存它**，也不要去修改产物文件——它们是生成物。

需求正文见 [任务描述.md](任务描述.md)，那是需求的唯一真源；本文件是它的工程化落地规范。

### 当前状态：站点已实现

脚手架与站点已经落地，下面的命令都是真实可用的。动手前先知道两件事：

- **端到端测试要先装浏览器**：`npx playwright install chromium`（首次，或升级 Playwright 之后跑一次）。没装的话 `npm run test:e2e` 会直接报找不到浏览器。
- **要求 Node 22+**（Astro 7 与 `tsx` 都需要）。

旧内容不会被继承（已确认：全新的站点，不迁移旧文章）。旧站内容仍完整保留在 git 历史 `0109dbf` 中，需要时用 `git show 0109dbf:<路径>` 取回。

**工作区里挂着 80 个未提交的删除**：原有的 Gridea 产物文件已从磁盘删除，但尚未 `git add` / 提交，所以 `git status` 会显示 80 行 ` D`。**这是有意保留的状态，不是误删，也不是需要清理的残留。** 因为删除未提交，`origin/master` 上的旧站照常在线，`https://cjblog.github.io` 不会断。首次部署新站时再连同这些删除一起提交——**在那之前不要顺手提交、推送或 `git restore` 恢复它们**。

## 常用命令

```bash
npm install
npm run dev          # 本地开发预览，http://localhost:4321
npm run sync         # drafts/ → src/content/：校验 frontmatter 并同步内容
npm run build        # 构建，产出 dist/
npm run preview      # 本地预览构建产物（scripts/serve-dist.mjs，前台运行）
npm run test         # 全部单元测试（vitest run，单次执行后退出）
npm run test:watch   # 监视模式
npm run test:e2e     # Playwright 端到端测试
```

运行单个测试（调试时优先用这些，不要为了跑一个用例而跑全量）：

```bash
npx vitest run tests/unit/reading-time.test.ts   # 单个测试文件
npx vitest run -t "计算阅读时长"                  # 按用例名筛选
npx playwright test tests/e2e/projects.spec.ts   # 单个 e2e 文件
npx playwright test --ui                         # e2e 交互式调试
```

**把同一套 e2e 打到线上**（验证「本地预览 == 线上」最直接的办法）：

```bash
PLAYWRIGHT_BASE_URL=https://cjblog.github.io npx playwright test
```

设了这个环境变量后不再启动本地 webServer，直接对线上地址断言。部署后想确认线上没坏，跑这一条就够了。注意它只做只读的导航与断言，不会改动线上内容。

**写内容的正确流程**：在 `drafts/` 下写 markdown → `npm run sync` → `npm run dev` 预览。

## 目录结构

```
drafts/                     # 唯一的写作入口，手工编辑这里
  posts/*.md                # 技术文章
  projects/*.md             # 单文件项目
  projects/<书>/            # 多文件项目 = 一本书（见下）
    index.md                #   书的首页，同时是项目条目
    01-章.md                #   章
    01-章/01-节.md          #   节（最多两级）
  pages/*.md                # 独立页面（关于作者这类），产出到根路径 /<slug>/
scripts/sync-drafts.ts      # 瘦 CLI：只负责读盘写盘，逻辑在 src/lib/sync.ts
scripts/serve-dist.mjs      # 预览 dist/ 的前台静态服务器（npm run preview 用它）
src/
  lib/schema.ts             # zod schema：frontmatter 校验的唯一真源；含 OUTPUT_DIRS
  lib/sync.ts               # planSync() 纯函数：校验 + 规划产出（有单测）
  lib/markdown.ts           # 渲染流水线 + stripMarkdown
  lib/toc.ts                # 文章目录：建树、截断到 4 级、压平（有单测）
  lib/book.ts               # 书的章节解析：排序、两级限制、重名检查（有单测）
  lib/pagination.ts         # 分页：每页条数、页码序列、第 N 页的地址（有单测）
  lib/reading-time.ts       # 字数统计与阅读时长
  lib/excerpt.ts            # 摘要推导
  lib/pricing.ts            # 价格 → 标签/颜色映射
  lib/sort.ts               # 确定性排序
  lib/date.ts  lib/site.ts  # 日期归一化 / 站点常量（含导航项）
  content.config.ts         # 把 schema 接到 Astro 内容层（四个集合）
  content/posts|projects|pages/   # 由 sync 生成，不要手工编辑
  components/               # ProjectCard、BlogLayout、Toc、BookNav、Pagination 等
  layouts/BaseLayout.astro
  pages/
    index.astro             # 首页：两个模块的第 1 页
    [page].astro            # 独立页面
    posts/[slug].astro      # 文章全文
    posts/page/[page].astro # 文章第 2 页起
    projects/[slug]/index.astro    # 项目落地页（书在这里显示左侧目录）
    projects/[slug]/[...parts].astro  # 书的章与节
    projects/page/[page].astro     # 项目第 2 页起
  styles/global.css         # 设计令牌与全部样式
public/                     # 静态资源，原样拷贝到 dist/
tests/unit/  tests/e2e/
astro.config.mjs  vitest.config.ts  playwright.config.ts
.github/workflows/deploy.yml
```

三条硬约定：

1. **`src/content/` 是生成目录。** 直接改那里的文件会在下次 `npm run sync` 时被覆盖。要改内容就改 `drafts/` 下对应的文件。
2. **业务逻辑放 `src/lib/` 并且写成纯函数**（输入 → 输出，不依赖文件系统与全局状态）。组件里只做取数与渲染。这样逻辑才能被单测覆盖——这是本仓库测试策略成立的前提。
3. **`src/content/` 的目录名不等于集合名。** 输出集合有四个（含 `bookChapters`），但要落到的目录只有三个——书的章 / 节写在 `projects/<书>/chapters/` 下，与项目共用一个目录，靠 `content.config.ts` 里不同的 glob 模式分开取。所以读写路径必须走 `src/lib/schema.ts` 的 `OUTPUT_DIRS` 映射，**不要拿集合名当目录名**。这条踩过：章节被写到 `src/content/bookChapters/`，内容层的 glob 根本不会去读那里，表现为章节一个页面都不生成。

## 内容规范（frontmatter）

文章 —— `drafts/posts/<slug>.md`：

```yaml
---
title: 标题
date: 2026-09-14
updated: 2026-09-20      # 可选，缺省视为与 date 相同
tags: [算法, Python]
pinned: false            # true → 出现在「技术文章」右栏的置顶区
draft: false             # true → 构建时不产出该页
summary: 可选，缺省由正文首段推导
---
```

项目 —— `drafts/projects/<slug>.md`：

```yaml
---
title: 项目名
summary: 一句话简介
tech: [Python, FastAPI, Vue3]   # 卡片上展示的技术栈关键词
price:
  type: free | limited-free | paid
  amount: 99                    # type: paid 时必填，其他类型填了会被忽略
order: 10                       # 排序权重，小的靠前
cover: /images/xxx.png          # 可选
link: https://...               # 可选，外部链接
draft: false                    # true → 构建时不产出该页
---
```

文章的 `updated` 缺省时回落为 `date`；项目的 `order` 缺省为 0。日期写 `2026-09-14` 即可（加不加引号都收），sync 会统一归一化成 `YYYY-MM-DD` 再产出，保证产物稳定。

**文件名即 slug，必须是小写字母/数字/连字符**（`my-first-post.md`）。中文文件名会被 sync 拒绝并提示改用英文 slug——否则 URL 里会出现一长串百分号编码。同一次同步里如果两个文件解析出同一个 slug，第二个会被报错拦下。

可选的正文分割标记是 `<!-- more -->`：写在它之前的内容会成为文章列表上的摘要。

字段命名注意：免费是 `free`，限时免费是 **`limited-free`**（连字符，不是 `limited_free` / `limitedFree`），付费是 `paid`。全文各处保持一致。

**schema 只在 `src/lib/schema.ts` 定义一次**，用 zod。sync 脚本、`src/content.config.ts` 与页面代码都从那里复用，不要另写一套校验。

schema 之所以不放在 `src/content.config.ts`（初版规范是这么写的），是因为那个文件依赖 `astro:content` 这个虚拟模块，Node 侧的 sync 脚本 import 不了。同理，sync 脚本用 `tsx` 跑 TypeScript（而不是写成 `.mjs`），才能与站点、单测共用同一份 schema 和类型——写成 `.mjs` 要么丢掉类型，要么把校验规则复制两份。

价格 → 颜色是需求里明确的展示规则，**集中在 `src/lib/pricing.ts` 里定义**（映射函数 + 常量），返回标签文案与 CSS 类名，组件只消费返回结果：

| `price.type` | 标签 | 颜色 |
| --- | --- | --- |
| `free` | 免费 | 绿 |
| `limited-free` | 限时免费 | 红 |
| `paid` | 付费:xx元 | 紫 |

不要在组件或样式里散落硬编码色值，否则改配色时会漏改。

## 架构要点

### 内容流水线

```
drafts/*.md  --sync-drafts.mjs(校验+复制)-->  src/content/  --Astro 内容集合-->  dist/
```

`sync-drafts.mjs` 的职责是**校验并快速失败**：frontmatter 缺字段、`date` 非法、`price.type: paid` 却没有 `amount`、slug 重复——都要中止同步、打印出**出错的文件路径与原因**，而不是静默跳过或产出半成品页面。静默失败会让错误一路漏到线上。

### 数学公式在构建期渲染

用 `remark-math` + `rehype-katex`，让 `$...$`（行内）与 `$$...$$`（行间）在**构建期**转成 KaTeX 的 HTML 标记，页面只需引 KaTeX 的 CSS。**不要**在浏览器端跑 KaTeX 的 JS 渲染——那会让公式在首屏闪烁，也会拖慢加载。代码块高亮同理，走构建期。

**Astro 7 的坑：默认 Markdown 处理器已经不是 remark/rehype 了。** Astro 7 换成了名为 Sätteri 的原生处理器，它只把公式解析成 mdast 节点、不负责渲染成 KaTeX。所以 `astro.config.mjs` 里必须显式用 `unified()`（来自 `@astrojs/markdown-remark`），否则公式会原样漏成 `$...$` 文本。旧的 `markdown.remarkPlugins` 写法已废弃。

插件表从 `src/lib/markdown.ts` 取：该文件导出 `mathRemarkPlugins` / `katexRehypePlugins`，站点与单测共用同一组。GFM 由 Astro 侧自带，所以**不要**把 `remark-gfm` 也塞给 `unified()`，会重复注册。

公式的 CSS 只在详情页导入（`import 'katex/dist/katex.min.css'`），Astro 按页拆分 CSS——首页不含公式，就不该为此付出体积代价。改动此处后请确认首页没有加载 `katex.*.css`。

### 首页模块切换：CSS `:target`，不是 JS

首页两个模块（`#projects` / `#posts`）**都渲染进 HTML**，靠 CSS 的 `:target` 切换，**默认展示「项目浏览」**。这样禁用 JS 时「技术文章」依然可达、内容依然在文档里。JS 只做一件事：让导航的 `aria-current` 跟着 hash 走。

两个容易踩的点：

- 切换不要改成 JS 控制 `hidden` 属性。`:target` 在首次绘制前就生效，不会先闪一下默认模块，也**不需要**在 `<head>` 里放同步脚本——曾经有过一段给 `<html>` 打标记的内联脚本，改成 `:target` 之后它就是死代码，已删除。
- **不要把当前模块写回 `<html>` 的 `data-module` 属性**：导航链接用的就是 `data-module`，同名会被 `[data-module="..."]` 选择器同时匹配到，测试直接报 strict mode violation。导航高亮只通过链接上的 `aria-current` 表达。

### 目录（TOC）

文章、项目详情页与独立页面共用 `src/components/Toc.astro`，宽屏在右侧、窄屏移到正文上方。

**标题数据必须来自 Astro 的 `render(entry).headings`，不要自己解析 markdown 生成 slug。** 那里面的 slug 就是页面里真实生成的 `id`，锚点一定对得上；自己实现需要复刻 Astro 的 slugger 规则，两边一旦有细微差异锚点就会静默失效。`src/lib/toc.ts` 只做纯数据整理（建树、截断到 4 级、压平），因此可以单测。

配套约束：

- 没有足够标题时（少于 2 个）不渲染目录，此时 `.detail__layout--with-toc` 不出现，退回单列，不留空列。
- 窄屏换位置用的是 `grid-template-areas` 而不是 CSS `order`。`order` 只改视觉顺序，读屏与 Tab 顺序仍按 DOM，会与看到的不一致。

### 分页

项目每页 3 个、文章每页 5 篇（`src/lib/pagination.ts` 的 `PROJECTS_PER_PAGE` / `POSTS_PER_PAGE`）。

**首页承载两个模块的第 1 页，第 2 页起才是独立路由**（`/projects/page/N/`、`/posts/page/N/`）。这个「第 1 页与其余页地址规则不同」的差异集中在 `listPagePath()` 里，由 `firstPageHref` 参数表达——不要在页面里手拼 URL。

配套约束：

- `paginatedPaths()` 只产出**第 2 页起**的静态路径，第 1 页由首页负责。两边都产出会撞路由。
- 分页页**不能用 `class="module"`**（见下方已知陷阱）。
- 置顶文章不参与文章分页计数，但每一页的右栏都照常显示——否则翻到第 2 页就没有置顶文章了。
- 因为分页占用 `/posts/page/N/` 与 `/projects/page/N/`，文章与项目的 slug 里 `page` 是保留字（`RESERVED_LIST_SLUGS`），同步阶段就会拦下。

### 项目 = 一本书

`drafts/projects/<项目>/` 是目录时即为一本书：`index.md` 是项目条目（用项目的 schema），其余文件是章与节，解析在 `src/lib/book.ts`。

**条目 id 与目录里的 slug 不是一回事，这是最容易踩的地方。** 内容层里章条目的 id 是 `<项目>/01-入门`（**保留数字前缀**），而目录里展示与用作 URL 段的 slug 是 `入门`（**去掉前缀**）。按 slug 去查条目会全部查不到，表现为章节一个页面都不生成、构建却完全成功。页面侧要按 `sourcePath` 查（`bookSourcesFromEntries` 与 `bookSourcePathFromId` 是一对互逆的转换）。

其他约束：

- 最多两级，`parseBookOutline` 会报错而不是悄悄截断。
- 顺序由文件名数字前缀决定，且**必须与传入顺序无关**——`parseBookOutline` 内部统一排序，不要依赖文件系统的遍历顺序。
- 章可以只有目录、没有同名文件（`hasOwnPage: false`），此时 `chapterHref()` 指向它的第一节。
- 路由用 `projects/[slug]/[...parts].astro` 一条 catch-all 覆盖章与节。**不要**改成 `[chapter].astro` 与 `[chapter]/[section].astro` 并存——文件与同名目录并存容易让路由解析变得难以推理。

### 独立页面与保留 slug

`drafts/pages/*.md` 产出到根路径 `/<slug>/`（`src/pages/[page].astro`，单段动态路由；Astro 会先匹配更具体的静态路由，所以不会截走 `/posts/…`）。

代价是 slug 可能撞上站内已占用的路径，所以 `src/lib/sync.ts` 里有 `RESERVED_PAGE_SLUGS`（`index`、`posts`、`projects`、`404`、`images`、`tags` 等）在同步阶段拦下。**新增根路径路由时记得往这个集合里加一项**，否则会出现两个页面抢同一个地址。

新增独立页面后还要在 `src/lib/site.ts` 的 `PAGES` 里加一项，它才会出现在导航上。

### 视觉与风格的硬约定

- **字体自托管**（`@fontsource`），不引第三方 CDN——静态站不该因为外部字体服务抖动而闪一下无样式文字。中文回落系统字体，不加载多 MB 的中文 Web 字体。
- **背景公式用 Unicode 字符，且位置写死在数组里**（`FormulaBackground.astro`）。不要改成随机：随机会让每次构建产出不同的 HTML，产物不可复现。也不要为了装饰去用 KaTeX 渲染背景公式——那会让本来不含公式的首页加载整套数学字体。
- **卡片平时的 `box-shadow: none`，hover 才投影**；价格三色（绿/红/紫）来自 `src/lib/pricing.ts`，是卡片上唯一的饱和色，因为它们承载真实信息。改配色时改 `pricing.ts` 里那一处，不要在组件里散布色值。
- **卡片要求统一尺寸（同一行等高）**，实现方式是「骨架一致 + 拉齐」两者配套，缺一不可：
  1. `.card-grid` 用 Grid 默认的 `stretch` 拉齐高度；
  2. 封面位**永远存在**且固定 `aspect-ratio: 16/9` —— 没写 `cover` 的项目由 `ProjectCard.astro` 生成一个公式图案占位（图案由 slug 决定，不用随机）；
  3. `.card__summary` 用 `-webkit-line-clamp: 3` 截断到三行。

  **这三条是一组，动其中一条必须重新检查另外两条。** 曾经踩过：封面只在有图时才渲染，拉齐等高后没封面的卡片在摘要下方裂出约 350px 空白；后来改成 `align-items: start` 回避，结果是卡片高度参差、不符合"大小一致"的要求。`tests/e2e/projects.spec.ts` 里有「卡片高度完全一致」和「卡片内部不会空出一大块」两条用例守着这个组合。
- 动效只保留卡片 hover 的「跳动」，**不要再加入场动画**（每块内容淡入上浮那种）。同时必须保留 `prefers-reduced-motion` 分支里关掉位移的那段。

### 项目卡片

- 列数自适应用 **CSS Grid**：`repeat(auto-fill, minmax(<最小值>, 1fr))`。**不要写 JS 断点来计算列数**——那会在首屏产生布局跳动，也让这段逻辑变得必须被测试却难以测试。
- hover 的「跳动」效果用 `transform` + `transition`（`transform` 不触发重排，性能好于改 `top`/`margin`）。
- **必须尊重 `prefers-reduced-motion`**：在该媒体查询下关掉位移动画，只保留颜色/阴影类反馈。
- 卡片内容：封面、标题、技术栈关键词、价格标签（颜色见上表）。

### 技术文章（两栏）

- **左栏**：按发布时间**倒序**的最新文章列表。每项显示标题、发布时间、字数、更新时间、建议阅读时长，以及按 markdown 分割语法截取的正文摘要。点击标题或正文进入全文。
- **右栏**：`pinned: true` 的置顶文章。
- 字数、阅读时长、摘要都在**构建期**由 `src/lib/` 的纯函数算出，不要在浏览器端重新计算。

### 卡片详情页 / 文章全文

正文即详情页，必须能正确渲染：**表格、图片、行内与行间公式、代码块**。这四类是需求里点名的，改 markdown 流水线时这四类都要有回归测试兜底（见下）。

## 测试要求

**测试不是可选项。** 硬性规则：

- 新增或修改功能时，**必须同时提交测试**。新增 `src/lib/` 下的纯函数而没有配套测试，视为该任务**未完成**，不要以「后续补上」结案。
- 修 bug 时先写一个能复现该 bug 的失败用例，再改代码让它通过。
- 纯函数与构建逻辑用 **Vitest**（`tests/unit/`）；真实浏览器里的渲染与交互用 **Playwright**（`tests/e2e/`）。不要用 e2e 去测本可以用单测覆盖的纯逻辑——那会让测试又慢又脆。
- e2e 只覆盖「必须真的跑在浏览器里才成立」的事：布局、交互、公式/表格在页面上的最终呈现。

### 单元测试清单（`tests/unit/`）

这些是 `src/lib/` 中应当存在、且必须有测试的函数。按功能名建测试文件：

- **`reading-time`** — 中英混排字数统计与阅读时长。必须覆盖边界：空正文（0 字）、纯中文、纯英文、中英混排、只有 markdown 标记没有正文。阅读时长的取整规则要固定下来并断言（例如不足一分钟按一分钟计）。
- **`excerpt`** — 摘要推导与截断。要断言**公式与 HTML 不污染摘要**（不能让摘要里出现 `$` 或 `katex` 之类的标记碎片），以及无摘要字段时能正确回落到正文。
- **`pricing`** — 三种 `price.type` → 标签文案与颜色类名的映射；`paid` 缺 `amount` 时必须**抛错**而不是产出「付费:undefined元」。
- **`sync-drafts`** — 校验逻辑：缺字段、`date` 非法、`paid` 无 `amount`、slug 重复时都要中止并报出**文件名**；`draft: true` 的文章不进入产出集合。
- **`sort`** — 文章按发布时间倒序、置顶文章正确分到右栏；项目按 `order` 升序，`order` 相同时的次序要确定（不要依赖文件系统遍历顺序）。
- **`markdown`** — 流水线把 `$x^2$` 与 `$$...$$` 转成 KaTeX 标记，且表格与图片结构在转换后仍完整保留。
- **`toc`** — 建树（同级平铺、浅层作父、跳级不凭空补父节点、以 h3 开头时自成根）、截断到 4 级、压平后的层级用于缩进、少于两个标题不显示。
- **`book`** — 章 / 节解析（名字取文件名去前缀、frontmatter title 优先）、按数字前缀排序且与传入顺序无关（含 `9` 在 `10` 前、`1-x` 在 `1.1-y` 前、无前缀排最后）、超过两级报错、章节重名报错、只有目录没有章文件时 `hasOwnPage` 为 false、`chapterHref` 的三种情形。
- **`pagination`** — 每页条数、总页数（含 0 条也算 1 页、整除时不多出空页）、取第 N 页、页码序列的省略号折叠、第 1 页与其余页地址的差异、越界抛错、`paginatedPaths` 只产出第 2 页起。

### 端到端测试清单（`tests/e2e/`）

- 首页默认停在「项目浏览」。
- 切换到「技术文章」后列表正确出现。
- 卡片 hover 后确实发生了位移/缩放（断言计算后的样式变化，不是断言「有 transition 属性」）。
- 点击卡片进入详情页，页面上表格、图片、公式均渲染成功（公式要断言 KaTeX 标记存在，不是只断言文字）。
- 技术文章右栏置顶顺序正确。
- 窄视口（手机宽度）下卡片退化为单列。
- 目录：每个锚点都能在正文里找到对应标题、只收录 1–4 级、点击跳转并标为当前、滚动时高亮跟随、窄屏移到正文上方且不再吸顶。
- 独立页面：可访问、导航高亮正确、首页的模块切换脚本不会误点亮它。
- 分页：首页只放第一页且数量正确、**各页合起来不重不漏**（总数与控件上写的一致）、页码按钮标出当前页、第一页没有上一页 / 最后一页没有下一页、翻页后地址正确、文章跨页仍按时间倒序、置顶文章在每一页的右栏都在。
- 书：多文件项目出现左侧目录而单文件项目没有、目录确实是两级且不出现第三级、点击章 / 节进入对应页面且左侧高亮跟随、**书内页右侧的文档目录仍然存在**（两套目录互不干扰）、目录里每个链接都能打开。
- 内容完整性（`content.spec.ts`）：所有详情页无死链、无 KaTeX 报错、可视正文里不漏出 LaTeX 源码或 markdown 标记（**漏出反引号几乎总是行内代码的反引号没配对**）。

**分页与书的测试不要写死页数和标题**——它们取决于内容多少，写死的话每加一篇文章就会挂一片（踩过一次）。从界面上读出实际页数（`pagination__summary`）再据此断言，并对「各页合起来不重不漏」这类不变量做断言。

### 组件测试

优先**断言渲染后的 HTML 输出**，而不是去测组件内部实现。Astro 提供了在 Vitest 中渲染 `.astro` 组件的机制（容器 API），也可以直接对 `npm run build` 产出的 `dist/` 文件做断言。**具体 API 名称与导入路径随 Astro 大版本会变**，落地时以实际安装的版本为准去核对，不要照抄记忆中的写法。

## 部署

`.github/workflows/deploy.yml` 的流程：

```
checkout → setup-node → npm ci → npm run test → npm run build
        → upload-pages-artifact(dist/) → deploy-pages
```

约定：

- **测试失败就不部署。** 单元测试与端到端测试都放在构建之前，都不设 `continue-on-error`。
- CI 里端到端测试前要先 `npx playwright install --with-deps chromium`。
- `dist/` **不提交进仓库**，用 `.gitignore` 排除（同样排除 `node_modules/`、`test-results/`、`playwright-report/`）。
- 仓库 Settings → Pages → Source 需要设为 **"GitHub Actions"**。这一步在 GitHub 网页上点，workflow 无法代劳——如果部署没生效，先检查这里。
- 因为本仓库是用户站点仓库，产物服务在根路径，`astro.config.mjs` 里**不要**设置 `base`。

## 动这个仓库之前

按用户要求：**需求有不确定的地方，先确认再动手**，不要靠猜。需求细节以 [任务描述.md](任务描述.md) 为准；本规范与它冲突时，先向用户确认哪个是当前意图，再改代码或改本文件。

## 已知陷阱

- **旧 Gridea 产物里所有资源引用都是绝对 URL**（如 `https://cjblog.github.io/styles/main.css`）。新站不要沿用这种写法——本地 `npm run dev` 时绝对 URL 会指回线上，导致改样式看不到效果。用 Astro 的资源导入或站内相对路径。
- **旧站的 Google Analytics 是已停用的 Universal Analytics**（`UA-143093516-1`，UA 属性早已停止处理数据）。重建时不要照搬，要加统计就换 GA4 或别的方案。
- 旧内容里有指向第三方图床的 **http 明文图片**（如 `http://image.easytool.vip/...`）。虽然本次不迁移旧文章，但若日后要迁，这些链接需要一并处理（失效与外链风险）。
- 旧内容集合配置的文件名随 Astro 版本变化：Astro 5+ 是 `src/content.config.ts`，更早版本是 `src/content/config.ts`；集合定义方式（`glob()` loader 等）也随版本不同。**以实际安装的版本为准**。
- **`sortPostsByDateDesc` 这类函数按 Astro `CollectionEntry` 的形状取值（`entry.data.date`），不是拍平的 `entry.date`。** 这里踩过一次：单测按拍平形状写全绿，但站点构建报「date 不是合法日期：undefined」。写涉及 entry 的工具函数时，测试数据也要用 `{ data: {...} }` 的形状。
- `Array.prototype.sort` 在**只有一个元素时不调用比较器**，所以「日期非法就抛错」这类防御性校验，用单元素测试是测不出来的——测试至少要给两个元素。
- 卡片用「链接只包住标题 + `::after` 铺满整卡」的写法（`ProjectCard.astro`），**不要**改成把整张卡片套进 `<a>`：那样读屏软件会把整卡内容念成一个链接名。
- **grid 项上的 `position: sticky` 必须配 `align-self: start`。** grid 项默认 `align-self: stretch`，会被拉伸到与所在网格区域等高；元素和容器一样高时 sticky 没有任何可移动余量，效果**等于完全失效**——整块跟着页面滑走。目录列跨了 header 与 body 两行，这个坑尤其明显。`.toc`、`.book` 都靠这一行生效，`.rail` 则是因为 `.blog-layout` 上有 `align-items: start` 才正常。
- **书的页面宽度必须固定，不能随「这一页有没有目录」变化。** 书页面固定三栏（`detail--with-book` 与 `detail--with-toc` 一起加），即使当前页标题太少、右侧没有目录也把那一列留着。否则从有目录的章翻到没目录的章，整页宽度会从 1040px 掉到 944px，跳得很明显。`tests/e2e/book.spec.ts` 里有「书的各个页面宽度完全一致」和「项目页宽度约为博客正文页的 1.1 倍」两条用例守着。
- **`.module` 只给首页那两个模块用。** 它的默认值是 `display: none`（配合 `:target` 切换），随手套到别的页面上会让**整页变成空白**。危险之处在于文字仍在 DOM 里，`allTextContents()` 这类内容断言照样通过、构建也不报错，只有可见性断言（`toBeVisible`）才发现得了。分页页与独立页面都用普通容器。`tests/e2e/pagination.spec.ts` 里那条「第一页没有上一页，最后一页没有下一页」就是靠可见性抓到的。
- **媒体查询不增加 CSS 优先级。** 同优先级的规则由源码顺序决定，所以「宽屏一套、窄屏覆盖」时，窄屏那段必须写在被覆盖的规则**之后**。踩过一次：`.toc` 的规则写在媒体查询之后，导致窄屏的 `position: static` 被后面的 `position: sticky` 盖掉，目录在正文上方还吸顶遮住内容。
- **`astro preview` 不能用作 Playwright 的 `webServer` 命令**：Astro 7 的 preview 会把服务转入后台并让前台进程退出，Playwright 判定「exited early」直接失败，而且在 4321 上留下常驻守护进程，下次构建时端口被占（症状是 `Preview server already running`）。所以 `npm run preview` 指向自己写的 `scripts/serve-dist.mjs`，前台运行、无额外依赖。若确实误跑了 `astro preview`，用 `npx astro preview stop` 收尾。
- **不要断言「页面不含 `$`」来验证公式渲染**。两个反例：文章本身在讨论公式语法时，会用行内代码展示字面量 `` `$...$` ``（正确行为）；KaTeX 默认输出 `htmlAndMathml`，MathML 的 `<annotation>` 里带着原始 LaTeX 源码，所以 `textContent` 里能找到 `\alpha`。要验证就断言**可视元素**——例如某个段落里 `.katex` 的个数。
