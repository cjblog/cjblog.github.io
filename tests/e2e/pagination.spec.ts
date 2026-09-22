import { expect, test, type Page } from '@playwright/test';
import { POSTS_PER_PAGE, PROJECTS_PER_PAGE } from '../../src/lib/pagination';

/**
 * 分页测试必须对「内容有多少」保持中立。这里踩过两次，都记下来：
 *
 *   1. 写死「一共几页」——每加一篇文章就挂一片。
 *   2. 改成「页数从界面上动态读」之后，仍然默认「一定不止一页」。内容被删到
 *      只剩一页时（作者清掉示例内容后就是这样），Pagination.astro 里
 *      `show = totalPages > 1` 为假，整个控件连同 .pagination__summary 都不渲染，
 *      于是所有翻页断言一起挂——而站点本身完全正常，只有一页本来就不该有分页控件。
 *
 * 所以：**只有一页是合法状态**。这时该断言的是「不渲染控件、也不生成第 2 页路由」；
 * 多于一页时才去跑翻页与「不重不漏」这些不变量。不适用的一律显式 skip，
 * 而不是靠往仓库里塞示例内容把前提凑出来。
 */

/** 只有一页时 Pagination.astro 整个不渲染，所以「有没有控件」必须先探，不能直接读 summary。 */
async function hasPagination(page: Page, scope: string): Promise<boolean> {
  return (await page.locator(`${scope} .pagination`).count()) > 0;
}

/** 内容只有一页时，翻页类断言无从谈起——跳过，理由写清楚，别让它假装通过。 */
async function skipUnlessMultiPage(page: Page, scope: string): Promise<void> {
  if (!(await hasPagination(page, scope))) {
    test.skip(true, `${scope} 只有一页，翻页类断言不适用`);
  }
}

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
  test('首页只放第一页的项目；超过一页才渲染分页控件', async ({ page }) => {
    await page.goto('/');

    const shown = await page.locator('#projects .card').count();
    expect(shown, `首页放了 ${shown} 个项目，超过每页 ${PROJECTS_PER_PAGE} 个`).toBeLessThanOrEqual(
      PROJECTS_PER_PAGE,
    );

    if (await hasPagination(page, '#projects')) {
      // 有控件 ⇒ 一定不止一页 ⇒ 第一页应当是满的
      expect(shown, '有多页时第一页应该是满的').toBe(PROJECTS_PER_PAGE);
    } else {
      // 只有一页：控件本就不渲染，而且不该生成第 2 页的路由
      const response = await page.goto('/projects/page/2/');
      expect(response?.status(), '项目只有一页，却生成了 /projects/page/2/').toBe(404);
    }
  });

  test('翻页后显示的项目与第一页不重复', async ({ page }) => {
    await page.goto('/');
    await skipUnlessMultiPage(page, '#projects');

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
    await skipUnlessMultiPage(page, '#projects');

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
    await page.goto('/');
    await skipUnlessMultiPage(page, '#projects');

    await page.goto('/projects/page/2/');
    await expect(page.locator('.pagination__page[aria-current="page"]')).toHaveText('2');
  });

  test('第一页没有「上一页」，最后一页没有「下一页」', async ({ page }) => {
    await page.goto('/');
    await skipUnlessMultiPage(page, '#projects');

    const { totalPages } = await readPagination(page, '#projects');

    await page.goto('/');
    await expect(
      page.locator('#projects .pagination__step--disabled').filter({ hasText: '上一页' }),
    ).toBeVisible();

    await page.goto(`/projects/page/${totalPages}/`);
    await expect(
      page.locator('.pagination__step--disabled').filter({ hasText: '下一页' }),
    ).toBeVisible();
  });

  test('从第二页能返回首页', async ({ page }) => {
    await page.goto('/');
    await skipUnlessMultiPage(page, '#projects');

    await page.goto('/projects/page/2/');
    await page.locator('.pagination__step').filter({ hasText: '上一页' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#projects .card')).toHaveCount(PROJECTS_PER_PAGE);
  });
});

test.describe('文章分页', () => {
  test('首页文章列表只放第一页；超过一页才渲染分页控件', async ({ page }) => {
    await page.goto('/#posts');

    const shown = await page.locator('#posts .post-item').count();
    expect(shown, `首页放了 ${shown} 篇文章，超过每页 ${POSTS_PER_PAGE} 篇`).toBeLessThanOrEqual(
      POSTS_PER_PAGE,
    );

    if (await hasPagination(page, '#posts')) {
      expect(shown, '有多页时第一页应该是满的').toBe(POSTS_PER_PAGE);
    } else {
      const response = await page.goto('/posts/page/2/');
      expect(response?.status(), '文章只有一页，却生成了 /posts/page/2/').toBe(404);
    }
  });

  test('各页合起来不重不漏', async ({ page }) => {
    await page.goto('/#posts');
    await skipUnlessMultiPage(page, '#posts');

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
    expect(new Set(titles).size, '有文章在多页里重复出现').toBe(titles.length);
    expect(titles.length).toBe(totalItems);
  });

  test('列表按发布时间倒序，跨页也延续', async ({ page }) => {
    await page.goto('/#posts');

    const totalPages = (await hasPagination(page, '#posts'))
      ? (await readPagination(page, '#posts')).totalPages
      : 1;

    const dates: string[] = [];
    for (let index = 1; index <= totalPages; index += 1) {
      await page.goto(index === 1 ? '/#posts' : `/posts/page/${index}/`);
      const metas = await page.locator('.post-item__meta').allTextContents();
      dates.push(...metas.map((text) => text.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? ''));
    }

    // 只有一篇文章时排序无从谈起，跳过而不是假装通过
    if (dates.length < 2) test.skip(true, `只有 ${dates.length} 篇文章，排序不适用`);

    expect(dates).toEqual([...dates].sort().reverse());
  });

  test('置顶文章在每一页的右栏都出现', async ({ page }) => {
    await page.goto('/#posts');

    // 没有置顶文章就无从断言——这取决于内容，不是模板行为
    if ((await page.locator('.rail__item').count()) === 0) {
      test.skip(true, '没有置顶文章，无从断言它在每页都出现');
    }

    if (!(await hasPagination(page, '#posts'))) return;

    // 否则翻到第 2 页就找不到置顶文章了
    const { totalPages } = await readPagination(page, '#posts');
    await page.goto(`/posts/page/${totalPages}/`);
    await expect(page.locator('.rail__item')).not.toHaveCount(0);
  });

  test('文章页码项指向正确的地址', async ({ page }) => {
    await page.goto('/#posts');
    await skipUnlessMultiPage(page, '#posts');

    await page.locator('#posts .pagination__page').filter({ hasText: '2' }).click();

    await expect(page).toHaveURL(/\/posts\/page\/2\/$/);
    await expect(page.locator('.pagination__page[aria-current="page"]')).toHaveText('2');
  });
});
