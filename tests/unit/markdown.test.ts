import { describe, expect, it } from 'vitest';
import { createMarkdownProcessor, renderMarkdown, stripMarkdown } from '../../src/lib/markdown';

/**
 * 这组用例跑的是 src/lib/markdown.ts 里的独立流水线。
 * 站点渲染走 Astro 的 unified() 处理器，插件取自同一组导出
 * （mathRemarkPlugins / siteRehypePlugins），所以这里验证的插件行为
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

  it('表格被包进 .table-scroll，窄屏才滚得动而不是撑破页面', () => {
    // global.css 里 .prose .table-scroll 有 overflow-x: auto，
    // 这个类此前从没有代码去加，宽表一直是把页面撑出横向滚动的
    const html = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<div class="table-scroll"><table>');
  });

  it('没有表格时不会凭空多出容器', () => {
    expect(renderMarkdown('只有一段普通文字。')).not.toContain('table-scroll');
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

  it('保留正文里的内联 SVG 示意图与它的容器', () => {
    // 图靠原始 HTML 画，流水线不能把它当危险内容吞掉
    const html = renderMarkdown(
      '<div class="diagram-scroll">\n<svg width="10" height="10"><rect width="10" height="10"/></svg>\n</div>',
    );
    expect(html).toContain('class="diagram-scroll"');
    expect(html).toContain('<svg');
    expect(html).toContain('<rect');
  });
});

describe('内容链接改写', () => {
  const contentRoot = '/repo/src/content';

  /** 带上文件路径走一遍流水线——链接改写要拿到路径才有意义。 */
  function renderFile(value: string, path: string): string {
    return String(createMarkdownProcessor({ contentRoot }).processSync({ value, path }));
  }

  /** 渲染出来的 href 里中文是百分号编码的，比对前先解开，断言才读得懂。 */
  function decodeHrefs(html: string): string {
    return html.replace(/(href|src)="([^"]*)"/g, (_, attr: string, url: string) => {
      try {
        return `${attr}="${decodeURIComponent(url)}"`;
      } catch {
        return `${attr}="${url}"`;
      }
    });
  }

  it('书里相对的 .md 链接被改写成站上地址', () => {
    const html = decodeHrefs(
      renderFile(
        '下一讲：[知识构建（一）](../第2章-知识库构建/03-知识构建一-PDF到205个知识点.md)',
        `${contentRoot}/projects/书/chapters/第1章-项目概述/02-系统总览.md`,
      ),
    );

    // 去掉了 .md、去掉了文件名数字前缀，也补上了 /projects/<书>/ 这一层
    expect(html).toContain('href="/projects/书/第2章-知识库构建/知识构建一-PDF到205个知识点/"');
    expect(html).not.toContain('.md');
  });

  it('没有文件路径时不改写，原文照旧', () => {
    // renderMarkdown 只拿到一段字符串，无从判断相对路径的基准
    const html = decodeHrefs(renderMarkdown('[下一讲](../第2章/03-x.md)'));
    expect(html).toContain('href="../第2章/03-x.md"');
  });

  it('外链与图片不受影响', () => {
    const html = decodeHrefs(
      renderFile('[外链](https://example.com/a.md) ![图](./a.png)', `${contentRoot}/posts/x.md`),
    );

    expect(html).toContain('href="https://example.com/a.md"');
    expect(html).toContain('src="./a.png"');
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

  it('内联 SVG 整块去掉，图里的文字不会漏成正文', () => {
    /*
     * 示意图用内联 SVG 画，图里的 <text> 是坐标轴、刻度和矩阵里的数字，
     * 不是可读的句子。只按「剥掉标签」处理的话它们会全部漏出来，
     * 把字数统计与列表页摘要一起搅乱。
     */
    const md = [
      '正文。',
      '',
      '<div class="diagram-scroll">',
      '<svg width="100" height="20"><text x="1" y="1">QK 打分矩阵</text></svg>',
      '</div>',
    ].join('\n');

    expect(stripMarkdown(md)).toBe('正文。');
  });

  it('SVG 之外的行内 HTML 仍然保留其间的文字', () => {
    // 上一条规则不能宽到把普通行内标签也整块删掉
    expect(stripMarkdown('前面 <span>重点</span> 后面')).toBe('前面 重点 后面');
  });

  it('两张图之间的正文不会被一起吃掉', () => {
    // 删除规则必须严格止于各自的 </svg>，不能贪婪地跨过中间的段落
    const md = '<svg><text>图一</text></svg>\n\n中间的话\n\n<svg><text>图二</text></svg>';
    expect(stripMarkdown(md)).toBe('中间的话');
  });

  it('多余空白被压成单个空格', () => {
    expect(stripMarkdown('第一行\n\n第二行')).toBe('第一行 第二行');
  });
});
