import { describe, expect, it } from 'vitest';
import { deriveExcerpt, MORE_SEPARATOR } from '../../src/lib/excerpt';

describe('deriveExcerpt', () => {
  it('frontmatter 的 summary 优先级最高', () => {
    const markdown = '正文第一段。\n\n<!-- more -->\n\n后面还有。';
    expect(deriveExcerpt(markdown, { summary: '手写的摘要' })).toBe('手写的摘要');
  });

  it('summary 为空白时不算数，回落到正文', () => {
    expect(deriveExcerpt('正文第一段。', { summary: '   ' })).toBe('正文第一段。');
  });

  it('取 <!-- more --> 之前的内容', () => {
    const markdown = `开头这段要显示。\n\n${MORE_SEPARATOR}\n\n后面不显示。`;
    expect(deriveExcerpt(markdown)).toBe('开头这段要显示。');
  });

  it('没有分割标记时回落到第一段正文', () => {
    expect(deriveExcerpt('第一段。\n\n第二段。')).toBe('第一段。');
  });

  it('跳过开头的纯标题块', () => {
    // 标题已经作为文章标题显示，摘要里再来一遍是重复
    expect(deriveExcerpt('## 二级标题\n\n真正的正文在这里。')).toBe('真正的正文在这里。');
  });

  it('连续多个标题块都会被跳过', () => {
    expect(deriveExcerpt('# 一级\n\n## 二级\n\n正文。')).toBe('正文。');
  });

  it('只有标题、没有正文时返回空串', () => {
    expect(deriveExcerpt('## 只有标题')).toBe('');
    expect(deriveExcerpt('')).toBe('');
  });

  it('公式不会污染摘要', () => {
    const markdown = '公式 $E = mc^2$ 出现在这里。\n\n$$\n\\int_0^1 x \\, dx\n$$';
    const excerpt = deriveExcerpt(markdown);
    expect(excerpt).not.toContain('$');
    expect(excerpt).not.toContain('\\int');
    expect(excerpt).not.toContain('katex');
    expect(excerpt).toContain('出现在这里');
  });

  it('整段都是公式的段落不会成为摘要', () => {
    expect(deriveExcerpt('$$\nE = mc^2\n$$\n\n真正的正文。')).toBe('真正的正文。');
  });

  it('HTML 标签不会漏进摘要', () => {
    const excerpt = deriveExcerpt('<div class="note">提示文字</div>\n\n正文在后面。');
    expect(excerpt).toBe('提示文字');
    expect(excerpt).not.toContain('<');
  });

  it('HTML 注释不会被当作正文', () => {
    expect(deriveExcerpt('<!-- 只有注释 -->\n\n真正的正文。')).toBe('真正的正文。');
  });

  it('markdown 语法被剥掉，只留文字', () => {
    const markdown = '**加粗**的[链接](https://example.com)与`代码`。';
    expect(deriveExcerpt(markdown)).toBe('加粗的链接与代码。');
  });

  it('超过长度上限时截断并加省略号', () => {
    const excerpt = deriveExcerpt('啊'.repeat(200), { maxLength: 10 });
    expect(excerpt).toBe(`${'啊'.repeat(10)}…`);
  });

  it('刚好等于上限时不加省略号', () => {
    expect(deriveExcerpt('啊'.repeat(10), { maxLength: 10 })).toBe('啊'.repeat(10));
  });

  it('maxLength 为 0 时返回空串', () => {
    expect(deriveExcerpt('正文。', { maxLength: 0 })).toBe('');
  });

  it('换行与多余空白被压成单个空格', () => {
    expect(deriveExcerpt('第一行\n第二行\n\n第三段。')).toBe('第一行 第二行');
  });
});
