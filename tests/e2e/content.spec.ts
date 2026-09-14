import { expect, test } from '@playwright/test';

/**
 * 内容完整性检查：不针对某个具体页面，而是把站内所有详情页扫一遍。
 *
 * 存在的意义是防「内容写错但构建照过」这类问题——例如 KaTeX 遇到不认识的
 * 命令不会让构建失败，只会在页面上排出一段红色报错，只有真的看一眼才发现。
 */

async function collectDetailLinks(page: import('@playwright/test').Page): Promise<string[]> {
  await page.goto('/');
  const hrefs = await page
    .locator('.card__link, #posts .post-item__title a, .rail__item a')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute('href'))
        .filter((href): href is string => Boolean(href) && href.startsWith('/')),
    );
  return [...new Set(hrefs)];
}

test.describe('内容完整性', () => {
  test('站内每个详情页链接都能打开，没有死链', async ({ page }) => {
    const links = await collectDetailLinks(page);
    expect(links.length).toBeGreaterThan(0);

    for (const href of links) {
      const response = await page.goto(href);
      expect(response?.status(), `${href} 应该返回 200`).toBe(200);
      // 不该掉进 404 页
      await expect(page.locator('.notfound__code')).toHaveCount(0);
    }
  });

  test('所有详情页的公式都没有渲染报错', async ({ page }) => {
    const links = await collectDetailLinks(page);
    expect(links.length).toBeGreaterThan(0);

    for (const href of links) {
      await page.goto(href);
      // KaTeX 遇到不支持的语法会输出 .katex-error，不会让构建失败
      await expect(page.locator('.katex-error'), `${href} 里有公式渲染报错`).toHaveCount(0);
    }
  });

  test('文章页至少渲染出了公式，说明流水线没被静默跳过', async ({ page }) => {
    await page.goto('/posts/latex-common-syntax/');

    const formulas = await page.locator('.prose .katex').count();
    expect(formulas).toBeGreaterThan(30);
  });

  test('可视正文里没有漏出来的 markdown 标记与 LaTeX 源码', async ({ page }) => {
    const links = await collectDetailLinks(page);
    expect(links.length).toBeGreaterThan(0);

    for (const href of links) {
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
        clone
          .querySelectorAll('pre, code, .katex-mathml, annotation')
          .forEach((node) => node.remove());
        return clone.innerText;
      });

      expect(leaked.length, `${href} 的正文是空的`).toBeGreaterThan(0);
      expect(leaked, `${href} 漏出了 LaTeX 源码`).not.toMatch(/\\[a-zA-Z]+/);
      // 反引号漏进正文，几乎总是行内代码的反引号没配对：
      // 一个落单的反引号会和文档后面某个反引号配成一对，把中间大段内容吞掉。
      expect(leaked, `${href} 漏出了反引号`).not.toContain('`');
    }
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
