import { describe, expect, it } from 'vitest';
import {
  buildPagination,
  listPagePath,
  PAGE_GAP,
  pageMarkers,
  paginate,
  paginatedPaths,
  totalPages,
  POSTS_PER_PAGE,
  PROJECTS_PER_PAGE,
} from '../../src/lib/pagination';

describe('totalPages', () => {
  it('没有内容时也算 1 页', () => {
    expect(totalPages(0, 5)).toBe(1);
  });

  it('整除与不整除', () => {
    expect(totalPages(10, 5)).toBe(2);
    expect(totalPages(11, 5)).toBe(3);
    expect(totalPages(1, 5)).toBe(1);
  });

  it('perPage 非法时抛错', () => {
    expect(() => totalPages(10, 0)).toThrow(/perPage/);
  });
});

describe('paginate', () => {
  const items = [1, 2, 3, 4, 5, 6, 7];

  it('取第一页', () => {
    expect(paginate(items, 1, 3)).toEqual([1, 2, 3]);
  });

  it('取中间一页', () => {
    expect(paginate(items, 2, 3)).toEqual([4, 5, 6]);
  });

  it('最后一页不足一整页时只给剩下的', () => {
    expect(paginate(items, 3, 3)).toEqual([7]);
  });

  it('越界返回空数组而不是抛错', () => {
    expect(paginate(items, 4, 3)).toEqual([]);
    expect(paginate(items, 0, 3)).toEqual([]);
  });

  it('空列表任何页都是空的', () => {
    expect(paginate([], 1, 5)).toEqual([]);
  });
});

describe('pageMarkers', () => {
  it('页数少时全部列出，没有省略号', () => {
    expect(pageMarkers(1, 3)).toEqual([1, 2, 3]);
    expect(pageMarkers(2, 3)).toEqual([1, 2, 3]);
  });

  it('页数多时折叠中间部分', () => {
    expect(pageMarkers(5, 10)).toEqual([1, PAGE_GAP, 4, 5, 6, PAGE_GAP, 10]);
  });

  it('当前页靠近开头时不折叠前面', () => {
    expect(pageMarkers(1, 10)).toEqual([1, 2, PAGE_GAP, 10]);
    expect(pageMarkers(2, 10)).toEqual([1, 2, 3, PAGE_GAP, 10]);
  });

  it('当前页靠近结尾时不折叠后面', () => {
    expect(pageMarkers(10, 10)).toEqual([1, PAGE_GAP, 9, 10]);
  });

  it('只有一页时就是 [1]', () => {
    expect(pageMarkers(1, 1)).toEqual([1]);
  });

  it('当前页越界时被夹到合法范围', () => {
    expect(pageMarkers(99, 3)).toEqual([1, 2, 3]);
  });
});

describe('listPagePath', () => {
  const options = { firstPageHref: '/#posts', basePath: '/posts/page' };

  it('第 1 页指回首页上的模块', () => {
    expect(listPagePath(1, options)).toBe('/#posts');
  });

  it('第 2 页起用独立路由', () => {
    expect(listPagePath(2, options)).toBe('/posts/page/2/');
    expect(listPagePath(12, options)).toBe('/posts/page/12/');
  });

  it('非法页码抛错', () => {
    expect(() => listPagePath(0, options)).toThrow(/页码/);
    expect(() => listPagePath(1.5, options)).toThrow(/页码/);
  });
});

describe('buildPagination', () => {
  const base = {
    perPage: PROJECTS_PER_PAGE,
    firstPageHref: '/',
    basePath: '/projects/page',
  };

  it('中间页同时有上一页与下一页', () => {
    const pagination = buildPagination({ ...base, current: 2, totalItems: 7 });

    expect(pagination.totalPages).toBe(3);
    expect(pagination.totalItems).toBe(7);
    expect(pagination.prev).toBe('/');
    expect(pagination.next).toBe('/projects/page/3/');
  });

  it('首页没有上一页', () => {
    const pagination = buildPagination({ ...base, current: 1, totalItems: 7 });

    expect(pagination.prev).toBeNull();
    expect(pagination.next).toBe('/projects/page/2/');
  });

  it('最后一页没有下一页', () => {
    const pagination = buildPagination({ ...base, current: 3, totalItems: 7 });

    expect(pagination.next).toBeNull();
    expect(pagination.prev).toBe('/projects/page/2/');
  });

  it('正好一整页时没有下一页', () => {
    const pagination = buildPagination({ ...base, current: 1, totalItems: 3 });

    expect(pagination.totalPages).toBe(1);
    expect(pagination.next).toBeNull();
    expect(pagination.prev).toBeNull();
  });

  it('页码越界时抛错，而不是渲染出一个不存在的页', () => {
    expect(() => buildPagination({ ...base, current: 4, totalItems: 7 })).toThrow(/超出范围/);
  });

  it('没有内容时仍是一页，控件不显示翻页', () => {
    const pagination = buildPagination({ ...base, current: 1, totalItems: 0 });

    expect(pagination.totalPages).toBe(1);
    expect(pagination.items).toEqual([{ kind: 'page', page: 1, href: '/', current: true }]);
    expect(pagination.prev).toBeNull();
    expect(pagination.next).toBeNull();
  });

  it('页码项自带地址，组件不必自己拼 URL', () => {
    const pagination = buildPagination({ ...base, current: 2, totalItems: 7 });

    expect(pagination.items).toEqual([
      { kind: 'page', page: 1, href: '/', current: false },
      { kind: 'page', page: 2, href: '/projects/page/2/', current: true },
      { kind: 'page', page: 3, href: '/projects/page/3/', current: false },
    ]);
  });

  it('页数多时页码项里出现省略号', () => {
    const pagination = buildPagination({
      ...base,
      current: 5,
      totalItems: 30,
      perPage: 3,
    });

    expect(pagination.items.filter((item) => item.kind === 'gap')).toHaveLength(2);
    expect(pagination.totalPages).toBe(10);
  });
});

describe('paginatedPaths', () => {
  it('只产出第 2 页起，第 1 页在首页上', () => {
    const paths = paginatedPaths({ totalItems: 12, perPage: POSTS_PER_PAGE, prefix: 'posts' });

    expect(paths.map((path) => path.params.page)).toEqual(['2', '3']);
    expect(paths.map((path) => path.props.current)).toEqual([2, 3]);
  });

  it('只有一页时不产出任何路径', () => {
    expect(paginatedPaths({ totalItems: 4, perPage: 5, prefix: 'posts' })).toEqual([]);
  });

  it('正好整除时不会多出一个空页', () => {
    const paths = paginatedPaths({ totalItems: 10, perPage: 5, prefix: 'posts' });
    expect(paths.map((path) => path.params.page)).toEqual(['2']);
  });
});

describe('每页条数', () => {
  it('需求规定：文章每页 5 篇，项目每页 3 个', () => {
    expect(POSTS_PER_PAGE).toBe(5);
    expect(PROJECTS_PER_PAGE).toBe(3);
  });
});
