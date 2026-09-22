import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';

/**
 * Markdown → HTML 的唯一流水线。
 *
 * 公式走 remark-math + rehype-katex，在**构建期**渲染成 KaTeX 标记，
 * 浏览器端只需要 KaTeX 的 CSS，不需要跑它的 JS（否则公式会先闪一下未渲染的原文）。
 *
 * 插件数组被 astro.config.mjs 复用，保证站点渲染与单测跑的是同一条流水线。
 */

/** 数学相关插件单独导出：Astro 的 unified() 处理器自带 GFM，
    再从这边塞一份 remark-gfm 会重复注册，所以它只取这两个。 */
export const mathRemarkPlugins = [remarkMath];
export const katexRehypePlugins = [rehypeKatex];

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** 递归地把 <table> 外面包一层容器，表格内部不再往下包。 */
function wrapTables(node: HastNode): void {
  if (!node.children) return;

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (!child) continue;

    if (child.type === 'element' && child.tagName === 'table') {
      node.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['table-scroll'] },
        children: [child],
      };
    } else {
      wrapTables(child);
    }
  }
}

/**
 * 把正文里的 <table> 包进 <div class="table-scroll">。
 *
 * global.css 里 `.prose .table-scroll { overflow-x: auto }` 一直在，但**从来
 * 没有代码加过这个类**——也就是说那句「宽表在窄屏上横向滚动，而不是把页面撑破」
 * 一直是句空话。实测：一个四列表中文字格在 390px 视口下把页面撑出 149px 横向滚动。
 */
export function rehypeWrapTables() {
  return (tree: HastNode): void => {
    wrapTables(tree);
  };
}

export const tableRehypePlugins = [rehypeWrapTables];

/** Astro 侧（astro.config.mjs）用的 rehype 表。
 *  与下面的独立流水线共用同一组，避免站点渲染与单测悄悄跑出两套行为。 */
export const siteRehypePlugins = [...katexRehypePlugins, ...tableRehypePlugins];

/** 独立流水线用的完整插件表（本站点的单测跑的就是它）。 */
export const remarkPlugins = [remarkGfm, ...mathRemarkPlugins];
export const rehypePlugins = [...siteRehypePlugins];

export function createMarkdownProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeKatex)
    .use(rehypeWrapTables)
    .use(rehypeStringify, { allowDangerousHtml: true });
}

/** 把 markdown 渲染成 HTML 字符串。 */
export function renderMarkdown(markdown: string): string {
  return String(createMarkdownProcessor().processSync(markdown));
}

export interface StripMarkdownOptions {
  /**
   * 是否保留围栏代码块的内容。
   * 字数统计要保留（代码也是文章的一部分），摘要不要（代码块出现在摘要里没有意义）。
   */
  keepCode?: boolean;
}

/**
 * 去掉 markdown 语法，得到纯文本。
 * 字数统计与摘要推导都基于它，避免两处各写一套正则而逐渐走偏。
 */
export function stripMarkdown(markdown: string, options: StripMarkdownOptions = {}): string {
  const { keepCode = false } = options;

  let text = markdown;

  // 围栏代码块：不要就整块删掉，要就只删围栏行、保留内容
  text = keepCode
    ? text.replace(/^\s*```[^\n]*$/gm, '')
    : text.replace(/```[\s\S]*?```/g, ' ');

  // 行间公式先处理，否则 $$ 会被后面的行内公式规则切碎
  text = text.replace(/\$\$[\s\S]*?\$\$/g, ' ');
  // 行内公式：$ 紧邻非空白内容才算公式，避免把「售价 $5」这类文本误判
  text = text.replace(/\$(?!\s)[^$\n]*?(?<!\s)\$/g, ' ');
  // \(...\) 与 \[...\] 形式的公式
  text = text.replace(/\\\[[\s\S]*?\\\]/g, ' ').replace(/\\\([\s\S]*?\\\)/g, ' ');

  // HTML 注释（含 <!-- more -->）与标签
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  text = text.replace(/<[^>]+>/g, ' ');

  // 图片保留 alt 文本，链接保留链接文字
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // 引用式链接 [text][ref] 与 [ref] 定义行
  text = text.replace(/^\[[^\]]+\]:\s+\S+$/gm, ' ');
  text = text.replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1');

  // 行内代码的反引号，内容保留
  text = text.replace(/`+/g, '');

  // 表格：分隔行整行丢掉，单元格竖线换成空格
  text = text.replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, ' ');
  text = text.replace(/^\s*\|/gm, ' ').replace(/\|\s*$/gm, ' ').replace(/\|/g, ' ');

  // 块级标记：标题、引用、列表、水平线
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  text = text.replace(/^\s{0,3}>\s?/gm, '');
  text = text.replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/gm, '');
  text = text.replace(/^\s{0,3}(?:[-*_])\s*(?:[-*_]\s*){2,}$/gm, ' ');

  // 强调与删除线
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');
  text = text.replace(/~~(.*?)~~/g, '$1');

  return text.replace(/\s+/g, ' ').trim();
}
