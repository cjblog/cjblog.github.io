import { expect, test } from '@playwright/test';

test.describe('技术文章两栏', () => {
  test('左栏按发布时间倒序，且不含置顶文章', async ({ page }) => {
    await page.goto('/#posts');

    const titles = await page
      .locator('#posts .post-item__title')
      .allTextContents();

    // 置顶的《Markdown 渲染效果演示》(09-01) 不在这里出现
    expect(titles.map((title) => title.trim())).toEqual([
      '字数统计与摘要截取是怎么算的', // 2026-09-10
      '为什么公式要在构建期渲染', // 2026-09-05
    ]);
  });

  test('右栏只放置顶文章', async ({ page }) => {
    await page.goto('/#posts');

    const rail = await page.locator('.rail__item').allTextContents();

    expect(rail).toHaveLength(1);
    expect(rail[0]).toContain('Markdown 渲染效果演示');
  });

  test('置顶文章在左栏不重复出现', async ({ page }) => {
    await page.goto('/#posts');

    const title = 'Markdown 渲染效果演示';
    await expect(page.locator('#posts .post-item__title', { hasText: title })).toHaveCount(0);
    await expect(page.locator('.rail__item', { hasText: title })).toHaveCount(1);
  });

  test('列表项显示发布时间、字数、更新时间与阅读时长', async ({ page }) => {
    await page.goto('/#posts');

    const meta = page.locator('#posts .post-item').first().locator('.post-item__meta');

    await expect(meta).toContainText('2026-09-10');
    await expect(meta).toContainText('发布');
    await expect(meta).toContainText('字');
    await expect(meta).toContainText('更新于');
    await expect(meta).toContainText('2026-09-12');
    await expect(meta).toContainText('阅读');
    await expect(meta).toContainText(/约 \d+ 分钟/);
  });

  test('字数不是 0，说明正文确实被统计了', async ({ page }) => {
    await page.goto('/#posts');

    const text = (await page.locator('#posts .post-item__meta').first().textContent()) ?? '';
    const wordCount = Number(text.match(/([\d,]+) 字/)?.[1].replace(/,/g, ''));

    expect(wordCount).toBeGreaterThan(100);
  });

  test('列表项显示摘要，且摘要里没有公式残留', async ({ page }) => {
    await page.goto('/#posts');

    const excerpt = page.locator('#posts .post-item__excerpt').first();
    await expect(excerpt).toBeVisible();
    await expect(excerpt).not.toContainText('$');
    await expect(excerpt).not.toContainText('katex');
  });

  test('摘要按 <!-- more --> 分割，不含标记之后的内容', async ({ page }) => {
    await page.goto('/#posts');

    // reading-time-and-excerpt 的 more 标记之后是「## 字数为什么不能只按空格切」
    const excerpt = page.locator('#posts .post-item__excerpt').first();
    await expect(excerpt).toContainText('字数');
    await expect(excerpt).not.toContainText('字数为什么不能只按空格切');
  });
});

test.describe('文章全文页', () => {
  test('点击标题进入全文', async ({ page }) => {
    await page.goto('/#posts');
    await page.locator('#posts .post-item__title a').first().click();

    await expect(page).toHaveURL(/\/posts\/reading-time-and-excerpt\/$/);
    await expect(page.locator('.detail__title')).toHaveText('字数统计与摘要截取是怎么算的');
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
