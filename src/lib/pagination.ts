/**
 * 列表分页。纯函数——URL 由调用方给出，不依赖任何路由知识，因此可以单测。
 *
 * 关于第 1 页的地址：首页同时装着两个模块的第 1 页（`/` 与 `/#posts`），
 * 第 2 页起才是独立路由（`/projects/page/2/`、`/posts/page/2/`）。
 * 所以「第 1 页」与「其余页」的地址规则不同，这个差异由 firstPageHref 参数表达。
 */

export const POSTS_PER_PAGE = 5;
export const PROJECTS_PER_PAGE = 3;

/** 页码序列里的一项：要么是一个可点的页码，要么是省略号。 */
export type PageItem =
  | { kind: 'gap' }
  | { kind: 'page'; page: number; href: string; current: boolean };

/** 页码序列里的省略号占位 */
export const PAGE_GAP = 'gap';
export type PageMarker = number | typeof PAGE_GAP;

export interface Pagination {
  current: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
  prev: string | null;
  next: string | null;
  /** 带地址的页码序列，组件直接用，不必自己拼 URL */
  items: PageItem[];
}

export interface ListPathOptions {
  /** 第 1 页的地址。首页上的模块，如 '/' 或 '/#posts' */
  firstPageHref: string;
  /** 第 2 页起的地址前缀（结尾不带斜杠），如 '/projects/page' */
  basePath: string;
}

/** 取某页的地址。第 1 页回落到 firstPageHref，其余走 basePath/N/。 */
export function listPagePath(page: number, options: ListPathOptions): string {
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`页码必须是不小于 1 的整数，收到 ${page}`);
  }
  return page === 1 ? options.firstPageHref : `${options.basePath}/${page}/`;
}

/** 总页数。没有内容时是 1（首页仍要渲染成一个空列表，而不是不存在）。 */
export function totalPages(itemCount: number, perPage: number): number {
  if (perPage < 1) throw new Error('perPage 必须是不小于 1 的整数');
  if (itemCount <= 0) return 1;
  return Math.ceil(itemCount / perPage);
}

/** 取某一页的内容。页码越界时返回空数组，由调用方决定怎么处理。 */
export function paginate<T>(items: readonly T[], page: number, perPage: number): T[] {
  if (perPage < 1) throw new Error('perPage 必须是不小于 1 的整数');
  if (!Number.isInteger(page) || page < 1) return [];
  const start = (page - 1) * perPage;
  return items.slice(start, start + perPage);
}

/**
 * 页码序列，两端超出窗口的部分用省略号折叠。
 * 例如 current=5, total=10, window=1 → [1, 'gap', 4, 5, 6, 'gap', 10]
 */
export function pageMarkers(current: number, pages: number, window = 1): PageMarker[] {
  const total = Math.max(1, pages);
  const clamped = Math.min(Math.max(1, current), total);

  const wanted = new Set<number>([1, total]);
  for (let offset = -window; offset <= window; offset += 1) {
    const page = clamped + offset;
    if (page >= 1 && page <= total) wanted.add(page);
  }

  const sorted = [...wanted].sort((a, b) => a - b);
  const markers: PageMarker[] = [];
  let previous = 0;
  for (const page of sorted) {
    // 相邻页码之间隔了不止一个数，说明中间被折叠了
    if (previous !== 0 && page - previous > 1) markers.push(PAGE_GAP);
    markers.push(page);
    previous = page;
  }
  return markers;
}

/** 一次算好分页控件需要的全部信息。 */
export function buildPagination(options: {
  current: number;
  totalItems: number;
  perPage: number;
  firstPageHref: string;
  basePath: string;
  window?: number;
}): Pagination {
  const { current, totalItems, perPage, firstPageHref, basePath } = options;
  const pages = totalPages(totalItems, perPage);

  if (!Number.isInteger(current) || current < 1 || current > pages) {
    throw new Error(`页码 ${current} 超出范围（共 ${pages} 页）`);
  }

  const pathFor = (page: number) => listPagePath(page, { firstPageHref, basePath });

  const items: PageItem[] = pageMarkers(current, pages, options.window ?? 1).map((marker) =>
    marker === PAGE_GAP
      ? { kind: 'gap' }
      : { kind: 'page', page: marker, href: pathFor(marker), current: marker === current },
  );

  return {
    current,
    totalPages: pages,
    totalItems,
    perPage,
    prev: current > 1 ? pathFor(current - 1) : null,
    next: current < pages ? pathFor(current + 1) : null,
    items,
  };
}

/** 生成第 2 页起的所有静态路径，供 Astro 的 getStaticPaths 使用。 */
export function paginatedPaths(options: {
  totalItems: number;
  perPage: number;
  prefix: string;
}): { params: { page: string }; props: { current: number } }[] {
  const pages = totalPages(options.totalItems, options.perPage);
  const paths = [];
  // 第 1 页在首页上，这里只产出第 2 页起的
  for (let page = 2; page <= pages; page += 1) {
    paths.push({
      params: { page: String(page) },
      props: { current: page },
    });
  }
  return paths;
}
