import { expect, test } from '@playwright/test';

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

    expect(railTitles.length).toBeGreaterThan(0);
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
      // 0 字说明正文没被读到；样例文章都远超 100 字
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

  test('全文页把行内公式渲染成 KaTeX，而不是漏出 LaTeX 原文', async ({ page }) => {
    await page.goto('/posts/reading-time-and-excerpt/');

    // 原文写作：公式里全是符号：$x$、$\alpha$、$\sum_{i=1}^{n}$ ...
    const paragraph = page.locator('.prose p', { hasText: '公式里全是符号' });
    await expect(paragraph.locator('.katex')).toHaveCount(3);

    // 两个坑，写这类断言时注意：
    // 1. 文章本身在讨论公式语法，会用行内代码展示字面量 `$...$`，
    //    所以「页面不含 $」这种断言在这类页面上不成立。
    // 2. KaTeX 默认输出 htmlAndMathml，MathML 的 <annotation> 里带着原始
    //    LaTeX 源码，所以 textContent 里确实能找到 \alpha —— 不能据此断言
    //    「没有漏出 LaTeX」。要断言就断言可视元素的数量与内容。
  });

  test('全文页渲染行间公式', async ({ page }) => {
    // katex-pipeline-notes 里有一个 $$...$$ 的矩阵
    await page.goto('/posts/katex-pipeline-notes/');

    await expect(page.locator('.prose .katex-display').first()).toBeVisible();
  });

  test('全文页渲染表格、代码块、图片、引用与标签', async ({ page }) => {
    await page.goto('/posts/markdown-rendering-demo/');

    await expect(page.locator('.prose table')).toBeVisible();
    await expect(page.locator('.prose pre').first()).toBeVisible();
    await expect(page.locator('.prose img').first()).toBeVisible();
    // 正文里有两处引用块（开头提示 + 引用示例），取第一个
    await expect(page.locator('.prose blockquote').first()).toBeVisible();
    await expect(page.locator('.detail__tags li')).toHaveCount(3);
  });

  test('全文页显示完整的元信息', async ({ page }) => {
    await page.goto('/posts/reading-time-and-excerpt/');

    const meta = page.locator('.post-meta');
    await expect(meta).toContainText('2026-09-10');
    await expect(meta).toContainText('字');
    await expect(meta).toContainText('更新于');
    await expect(meta).toContainText('2026-09-12');
  });

  test('代码块带语法高亮', async ({ page }) => {
    await page.goto('/posts/markdown-rendering-demo/');

    // Shiki 会把 token 包成带颜色的 span
    const colored = await page
      .locator('.prose pre code span[style*="color"]')
      .count();

    expect(colored).toBeGreaterThan(0);
  });

  test('可以从全文页返回技术文章模块', async ({ page }) => {
    await page.goto('/posts/katex-pipeline-notes/');
    await page.locator('.detail__back').click();

    await expect(page).toHaveURL(/#posts$/);
    await expect(page.locator('#posts')).toBeVisible();
  });
});
