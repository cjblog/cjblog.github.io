import { expect, test, type Page } from '@playwright/test';
import { parseInternalTarget, type InternalTarget } from '../../src/lib/links';

/**
 * 详情页的渲染机制。
 *
 * ⚠️ 这里**不逐篇巡检全站**：从首页能走到的详情页里「找一篇满足条件的」，
 * 拿它验证机制，确实没有就 skip。逐篇遍历会让用例随文章数量越来越慢，
 * 而且最后卡住部署的往往是一篇文章里的笔误，不是代码坏了。
 *
 * 内容本身的问题（链接写错、图片路径打错）属于内容范畴，在编辑与同步阶段
 * 发现，不该由测试套件替作者巡检全站。规则见 CLAUDE.md 的「测功能，不测内容」。
 */

/**
 * 首页能走到的详情页：项目卡片、左栏文章、右栏置顶、导航里的独立页面。
 *
 * 只到详情页这一层，**不跟进书里的章节导航**——那是内容巡检，
 * 会让这个候选池随书写得越厚而越大。
 */
async function collectDetailLinks(page: Page): Promise<string[]> {
  await page.goto('/');

  const contentLinks = await page
    .locator('.card__link, #posts .post-item__title a, .rail__item a')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute('href'))
        .filter((href): href is string => Boolean(href) && href.startsWith('/')),
    );

  // 导航里的独立页面（/about/ 这类）——排除首页模块（'/' 与 '/#posts'），
  // 它们不是独立页面。以后新增独立页面会被自动纳入候选。
  const pageLinks = await page.locator('.site-nav__link').evaluateAll((nodes) =>
    nodes
      .map((node) => node.getAttribute('href'))
      .filter(
        (href): href is string =>
          Boolean(href) && href!.startsWith('/') && href !== '/' && !href!.startsWith('/#'),
      ),
  );

  return [...new Set([...contentLinks, ...pageLinks])];
}

/** 从候选详情页里找第一篇满足条件的；找不到返回 null，由调用方决定是否 skip。 */
async function findDetailWhere(
  page: Page,
  matches: (candidate: Page) => Promise<boolean>,
): Promise<string | null> {
  for (const href of await collectDetailLinks(page)) {
    await page.goto(href);
    if (await matches(page)) return href;
  }
  return null;
}

test.describe('内容完整性', () => {
  test('首页的各类入口都能打开对应的详情页', async ({ page }) => {
    /*
     * 路由模板坏掉时，对应那一类入口会 404。三类各取一个样本就够了——
     * 断言的是「这条路由能生成页面」，不是「每个详情页都存在」。
     */
    await page.goto('/');

    const groups = [
      { name: '项目卡片', selector: '.card__link' },
      { name: '文章标题', selector: '#posts .post-item__title a' },
      { name: '置顶文章', selector: '.rail__item a' },
    ];

    // 先把地址收集齐：下面要导航走，导航之后再取就取到别的页面上了
    const samples: { name: string; href: string }[] = [];
    for (const group of groups) {
      const links = page.locator(group.selector);
      if ((await links.count()) === 0) continue;
      const href = await links.first().getAttribute('href');
      if (href) samples.push({ name: group.name, href });
    }

    expect(samples.length, '首页一个入口都没有，站点结构不对').toBeGreaterThan(0);

    for (const sample of samples) {
      const response = await page.goto(sample.href);
      expect(response?.status(), `${sample.name} ${sample.href} 应该返回 200`).toBe(200);
      // 不该掉进 404 页
      await expect(page.locator('.notfound__code')).toHaveCount(0);
    }
  });

  test('详情页的公式渲染成 KaTeX，没有渲染报错', async ({ page }) => {
    const href = await findDetailWhere(
      page,
      async (p) => (await p.locator('.prose .katex-display').count()) > 0,
    );
    if (!href) {
      test.skip(true, '站内没有含行间公式的详情页');
      return;
    }

    await page.goto(href);

    await expect(page.locator('.prose .katex-display').first()).toBeVisible();
    // KaTeX 遇到不支持的语法会输出 .katex-error，不会让构建失败
    await expect(page.locator('.katex-error'), `${href} 里有公式渲染报错`).toHaveCount(0);
  });

  test('正文里不漏出 markdown 标记与 LaTeX 源码', async ({ page }) => {
    const href = await findDetailWhere(page, async (p) => (await p.locator('.prose .katex').count()) > 0);
    if (!href) {
      test.skip(true, '站内没有含公式的详情页');
      return;
    }

    await page.goto(href);

    /*
     * 两类必须排除的「合法命中」，否则这条断言在讲 LaTeX 的文章上永远失败：
     *   1. 代码块与行内代码 —— 文章本身在展示 LaTeX 写法，那是正确内容
     *   2. KaTeX 的 MathML <annotation> —— 里面就是原始 TeX 源码，供读屏使用
     * 排除之后正文里若还剩 \命令 或反引号，就是源码里的标记没配对或没渲染。
     */
    const leaked = await page.evaluate(() => {
      const clone = document.querySelector('.prose')?.cloneNode(true) as HTMLElement | undefined;
      if (!clone) return '';
      clone.querySelectorAll('pre, code, .katex-mathml, annotation').forEach((node) => node.remove());
      return clone.innerText;
    });

    expect(leaked.length, `${href} 的正文是空的`).toBeGreaterThan(0);
    expect(leaked, `${href} 漏出了 LaTeX 源码`).not.toMatch(/\\[a-zA-Z]+/);
    // 反引号漏进正文，几乎总是行内代码的反引号没配对：
    // 一个落单的反引号会和文档后面某个反引号配成一对，把中间大段内容吞掉。
    expect(leaked, `${href} 漏出了反引号`).not.toContain('`');
  });

  /*
   * 测的是 src/lib/links.ts 那套改写规则（去 .md、去文件名数字前缀、补
   * /projects/<书>/ 这一层）。找一篇真的有站内链接的正文来验机制即可，
   * 不必把全站的链接都走一遍——那是内容巡检。
   */
  test('正文里的站内链接被改写成站上地址，且目标打开得了', async ({ page }) => {
    const href = await findDetailWhere(
      page,
      async (p) => (await p.locator('.prose a[href^="/"]').count()) > 0,
    );
    if (!href) {
      test.skip(true, '站内没有含站内链接的详情页');
      return;
    }

    await page.goto(href);
    // 先记下当前页地址：下面查锚点时会跳走
    const base = page.url();

    const raws = await page
      .locator('.prose a[href]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));

    // 改写失败的典型症状：正文里还留着 `.md` 结尾的相对链接
    expect(
      raws.filter((raw) => raw.split('#')[0]!.endsWith('.md')),
      `${href} 里有没被改写的 .md 链接`,
    ).toEqual([]);

    const targets = raws
      .map((raw) => ({ raw, target: parseInternalTarget(raw, new URL(base).pathname) }))
      .filter((entry): entry is { raw: string; target: InternalTarget } => entry.target !== null);

    expect(targets.length, `${href} 上其实没有站内链接`).toBeGreaterThan(0);

    const broken: string[] = [];
    for (const { raw, target } of targets) {
      const targetUrl = new URL(target.path, base);
      const response = await page.request.get(targetUrl.href);
      if (!response.ok()) {
        broken.push(`${raw}（${response.status()}）`);
        continue;
      }

      if (!target.hash) continue;

      /*
       * 页面打得开不代表锚点对得上。标题的 id 是 Astro 的 slugger 从标题文字
       * 算出来的，标题一改 id 就变，而链接不会跟着变——尤其是标题里带公式的
       * 那几节，id 是一串谁也猜不出来的东西。
       */
      await page.goto(`${targetUrl.href}#${encodeURIComponent(target.hash)}`);
      const found = await page.evaluate((id) => document.getElementById(id) !== null, target.hash);
      if (!found) broken.push(`${raw}（目标页上没有 id="${target.hash}" 的元素）`);
    }

    expect(broken, `${href} 上有走不通的站内链接：\n${broken.join('\n')}`).toEqual([]);
  });

  test('正文里的图片能加载出来，没有 404', async ({ page }) => {
    // 图片路径写错不会让构建失败，页面上只留一个破图标
    const href = await findDetailWhere(page, async (p) => (await p.locator('.prose img').count()) > 0);
    if (!href) {
      test.skip(true, '站内没有含图片的详情页');
      return;
    }

    await page.goto(href);

    const srcs = await page
      .locator('.prose img')
      .evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLImageElement).getAttribute('src') ?? '').filter(Boolean),
      );

    const broken: string[] = [];
    for (const src of srcs) {
      const response = await page.request.get(new URL(src, page.url()).href);
      if (!response.ok()) broken.push(`${src}（${response.status()}）`);
    }

    expect(broken, `${href} 上有加载不出来的图片：\n${broken.join('\n')}`).toEqual([]);
  });
});

test.describe('404 页', () => {
  test('访问不存在的地址时展示站点风格的 404', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist/');

    expect(response?.status()).toBe(404);
    await expect(page.locator('.notfound__code')).toHaveText('404');
    await expect(page.locator('.notfound__title')).toBeVisible();
  });

  test('404 页给出可走的入口，而不是死胡同', async ({ page }) => {
    await page.goto('/this-page-does-not-exist/');

    await expect(page.locator('.notfound__action', { hasText: '去看项目' })).toBeVisible();
    await expect(page.locator('.notfound__action', { hasText: '去看技术文章' })).toBeVisible();
    // 顺带列出最近的文章
    await expect(page.locator('.notfound__recent .post-item')).not.toHaveCount(0);
  });

  test('404 页上的导航不高亮任何模块', async ({ page }) => {
    await page.goto('/this-page-does-not-exist/');

    await expect(page.locator('.site-nav__link[aria-current="true"]')).toHaveCount(0);
  });

  test('404 页的入口链接确实能走通', async ({ page }) => {
    await page.goto('/this-page-does-not-exist/');
    await page.locator('.notfound__action', { hasText: '去看技术文章' }).click();

    await expect(page.locator('#posts')).toBeVisible();
  });
});
