import matter from 'gray-matter';
import type { z } from 'zod';
import { COLLECTIONS, type CollectionName } from './schema';
import { formatDate, toDate } from './date';

/**
 * 草稿同步的**纯逻辑**：给定草稿文件内容，算出要写哪些文件、有哪些错误。
 * 刻意不碰文件系统，这样它可以被单测直接覆盖；磁盘读写都在 scripts/sync-drafts.ts 里。
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
  collection: CollectionName;
  slug: string;
  /** 归一化后的完整文件内容，写入 src/content/<collection>/<slug>.md */
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

export function planSync(files: readonly DraftFile[]): SyncPlan {
  const entries: SyncedEntry[] = [];
  const errors: SyncError[] = [];
  const seenSlugs = new Map<string, string>();

  for (const file of files) {
    const parsed = parseDraft(file, errors);
    if (!parsed) continue;

    const key = `${parsed.collection}/${parsed.slug}`;
    const duplicate = seenSlugs.get(key);
    if (duplicate !== undefined) {
      errors.push({
        file: file.relativePath,
        reason: `slug「${parsed.slug}」与 ${duplicate} 重复（同一集合内 slug 必须唯一）`,
      });
      continue;
    }
    seenSlugs.set(key, file.relativePath);

    if (parsed.draft) continue;

    entries.push({
      file: file.relativePath,
      collection: parsed.collection,
      slug: parsed.slug,
      output: matter.stringify(parsed.body, parsed.data),
    });
  }

  return { entries, errors };
}

interface ParsedDraft {
  collection: CollectionName;
  slug: string;
  draft: boolean;
  body: string;
  data: Record<string, unknown>;
}

function parseDraft(file: DraftFile, errors: SyncError[]): ParsedDraft | null {
  const collection = resolveCollection(file.relativePath, errors);
  if (!collection) return null;

  const slug = resolveSlug(file.relativePath, errors);
  if (!slug) return null;

  if (collection === 'pages' && RESERVED_PAGE_SLUGS.has(slug)) {
    errors.push({
      file: file.relativePath,
      reason: `「${slug}」是站内已占用的路径，独立页面的文件名不能用它。换一个名字，例如 about-me.md`,
    });
    return null;
  }

  const { data, body } = parseFrontmatter(file, errors);
  if (data === null) return null;

  if (!validate(file, collection, data, errors)) return null;

  const normalized = normalizeData(file, data, errors);
  if (normalized === null) return null;

  return {
    collection,
    slug,
    draft: data.draft === true,
    body,
    data: normalized,
  };
}

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
  collection: CollectionName,
  data: Record<string, unknown>,
  errors: SyncError[],
): boolean {
  // 先给 paid 一个专门的中文提示。schema 的 discriminated union 也拦得住，
  // 但它报的是「判别器取值无效」，对写作者没有指导意义。
  const price = data.price;
  if (
    isRecord(price) &&
    price.type === 'paid' &&
    typeof price.amount !== 'number'
  ) {
    errors.push({
      file: file.relativePath,
      reason: 'price.type 为 paid 时必须提供 amount（数字），例如 amount: 99',
    });
    return false;
  }

  const schema = COLLECTIONS[collection].schema as unknown as z.ZodType;
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
