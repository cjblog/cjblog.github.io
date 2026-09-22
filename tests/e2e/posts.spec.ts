import { expect, test, type Page } from '@playwright/test';

/**
 * 这个文件里的断言刻意不依赖具体是哪几篇文章。
 *
 * 之前的版本把样例文章的标题和日期写死在断言里，结果每加一篇文章就会挂一批
 * 用例——测的是「当时的样例快照」而不是「两栏布局该有的行为」。现在改成断言
 * 不变量：倒序、字段格式、置顶不重复、错误不泄漏。这类断言的内容无关。
 *
 * 摘要分割（`<!-- more -->`）的语义由 tests/unit/excerpt.test.ts 覆盖，
 * 那里能用构造好的输入精确验证，比依赖某篇真实文章稳。
 */

/** 走遍文章列表的所有页，收集详情页地址。分页不存在时就只有首页那一页。 */
async function collectPostHrefs(page: Page): Promise<string[]> {
  const hrefs: string[] = [];
  let index = 1;

  for (;;) {
    await page.goto(index === 1 ? '/#posts' : `/posts/page/${index}/`);
    const found = await page
      .locator('.post-item__title a')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));
    hrefs.push(...found.filter(Boolean));

    if ((await page.locator('.pagination__step[rel="next"]').count()) === 0) break;
    index += 1;
  }

  return hrefs;
}

/**
 * 找第一篇满足条件的文章。
 *
 * 「全文页里某某元素渲染出来了」这类断言需要一个真的含该元素的页面。原版把那个
 * 页面写死成某篇样例文章，作者一删就整片红。这里改成逐篇探测：内容里有什么就
 * 断言什么，确实没有就 skip——而不是把「仓库里得留着某篇示例文章」变成部署前提。
 */
async function findPostWhere(
  page: Page,
  matches: (page: Page) => Promise<boolean>,
): Promise<string | null> {
  for (const href of await collectPostHrefs(page)) {
    await page.goto(href);
    if (await matches(page)) return href;
  }
  return null;
}

test.describe('技术文章两栏', () => {
  test('左栏按发布时间倒序', async ({ page }) => {
    await page.goto('/#posts');

    const metas = await page.locator('#posts .post-item__meta').allTextContents();
    const dates = metas.map((text) => text.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '');

    expect(dates.length).toBeGreaterThan(1);
    expect(dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))).toBe(true);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  test('右栏有置顶文章，且左栏不重复出现', async ({ page }) => {
    await page.goto('/#posts');

    // 右栏链接的文本节点是标题，日期在单独的 .rail__date 里
    const railTitles = await page
      .locator('.rail__item a')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.childNodes[0]?.textContent?.trim() ?? ''),
      );
    const columnTitles = (await page.locator('#posts .post-item__title a').allTextContents()).map(
      (title) => title.trim(),
    );

    if (railTitles.length === 0) {
      test.skip(true, '站内没有置顶文章，无从断言它不出现在左栏');
      return;
    }
    expect(railTitles.every((title) => title.length > 0)).toBe(true);

    for (const title of railTitles) {
      expect(columnTitles, `置顶的《${title}》不该同时出现在左栏`).not.toContain(title);
    }
  });

  test('列表项显示发布时间、字数、更新时间与阅读时长', async ({ page }) => {
    await page.goto('/#posts');

    // 断言字段格式而非具体数值——加了新文章也不该影响这条
    for (const meta of await page.locator('#posts .post-item__meta').all()) {
      await expect(meta).toHaveText(/\d{4}-\d{2}-\d{2}\s*发布/);
      await expect(meta).toHaveText(/[\d,]+ 字/);
      await expect(meta).toHaveText(/更新于 \d{4}-\d{2}-\d{2}/);
      await expect(meta).toHaveText(/阅读 约 \d+ 分钟/);
    }
  });

  test('字数统计确实算出了正文的量', async ({ page }) => {
    await page.goto('/#posts');

    const metas = await page.locator('#posts .post-item__meta').allTextContents();
    const counts = metas.map((text) => Number(text.match(/([\d,]+) 字/)?.[1].replace(/,/g, '')));

    expect(counts.length).toBeGreaterThan(0);
    for (const count of counts) {
      // 0 字说明正文没被读到；正常文章都远超 100 字
      expect(count).toBeGreaterThan(100);
    }
  });

  test('列表摘要不为空，且没有漏出公式、HTML 或分割标记', async ({ page }) => {
    await page.goto('/#posts');

    const excerpts = await page.locator('#posts .post-item__excerpt').allTextContents();
    expect(excerpts.length).toBeGreaterThan(0);

    for (const text of excerpts) {
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toContain('$');
      expect(text).not.toContain('katex');
      expect(text).not.toContain('<!--');
      expect(text).not.toContain('<');
    }
  });
});

test.describe('文章全文页', () => {
  test('点击标题进入的就是那篇文章的全文', async ({ page }) => {
    await page.goto('/#posts');

    const link = page.locator('#posts .post-item__title a').first();
    const title = (await link.textContent())?.trim();
    expect(title).toBeTruthy();

    await link.click();

    await expect(page).toHaveURL(/\/posts\/[^/]+\/$/);
    await expect(page.locator('.detail__title')).toHaveText(title as string);
  });

  test('行内公式渲染成 KaTeX，而不是漏出 LaTeX 原文', async ({ page }) => {
    const href = await findPostWhere(
      page,
      async (p) =>
        (await p.locator('.prose .katex-display .katex').count()) <
        (await p.locator('.prose .katex').count()),
    );
    if (!href) {
      test.skip(true, '站内没有含行内公式的文章');
      return;
    }

    await page.goto(href);

    const inline = (await page.locator('.prose .katex').count()) -
      (await page.locator('.prose .katex-display .katex').count());
    expect(inline, `${href} 的行内公式没有渲染成 KaTeX`).toBeGreaterThan(0);

    /*
     * 两个坑，改这类断言时注意：
     * 1. 文章本身在讨论公式语法时，会用行内代码展示字面量 `$...$`，那是正确内容，
     *    所以「页面不含 $」这种断言在这类页面上不成立。
     * 2. KaTeX 默认输出 htmlAndMathml，MathML 的 <annotation> 里带着原始 LaTeX，
     *    所以 textContent 里确实能找到 \alpha —— 不能据此断言「没有漏出 LaTeX」。
     * 要断言就断言可视元素。两处的「没有漏出来」由 content.spec.ts 统一兜底。
     */
    await expect(page.locator('.katex-error')).toHaveCount(0);
  });

  test('行间公式渲染成 KaTeX 的 display 块', async ({ page }) => {
    const href = await findPostWhere(
      page,
      async (p) => (await p.locator('.prose .katex-display').count()) > 0,
    );
    if (!href) {
      test.skip(true, '站内没有含行间公式的文章');
      return;
    }

    await page.goto(href);
    await expect(page.locator('.prose .katex-display').first()).toBeVisible();
  });

  test('全文页把表格、代码块、图片、引用渲染成对应元素', async ({ page }) => {
    /*
     * 原版要求某一篇样例文章同时具备这四样，那是那篇文章的属性而不是模板行为。
     * 这里逐个特性去找「含它的那一篇」再断言，站内确实没有的特性跳过。
     * 表格额外断言被 .table-scroll 包住——窄屏靠它横向滚动，否则会把页面撑破。
     */
    const features = [
      { name: '表格', selector: '.prose table' },
      { name: '代码块', selector: '.prose pre' },
      { name: '图片', selector: '.prose img' },
      { name: '引用', selector: '.prose blockquote' },
    ];
    const absent: string[] = [];

    for (const feature of features) {
      const href = await findPostWhere(
        page,
        async (p) => (await p.locator(feature.selector).count()) > 0,
      );
      if (!href) {
        absent.push(feature.name);
        continue;
      }

      await page.goto(href);
      await expect(
        page.locator(feature.selector).first(),
        `${feature.name}没在 ${href} 上渲染出来`,
      ).toBeVisible();

      if (feature.name === '表格') {
        const tables = await page.locator('.prose table').count();
        const wrapped = await page.locator('.prose .table-scroll > table').count();
        expect(wrapped, `${href} 有表格没被 .table-scroll 包住，窄屏会被撑破`).toBe(tables);
      }
    }

    if (absent.length === features.length) {
      test.skip(true, '站内没有任何一篇同时可测的文章内容');
    }
  });

  test('全文页显示完整的元信息', async ({ page }) => {
    // 不再绑定某一篇：第一篇有元信息的文章即可，断言的是字段格式
    await page.goto('/#posts');

    const link = page.locator('#posts .post-item__title a').first();
    await link.click();

    const meta = page.locator('.post-meta');
    await expect(meta).toHaveText(/\d{4}-\d{2}-\d{2}\s*发布/);
    await expect(meta).toContainText('字');
    await expect(meta).toContainText('更新于');
    await expect(meta).toHaveText(/更新于 \d{4}-\d{2}-\d{2}/);
    await expect(meta).toContainText('阅读');
  });

  test('代码块带语法高亮', async ({ page }) => {
    const href = await findPostWhere(
      page,
      async (p) => (await p.locator('.prose pre code').count()) > 0,
    );
    if (!href) {
      test.skip(true, '站内没有含代码块的文章');
      return;
    }

    await page.goto(href);

    // Shiki 会把 token 包成带颜色的 span
    const colored = await page.locator('.prose pre code span[style*="color"]').count();
    expect(colored, `${href} 的代码块没有被 Shiki 高亮`).toBeGreaterThan(0);
  });

  test('可以从全文页返回技术文章模块', async ({ page }) => {
    await page.goto('/#posts');
    await page.locator('#posts .post-item__title a').first().click();

    await page.locator('.detail__back').click();

    await expect(page).toHaveURL(/#posts$/);
    await expect(page.locator('#posts')).toBeVisible();
  });
});
