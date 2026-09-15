/**
 * 「项目 = 一本书」的目录解析。
 *
 * 约定（作者在 drafts/projects/<项目>/ 下的写法）：
 *
 *   my-book/
 *     index.md            书的首页（项目介绍），不算章节
 *     01-起步.md          第一章，章名取文件名去掉数字前缀
 *     01-起步/
 *       01-安装.md        1.1 节
 *       02-第一个程序.md   1.2 节
 *     02-进阶.md
 *
 * 两条规则：**最多两级**，**顺序由文件名前面的数字决定**。
 *
 * 这里是纯函数：输入文件清单，输出目录树与错误清单，不碰文件系统。
 */

export interface BookSourceFile {
  /** 相对书根目录的路径，如 `01-起步.md`、`01-起步/01-安装.md`、`index.md` */
  relativePath: string;
  /** frontmatter 里的 title；缺省时显示名用文件名 */
  title?: string;
}

export interface BookError {
  file: string;
  reason: string;
}

export interface BookNode {
  /** URL 段：文件名去掉数字前缀，如 `起步` */
  slug: string;
  /** 显示名：frontmatter title 优先，否则用去掉前缀的文件名 */
  title: string;
  /** 数字前缀解析出的序号，用来排序；没有前缀时为 null */
  order: number[] | null;
  /**
   * 源文件相对书根目录的路径，如 `01-起步.md`。
   * 带上它是为了让调用方不必再用 slug 反查文件——那既绕又容易在
   * 重名、大小写这类边界上出错。
   */
  sourcePath: string;
}

export interface BookSection extends BookNode {
  /** 所属章的 slug */
  chapterSlug: string;
}

export interface BookChapter extends BookNode {
  /** 章自身的正文页。只有子目录、没有同名章文件时为 false，点击时进它的第一节 */
  hasOwnPage: boolean;
  sections: BookSection[];
}

export interface BookOutline {
  chapters: BookChapter[];
}

export interface ParsedBook {
  outline: BookOutline;
  errors: BookError[];
}

/** 书首页的文件名，不进目录 */
export const BOOK_INDEX_FILE = 'index';

/** 目录最多两级：章 + 节 */
export const MAX_BOOK_DEPTH = 2;

const collator = new Intl.Collator('zh-Hans-CN');

/**
 * 拆出文件名前面的数字前缀。
 * 支持 `01-起步`、`1-起步`、`1.1-安装`、`2_进阶` 这几种写法；
 * 没有前缀时 order 为 null，排在所有带前缀的之后。
 */
export function parseBookFileName(baseName: string): { order: number[] | null; name: string } {
  const match = /^(\d+(?:[.\-_]\d+)*)[\s\-_.]+(.+)$/.exec(baseName);
  if (!match) return { order: null, name: baseName };

  const [, rawOrder, name] = match;
  const order = rawOrder!.split(/[.\-_]/).map((part) => Number(part));
  return { order, name: name!.trim() };
}

/** 数字前缀先按位比较，再按名字。没前缀的排在带前缀的之后。 */
function compareNodes(a: BookNode, b: BookNode): number {
  if (a.order !== null && b.order !== null) {
    const length = Math.max(a.order.length, b.order.length);
    for (let index = 0; index < length; index += 1) {
      // 缺位视作 -1：`1-xx` 排在 `1.1-yy` 前面
      const left = a.order[index] ?? -1;
      const right = b.order[index] ?? -1;
      if (left !== right) return left - right;
    }
  } else if (a.order !== null) {
    return -1;
  } else if (b.order !== null) {
    return 1;
  }
  return collator.compare(a.title, b.title);
}

export function parseBookOutline(files: readonly BookSourceFile[]): ParsedBook {
  const errors: BookError[] = [];
  const chapterMap = new Map<string, BookChapter>();
  const seenChapterSlugs = new Map<string, string>();

  // 先按路径深度归位，再统一排序，免得依赖文件系统的遍历顺序
  const chapterFiles: BookSourceFile[] = [];
  const sectionFiles: { chapterDir: string; file: BookSourceFile }[] = [];

  for (const file of files) {
    const segments = file.relativePath.replace(/\.md$/i, '').split('/');
    const baseName = segments[segments.length - 1] ?? '';

    // 书的首页不是章节
    if (segments.length === 1 && baseName === BOOK_INDEX_FILE) continue;

    if (segments.length > MAX_BOOK_DEPTH) {
      errors.push({
        file: file.relativePath,
        reason: `书的目录最多两级（章 / 节），这个文件在第 ${segments.length} 级`,
      });
      continue;
    }

    if (segments.length === 1) {
      chapterFiles.push(file);
    } else {
      sectionFiles.push({ chapterDir: segments[0]!, file });
    }
  }

  const makeNode = (file: BookSourceFile, baseName: string): BookNode => {
    const { order, name } = parseBookFileName(baseName);
    return {
      slug: name,
      title: file.title?.trim() || name,
      order,
      sourcePath: file.relativePath,
    };
  };

  for (const file of chapterFiles) {
    const baseName = file.relativePath.replace(/\.md$/i, '');
    const node = makeNode(file, baseName);

    const duplicate = seenChapterSlugs.get(node.slug);
    if (duplicate !== undefined) {
      errors.push({
        file: file.relativePath,
        reason: `章名「${node.slug}」与 ${duplicate} 重复（去掉数字前缀后必须唯一）`,
      });
      continue;
    }
    seenChapterSlugs.set(node.slug, file.relativePath);

    chapterMap.set(node.slug, { ...node, hasOwnPage: true, sections: [] });
  }

  const seenSectionSlugs = new Map<string, string>();

  for (const { chapterDir, file } of sectionFiles) {
    const chapterName = parseBookFileName(chapterDir).name;
    const fileName = file.relativePath.split('/').pop()!.replace(/\.md$/i, '');
    const node = makeNode(file, fileName);

    const key = `${chapterName}/${node.slug}`;
    const duplicate = seenSectionSlugs.get(key);
    if (duplicate !== undefined) {
      errors.push({
        file: file.relativePath,
        reason: `节名「${node.slug}」在《${chapterName}》里与 ${duplicate} 重复`,
      });
      continue;
    }
    seenSectionSlugs.set(key, file.relativePath);

    // 只有子目录、没有同名章文件时，在这里把章补出来（hasOwnPage 为 false）
    let chapter = chapterMap.get(chapterName);
    if (chapter === undefined) {
      const { order } = parseBookFileName(chapterDir);
      chapter = {
        slug: chapterName,
        title: chapterName,
        order,
        // 章没有自己的文件，指向目录本身
        sourcePath: chapterDir,
        hasOwnPage: false,
        sections: [],
      };
      chapterMap.set(chapterName, chapter);
    }

    chapter.sections.push({ ...node, chapterSlug: chapterName });
  }

  const chapters = [...chapterMap.values()].sort(compareNodes);
  for (const chapter of chapters) {
    chapter.sections.sort(compareNodes);
  }

  return { outline: { chapters }, errors };
}

/**
 * 从内容集合的条目重建书的输入清单。
 *
 * 条目 id 形如 `<项目>/01-起步` 或 `<项目>/01-起步/01-安装`（content.config.ts 的
 * generateId 去掉了中间的 chapters/），加回 .md 就是源文件相对路径。
 * 这样页面侧不必再自己拼路径，也保证与 sync 用的是同一套还原规则。
 */
export function bookSourcesFromEntries(
  projectSlug: string,
  entries: readonly { id: string; data: { title?: string | undefined } }[],
): BookSourceFile[] {
  const prefix = `${projectSlug}/`;
  return entries
    .filter((entry) => entry.id.startsWith(prefix))
    .map((entry) => {
      const relativePath = `${entry.id.slice(prefix.length)}.md`;
      const title = entry.data.title;
      return title === undefined ? { relativePath } : { relativePath, title };
    });
}

/**
 * 内容集合条目的 id → 源文件相对书根的路径（bookSourcesFromEntries 的逆运算）。
 *
 * 注意条目 id 里**保留了数字前缀**（`<项目>/01-入门`），而目录里的 slug 是
 * 去掉前缀的（`入门`）。两者不要混用——按 slug 去查条目会全部查不到，
 * 表现为章节一个页面都不生成。
 */
export function bookSourcePathFromId(projectSlug: string, id: string): string {
  return `${id.slice(projectSlug.length + 1)}.md`;
}

/** 书内页面的地址。parts 为空时就是项目落地页。 */
export function bookPagePath(projectSlug: string, parts: readonly string[] = []): string {
  const suffix = parts.length > 0 ? `${parts.join('/')}/` : '';
  return `/projects/${projectSlug}/${suffix}`;
}

/** 章在目录里指向哪里：有正文页就指自己，否则指第一节。 */
export function chapterHref(projectSlug: string, chapter: BookChapter): string | null {
  if (chapter.hasOwnPage) return bookPagePath(projectSlug, [chapter.slug]);
  const first = chapter.sections[0];
  return first ? bookPagePath(projectSlug, [chapter.slug, first.slug]) : null;
}

/** 目录里所有可点的项，用来判断当前高亮在哪一项。 */
export function flattenBook(outline: BookOutline): { chapter: BookChapter; section?: BookSection }[] {
  return outline.chapters.flatMap((chapter) => [
    { chapter },
    ...chapter.sections.map((section) => ({ chapter, section })),
  ]);
}
