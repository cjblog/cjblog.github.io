import matter from 'gray-matter';
import type { z } from 'zod';
import {
  bookChapterSchema,
  COLLECTIONS,
  OUTPUT_DIRS,
  projectSchema,
  type CollectionName,
  type OutputCollection,
} from './schema';
import { formatDate, toDate } from './date';
import { BOOK_INDEX_FILE, parseBookOutline, type BookSourceFile } from './book';

/**
 * 草稿同步的**纯逻辑**：给定草稿文件内容，算出要写哪些文件、有哪些错误。
 * 刻意不碰文件系统，这样它可以被单测直接覆盖；磁盘读写都在 scripts/sync-drafts.ts 里。
 *
 * 两种形态的项目：
 *   drafts/projects/foo.md           单文件项目
 *   drafts/projects/foo/             一本书
 *     index.md                       书的首页（项目介绍），必须有
 *     01-起步.md                     章
 *     01-起步/01-安装.md             节
 */

export interface DraftFile {
  /** 相对 drafts/ 的路径，如 `posts/hello.md`。报错时用它指认文件。 */
  relativePath: string;
  content: string;
}

export interface SyncError {
  file: string;
  reason: string;
}

export interface SyncedEntry {
  /** 源草稿文件，相对 drafts/ */
  file: string;
  collection: OutputCollection;
  /** 条目标识。文章/项目/页面是文件名；书的章是 `项目/章[/节]` */
  slug: string;
  /** 相对集合输出目录的路径（含 .md），写入 src/content/<collection>/<outputPath> */
  outputPath: string;
  /** 归一化后的完整文件内容 */
  output: string;
}

export interface SyncPlan {
  entries: SyncedEntry[];
  errors: SyncError[];
}

/** 文件名即 slug，要求 ASCII kebab-case，保证 URL 干净可分享。 */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * 独立页面产出到根路径 /<slug>/，下面这些 slug 已被站内其它路由占用，
 * 撞上会生成冲突路由或覆盖不掉的页面，所以在同步阶段就拦下来。
 */
export const RESERVED_PAGE_SLUGS = new Set([
  'index',
  'posts',
  'projects',
  'pages',
  'page',
  'tag',
  'tags',
  'archives',
  'images',
  '404',
]);

/**
 * 文章与项目列表分页用的是 /posts/page/N/ 与 /projects/page/N/，
 * 所以 `page` 不能作为文章或项目的 slug，否则详情页会和分页目录抢地址。
 */
export const RESERVED_LIST_SLUGS = new Set(['page']);

export function planSync(files: readonly DraftFile[]): SyncPlan {
  const entries: SyncedEntry[] = [];
  const errors: SyncError[] = [];
  const seenSlugs = new Map<string, string>();

  // 项目目录下的文件要按「一本书」整体处理，先归拢
  const books = new Map<string, DraftFile[]>();
  const loose: DraftFile[] = [];

  for (const file of files) {
    const segments = file.relativePath.split('/');
    const isBookFile = segments[0] === COLLECTIONS.projects.dir && segments.length > 2;

    if (isBookFile) {
      const dir = segments[1]!;
      const list = books.get(dir);
      if (list === undefined) books.set(dir, [file]);
      else list.push(file);
    } else {
      loose.push(file);
    }
  }

  for (const file of loose) {
    planSingleFile(file, entries, errors, seenSlugs);
  }

  for (const [dir, bookFiles] of [...books].sort(([a], [b]) => a.localeCompare(b))) {
    planBook(dir, bookFiles, entries, errors, seenSlugs);
  }

  return { entries, errors };
}

/* -------------------------------------------------------------------------
   单文件条目：文章、单文件项目、独立页面
   ------------------------------------------------------------------------- */

function planSingleFile(
  file: DraftFile,
  entries: SyncedEntry[],
  errors: SyncError[],
  seenSlugs: Map<string, string>,
): void {
  const collection = resolveCollection(file.relativePath, errors);
  if (!collection) return;

  const slug = resolveSlug(file.relativePath, errors);
  if (!slug) return;

  if (!checkReservedSlug(file.relativePath, collection, slug, errors)) return;

  if (!claimSlug(`${collection}/${slug}`, file.relativePath, seenSlugs, errors)) return;

  const { data, body } = parseFrontmatter(file, errors);
  if (data === null) return;

  if (!validate(file, COLLECTIONS[collection].schema, data, errors)) return;
  if (data.draft === true) return;

  const normalized = normalizeData(file, data, errors);
  if (normalized === null) return;

  entries.push({
    file: file.relativePath,
    collection,
    slug,
    outputPath: `${slug}.md`,
    output: stringify(normalized, body),
  });
}

/* -------------------------------------------------------------------------
   书：drafts/projects/<项目>/…
   ------------------------------------------------------------------------- */

function planBook(
  dir: string,
  files: readonly DraftFile[],
  entries: SyncedEntry[],
  errors: SyncError[],
  seenSlugs: Map<string, string>,
): void {
  const bookRoot = `${COLLECTIONS.projects.dir}/${dir}`;

  if (!SLUG_RE.test(dir)) {
    errors.push({
      file: bookRoot,
      reason: `项目目录名必须是小写字母、数字与连字符组成的 slug，当前是「${dir}」`,
    });
    return;
  }

  if (!checkReservedSlug(bookRoot, 'projects', dir, errors)) return;
  if (!claimSlug(`projects/${dir}`, bookRoot, seenSlugs, errors)) return;

  const indexFile = files.find(
    (file) => file.relativePath === `${bookRoot}/${BOOK_INDEX_FILE}.md`,
  );
  if (indexFile === undefined) {
    errors.push({
      file: bookRoot,
      reason: `书目录里必须有 ${BOOK_INDEX_FILE}.md（书的首页 / 项目介绍）`,
    });
    return;
  }

  // 1. 书的首页 = 项目条目，用项目的 schema
  const parsedIndex = parseFrontmatter(indexFile, errors);
  if (parsedIndex.data === null) return;
  if (!validate(indexFile, projectSchema, parsedIndex.data, errors)) return;

  const indexData = normalizeData(indexFile, parsedIndex.data, errors);
  if (indexData === null) return;

  entries.push({
    file: indexFile.relativePath,
    collection: 'projects',
    slug: dir,
    outputPath: `${dir}/${BOOK_INDEX_FILE}.md`,
    output: stringify(indexData, parsedIndex.body),
  });

  // 2. 章与节
  const chapterFiles = files.filter((file) => file !== indexFile);
  const sources: BookSourceFile[] = [];
  const byRelativePath = new Map<string, DraftFile>();

  for (const file of chapterFiles) {
    // parseBookOutline 要的是相对书根目录的路径
    const relativePath = file.relativePath.slice(bookRoot.length + 1);
    byRelativePath.set(relativePath, file);

    const { data } = parseFrontmatter(file, []);
    const title = typeof data?.title === 'string' ? data.title : undefined;
    sources.push(title === undefined ? { relativePath } : { relativePath, title });
  }

  const { outline, errors: bookErrors } = parseBookOutline(sources);
  for (const error of bookErrors) {
    errors.push({ file: `${bookRoot}/${error.file}`, reason: error.reason });
  }

  /*
   * 3. 逐个校验并产出。
   *    - 条目标识用解析出的 slug（`项目/章` 或 `项目/章/节`），与页面路由同一套；
   *    - 输出路径沿用源文件的相对路径，保留数字前缀，便于人工对照书本目录。
   */
  const targets = outline.chapters.flatMap((chapter) => [
    ...(chapter.hasOwnPage
      ? [{ parts: [chapter.slug], sourcePath: chapter.sourcePath }]
      : []),
    ...chapter.sections.map((section) => ({
      parts: [chapter.slug, section.slug],
      sourcePath: section.sourcePath,
    })),
  ]);

  for (const target of targets) {
    const file = byRelativePath.get(target.sourcePath);
    if (file === undefined) continue;

    const parsed = parseFrontmatter(file, errors);
    if (parsed.data === null) continue;
    if (!validate(file, bookChapterSchema, parsed.data, errors)) continue;

    entries.push({
      file: file.relativePath,
      collection: 'bookChapters',
      slug: `${dir}/${target.parts.join('/')}`,
      outputPath: `${dir}/chapters/${target.sourcePath}`,
      output: stringify(parsed.data, parsed.body),
    });
  }
}

/* -------------------------------------------------------------------------
   公共校验
   ------------------------------------------------------------------------- */

function resolveCollection(relativePath: string, errors: SyncError[]): CollectionName | null {
  const [dir] = relativePath.split('/');

  // 从 COLLECTIONS 推导，新增集合时这里自动跟上，不用再改一遍
  const match = (Object.keys(COLLECTIONS) as CollectionName[]).find(
    (name) => COLLECTIONS[name].dir === dir,
  );
  if (match !== undefined) return match;

  const allowed = (Object.keys(COLLECTIONS) as CollectionName[])
    .map((name) => `drafts/${COLLECTIONS[name].dir}/`)
    .join('、');
  errors.push({
    file: relativePath,
    reason: `不认识的目录「${dir ?? ''}」：草稿必须放在 ${allowed} 下`,
  });
  return null;
}

function resolveSlug(relativePath: string, errors: SyncError[]): string | null {
  const base = relativePath.split('/').pop() ?? '';
  const slug = base.replace(/\.md$/i, '');
  if (!SLUG_RE.test(slug)) {
    errors.push({
      file: relativePath,
      reason: `文件名必须是小写字母、数字与连字符组成的 slug（例如 my-first-post.md），当前是「${slug}」`,
    });
    return null;
  }
  return slug;
}

function checkReservedSlug(
  file: string,
  collection: CollectionName,
  slug: string,
  errors: SyncError[],
): boolean {
  if (collection === 'pages' && RESERVED_PAGE_SLUGS.has(slug)) {
    errors.push({
      file,
      reason: `「${slug}」是站内已占用的路径，独立页面的文件名不能用它。换一个名字，例如 about-me.md`,
    });
    return false;
  }

  if (collection !== 'pages' && RESERVED_LIST_SLUGS.has(slug)) {
    errors.push({
      file,
      reason: `「${slug}」被列表分页占用（/posts/page/N/ 与 /projects/page/N/），${COLLECTIONS[collection].dir} 里不能用它做文件名`,
    });
    return false;
  }

  return true;
}

function claimSlug(
  key: string,
  file: string,
  seenSlugs: Map<string, string>,
  errors: SyncError[],
): boolean {
  const duplicate = seenSlugs.get(key);
  if (duplicate !== undefined) {
    errors.push({
      file,
      reason: `slug「${key.split('/').pop()}」与 ${duplicate} 重复（同一集合内 slug 必须唯一）`,
    });
    return false;
  }
  seenSlugs.set(key, file);
  return true;
}

function parseFrontmatter(
  file: DraftFile,
  errors: SyncError[],
): { data: Record<string, unknown> | null; body: string } {
  try {
    const parsed = matter(file.content);
    return { data: parsed.data as Record<string, unknown>, body: parsed.content };
  } catch (error) {
    errors.push({
      file: file.relativePath,
      reason: `frontmatter 无法解析：${(error as Error).message}`,
    });
    return { data: null, body: '' };
  }
}

function validate(
  file: DraftFile,
  schema: z.ZodType,
  data: Record<string, unknown>,
  errors: SyncError[],
): boolean {
  // 先给 paid 一个专门的中文提示。schema 的 discriminated union 也拦得住，
  // 但它报的是「判别器取值无效」，对写作者没有指导意义。
  const price = data.price;
  if (isRecord(price) && price.type === 'paid' && typeof price.amount !== 'number') {
    errors.push({
      file: file.relativePath,
      reason: 'price.type 为 paid 时必须提供 amount（数字），例如 amount: 99',
    });
    return false;
  }

  const result = schema.safeParse(data);
  if (!result.success) {
    errors.push({ file: file.relativePath, reason: formatIssues(result.error) });
    return false;
  }
  return true;
}

/**
 * 归一化 frontmatter 后再产出：
 * 日期统一成 YYYY-MM-DD（否则 YAML 会把无引号的日期解析成 Date，产物不稳定），
 * draft 字段丢掉（草稿根本不会产出）。
 */
function normalizeData(
  file: DraftFile,
  data: Record<string, unknown>,
  errors: SyncError[],
): Record<string, unknown> | null {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'draft') continue;
    if (key === 'date' || key === 'updated') {
      try {
        normalized[key] = formatDate(toDate(value as string | Date, key));
      } catch (error) {
        errors.push({ file: file.relativePath, reason: (error as Error).message });
        return null;
      }
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

/** 没有 frontmatter 时不要写出空的 `---\n---` 块。 */
function stringify(data: Record<string, unknown>, body: string): string {
  return Object.keys(data).length === 0 ? body : matter.stringify(body, data);
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map(formatIssue).join('；');
}

function formatIssue(issue: z.ZodIssue): string {
  const path = issue.path.join('.');
  const message = translateMessage(issue.message);
  return path ? `${path}：${message}` : message;
}

/**
 * zod 对「必填字段缺失」和「类型不对」给的是英文的 Invalid input / Required，
 * 对中文写作者没有指导意义。这里换成看得懂的说法。
 */
function translateMessage(message: string): string {
  if (message === 'Invalid input' || message === 'Required') {
    return '必填字段缺失，或类型不正确';
  }
  if (message === 'Expected string, received date') {
    return '日期格式不正确';
  }
  return message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
