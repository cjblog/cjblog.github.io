import { z } from 'zod';

/**
 * frontmatter 校验的唯一真源。
 *
 * 放在 src/lib/ 而不是 src/content.config.ts，是因为 sync 脚本（Node CLI）
 * 也要用同一套 schema，而 content.config.ts 依赖 astro:content 这个虚拟模块，
 * Node 侧无法 import。src/content.config.ts 从这里复用，仍然只有一份定义。
 */

/** YAML 里的 `2026-09-14` 会被 gray-matter 解析成 Date，带引号则是 string，两种都收。 */
const dateLike = z.union([z.string(), z.date()]);

const httpUrl = z
  .string()
  .regex(/^https?:\/\//, '必须是 http:// 或 https:// 开头的链接');

/**
 * 价格用 discriminated union：type 为 paid 时 amount 是必填的，
 * 「付费却没有价格」在 schema 层就过不去，不需要在业务代码里再查一遍。
 */
export const priceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('free') }),
  z.object({ type: z.literal('limited-free') }),
  z.object({ type: z.literal('paid'), amount: z.number().positive('amount 必须大于 0') }),
]);

export const postSchema = z.object({
  title: z.string().min(1, 'title 不能为空'),
  date: dateLike,
  updated: dateLike.optional(),
  tags: z.array(z.string()).default([]),
  pinned: z.boolean().default(false),
  draft: z.boolean().default(false),
  summary: z.string().optional(),
});

export const projectSchema = z.object({
  title: z.string().min(1, 'title 不能为空'),
  summary: z.string().min(1, 'summary 不能为空'),
  tech: z.array(z.string()).min(1, 'tech 至少写一个技术栈关键词'),
  price: priceSchema,
  order: z.number().default(0),
  cover: z.string().optional(),
  link: httpUrl.optional(),
});

/**
 * 独立页面（「关于作者」这类）。不走列表，没有日期与置顶的概念，
 * 只产出根路径下的一个页面。slug 有额外限制，见 sync.ts 的保留字检查。
 */
export const pageSchema = z.object({
  title: z.string().min(1, 'title 不能为空'),
  description: z.string().optional(),
  order: z.number().default(0),
  draft: z.boolean().default(false),
});

/**
 * 书的章 / 节。标题默认取文件名（去掉数字前缀），所以 frontmatter 是可选的，
 * 想覆盖时才写 title。
 */
export const bookChapterSchema = z.object({
  title: z.string().optional(),
});

export type PostFrontmatter = z.infer<typeof postSchema>;
export type PageFrontmatter = z.infer<typeof pageSchema>;
export type BookChapterFrontmatter = z.infer<typeof bookChapterSchema>;
export type ProjectFrontmatter = z.infer<typeof projectSchema>;
export type Price = z.infer<typeof priceSchema>;
export type PriceType = Price['type'];

/**
 * 可以在 drafts/ 下直接写作的集合。
 *
 * 书的章 / 节**不在这里**——它们不是独立的草稿目录，而是项目目录内部的
 * 一部分（drafts/projects/<项目>/…），由 sync 整体处理。把 bookChapters
 * 加进来会凭空造出一个 drafts/bookChapters/ 的合法写作位置。
 */
export const COLLECTIONS = {
  posts: { dir: 'posts', schema: postSchema },
  projects: { dir: 'projects', schema: projectSchema },
  pages: { dir: 'pages', schema: pageSchema },
} as const;

export type CollectionName = keyof typeof COLLECTIONS;

/**
 * 输出集合 → src/content/ 下的实际目录。
 *
 * 输出集合比可写作的集合多一个 bookChapters：书的章 / 节写在
 * `src/content/projects/<书>/chapters/` 里，与项目集合共享同一个目录
 * （content.config.ts 用不同的 glob 模式把它们分开取）。
 * 所以这里必须显式映射，不能拿集合名当目录名。
 */
export const OUTPUT_DIRS = {
  posts: 'posts',
  projects: 'projects',
  pages: 'pages',
  bookChapters: 'projects',
} as const;

export type OutputCollection = keyof typeof OUTPUT_DIRS;
