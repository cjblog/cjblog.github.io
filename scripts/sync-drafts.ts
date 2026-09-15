import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planSync, type DraftFile } from '../src/lib/sync';
import { COLLECTIONS, OUTPUT_DIRS } from '../src/lib/schema';

/**
 * 把 drafts/ 下的 markdown 同步到 src/content/。
 *
 * 这是个瘦 CLI：逻辑全在 src/lib/sync.ts 的 planSync() 里（纯函数、有单测）。
 * 这里只负责读盘、写盘，以及在有错误时**全部打印出来并停下** —— 静默跳过
 * 会让错误一路漏到线上。
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const draftsDir = join(root, 'drafts');
const contentDir = join(root, 'src', 'content');

async function collectDrafts(): Promise<DraftFile[]> {
  if (!existsSync(draftsDir)) return [];

  const files: DraftFile[] = [];
  for (const collection of Object.values(COLLECTIONS)) {
    const dir = join(draftsDir, collection.dir);
    if (!existsSync(dir)) continue;
    for (const path of await walk(dir)) {
      files.push({
        relativePath: relative(draftsDir, path),
        content: await readFile(path, 'utf8'),
      });
    }
  }
  // 排序保证同步顺序稳定，报错顺序也就稳定
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function walk(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walk(path)));
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

async function main(): Promise<void> {
  const drafts = await collectDrafts();
  const { entries, errors } = planSync(drafts);

  if (errors.length > 0) {
    console.error(`\n草稿校验失败，共 ${errors.length} 处问题：\n`);
    for (const error of errors) {
      console.error(`  drafts/${error.file}`);
      console.error(`    ${error.reason}\n`);
    }
    process.exitCode = 1;
    return;
  }

  // 先清空再写入，避免删掉的草稿在 src/content/ 里留下 orphan 页面。
  // 按输出目录去重后清理——书的章 / 节与项目共用 projects/，
  // 直接用集合名当目录名会写出一个内容层根本不会去读的目录。
  for (const dir of new Set(Object.values(OUTPUT_DIRS))) {
    await rm(join(contentDir, dir), { recursive: true, force: true });
  }

  for (const entry of entries) {
    const target = join(contentDir, OUTPUT_DIRS[entry.collection], entry.outputPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, entry.output, 'utf8');
  }

  const count = (collection: string) =>
    entries.filter((entry) => entry.collection === collection).length;
  const chapters = count('bookChapters');
  const suffix = chapters > 0 ? `，书章节 ${chapters} 篇` : '';
  console.log(
    `已同步 ${entries.length} 篇草稿：技术文章 ${count('posts')} 篇，项目 ${count('projects')} 个，独立页面 ${count('pages')} 个${suffix}。`,
  );
}

await main();
