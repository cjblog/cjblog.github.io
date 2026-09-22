# CLAUDE.md

给 Claude Code 在本仓库工作时的开发规范。

**按用户要求：需求有不确定的地方，先确认再动手，不要靠猜。** 需求细节以 [任务描述.md](任务描述.md) 为准；本文件与它冲突时，先向用户确认哪个是当前意图，再改代码或改本文件。

## 这个仓库是什么

`cjblog.github.io` 是 GitHub 的**用户站点仓库**，线上 `https://cjblog.github.io`，服务在**根路径**，所以 `astro.config.mjs` 里**不要设 `base`**（和项目站点仓库不同，别照搬 `base: '/repo-name'` 的写法）。

Astro 静态站，含「项目浏览」与「技术文章」两个模块。旧站是 Gridea 的生成产物，已删除且不迁移旧文章（旧内容仍在 git 历史 `0109dbf` 里）。

**要求 Node 22+**；首次跑 e2e 前先 `npx playwright install chromium`。

## 常用命令

```bash
npm install
npm run dev          # 开发预览，http://localhost:4321
npm run sync         # drafts/ → src/content/：校验 frontmatter 并同步
npm run build        # 构建到 dist/
npm run preview      # 预览构建产物（scripts/serve-dist.mjs，前台运行）
npm run test         # 单元测试（vitest run，跑一次就退出）
npm run test:e2e     # Playwright 端到端
```

调试时跑单个用例，不要动辄跑全量：

```bash
npx vitest run tests/unit/reading-time.test.ts   # 单个测试文件
npx vitest run -t "计算阅读时长"                  # 按用例名筛
npx playwright test tests/e2e/projects.spec.ts   # 单个 e2e 文件
npx playwright test --ui                         # e2e 交互式调试
```

把同一套 e2e 打到线上（验证「本地预览 == 线上」最直接的办法，只读不写）：

```bash
PLAYWRIGHT_BASE_URL=https://cjblog.github.io npx playwright test
```

## 写内容的流程

`drafts/` 下写 markdown → `npm run sync` → `npm run dev` 预览。

```
drafts/posts/*.md          技术文章
drafts/projects/*.md       单文件项目
drafts/projects/<书>/      多文件项目 = 一本书（index.md + 章/节，最多两级）
drafts/pages/*.md          独立页面，产出到根路径 /<slug>/
```

### 三条硬约定

1. **`src/content/` 是生成目录。** 直接改那里会在下次 `npm run sync` 时被覆盖，要改内容就改 `drafts/` 下对应的文件。
2. **业务逻辑放 `src/lib/` 并写成纯函数**（输入 → 输出，不碰文件系统与全局状态），组件里只做取数与渲染。这是本仓库测试策略成立的前提。
3. **`src/content/` 的目录名 ≠ 集合名。** 输出集合有四个（含 `bookChapters`），但目录只有三个——书的章/节写在 `projects/<书>/chapters/` 下，靠 `content.config.ts` 里不同的 glob 分开取。读写路径必须走 `src/lib/schema.ts` 的 `OUTPUT_DIRS`，**不要拿集合名当目录名**。踩过：章节被写到 `src/content/bookChapters/`，glob 根本不读那里，表现为章节一个页面都不生成、构建却完全成功。

### frontmatter

文章 `drafts/posts/<slug>.md`：`title` `date` `updated?` `tags` `pinned` `draft` `summary?`
项目 `drafts/projects/<slug>.md`：`title` `summary` `tech` `price{type,amount?}` `order?` `cover?` `link?` `draft`

- `price.type` 只有三个值：`free` / **`limited-free`**（连字符，不是 `limited_free` / `limitedFree`）/ `paid`（此时 `amount` 必填，其他类型填了会被忽略）。
- `updated` 缺省回落为 `date`，`order` 缺省为 0。日期写 `2026-09-14`，加不加引号都收，sync 统一归一化成 `YYYY-MM-DD`。
- **文件名即 slug，只能是小写字母/数字/连字符。** 中文文件名会被 sync 拒绝（否则 URL 里是一长串百分号编码）。同一次同步里两个文件解析出同一 slug，第二个会被报错拦下。
- 正文里的 `<!-- more -->` 之前的内容会成为列表页摘要。

**schema 只在 `src/lib/schema.ts` 定义一次**（用 zod），sync、`src/content.config.ts` 与页面代码都从那里复用，不要另写一套。它不放在 `content.config.ts` 里，是因为那个文件依赖 `astro:content` 虚拟模块，Node 侧的 sync 跑不了；同理 sync 脚本用 `tsx` 而不是 `.mjs`，才能共用同一份 schema 与类型。

价格 → 颜色**集中在 `src/lib/pricing.ts`**，组件只消费它返回的标签文案与 CSS 类名，不要在组件或样式里散落色值：

| `price.type` | 标签 | 颜色 |
| --- | --- | --- |
| `free` | 免费 | 绿 |
| `limited-free` | 限时免费 | 红 |
| `paid` | 付费:xx元 | 紫 |

## 开发规范

### 内容流水线

```
drafts/  --sync（校验 + 复制）-->  src/content/  --Astro 内容集合-->  dist/
```

sync 的职责是**校验并快速失败**：缺字段、`date` 非法、`paid` 无 `amount`、slug 重复——都要中止并打印**出错的文件路径与原因**，不许静默跳过或产出半成品。静默失败会让错误一路漏到线上。

### 公式在构建期渲染

`remark-math` + `rehype-katex`，在构建期把 `$...$`（行内）与 `$$...$$`（行间）转成 KaTeX 的 HTML 标记，页面只引 CSS。**不要**在浏览器端跑 KaTeX 的 JS 渲染——公式会在首屏闪烁，也拖慢加载。代码块高亮同理。

⚠️ **Astro 7 默认的 Markdown 处理器已不是 remark/rehype。** 它换成了 Sätteri，只把公式解析成 mdast 节点、不渲染 KaTeX。所以 `astro.config.mjs` 里必须显式用 `unified()`（来自 `@astrojs/markdown-remark`），否则公式会原样漏成 `$...$` 文本；旧的 `markdown.remarkPlugins` 写法已废弃。插件表从 `src/lib/markdown.ts` 取（`mathRemarkPlugins` / `siteRehypePlugins`），站点与单测共用同一组。GFM 由 Astro 自带，**不要**再塞 `remark-gfm`，会重复注册。

表格由 `rehypeWrapTables` 包进 `<div class="table-scroll">`——窄屏靠它横向滚动。这个类曾经只有 CSS、没有任何代码去加，宽表一直把页面撑出横向滚动（实测一个四列表格在 390px 视口下溢出 149px）。改 markdown 流水线时别把这个插件漏掉。

KaTeX 的 CSS 只在详情页 import，Astro 按页拆 CSS——首页不含公式，就不该付这份体积。

### 首页模块切换用 CSS `:target`，不是 JS

两个模块 `#projects` / `#posts` **都渲染进 HTML**，靠 `:target` 切换，**默认「项目浏览」**。禁 JS 时「技术文章」依然可达、内容也依然在文档里。JS 只做一件事：同步导航的 `aria-current`。

- 不要改成 JS 控制 `hidden`：`:target` 首次绘制前就生效，不会先闪一下默认模块，也**不需要** `<head>` 里的同步脚本。
- **不要把当前模块写回 `<html>` 的 `data-module`**：导航链接用的就是 `data-module`，同名会被 `[data-module="..."]` 一起匹配到，测试直接报 strict mode violation。高亮只走链接上的 `aria-current`。

### 目录（TOC）

文章、项目详情页与独立页面共用 `src/components/Toc.astro`，宽屏在右侧、窄屏移到正文上方。

**标题必须来自 Astro 的 `render(entry).headings`，不要自己解析 markdown 生成 slug**——那里的 slug 就是页面里真实生成的 `id`，锚点一定对得上；自己实现要复刻 Astro 的 slugger 规则，差一点锚点就静默失效。`src/lib/toc.ts` 只做纯数据整理（建树、截断到 4 级、压平），因此可以单测。

少于 2 个标题就不渲染目录，此时不留空列。窄屏换位置用 `grid-template-areas` 而不是 CSS `order`——后者只改视觉顺序，读屏与 Tab 顺序仍按 DOM，会与看到的不一致。

### 分页

项目每页 3 个、文章每页 5 篇（`src/lib/pagination.ts` 的 `PROJECTS_PER_PAGE` / `POSTS_PER_PAGE`）。

**首页承载两个模块的第 1 页，第 2 页起才是独立路由**（`/projects/page/N/`、`/posts/page/N/`）。这个差异集中在 `listPagePath()` 里，**不要在页面里手拼 URL**。

- `paginatedPaths()` 只产出**第 2 页起**的静态路径，第 1 页归首页。两边都产出会撞路由。
- 分页页**不能用 `class="module"`**（见已知陷阱）。
- 置顶文章不参与文章分页计数，但每一页的右栏都照常显示。
- 文章与项目的 slug 里 `page` 是保留字（`RESERVED_LIST_SLUGS`），同步阶段就会拦下。

### 项目 = 一本书

`drafts/projects/<项目>/` 是目录时即为一本书：`index.md` 是项目条目（用项目 schema），其余是章与节，解析在 `src/lib/book.ts`。

**条目 id 与目录里的 slug 不是一回事，这里最容易踩。** 内容层里章条目的 id 是 `<项目>/01-入门`（**保留数字前缀**），而展示与 URL 段用的 slug 是 `入门`（**去掉前缀**）。按 slug 查条目会全部查不到，表现为章节一个页面都不生成、构建却完全成功。页面侧要按 `sourcePath` 查（`bookSourcesFromEntries` 与 `bookSourcePathFromId` 是一对互逆的转换）。

- 最多两级，`parseBookOutline` 会报错而不是悄悄截断。
- 顺序由文件名数字前缀决定，且**必须与传入顺序无关**（内部统一排序，不要依赖文件系统遍历顺序）。
- 章可以只有目录、没有同名文件（`hasOwnPage: false`），此时 `chapterHref()` 指向它的第一节。
- 路由用一条 catch-all `projects/[slug]/[...parts].astro` 覆盖章与节，**不要**拆成 `[chapter].astro` 与 `[chapter]/[section].astro` 并存。

### 独立页面与保留 slug

`drafts/pages/*.md` 产出到根路径 `/<slug>/`。代价是 slug 可能撞上站内已占用的路径，所以 `src/lib/sync.ts` 里有 `RESERVED_PAGE_SLUGS` 在同步阶段拦下。**新增根路径路由时记得往这个集合里加一项**，否则两个页面会抢同一个地址。新增独立页面还要在 `src/lib/site.ts` 的 `PAGES` 里加一项，才会出现在导航上。

### 视觉硬约定

- **字体自托管**（`@fontsource`），不引第三方 CDN——静态站不该因为外部字体服务抖动而闪一下无样式文字。中文回落系统字体，不加载多 MB 的中文 Web 字体。
- **背景公式用 Unicode 字符，位置写死在数组里**（`FormulaBackground.astro`）。不要改成随机：随机会让每次构建产出不同的 HTML、产物不可复现。也别为了装饰用 KaTeX 渲染背景公式。
- 卡片平时 `box-shadow: none`，hover 才投影。价格三色是卡片上唯一的饱和色，因为它们承载真实信息。
- **卡片等高 = 骨架一致 + 拉齐，两条配套，缺一不可**：① `.card-grid` 用 Grid 默认的 `stretch` 拉齐；② 封面位**永远存在**且固定 `aspect-ratio: 16/9`（没写 `cover` 的项目由 `ProjectCard.astro` 按 slug 生成占位图案，不用随机）；③ `.card__summary` 截断到 3 行。**动其中一条必须重查另外两条**——踩过：封面只在有图时才渲染，拉齐后没封面的卡片裂出约 350px 空白；改成 `align-items: start` 回避，又变成卡片高度参差。
- 列数自适应用 CSS Grid `repeat(auto-fill, minmax(...))`，**不要写 JS 断点算列数**（首屏会跳，且难以测试）。hover 位移用 `transform` + `transition`。
- **必须尊重 `prefers-reduced-motion`**：该媒体查询下关掉位移动画，只留颜色/阴影反馈。
- 动效只保留卡片 hover 的「跳动」，**不要再加入场动画**。
- 卡片用「链接只包住标题 + `::after` 铺满整卡」，**不要**把整张卡片套进 `<a>`：那样读屏软件会把整卡内容念成一个链接名。

### 技术文章与详情页

左栏是按发布时间**倒序**的最新文章（标题、时间、字数、更新时间、阅读时长、摘要），右栏是 `pinned: true` 的置顶文章。字数、阅读时长、摘要在**构建期**由 `src/lib/` 的纯函数算出，不要在浏览器端重新计算。

正文即详情页，必须能正确渲染**表格、图片、行内与行间公式、代码块**——这四类是需求里点名的，改 markdown 流水线时都要有回归测试兜底。

## 测试要求

**测试不是可选项。**

- 新增或修改功能时**必须同时提交测试**。新增 `src/lib/` 下的纯函数而没有配套测试，视为任务**未完成**，不要以「后续补上」结案。
- 修 bug 时先写一个能复现该 bug 的失败用例，再改代码让它通过。
- 纯函数与构建逻辑用 **Vitest**（`tests/unit/`）；真实浏览器里的渲染与交互用 **Playwright**（`tests/e2e/`）。不要用 e2e 去测本可以用单测覆盖的纯逻辑——那会让测试又慢又脆。
- `src/lib/` 下每个模块都要有同名测试文件。边界以现有测试为准去读，别只测 happy path。
- e2e 只覆盖「必须真的跑在浏览器里才成立」的事：布局、交互、公式/表格在页面上的最终呈现。

几条反复踩过的：

- **涉及 Astro entry 的函数按 `entry.data.date` 取值，不是拍平的 `entry.date`**，测试数据也要用 `{ data: {...} }` 的形状。踩过：单测全绿，站点构建却报「date 不是合法日期：undefined」。
- **`Array.prototype.sort` 在只有一个元素时不调用比较器**，「日期非法就抛错」这类防御性校验用单元素测试测不出来——至少给两个元素。
- **不要写死页数和标题**（分页与书的测试）：它们随内容多少变化，写死的话每加一篇文章就挂一片。从界面上读出实际页数再断言，并对「各页合起来不重不漏」这类不变量做断言。
- **不要断言「页面不含 `$`」来验证公式渲染**。两个反例：文章本身讨论公式语法时，会用行内代码展示字面量 `` `$...$` ``（正确行为）；KaTeX 默认输出 `htmlAndMathml`，MathML 的 `<annotation>` 里带着原始 LaTeX 源码。要验证就断言**可视元素**，例如某段落里 `.katex` 的个数。
- 组件测试优先**断言渲染后的 HTML 输出**，而不是组件内部实现。Astro 的容器 API 名称与导入路径随大版本会变，**以实际安装的版本为准**，不要照抄记忆中的写法。

## 部署

```
checkout → setup-node → npm ci → npm run test → npm run build
        → upload-pages-artifact(dist/) → deploy-pages
```

- **测试失败就不部署。** 单元测试与端到端测试都放在构建之前，都不设 `continue-on-error`。
- CI 里 e2e 前要先 `npx playwright install --with-deps chromium`。
- `dist/` **不提交进仓库**，用 `.gitignore` 排除（连同 `node_modules/`、`test-results/`、`playwright-report/`）。
- 仓库 Settings → Pages → Source 需要设为 **"GitHub Actions"**。这一步在 GitHub 网页上点，workflow 无法代劳——部署没生效先查这里。

## 已知陷阱

不看就会重犯的几条：

- **grid 项上的 `position: sticky` 必须配 `align-self: start`。** grid 项默认 `align-self: stretch`，会被拉伸到与所在网格区域等高；元素和容器一样高时 sticky 没有任何可移动余量，效果**等于完全失效**（整块跟着页面滑走）。`.toc`、`.book` 都靠这一行生效。
- **书的页面宽度必须固定，不能随「这一页有没有目录」变化。** 书页固定三栏（`detail--with-book` 与 `detail--with-toc` 一起加），即使当前页标题太少、右侧没目录也把那一列留着，否则从有目录的章翻到没目录的章，整页宽度会从 1136px 掉到 1016px。改书页列宽时要连 `--page-width` 一起验算：书页正文区 71rem = 1136px 正好是容器可用宽度，差一点就会被截住、转而吃掉正文列，且不报任何错。
- **`.module` 只给首页那两个模块用。** 它默认值是 `display: none`（配合 `:target` 切换），随手套到别的页面上会让**整页变成空白**——危险之处在于文字仍在 DOM 里，`allTextContents()` 这类内容断言照样通过、构建也不报错，只有可见性断言（`toBeVisible`）才发现得了。
- **媒体查询不增加 CSS 优先级。** 同优先级的规则由源码顺序决定，所以「宽屏一套、窄屏覆盖」时，窄屏那段必须写在被覆盖的规则**之后**。踩过：`.toc` 的窄屏 `position: static` 被后面的 `sticky` 盖掉，目录在正文上方还吸顶遮住内容。
- **`astro preview` 不能用作 Playwright 的 `webServer` 命令**：Astro 7 的 preview 会把服务转入后台并让前台进程退出，Playwright 判定「exited early」直接失败，还在 4321 上留下常驻进程。所以 `npm run preview` 指向自己写的 `scripts/serve-dist.mjs`。误跑了用 `npx astro preview stop` 收尾。
