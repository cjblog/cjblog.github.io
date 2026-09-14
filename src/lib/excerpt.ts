import { stripMarkdown } from './markdown';

/** 正文里手动指定摘要截止位置的分割标记。 */
export const MORE_SEPARATOR = '<!-- more -->';

export const DEFAULT_EXCERPT_LENGTH = 120;

export interface ExcerptOptions {
  /** 截断长度，按字符计（中文一个字算一个字符）。 */
  maxLength?: number;
  /** frontmatter 里显式写的 summary，优先级最高。 */
  summary?: string;
}

/**
 * 推导文章摘要。
 *
 * 优先顺序：frontmatter 的 summary → `<!-- more -->` 之前的内容 → 第一段正文。
 * 结果一定是纯文本：公式、HTML 标签、markdown 语法都不会漏进摘要。
 */
export function deriveExcerpt(markdown: string, options: ExcerptOptions = {}): string {
  const maxLength = options.maxLength ?? DEFAULT_EXCERPT_LENGTH;

  const explicit = options.summary?.trim();
  if (explicit) return truncate(collapse(explicit), maxLength);

  const beforeSeparator = sliceBeforeSeparator(markdown);
  const source = beforeSeparator ?? markdown;

  return truncate(firstProseBlock(source), maxLength);
}

/** 取 `<!-- more -->` 之前的部分；没有该标记时返回 null。 */
function sliceBeforeSeparator(markdown: string): string | null {
  const index = markdown.indexOf(MORE_SEPARATOR);
  return index === -1 ? null : markdown.slice(0, index);
}

/**
 * 取第一段真正的正文。
 * 跳过纯标题块——标题已经作为文章标题显示，摘要里再来一遍是重复。
 */
function firstProseBlock(markdown: string): string {
  for (const block of markdown.split(/\n\s*\n/)) {
    if (isHeadingOnly(block)) continue;
    const text = stripMarkdown(block);
    if (text) return text;
  }
  return '';
}

function isHeadingOnly(block: string): boolean {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 && lines.every((line) => /^#{1,6}\s+/.test(line));
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncate(text: string, maxLength: number): string {
  if (maxLength <= 0) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}
