# 土豆不吃鱼

个人站点，包含两个模块：

- **项目浏览** —— 卡片式展示项目，点开是 Markdown 写的详情页
- **技术文章** —— 两栏博客，左栏最新、右栏置顶，全文支持表格、图片、代码高亮与数学公式

线上地址：<https://cjblog.github.io>

用 [Astro](https://astro.build/) 构建成纯静态页面，托管在 GitHub Pages。

---

## 快速开始

```bash
npm install          # 首次
npm run dev          # 本地预览，http://localhost:4321
```

改内容只需要动 `drafts/` 目录里的 Markdown 文件，然后：

```bash
npm run sync         # 把 drafts/ 同步到站点内容
npm run dev          # 预览
```

发布就是把改动提交并推送到 `master`，剩下的交给 GitHub Actions：

```bash
git add -A
git commit -m "新增文章：xxx"
git push
```

推送后约一两分钟自动上线。想先确认线上没问题，可以对着线上跑一遍端到端测试：

```bash
PLAYWRIGHT_BASE_URL=https://cjblog.github.io npx playwright test
```

---

## 写一篇技术文章

在 `drafts/posts/` 下新建一个 `.md` 文件，**文件名就是网址里的路径**，所以必须用小写字母、数字和连字符：

```text
drafts/posts/my-first-post.md   →   https://cjblog.github.io/posts/my-first-post/
```

写完文件头部要有 frontmatter（两条 `---` 之间的部分）：

```markdown
---
title: 文章标题
date: 2026-09-14
tags: [算法, Python]
---

正文从这里开始。
```

### 文章可用的字段

| 字段 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `title` | 是 | — | 文章标题，显示在列表和全文页顶部 |
| `date` | 是 | — | 发布日期，决定列表排序（最新在最上） |
| `updated` | 否 | 同 `date` | 更新时间，列表上单独显示 |
| `tags` | 否 | `[]` | 标签数组，显示在全文页标题下方 |
| `pinned` | 否 | `false` | 设为 `true` 会出现在右栏「置顶文章」。**置顶后不再出现在左栏**，两处不重复 |
| `draft` | 否 | `false` | 设为 `true` 则构建时不产出这一页 |
| `summary` | 否 | 自动推导 | 列表上显示的摘要，不写就按下面的规则自动截取 |

日期写 `2026-09-14` 这种形式即可，加不加引号都行。

### 列表上的摘要怎么来的

不写 `summary` 时按三档优先级自动推导：

1. frontmatter 里的 `summary`
2. 正文中 `<!-- more -->` 标记**之前**的内容
3. 第一段真正的正文（开头的标题会被跳过）

想精确控制摘要范围，就在正文里插一行分割标记：

```markdown
这是会显示在列表上的部分。

<!-- more -->

这部分只在全文页可见。
```

### 列表上显示的那些数字

- **字数**：中日韩字符逐字计数，英文按词计数。公式和 Markdown 语法符号不计入
- **阅读时长**：按每分钟 300 字估算，向上取整
- **更新时间**：取 `updated`，没写就同 `date`

这些都是构建时算好的，不需要手工维护。

---

## 加一个项目

在 `drafts/projects/` 下新建 `.md`，和文章一样，**文件名即网址路径**：

```text
drafts/projects/my-project.md   →   https://cjblog.github.io/projects/my-project/
```

frontmatter 比文章多几个字段：

```markdown
---
title: 项目名称
summary: 一句话说明这个项目是做什么的
tech: [Python, FastAPI, Vue3]
price:
  type: free
order: 10
---

正文从这里开始，可以放表格、图片、公式。
```

### 项目可用的字段

| 字段 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `title` | 是 | — | 项目名称 |
| `summary` | 是 | — | 卡片上的一句话简介，同时用作页面描述 |
| `tech` | 是 | — | 技术栈关键词数组，至少写一个，显示为卡片底部的标签 |
| `price` | 是 | — | 价格，见下表 |
| `order` | 否 | `0` | 卡片排序，**数字小的排前面** |
| `cover` | 否 | 自动生成 | 卡片封面图路径，例如 `/images/my-cover.png`。不写会自动生成一个浅蓝色公式图案 |
| `link` | 否 | — | 外部链接，必须 `http://` 或 `https://` 开头。写了会在详情页显示「项目地址」 |
| `draft` | 否 | `false` | 设为 `true` 则构建时不产出这一页 |

### 价格怎么写

`price.type` 决定卡片右上角标签的文字和颜色：

| 写法 | 标签显示 | 颜色 |
| --- | --- | --- |
| `price:`<br>`  type: free` | 免费 | 绿 |
| `price:`<br>`  type: limited-free` | 限时免费 | 红 |
| `price:`<br>`  type: paid`<br>`  amount: 99` | 付费:99元 | 紫 |

注意 `type` 只有这三个取值，**限时免费是连字符的 `limited-free`**。写 `paid` 时 `amount` 必填且必须大于 0，漏写会在同步时报错并指出是哪个文件。

---

## 把一个项目写成一本书

如果一个项目要写的内容很多，可以把它写成一个**目录**而不是单个文件。此时项目详情页的左侧会出现按章、节组织的目录，右侧仍是当前这一章的标题目录。

把一个已有的单文件项目变成书，就是把 `drafts/projects/my-book.md` 改成这样一个目录：

```text
drafts/projects/my-book/
  index.md               必须存在，就是项目介绍（原来的那个文件内容放这里）
  01-起步.md             第一章，章名取文件名
  01-起步/
    01-安装.md           1.1 节
    02-第一个程序.md      1.2 节
  02-进阶.md             第二章
  02-进阶/
    01-并发.md
```

规则只有四条：

1. **`index.md` 必须有**，它就是项目卡片点进来的落地页
2. **最多两级**：根目录的 `.md` 是章，章目录里的 `.md` 是节。再深会被同步拦下并报错
3. **顺序由文件名前面的数字决定**，`01-`、`02-`、`1.1-` 都认。没有数字前缀的排在带前缀的后面
4. **章名和节名取文件名去掉数字前缀的部分**，所以 `01-起步.md` 显示为「起步」

想改显示名而不改文件名，在文件里写 frontmatter 覆盖：

```markdown
---
title: 第一章 起步
---
```

### 几个细节

- **章可以只有目录、没有同名文件**（例如只建 `01-起步/` 目录放节），此时点击这一章会进它的第一节
- **章也可以没有节**，就是一个普通的 `.md`
- 文件名去掉数字前缀后**不能重名**（`01-起步.md` 和 `02-起步.md` 会冲突），同步时会报错并指出是哪个文件
- 书的**章节目录是给读者看的导航，和文章目录是两套东西**：左边那栏是整本书的章节，右边那栏是当前这一页的标题

---

## 列表分页

项目与技术文章都会自动分页：**项目每页 3 个，文章每页 5 篇**。不需要任何配置，内容多了自动生效。

第 1 页在首页上（「项目浏览」与「技术文章」两个模块），第 2 页起是独立地址：

| 内容 | 第 1 页 | 第 2 页起 |
| --- | --- | --- |
| 项目 | `/` | `/projects/page/2/`、`/projects/page/3/`… |
| 技术文章 | `/#posts` | `/posts/page/2/`、`/posts/page/3/`… |

翻页控件会显示「第 2 / 3 页　共 7 个项目」，两端是上一页 / 下一页，中间可以跳到任意页。只有一页时不显示控件。

**注意一条命名限制**：因为分页用了 `/posts/page/N/` 和 `/projects/page/N/`，所以文章和项目的文件名**不能叫 `page`**，同步时会拦下并提示改名。

**置顶文章不参与分页计数**——它们在每一页的右栏都会出现，否则翻到第 2 页就找不到置顶文章了。

---

## 加一个独立页面

「关于作者」这类不属于任何模块、单独存在的页面，放在 `drafts/pages/` 下：

```text
drafts/pages/about.md   →   https://cjblog.github.io/about/
```

frontmatter 只需要标题：

```markdown
---
title: 关于作者
description: 出现在搜索引擎与分享卡片上的一句话，可选
---

正文从这里开始。
```

| 字段 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `title` | 是 | — | 页面标题，同时作为浏览器标签页标题 |
| `description` | 否 | 站点的默认描述 | 页面的 meta description |
| `draft` | 否 | `false` | 设为 `true` 则不产出这一页 |

**文件名有限制**：独立页面产出在根路径下，所以不能占用站内已有的路径——`posts`、`projects`、`index`、`404`、`images`、`tags` 这些名字会被同步拦下并提示换一个。

新建页面后需要在 `src/lib/site.ts` 的 `PAGES` 里加一项，它才会出现在导航上：

```ts
export const PAGES = [
  { id: 'about', label: '关于作者', path: '/about/' },
  // 再加一个就是：{ id: 'contact', label: '联系我', path: '/contact/' },
];
```

---

## 文章目录（自动生成）

文章、项目详情页与独立页面在**宽屏下会自动在右侧显示目录**，窄屏下移到正文上方。不需要任何配置——目录由正文里的一到四级标题自动生成，点击可以跳转，滚动时会高亮当前所在的小节。

两条规则：

- **只收录 1–4 级标题**，`#####` 及更深的标题不进目录
- **标题少于两个时不显示目录**，一两个标题不需要目录

想让某个小节能出现在目录里，用 `##` 而不是加粗文字——加粗不是标题，不会进目录。

---

## 数学公式

行内公式用单个美元符号，行间公式用两个并**前后留空行**：

```markdown
质能方程 $E = mc^2$。

$$
\int_{0}^{\infty} e^{-x^{2}} \, \mathrm{d}x = \frac{\sqrt{\pi}}{2}
$$
```

公式在**构建时**就渲染成最终效果，浏览器只加载一份 CSS，不需要跑 JavaScript，所以不会出现「先看到一堆美元符号再突然变成公式」的闪烁。

完整的语法速查见站内文章 [LaTeX 数学公式常用语法](https://cjblog.github.io/posts/latex-common-syntax/)。三条最容易踩的：

- 矩阵换行要写两个反斜杠 `\\`，花括号做字面量要转义成 `\{` `\}`
- 用 `aligned` 而不是 `align`，KaTeX 不支持后者
- 不支持公式编号和 `\ref` 交叉引用

公式写错了不会导致构建失败，只会在页面上排出一段红色报错。**发布前先在本地看一眼**。

---

## 图片放哪

放在 `public/` 目录下，用站内绝对路径引用：

```markdown
![架构图](/images/architecture.svg)
```

文件放 `public/images/architecture.svg`，引用写 `/images/architecture.svg`。

**不要写完整的 `https://cjblog.github.io/...` 链接**——那样本地预览时会去线上取图，改了图片看不到效果。

---

## 文件与目录

```text
drafts/                  ← 你写内容的地方，只改这里
  posts/*.md             # 技术文章
  projects/*.md          # 单文件项目
  projects/<书>/         # 多文件项目（一本书）
    index.md
    01-章.md
    01-章/01-节.md
  pages/*.md             # 独立页面（关于作者这类）
src/
  content/               ← npm run sync 生成，不要手工改
  lib/                   ← 字数统计、摘要、价格映射、目录、分页、书本结构等纯函数
  components/  layouts/  pages/  styles/
public/                  ← 图片、favicon 等原样拷贝的静态资源
tests/                   ← 单元测试与端到端测试
```

有一条要记住：**`src/content/` 是生成目录**，直接改那里的文件会在下次 `npm run sync` 时被覆盖。要改内容就改 `drafts/` 下的对应文件。

---

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地预览，改内容自动刷新 |
| `npm run sync` | `drafts/` → `src/content/`，并校验 frontmatter |
| `npm run build` | 构建到 `dist/` |
| `npm run preview` | 预览构建产物（和 `dev` 不同，这个跑的是真正上线的那份） |
| `npm test` | 单元测试 |
| `npm run test:e2e` | 端到端测试（首次需要 `npx playwright install chromium`） |

内容写错时 `npm run sync` 会**指出是哪个文件、哪一行有问题并中止**，不会产出一个残缺的站点。看到报错按提示改就行。

---

## 部署

推送到 `master` 后，GitHub Actions 自动执行：安装依赖 → 跑单元测试 → 跑端到端测试 → 构建 → 发布到 GitHub Pages。**任何一步失败都不会上线**。

需要在仓库的 **Settings → Pages → Source** 里选择 **GitHub Actions**（这一步只能在网页上点）。

`dist/` 和 `node_modules/` 都不进仓库，构建在 GitHub 的机器上完成，本地不需要装任何环境来发布。

---

## 当前内容状态

`drafts/` 里目前的项目与部分文章是**示例内容**，用来演示排版与验证渲染，正文里都有明确标注。替换成自己的内容时直接改写或删除对应文件即可。

更详细的工程约定（架构、测试要求、已知陷阱）见 [CLAUDE.md](./CLAUDE.md)。
