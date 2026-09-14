import { toDate } from './date';

/**
 * 这里的入参刻意采用 Astro `CollectionEntry` 的形状（日期在 `data` 下），
 * 而不是拍平的 `{ date, title }` —— 拍平过的形状看着更顺手，但会掩盖
 * 「页面里拿到的是 entry.data.date」这件事，单测全绿而构建报错。
 */

export interface DatedEntry {
  data: {
    date: string | Date;
    title: string;
  };
}

export interface OrderedEntry {
  data: {
    order: number;
    title: string;
  };
}

/** 中文按拼音排序，保证同一批数据每次构建的顺序完全一致。 */
const collator = new Intl.Collator('zh-Hans-CN');

/**
 * 文章按发布时间倒序（最新在最上）。
 *
 * 同一天的文章用标题做兜底排序——不能依赖文件系统遍历顺序，
 * 否则同样的内容在不同机器上会构建出不同的页面顺序。
 */
export function sortPostsByDateDesc<T extends DatedEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    const diff = toDate(b.data.date).getTime() - toDate(a.data.date).getTime();
    return diff !== 0 ? diff : collator.compare(a.data.title, b.data.title);
  });
}

/** 右栏的置顶文章，同样按时间倒序。 */
export function selectPinnedPosts<T extends DatedEntry & { data: { pinned: boolean } }>(
  entries: readonly T[],
): T[] {
  return sortPostsByDateDesc(entries.filter((entry) => entry.data.pinned));
}

/** 项目按 order 升序（小的靠前），order 相同按标题兜底。 */
export function sortProjects<T extends OrderedEntry>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) => a.data.order - b.data.order || collator.compare(a.data.title, b.data.title),
  );
}
