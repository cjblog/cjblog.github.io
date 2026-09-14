import { describe, expect, it } from 'vitest';
import {
  buildToc,
  countTocItems,
  flattenToc,
  shouldShowToc,
  MAX_TOC_DEPTH,
} from '../../src/lib/toc';

const h = (depth: number, text: string, slug = text) => ({ depth, slug, text });

describe('buildToc', () => {
  it('同级标题平铺成兄弟节点', () => {
    const toc = buildToc([h(2, 'A'), h(2, 'B'), h(2, 'C')]);

    expect(toc.map((item) => item.text)).toEqual(['A', 'B', 'C']);
    expect(toc.every((item) => item.children.length === 0)).toBe(true);
  });

  it('浅层标题成为深层的父节点', () => {
    const toc = buildToc([h(2, 'A'), h(3, 'A1'), h(4, 'A1a'), h(3, 'A2'), h(2, 'B')]);

    expect(toc.map((item) => item.text)).toEqual(['A', 'B']);
    expect(toc[0]!.children.map((item) => item.text)).toEqual(['A1', 'A2']);
    expect(toc[0]!.children[0]!.children.map((item) => item.text)).toEqual(['A1a']);
    expect(toc[1]!.children).toEqual([]);
  });

  it('跳级写的标题挂到最近的更浅节点下，不凭空补出一级父节点', () => {
    // h2 之后直接 h4：h4 应该挂在 h2 下，而不是造一个不存在的 h3
    const toc = buildToc([h(2, 'A'), h(4, 'A 的孙子')]);

    expect(toc).toHaveLength(1);
    expect(toc[0]!.children.map((item) => item.text)).toEqual(['A 的孙子']);
  });

  it('以 h3 开头时它自己成为根节点', () => {
    const toc = buildToc([h(3, '开头就是三级'), h(3, '另一个三级')]);

    expect(toc.map((item) => item.text)).toEqual(['开头就是三级', '另一个三级']);
  });

  it('超过最大深度的标题被丢掉', () => {
    const toc = buildToc([h(2, 'A'), h(5, '太深了'), h(6, '更深')]);

    expect(countTocItems(toc)).toBe(1);
  });

  it('恰好第 4 级会被保留', () => {
    const toc = buildToc([h(1, '一级'), h(2, '二级'), h(3, '三级'), h(4, '四级')]);

    expect(countTocItems(toc)).toBe(4);
    expect(MAX_TOC_DEPTH).toBe(4);
  });

  it('可以自定义最大深度', () => {
    expect(countTocItems(buildToc([h(2, 'A'), h(3, 'B')], 2))).toBe(1);
  });

  it('空输入返回空数组', () => {
    expect(buildToc([])).toEqual([]);
  });

  it('保留原始的 slug 与 depth', () => {
    const toc = buildToc([h(2, '中文标题')]);

    expect(toc[0]).toMatchObject({ depth: 2, slug: '中文标题', text: '中文标题' });
  });

  it('不修改传入的数组', () => {
    const input = [h(2, 'A'), h(3, 'B')];
    const snapshot = JSON.stringify(input);

    buildToc(input);

    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('flattenToc', () => {
  it('压平后给出从 1 开始的层级，供缩进使用', () => {
    const links = flattenToc(buildToc([h(2, 'A'), h(3, 'A1'), h(4, 'A1a'), h(2, 'B')]));

    expect(links.map((link) => [link.text, link.level])).toEqual([
      ['A', 1],
      ['A1', 2],
      ['A1a', 3],
      ['B', 1],
    ]);
  });

  it('顺序是深度优先，与阅读顺序一致', () => {
    const links = flattenToc(buildToc([h(2, '第一节'), h(3, '1.1'), h(2, '第二节')]));

    expect(links.map((link) => link.text)).toEqual(['第一节', '1.1', '第二节']);
  });

  it('保留 slug，锚点才能指向正确的标题', () => {
    const links = flattenToc(buildToc([h(2, '带 空格 的标题', '带-空格-的标题')]));

    expect(links[0]!.slug).toBe('带-空格-的标题');
  });

  it('空输入返回空数组', () => {
    expect(flattenToc([])).toEqual([]);
  });
});

describe('countTocItems', () => {
  it('统计所有层级', () => {
    expect(countTocItems(buildToc([h(2, 'A'), h(3, 'A1'), h(4, 'A1a'), h(2, 'B')]))).toBe(4);
  });

  it('空树为 0', () => {
    expect(countTocItems([])).toBe(0);
  });
});

describe('shouldShowToc', () => {
  it('只有一个标题时不显示——一两条不需要目录', () => {
    expect(shouldShowToc([h(2, '只有一个')])).toBe(false);
  });

  it('两个及以上就显示', () => {
    expect(shouldShowToc([h(2, 'A'), h(2, 'B')])).toBe(true);
  });

  it('只有超出深度的标题时不算数', () => {
    expect(shouldShowToc([h(2, 'A'), h(5, '太深')])).toBe(false);
  });

  it('没有标题时不显示', () => {
    expect(shouldShowToc([])).toBe(false);
  });
});
