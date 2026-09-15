import { expect, test } from '@playwright/test';

/**
 * 「项目 = 一本书」：项目目录下有多个 Markdown 文件时，详情页左侧出现
 * 按章 / 节组织的目录，右侧仍是当前文档的标题目录。
 */
const BOOK = '/projects/astro-guide/';
const SINGLE_FILE_PROJECT = '/projects/llm-wiki/';

test.describe('书的左侧目录', () => {
  test('多文件项目的详情页出现书本目录', async ({ page }) => {
    await page.goto(BOOK);

    await expect(page.locator('.book')).toBeVisible();
    await expect(page.locator('.book__heading')).not.toBeEmpty();
    // 第一项是回项目介绍
    await expect(page.locator('.book__list > li').first()).toContainText('项目介绍');
  });

  test('单文件项目没有书本目录', async ({ page }) => {
    await page.goto(SINGLE_FILE_PROJECT);

    await expect(page.locator('.book')).toHaveCount(0);
  });

  test('目录分两级：章与节', async ({ page }) => {
    await page.goto(BOOK);

    // 「第一级为章，子目录为节」，两级都要真的渲染出来
    await expect(page.locator('.book__list > li > .book__link').first()).toBeVisible();
    await expect(page.locator('.book__sublist .book__link').first()).toBeVisible();

    const chapters = await page.locator('.book__list > li > .book__link').count();
    const sections = await page.locator('.book__sublist .book__link').count();
    expect(chapters).toBeGreaterThan(1);
    expect(sections).toBeGreaterThan(1);
  });

  test('目录不出现第三级', async ({ page }) => {
    await page.goto(BOOK);

    // 节下面不再有嵌套列表
    await expect(page.locator('.book__sublist .book__sublist')).toHaveCount(0);
  });

  test('落地页上「项目介绍」被标为当前', async ({ page }) => {
    await page.goto(BOOK);

    await expect(page.locator('.book__link[aria-current="true"]')).toHaveText('项目介绍');
  });

  test('目录里每个链接都能打开', async ({ page }) => {
    await page.goto(BOOK);

    const hrefs = await page
      .locator('.book__link')
      .evaluateAll((nodes) =>
        nodes
          .map((node) => node.getAttribute('href'))
          .filter((href): href is string => Boolean(href)),
      );

    expect(hrefs.length).toBeGreaterThan(3);
    for (const href of hrefs) {
      const response = await page.goto(href);
      expect(response?.status(), `${href} 打不开`).toBe(200);
      await expect(page.locator('.notfound__code')).toHaveCount(0);
    }
  });
});

test.describe('书的章与节', () => {
  test('点击节进入对应页面，左侧高亮当前节', async ({ page }) => {
    await page.goto(BOOK);

    const section = page.locator('.book__sublist .book__link').first();
    const title = (await section.textContent())?.trim();
    expect(title).toBeTruthy();

    await section.click();

    // 书内页的地址是 /projects/<书>/<章>/<节>/
    await expect(page).toHaveURL(/\/projects\/astro-guide\/.+\/.+\/$/);
    await expect(page.locator('.detail__title')).toHaveText(title as string);
    await expect(page.locator('.book__link[aria-current="true"]')).toHaveText(title as string);
  });

  test('点击章进入章的页面', async ({ page }) => {
    await page.goto(BOOK);

    const chapter = page.locator('.book__list > li > .book__link').nth(1);
    const title = (await chapter.textContent())?.trim();

    await chapter.click();

    await expect(page).toHaveURL(/\/projects\/astro-guide\/.+\/$/);
    await expect(page.locator('.detail__title')).toHaveText(title as string);
    await expect(page.locator('.book__link[aria-current="true"]')).toHaveText(title as string);
  });

  test('书内页右侧仍有当前文档的目录', async ({ page }) => {
    await page.goto(BOOK);
    await page.locator('.book__sublist .book__link').first().click();

    // 「右侧为当前文档的目录保持不变」
    await expect(page.locator('.toc')).toBeVisible();
    await expect(page.locator('.toc__link').first()).toBeVisible();
  });

  test('书内页上书本目录与文档目录同时存在，且是两套东西', async ({ page }) => {
    await page.goto(BOOK);
    await page.locator('.book__sublist .book__link').first().click();

    const bookLinks = await page.locator('.book__link').count();
    const tocLinks = await page.locator('.toc__link').count();

    expect(bookLinks).toBeGreaterThan(1);
    expect(tocLinks).toBeGreaterThan(1);
    // 两者的链接地址不同：一个是页面跳转，一个是页内锚点
    await expect(page.locator('.book__link').first()).toHaveAttribute('href', /^\/projects\//);
    await expect(page.locator('.toc__link').first()).toHaveAttribute('href', /^#/);
  });

  test('书内页可以从左上角返回项目介绍', async ({ page }) => {
    await page.goto(BOOK);
    await page.locator('.book__sublist .book__link').first().click();

    await page.locator('.detail__back').click();
    await expect(page).toHaveURL(/\/projects\/astro-guide\/$/);
  });
});

test.describe('书 · 窄屏', () => {
  test.use({ viewport: { width: 700, height: 900 } });

  test('书目录移到正文上方且不再吸顶', async ({ page }) => {
    await page.goto(BOOK);

    const book = page.locator('.book');
    await expect(book).toBeVisible();

    const bookBox = await book.boundingBox();
    const bodyBox = await page.locator('.detail__body').boundingBox();
    expect(bookBox!.y).toBeLessThan(bodyBox!.y);

    expect(await book.evaluate((node) => getComputedStyle(node).position)).toBe('static');
  });

  test('窄屏下页面不出现横向滚动', async ({ page }) => {
    await page.goto(BOOK);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBeLessThanOrEqual(1);
  });
});
