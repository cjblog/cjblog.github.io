import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { bookChapterSchema, COLLECTIONS } from './lib/schema';

/**
 * 内容集合。schema 来自 src/lib/schema.ts —— 与 sync 脚本共用同一份定义，
 * 这里只是把它接到 Astro 的内容层上，不要再写第二套校验规则。
 *
 * 集合目录由 `npm run sync` 生成，不要手工编辑 src/content/ 下的文件。
 *
 * 项目有两种形态，都落在 src/content/projects/ 下：
 *   llm-wiki.md              单文件项目
 *   my-book/                 一本书
 *     index.md               书的首页 = 项目条目
 *     chapters/01-起步.md    章
 *     chapters/01-起步/…     节
 * 所以 projects 与 bookChapters 用不同的 glob 模式分开取，互不重叠。
 */
const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: COLLECTIONS.posts.schema,
});

/** 独立页面（「关于作者」这类），产出根路径下的 /<slug>/ */
const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: COLLECTIONS.pages.schema,
});

/** 项目卡片：单文件项目，以及书目录的 index.md。id 去掉 `index` 后缀。 */
const projects = defineCollection({
  loader: glob({
    pattern: ['*.md', '*/index.md'],
    base: './src/content/projects',
    generateId: ({ entry }) => entry.replace(/\.md$/, '').replace(/\/index$/, ''),
  }),
  schema: COLLECTIONS.projects.schema,
});

/** 书的章与节。id 去掉中间的 `chapters/`，变成 `<项目>/<章>[/<节>]`。 */
const bookChapters = defineCollection({
  loader: glob({
    pattern: ['*/chapters/*.md', '*/chapters/*/*.md'],
    base: './src/content/projects',
    generateId: ({ entry }) =>
      entry.replace(/^([^/]+)\/chapters\//, '$1/').replace(/\.md$/, ''),
  }),
  schema: bookChapterSchema,
});

export const collections = { posts, projects, pages, bookChapters };
