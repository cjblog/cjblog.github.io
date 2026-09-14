import { describe, expect, it } from 'vitest';
import { renderMarkdown, stripMarkdown } from '../../src/lib/markdown';

/**
 * 这组用例跑的是 src/lib/markdown.ts 里的独立流水线。
 * 站点渲染走 Astro 的 unified() 处理器，插件取自同一组导出
 * （mathRemarkPlugins / katexRehypePlugins），所以这里验证的插件行为
 * 就是站点上跑的那套；页面上的最终效果另由 e2e 兜底。
 */
describe('renderMarkdown 公式', () => {
  it('行内公式渲染成 KaTeX 标记，原文不再出现', () => {
    const html = renderMarkdown('质能方程 $E = mc^2$ 很有名。');
    expect(html).toContain('katex');
    expect(html).not.toContain('$E = mc^2$');
  });

  it('行间公式渲染成 KaTeX 的 display 块', () => {
    const html = renderMarkdown('$$\n\\int_0^1 x \\, dx\n$$');
    expect(html).toContain('katex-display');
  });

  it('公式里的下划线是下标，不会被当成强调语法', () => {
    const html = renderMarkdown('$x_1 + x_2$');
    expect(html).toContain('katex');
    expect(html).not.toContain('<em>');
  });

  it('公式里的星号不会被当成强调语法', () => {
    const html = renderMarkdown('$a * b * c$');
    expect(html).toContain('katex');
    expect(html).not.toContain('<em>');
  });

  it('矩阵等多行公式能正常渲染', () => {
    const html = renderMarkdown('$$\n\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}\n$$');
    expect(html).toContain('katex');
  });

  it('行内代码里的 $ 不会被当成公式', () => {
    const html = renderMarkdown('用 `$x$` 表示变量');
    expect(html).toContain('<code>$x$</code>');
    expect(html).not.toContain('katex');
  });
});

describe('renderMarkdown 其它元素', () => {
  it('保留 GFM 表格结构', () => {
    const html = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>1</td>');
  });

  it('表格的居中对齐被保留', () => {
    const html = renderMarkdown('| a |\n| :-: |\n| 1 |');
    expect(html).toContain('align="center"');
  });

  it('保留图片的路径与 alt', () => {
    const html = renderMarkdown('![架构图](/images/diagram.svg)');
    expect(html).toContain('src="/images/diagram.svg"');
    expect(html).toContain('alt="架构图"');
  });

  it('保留代码块的语言类名，供高亮使用', () => {
    const html = renderMarkdown('```python\nprint(1)\n```');
    expect(html).toContain('language-python');
  });

  it('任务列表渲染成复选框', () => {
    const html = renderMarkdown('- [x] 已完成\n- [ ] 未完成');
    expect(html).toContain('type="checkbox"');
  });

  it('保留标题层级', () => {
    expect(renderMarkdown('## 二级标题')).toContain('<h2');
  });
});

describe('stripMarkdown', () => {
  it('默认丢掉围栏代码块的内容', () => {
    expect(stripMarkdown('文本\n\n```js\nconst a = 1\n```')).toBe('文本');
  });

  it('keepCode 时保留代码内容、只去掉围栏行', () => {
    expect(stripMarkdown('```js\nconst a = 1\n```', { keepCode: true })).toBe('const a = 1');
  });

  it('剥掉链接语法但保留链接文字', () => {
    expect(stripMarkdown('[文字](https://a.com)')).toBe('文字');
  });

  it('剥掉图片语法但保留 alt 文字', () => {
    expect(stripMarkdown('![说明](/a.png)')).toBe('说明');
  });

  it('表格分隔行被丢掉、单元格文字保留', () => {
    expect(stripMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |')).toBe('a b 1 2');
  });

  it('块级标记被剥掉', () => {
    expect(stripMarkdown('## 标题')).toBe('标题');
    expect(stripMarkdown('> 引用')).toBe('引用');
    expect(stripMarkdown('- 列表项')).toBe('列表项');
    expect(stripMarkdown('1. 有序项')).toBe('有序项');
  });

  it('强调与删除线语法被剥掉', () => {
    expect(stripMarkdown('**粗** 与 *斜* 与 ~~删~~')).toBe('粗 与 斜 与 删');
  });

  it('行间公式整段被去掉', () => {
    expect(stripMarkdown('正文。\n\n$$\nE = mc^2\n$$')).toBe('正文。');
  });

  it('带圆括号与方括号的公式写法也能去掉', () => {
    expect(stripMarkdown('前面 \\(a+b\\) 后面')).toBe('前面 后面');
    expect(stripMarkdown('前面 \\[a+b\\] 后面')).toBe('前面 后面');
  });

  it('不会把「售价 $5」这类文本当成公式', () => {
    // 只有一个 $ 或 $ 后紧跟空格，都不构成行内公式
    expect(stripMarkdown('售价 $5 元')).toBe('售价 $5 元');
    expect(stripMarkdown('价格 $ 100')).toBe('价格 $ 100');
  });

  it('HTML 标签与注释被去掉', () => {
    expect(stripMarkdown('<div>提示</div>')).toBe('提示');
    expect(stripMarkdown('文字 <!-- 注释 --> 继续')).toBe('文字 继续');
  });

  it('多余空白被压成单个空格', () => {
    expect(stripMarkdown('第一行\n\n第二行')).toBe('第一行 第二行');
  });
});
