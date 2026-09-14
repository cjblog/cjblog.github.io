/**
 * 文章目录。
 *
 * 标题数据来自 Astro 的 `render(entry).headings`——那里面的 slug 就是页面里
 * 真实生成的 `id`，直接拿来当锚点一定对得上。不要自己解析 markdown 生成 slug，
 * 那需要复刻 Astro 的 slugger 规则，两边一旦有细微差异锚点就会失效。
 *
 * 这里只做纯数据的整理：按层级建树、按最大深度截断、压平带缩进层级。
 */

export interface TocHeading {
  depth: number;
  slug: string;
  text: string;
}

export interface TocItem extends TocHeading {
  children: TocItem[];
}

/** 需求规定目录最多 4 级标题，更深的不进目录。 */
export const MAX_TOC_DEPTH = 4;

/** 标题少于这个数就不显示目录——一两个标题不需要目录。 */
export const MIN_TOC_HEADINGS = 2;

/**
 * 把扁平的标题列表整理成树。
 *
 * 用栈处理层级关系：遇到更浅或同级的标题就先出栈，直到找到自己的父节点。
 * 这样即使作者跳级写（比如 h2 直接跟 h4），也不会错位——h4 会挂在 h2 下，
 * 而不是凭空补出一个 h3 父节点。
 */
export function buildToc(
  headings: readonly TocHeading[],
  maxDepth: number = MAX_TOC_DEPTH,
): TocItem[] {
  const roots: TocItem[] = [];
  const stack: TocItem[] = [];

  for (const heading of headings) {
    if (heading.depth > maxDepth) continue;

    const item: TocItem = { ...heading, children: [] };

    while (stack.length > 0 && stack[stack.length - 1]!.depth >= item.depth) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent === undefined) {
      roots.push(item);
    } else {
      parent.children.push(item);
    }

    stack.push(item);
  }

  return roots;
}

export interface TocLink extends TocHeading {
  /** 从 1 开始的层级，用来决定缩进 */
  level: number;
}

/** 压平成带层级的一维列表，渲染时不需要递归组件。 */
export function flattenToc(items: readonly TocItem[], level = 1): TocLink[] {
  const links: TocLink[] = [];
  for (const item of items) {
    links.push({ depth: item.depth, slug: item.slug, text: item.text, level });
    links.push(...flattenToc(item.children, level + 1));
  }
  return links;
}

/** 树里的标题总数（含各级子节点）。 */
export function countTocItems(items: readonly TocItem[]): number {
  return items.reduce((total, item) => total + 1 + countTocItems(item.children), 0);
}

/** 目录是否值得展示。 */
export function shouldShowToc(headings: readonly TocHeading[], maxDepth = MAX_TOC_DEPTH): boolean {
  return countTocItems(buildToc(headings, maxDepth)) >= MIN_TOC_HEADINGS;
}
