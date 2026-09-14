import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 预览 dist/ 的极简静态服务器。
 *
 * 为什么不用 `astro preview`：Astro 7 的 preview 会把服务转入后台并让前台进程退出，
 * 于是 Playwright 的 webServer 判定「提前退出」而直接失败；同时它还会留下常驻的
 * 后台进程，下次构建时端口被占。自己起一个前台服务器，行为可预测，也没有额外依赖。
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT ?? 4321);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

/** 把 URL 路径解析成磁盘路径；越出 dist/ 一律拒绝。 */
function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const target = resolve(join(root, normalize(decoded)));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

async function findFile(path) {
  const candidates = [
    path,
    join(path, 'index.html'), // 目录式 URL：/posts/foo/ → /posts/foo/index.html
    `${path}.html`, // 无扩展名：/posts/foo → /posts/foo.html
  ];

  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      // 试下一个候选
    }
  }
  return null;
}

const server = createServer(async (request, response) => {
  const path = resolvePath(request.url ?? '/');

  if (path === null) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  const file = await findFile(path);
  if (file === null) {
    // 静态站的自定义 404 页
    const notFound = join(root, '404.html');
    try {
      await stat(notFound);
      response.writeHead(404, { 'content-type': MIME['.html'] });
      createReadStream(notFound).pipe(response);
    } catch {
      response.writeHead(404).end('Not Found');
    }
    return;
  }

  response.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(response);
});

server.listen(port, () => {
  console.log(`预览服务已启动：http://localhost:${port}（服务目录 dist/）`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
