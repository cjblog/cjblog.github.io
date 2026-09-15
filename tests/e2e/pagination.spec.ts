import { expect, test, type Page } from '@playwright/test';

/**
 * 分页测试刻意不写死「一共几页」——页数取决于内容多少，写死的话
 * 每加一篇文章就会挂。这里从界面上读出实际页数，再据此断言。
 */
async function readPagination(
  page: Page,
  scope: string,
): Promise<{ totalPages: number; totalItems: number }> {
  const summary = (await page.locator(`${scope} .pagination__summary`).textContent()) ?? '';

  const pages = Number(summary.match(/\/\s*(\d+)\s*页/)?.[1]);
  const items = Number(summary.match(/共\s*(\d+)/)?.[1]);

  expect(Number.isInteger(pages) && pages >= 1, `读不出总页数：${summary}`).toBe(true);
  expect(Number.isInteger(items) && items >= 0, `读不出总条数：${summary}`).toBe(true);

  return { totalPages: pages, totalItems: items };
}

async function collectTitlesAcrossPages(
  page: Page,
  totalPages: number,
  hrefFor: (pageNumber: number) => string,
  selector: string,
): Promise<string[]> {
  const titles: string[] = [];
  for (let index = 1; index <= totalPages; index += 1) {
    await page.goto(hrefFor(index));
    const onPage = await page.locator(selector).allTextContents();
    titles.push(...onPage.map((title) => title.trim()));
  }
  return titles;
}

test.describe('项目分页', () => {
  test('首页只放第一页的项目，并给出分页控件', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#projects .card')).toHaveCount(3);
    await expect(page.locator('#projects .pagination')).toBeVisible();
  });

  test('翻页后显示的项目与第一页不重复', async ({ page }) => {
    await page.goto('/');
    const firstPage = (await page.locator('#projects .card__title').allTextContents()).map((t) =>
      t.trim(),
    );

    await page.locator('#projects .pagination__page').filter({ hasText: '2' }).click();
    await expect(page).toHaveURL(/\/projects\/page\/2\/$/);

    const secondPage = (await page.locator('.card__title').allTextContents()).map((t) => t.trim());
    expect(secondPage.length).toBeGreaterThan(0);
    for (const title of secondPage) {
      expect(firstPage, `《${title}》在两页里都出现了`).not.toContain(title);
    }
  });

  test('各页合起来不重不漏', async ({ page }) => {
    await page.goto('/');
    const { totalPages, totalItems } = await readPagination(page, '#projects');

    const titles = await collectTitlesAcrossPages(
      page,
      totalPages,
      (index) => (index === 1 ? '/' : `/projects/page/${index}/`),
      '.card__title',
    );

    expect(new Set(titles).size, '有项目在多页里重复出现').toBe(titles.length);
    expect(titles.length, '分页后的总数与控件上写的不一致').toBe(totalItems);
  });

  test('页码按钮标出当前页', async ({ page }) => {
    await page.goto('/projects/page/2/');

    await expect(page.locator('.pagination__page[aria-current="page"]')).toHaveText('2');
  });

  test('第一页没有「上一页」，最后一页没有「下一页」', async ({ page }) => {
    await page.goto('/');
    const { totalPages } = await readPagination(page, '#projects');

    await expect(
      page.locator('#projects .pagination__step--disabled').filter({ hasText: '上一页' }),
    ).toBeVisible();

    await page.goto(`/projects/page/${totalPages}/`);
    await expect(
      page.locator('.pagination__step--disabled').filter({ hasText: '下一页' }),
    ).toBeVisible();
  });

  test('从第二页能返回首页', async ({ page }) => {
    await page.goto('/projects/page/2/');
    await page.locator('.pagination__step').filter({ hasText: '上一页' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#projects .card')).toHaveCount(3);
  });
});

test.describe('文章分页', () => {
  test('首页文章列表只放第一页，每页 5 篇', async ({ page }) => {
    await page.goto('/#posts');

    await expect(page.locator('#posts .post-item')).toHaveCount(5);
    await expect(page.locator('#posts .pagination')).toBeVisible();
  });

  test('各页合起来不重不漏', async ({ page }) => {
    await page.goto('/#posts');
    const { totalPages, totalItems } = await readPagination(page, '#posts');

    // 首页上文章在 #posts 模块里，分页页上是独立列表，但都用同一个类名；
    // 右栏置顶用的是 .rail__item，不会混进来
    const titles = await collectTitlesAcrossPages(
      page,
      totalPages,
      (index) => (index === 1 ? '/#posts' : `/posts/page/${index}/`),
      '.post-item__title',
    );

    // 左栏是「最新文章」，置顶文章不在其中，所以拿它和控件上的总数比
    const unique = [...new Set(titles.map((title) => title.trim()))];
    expect(unique.length, '有文章在多页里重复出现').toBe(titles.length);
    expect(titles.length).toBe(totalItems);
  });

  test('分页按发布时间倒序跨页延续', async ({ page }) => {
    await page.goto('/#posts');
    const { totalPages } = await readPagination(page, '#posts');

    const dates: string[] = [];
    for (let index = 1; index <= totalPages; index += 1) {
      await page.goto(index === 1 ? '/#posts' : `/posts/page/${index}/`);
      const metas = await page.locator('.post-item__meta').allTextContents();
      dates.push(...metas.map((text) => text.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? ''));
    }

    expect(dates.length).toBeGreaterThan(5);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  test('置顶文章在每一页的右栏都出现', async ({ page }) => {
    await page.goto('/#posts');
    const { totalPages } = await readPagination(page, '#posts');
    expect(totalPages).toBeGreaterThan(1);

    // 否则翻到第 2 页就找不到置顶文章了
    await page.goto(`/posts/page/${totalPages}/`);
    await expect(page.locator('.rail__item')).not.toHaveCount(0);
  });

  test('文章页码项指向正确的地址', async ({ page }) => {
    await page.goto('/#posts');
    await page.locator('#posts .pagination__page').filter({ hasText: '2' }).click();

    await expect(page).toHaveURL(/\/posts\/page\/2\/$/);
    await expect(page.locator('.pagination__page[aria-current="page"]')).toHaveText('2');
  });
});
