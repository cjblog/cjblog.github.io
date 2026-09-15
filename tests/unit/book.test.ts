import { describe, expect, it } from 'vitest';
import {
  bookPagePath,
  chapterHref,
  flattenBook,
  parseBookFileName,
  parseBookOutline,
  type BookSourceFile,
} from '../../src/lib/book';

const file = (relativePath: string, title?: string): BookSourceFile =>
  title === undefined ? { relativePath } : { relativePath, title };

describe('parseBookFileName', () => {
  it('拆出数字前缀与名字', () => {
    expect(parseBookFileName('01-起步')).toEqual({ order: [1], name: '起步' });
    expect(parseBookFileName('2_进阶')).toEqual({ order: [2], name: '进阶' });
    expect(parseBookFileName('10 收尾')).toEqual({ order: [10], name: '收尾' });
  });

  it('支持 1.1 这种带小数点的编号', () => {
    expect(parseBookFileName('1.1-安装')).toEqual({ order: [1, 1], name: '安装' });
    expect(parseBookFileName('1.2.3-细节')).toEqual({ order: [1, 2, 3], name: '细节' });
  });

  it('没有数字前缀时 order 为 null', () => {
    expect(parseBookFileName('起步')).toEqual({ order: null, name: '起步' });
  });

  it('只有数字、没有名字时整体当作名字', () => {
    expect(parseBookFileName('01')).toEqual({ order: null, name: '01' });
  });

  it('前缀里的数字按数值而非字符串比较', () => {
    // '9-' 应该排在 '10-' 前面，字符串比较会反过来
    expect(parseBookFileName('9-九').order).toEqual([9]);
    expect(parseBookFileName('10-十').order).toEqual([10]);
  });
});

describe('parseBookOutline 基本结构', () => {
  it('章取根目录的文件名，节取子目录的文件名', () => {
    const { outline, errors } = parseBookOutline([
      file('index.md'),
      file('01-起步.md'),
      file('01-起步/01-安装.md'),
      file('01-起步/02-第一个程序.md'),
      file('02-进阶.md'),
    ]);

    expect(errors).toEqual([]);
    expect(outline.chapters.map((chapter) => chapter.title)).toEqual(['起步', '进阶']);
    expect(outline.chapters[0]!.sections.map((section) => section.title)).toEqual([
      '安装',
      '第一个程序',
    ]);
    expect(outline.chapters[1]!.sections).toEqual([]);
  });

  it('index.md 是书的首页，不进目录', () => {
    const { outline } = parseBookOutline([file('index.md'), file('01-起步.md')]);

    expect(outline.chapters).toHaveLength(1);
    expect(outline.chapters[0]!.slug).toBe('起步');
  });

  it('frontmatter 的 title 优先于文件名', () => {
    const { outline } = parseBookOutline([
      file('01-intro.md', '第一章 绪论'),
      file('01-intro/01-setup.md', '1.1 环境准备'),
    ]);

    // URL 段仍取文件名，显示名取 frontmatter
    expect(outline.chapters[0]!.title).toBe('第一章 绪论');
    expect(outline.chapters[0]!.slug).toBe('intro');
    expect(outline.chapters[0]!.sections[0]!.title).toBe('1.1 环境准备');
    expect(outline.chapters[0]!.sections[0]!.slug).toBe('setup');
  });

  it('章记下自己有没有正文页', () => {
    const { outline } = parseBookOutline([
      file('01-起步.md'),
      file('01-起步/01-安装.md'),
      file('02-只有目录/01-某节.md'),
    ]);

    expect(outline.chapters[0]!.hasOwnPage).toBe(true);
    expect(outline.chapters[1]!.hasOwnPage).toBe(false);
    expect(outline.chapters[1]!.title).toBe('只有目录');
  });

  it('空清单得到空目录', () => {
    expect(parseBookOutline([]).outline.chapters).toEqual([]);
  });
});

describe('parseBookOutline 排序', () => {
  it('按数字前缀排序，而不是按传入顺序', () => {
    const { outline } = parseBookOutline([
      file('03-第三.md'),
      file('01-第一.md'),
      file('02-第二.md'),
    ]);

    expect(outline.chapters.map((chapter) => chapter.title)).toEqual(['第一', '第二', '第三']);
  });

  it('数字按数值比较，9 在 10 前面', () => {
    const { outline } = parseBookOutline([file('10-十.md'), file('9-九.md')]);

    expect(outline.chapters.map((chapter) => chapter.title)).toEqual(['九', '十']);
  });

  it('带前缀的排在没前缀的前面', () => {
    const { outline } = parseBookOutline([file('前言.md'), file('01-第一.md'), file('附录.md')]);

    expect(outline.chapters[0]!.title).toBe('第一');

    // 剩下两个按拼音排（附 fù 在 前 qián 之前），关键是顺序与传入顺序无关
    const reversed = parseBookOutline([file('附录.md'), file('前言.md'), file('01-第一.md')])
      .outline;
    expect(outline.chapters.map((chapter) => chapter.title)).toEqual(
      reversed.chapters.map((chapter) => chapter.title),
    );
  });

  it('都没前缀时按名字排，顺序确定', () => {
    const forward = parseBookOutline([file('甲.md'), file('乙.md')]).outline;
    const backward = parseBookOutline([file('乙.md'), file('甲.md')]).outline;

    expect(forward.chapters.map((c) => c.title)).toEqual(backward.chapters.map((c) => c.title));
  });

  it('节也按同样规则排序', () => {
    const { outline } = parseBookOutline([
      file('01-起步.md'),
      file('01-起步/1.2-第二节.md'),
      file('01-起步/1.1-第一节.md'),
      file('01-起步/1.10-第十节.md'),
    ]);

    expect(outline.chapters[0]!.sections.map((section) => section.title)).toEqual([
      '第一节',
      '第二节',
      '第十节',
    ]);
  });

  it('1-xx 排在 1.1-yy 前面', () => {
    const { outline } = parseBookOutline([
      file('01-起步.md'),
      file('01-起步/1.1-子节.md'),
      file('01-起步/1-节.md'),
    ]);

    expect(outline.chapters[0]!.sections.map((section) => section.title)).toEqual(['节', '子节']);
  });
});

describe('parseBookOutline 报错', () => {
  it('超过两级时报错并指出文件', () => {
    const { outline, errors } = parseBookOutline([
      file('01-起步.md'),
      file('01-起步/01-安装/01-太深.md'),
    ]);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.file).toBe('01-起步/01-安装/01-太深.md');
    expect(errors[0]!.reason).toContain('最多两级');
    expect(outline.chapters[0]!.sections).toEqual([]);
  });

  it('去掉前缀后章名重复时报错', () => {
    const { errors } = parseBookOutline([file('01-起步.md'), file('02-起步.md')]);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.file).toBe('02-起步.md');
    expect(errors[0]!.reason).toContain('重复');
  });

  it('同一章里节名重复时报错', () => {
    const { errors } = parseBookOutline([
      file('01-起步.md'),
      file('01-起步/01-安装.md'),
      file('01-起步/02-安装.md'),
    ]);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.file).toBe('01-起步/02-安装.md');
    expect(errors[0]!.reason).toContain('安装');
  });

  it('不同章里节名相同不算冲突', () => {
    const { errors } = parseBookOutline([
      file('01-起步.md'),
      file('01-起步/01-安装.md'),
      file('02-进阶.md'),
      file('02-进阶/01-安装.md'),
    ]);

    expect(errors).toEqual([]);
  });

  it('多个问题一次性全部报出', () => {
    const { errors } = parseBookOutline([
      file('01-甲.md'),
      file('02-甲.md'),
      file('01-甲/01-安装/01-太深.md'),
    ]);

    expect(errors).toHaveLength(2);
  });

  it('出错时其余章节照常解析', () => {
    const { outline } = parseBookOutline([file('01-甲.md'), file('02-甲.md'), file('03-乙.md')]);

    expect(outline.chapters.map((chapter) => chapter.title)).toEqual(['甲', '乙']);
  });
});

describe('bookPagePath', () => {
  it('没有层级时就是项目落地页', () => {
    expect(bookPagePath('my-book')).toBe('/projects/my-book/');
    expect(bookPagePath('my-book', [])).toBe('/projects/my-book/');
  });

  it('章与节的地址', () => {
    expect(bookPagePath('my-book', ['起步'])).toBe('/projects/my-book/起步/');
    expect(bookPagePath('my-book', ['起步', '安装'])).toBe('/projects/my-book/起步/安装/');
  });
});

describe('chapterHref', () => {
  it('章有正文页时指向自己', () => {
    const { outline } = parseBookOutline([file('01-起步.md'), file('01-起步/01-安装.md')]);

    expect(chapterHref('my-book', outline.chapters[0]!)).toBe('/projects/my-book/起步/');
  });

  it('章只有子目录时指向第一节', () => {
    const { outline } = parseBookOutline([file('01-起步/01-安装.md')]);

    expect(chapterHref('my-book', outline.chapters[0]!)).toBe('/projects/my-book/起步/安装/');
  });

  it('章既没有正文页也没有节时返回 null', () => {
    const chapter = { slug: '空', title: '空', order: null, hasOwnPage: false, sections: [] };

    expect(chapterHref('my-book', chapter)).toBeNull();
  });
});

describe('flattenBook', () => {
  it('按阅读顺序给出章与节，供导航高亮使用', () => {
    const { outline } = parseBookOutline([
      file('01-起步.md'),
      file('01-起步/01-安装.md'),
      file('02-进阶.md'),
    ]);

    const items = flattenBook(outline);

    expect(items.map((item) => item.section?.title ?? item.chapter.title)).toEqual([
      '起步',
      '安装',
      '进阶',
    ]);
    expect(items[1]!.chapter.title).toBe('起步');
    expect(items[1]!.section!.chapterSlug).toBe('起步');
  });
});
