// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import { mathRemarkPlugins, siteRehypePlugins } from './src/lib/markdown.ts';

/**
 * 用户站点仓库，服务在根路径 —— 不要设置 base，
 * 设了会让所有资源路径多一层前缀而 404。
 *
 * Markdown 处理器：Astro 7 默认换成 satteri 了，但 satteri 只把公式解析成
 * mdast 节点、不负责渲染。要 KaTeX 就得显式用 unified()。
 * 插件从 src/lib/markdown.ts 取，站点渲染与单测跑的是同一组。
 * GFM 由 Astro 侧自带，这里不重复注册 remark-gfm。
 */
export default defineConfig({
  site: 'https://cjblog.github.io',
  markdown: {
    processor: unified({
      remarkPlugins: mathRemarkPlugins,
      rehypePlugins: siteRehypePlugins,
    }),
    shikiConfig: { theme: 'github-light' },
  },
});
