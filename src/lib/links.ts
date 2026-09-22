/**
 * 正文里的站内引用解析。
 *
 * 文章之间互相引用时，链接写错、目标 slug 改名、锚点写错，**都不会让构建失败**
 * ——页面上只留一个 404，或者一个跳过去但停在页首的死锚点。这类错误没有别的
 * 办法发现，只能在真实浏览器里把每条站内引用都走一遍。
 *
 * 这里只做纯解析：href + 当前页路径 → 站内目标。去不去请求由调用方（e2e）决定。
 * 这样「哪种写法算站内、锚点怎么解码」这套规则可以单测，不用起浏览器。
 */

import { bookPagePath, parseBookFileName } from './book';

/** 解析相对路径时用的哨兵 origin。真站点的域名不参与计算，也就与部署地址无关。 */
const SENTINEL_ORIGIN = 'https://internal.invalid';

export interface InternalTarget {
  /** 站内绝对路径，已百分号解码，形如 `/posts/x/`。同页锚点得到的是当前页的路径。 */
  path: string;
  /** 锚点（不含 `#`），已百分号解码；没有锚点时为 null。 */
  hash: string | null;
}

/**
 * 把一个 href 解析成站内目标；不是站内引用时返回 null。
 *
 * 外链、`mailto:`、`data:` 一律返回 null——它们不该由站内检查负责。
 *
 * 相对路径按 `pagePath` 解析成绝对路径，所以作者写 `/posts/x/` 还是 `../x/`
 * 都会被覆盖到。这一点是刻意的：只认某一种写法的话，换种写法检查就瞎了，
 * 而「检查瞎了」和「没有链接」在测试输出里长得一模一样。
 *
 * 查询串会被丢掉——它不影响页面存不存在。
 */
export function parseInternalTarget(
  href: string | null | undefined,
  pagePath = '/',
): InternalTarget | null {
  if (!href) return null;

  let url: URL;
  try {
    url = new URL(href, SENTINEL_ORIGIN + pagePath);
  } catch {
    // 畸形 href（例如落单的 `%`）。当作不可解析，而不是抛出去中断整轮扫描。
    return null;
  }

  // 换了 origin 就是外链。`//example.com/x` 也会在这里被挡掉。
  if (url.origin !== SENTINEL_ORIGIN) return null;

  const hash = url.hash.slice(1);

  return {
    path: safeDecode(url.pathname),
    hash: hash ? safeDecode(hash) : null,
  };
}

/**
 * `decodeURIComponent` 遇到落单的 `%` 会抛错。
 * 解码失败时原样返回，让调用方拿到一个能显示出来的字符串去报错。
 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 去掉 `npm run sync` 插进去的 `chapters/` 那一层，得到**作者在 drafts/ 下看到的路径**。
 *
 * 作者写的是 `drafts/projects/<书>/<章>/<节>.md`，sync 把它搬到
 * `src/content/projects/<书>/chapters/<章>/<节>.md`。这一层只存在于生成目录里，
 * 作者看不见——所以正文里的相对链接（`../第2章-…/03-….md`）是按**没有它**写的。
 * 不改写就解析，`../` 会多跳或少跳一层，链接在源文件里对、在站上错。
 */
export function toDraftsPath(contentRelativePath: string): string {
  const segments = contentRelativePath.split('/').filter(Boolean);
  if (segments[0] === 'projects' && segments[2] === 'chapters') {
    return [segments[0], segments[1], ...segments.slice(3)].join('/');
  }
  return segments.join('/');
}

/**
 * 目标文件的路径 → 站点地址；不认识的形状返回 null。
 *
 * 路径按 **drafts 视角**给（见 `toDraftsPath`），两种写法都收：
 *
 *   posts/<slug>.md                  → /posts/<slug>/
 *   pages/<slug>.md                  → /<slug>/
 *   projects/<项目>.md                → /projects/<项目>/
 *   projects/<书>/index.md            → /projects/<书>/
 *   projects/<书>/<章>.md             → /projects/<书>/<章 去数字前缀>/
 *   projects/<书>/<章>/<节>.md        → /projects/<书>/<章>/<节 去数字前缀>/
 *
 * 数字前缀必须去掉，且用的是 book.ts 里那一个规则——内容层里章条目的 id 是
 * `<书>/01-入门`（**带**前缀），而 URL 段是 `入门`（**不带**）。两套并存是刻意的，
 * 自己再写一遍前缀正则迟早会和 book.ts 走偏。
 */
export function contentPathToUrl(targetPath: string): string | null {
  const segments = toDraftsPath(targetPath).split('/').filter(Boolean);
  const fileName = segments.at(-1);
  if (!fileName?.endsWith('.md')) return null;

  const collection = segments[0];

  if (collection === 'posts') {
    return segments.length === 2 ? `/posts/${slugOf(fileName)}/` : null;
  }
  if (collection === 'pages') {
    return segments.length === 2 ? `/${slugOf(fileName)}/` : null;
  }
  if (collection !== 'projects') return null;

  // 单文件项目
  if (segments.length === 2) return `/projects/${slugOf(fileName)}/`;
  if (segments.length > 4) return null;

  const projectSlug = segments[1]!;
  // 书目录：index.md 就是这本书的项目条目
  if (fileName === 'index.md') return segments.length === 3 ? bookPagePath(projectSlug) : null;

  // 章，或「章 + 节」
  const parts = segments.slice(2).map((segment) => parseBookFileName(slugOf(segment)).name);
  return parts.length > 0 ? bookPagePath(projectSlug, parts) : null;
}

/** 去掉 `.md` 后缀。 */
function slugOf(fileName: string): string {
  return fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName;
}

/**
 * 把正文里写的一条相对 `.md` 链接改写成站上地址；不该由这里管的返回 null。
 *
 * `sourceRelativePath` 是**当前这个文件**的路径（内容根相对，带不带 `chapters/`
 * 都行——作者是按 drafts 视角写链接的，见 `toDraftsPath`）。链接按它所在目录解析，
 * 所以从 `projects/<书>/第5章/08-x.md` 写的 `../第4章/07-y.md` 会落到
 * `projects/<书>/第4章/07-y.md`。
 *
 * 解析不到已知形状时**返回 null 而不是猜一个地址**——让链接原样留着，
 * 由 e2e 里那条「正文里的站内链接都能打开」把它抓出来。改写器不该把错误藏起来。
 */
export function rewriteContentLink(
  href: string | null | undefined,
  sourceRelativePath: string,
): string | null {
  const local = splitLocalMarkdownHref(href);
  if (!local) return null;

  const sourceDir = toDraftsPath(sourceRelativePath).split('/').slice(0, -1).join('/');
  const resolved = resolveRelativePath(sourceDir, local.target);
  if (!resolved) return null;

  const url = contentPathToUrl(resolved);
  if (!url) return null;

  return local.hash ? `${url}#${local.hash}` : url;
}

/**
 * 判断一个 href 是不是「相对的 .md 链接」，是则拆出目标与锚点。
 *
 * 排除掉：绝对路径（已经指向站上地址，无需改写）、纯锚点、带协议的
 * （http/https/mailto/…）、协议相对（`//host/x`）。这些都不该由改写器碰。
 */
function splitLocalMarkdownHref(
  href: string | null | undefined,
): { target: string; hash: string } | null {
  if (!href) return null;
  if (href.startsWith('/') || href.startsWith('#')) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) return null;

  const hashAt = href.indexOf('#');
  const rawPath = hashAt === -1 ? href : href.slice(0, hashAt);
  const rawHash = hashAt === -1 ? '' : href.slice(hashAt + 1);

  if (!rawPath.toLowerCase().endsWith('.md')) return null;

  return { target: safeDecode(rawPath), hash: rawHash ? safeDecode(rawHash) : '' };
}

/**
 * 相对路径归一化。跳出内容根（`..` 用过头）时返回 null——
 * 那说明这条链接本来就不指向站内文件。
 */
function resolveRelativePath(baseDir: string, target: string): string | null {
  const stack = baseDir.split('/').filter(Boolean);

  for (const segment of target.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(segment);
  }

  return stack.join('/');
}
