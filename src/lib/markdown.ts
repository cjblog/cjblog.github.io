import { fileURLToPath } from 'node:url';
import { relative, resolve } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import { rewriteContentLink } from './links';

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

interface MdastNode {
  type: string;
  url?: string;
  children?: MdastNode[];
}

export interface ContentLinkOptions {
  /** 内容根的绝对路径。默认按本模块的位置推导出 `src/content`。 */
  contentRoot?: string;
}

/** `src/lib/markdown.ts` → `../content` = `src/content`。 */
const DEFAULT_CONTENT_ROOT = fileURLToPath(new URL('../content', import.meta.url));

/**
 * 把正文里相对的 `.md` 链接改写成站上地址。
 *
 * 书的源文件里写的是这种 Obsidian 风格的链接：
 *
 *     [知识构建（一）](../第2章-知识库构建/03-知识构建一-PDF到205个知识点.md)
 *
 * 在编辑器与 GitHub 上点得开，直接搬到站上却是 404——站上要去掉 `.md`、再去掉
 * 文件名的数字前缀，还得补上 `/projects/<书>/` 这一层。让人手写站上地址的话，
 * 这三条规则每加一节都要重算一遍，且算错了不会有人报错。
 *
 * 映射规则都在 `links.ts` 的 `contentPathToUrl` 里，这里只负责遍历 mdast 的
 * link 节点喂给它。**解析不出已知形状的链接原样留着**，由 e2e 那条
 * 「正文里的站内链接都能打开」把它抓出来——改写器不该替作者猜地址。
 *
 * 只处理 link，不碰 image：图片的本地路径有 Astro 自己的处理流程。
 *
 * ⚠️ 挂到 astro.config.mjs 时**必须当裸函数传**（`remarkPlugins: [remarkRewriteContentLinks]`），
 * 不能用 `[plugin, options]` 元组形式：元组在 Astro 的配置传递里会被静默丢掉，
 * 插件根本不执行，而构建照常成功、页面上一条链接都没改。内容根因此用模块位置推导，
 * 单测要改的话直接调用 `remarkRewriteContentLinks({ contentRoot })` 拿 attacher。
 */
export function remarkRewriteContentLinks(options: ContentLinkOptions = {}) {
  return (tree: MdastNode, file: { path?: string }): void => {
    const sourceRelativePath = toContentRelativePath(file?.path, options.contentRoot ?? DEFAULT_CONTENT_ROOT);
    if (!sourceRelativePath) return;

    rewriteLinks(tree, sourceRelativePath);
  };
}

function rewriteLinks(node: MdastNode, sourceRelativePath: string): void {
  if (node.type === 'link' && typeof node.url === 'string') {
    const rewritten = rewriteContentLink(node.url, sourceRelativePath);
    if (rewritten) node.url = rewritten;
  }

  for (const child of node.children ?? []) {
    rewriteLinks(child, sourceRelativePath);
  }
}

/**
 * vfile 的路径 → 内容根相对路径。不在内容根下（编辑器内联渲染这类场景没有
 * 真实文件路径）时返回 null，插件就此跳过，不影响原文。
 */
function toContentRelativePath(rawPath: string | undefined, contentRoot: string): string | null {
  if (!rawPath) return null;

  let filePath: string;
  try {
    filePath = rawPath.startsWith('file:') ? fileURLToPath(rawPath) : rawPath;
  } catch {
    return null;
  }

  const relativePath = relative(resolve(contentRoot), resolve(filePath));
  // `../` 开头说明压根不在内容根下
  if (!relativePath || relativePath.startsWith('..')) return null;

  // Windows 上 path.relative 给的是反斜杠，而内容路径一律按 `/` 处理
  return relativePath.split('\\').join('/');
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

export function createMarkdownProcessor(options: ContentLinkOptions = {}) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    // 与站点同一条流水线：正文里的相对 `.md` 链接照改不误。
    // 没有文件路径的调用（renderMarkdown 这类只有一段字符串的）插件会自动跳过。
    .use(remarkRewriteContentLinks, options)
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

  // HTML 注释（含 <!-- more -->）
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');

  // 内联 SVG 整块丢掉，必须赶在「去标签」之前——否则只剩标签被剥掉，
  // 图里的 <text> 全都漏成正文：刻度、坐标轴标签、矩阵里的数字都会混进
  // 字数统计与摘要。它们是为看图服务的碎片，不是可读的句子。
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');

  // 其余 HTML 标签：剥掉标签本身，保留其间的文字（`<div>提示</div>` → `提示`）
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
