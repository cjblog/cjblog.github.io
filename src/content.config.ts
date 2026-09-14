import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { COLLECTIONS } from './lib/schema';

/**
 * 内容集合。schema 来自 src/lib/schema.ts —— 与 sync 脚本共用同一份定义，
 * 这里只是把它接到 Astro 的内容层上，不要再写第二套校验规则。
 *
 * 集合目录由 `npm run sync` 生成，不要手工编辑 src/content/ 下的文件。
 */
const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: COLLECTIONS.posts.schema,
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: COLLECTIONS.projects.schema,
});

export const collections = { posts, projects };
