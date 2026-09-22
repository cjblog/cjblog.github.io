import { expect, test, type Page } from '@playwright/test';

/**
 * 目录用例原本每一条都写死 /posts/latex-common-syntax/ 与 /projects/llm-wiki/。
 * 那是在拿「当时那两篇内容的标题结构」当断言对象——作者一删内容就整片红，
 * 而目录组件本身没动过一行。
 *
 * 现在改成：从站内实际存在的页面里找「标题够多、确实渲染了目录」的那一页再断言。
 * 找不到就 skip——「仓库里必须留着某篇长文章」不该是部署的前提。
 */

/** 取出目录里每一项指向的标题 id（href 里的中文是编码过的，要解码） */
async function tocSlugs(page: Page): Promise<string[]> {
  return page
    .locator('.toc__link')
    .evaluateAll((nodes) =>
      nodes.map((node) => decodeURIComponent((node as HTMLAnchorElement).hash.slice(1))),
    );
}

/** 站内所有详情页：首页卡片、文章列表、以及导航里的独立页面。 */
async function collectDetailHrefs(page: Page): Promise<string[]> {
  await page.goto('/');

  const hrefs = await page
    .locator('.card__link, #posts .post-item__title a, .site-nav__link')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));

  return [
    ...new Set(
      hrefs.filter((href) => href.startsWith('/') && href !== '/' && !href.startsWith('/#')),
    ),
  ];
}

/** 找一个目录项不少于 minItems 的详情页。 */
async function findPageWithToc(page: Page, minItems: number): Promise<string | null> {
  for (const href of await collectDetailHrefs(page)) {
    await page.goto(href);
    if ((await page.locator('.toc__link').count()) >= minItems) return href;
  }
  return null;
}

/** 找一个目录项不少于 minItems 的项目详情页。 */
async function findProjectPageWithToc(page: Page, minItems: number): Promise<string | null> {
  await page.goto('/');
  const projectHrefs = await page
    .locator('.card__link')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));

  for (const href of projectHrefs.filter(Boolean)) {
    await page.goto(href);
    if ((await page.locator('.toc__link').count()) >= minItems) return href;
  }
  return null;
}

test.describe('文章目录', () => {
  test('详情页显示目录，且每个锚点都能找到对应标题', async ({ page }) => {
    const href = await findPageWithToc(page, 2);
    if (!href) {
      test.skip(true, '站内没有标题足够多、会渲染目录的页面');
      return;
    }

    await page.goto(href);
    await expect(page.locator('.toc')).toBeVisible();

    const slugs = await tocSlugs(page);
    expect(slugs.length).toBeGreaterThan(1);

    for (const slug of slugs) {
      // 用属性选择器而不是 #id，避免标题里出现 CSS 特殊字符时选择器失效
      await expect(page.locator(`.prose [id="${slug}"]`), `锚点 #${slug} 没有对应标题`).toHaveCount(
        1,
      );
    }
  });

  test('项目详情页同样有目录', async ({ page }) => {
    const href = await findProjectPageWithToc(page, 2);
    if (!href) {
      test.skip(true, '站内没有标题足够多的项目页，无从断言');
      return;
    }

    await page.goto(href);
    await expect(page.locator('.toc')).toBeVisible();
    await expect(page.locator('.toc__link').first()).toBeVisible();
  });

  test('目录项的文字与标题文字一致', async ({ page }) => {
    const href = await findPageWithToc(page, 2);
    if (!href) {
      test.skip(true, '站内没有标题足够多、会渲染目录的页面');
      return;
    }

    await page.goto(href);

    const tocTexts = await page.locator('.toc__link').allTextContents();
    const slugs = await tocSlugs(page);

    for (const [index, slug] of slugs.entries()) {
      const heading = await page.locator(`.prose [id="${slug}"]`).textContent();
      expect(tocTexts[index]?.trim()).toBe(heading?.trim());
    }
  });

  test('目录只收录 1–4 级标题', async ({ page }) => {
    // 把所有会渲染目录的页面都过一遍，而不是只看写死的那一个
    const checked: string[] = [];

    for (const url of await collectDetailHrefs(page)) {
      await page.goto(url);

      const tags = await page.locator('.toc__link').evaluateAll((nodes) =>
        nodes.map((node) => {
          const slug = decodeURIComponent((node as HTMLAnchorElement).hash.slice(1));
          return document.getElementById(slug)?.tagName ?? '';
        }),
      );

      if (tags.length === 0) continue;
      checked.push(url);

      for (const tag of tags) {
        expect(['H1', 'H2', 'H3', 'H4'], `${url} 的目录收录了 ${tag}`).toContain(tag);
      }
    }

    expect(checked.length, '站内没有任何页面渲染出目录').toBeGreaterThan(0);
  });

  test('点击目录项跳到对应标题并标为当前', async ({ page }) => {
    const href = await findPageWithToc(page, 3);
    if (!href) {
      test.skip(true, '站内没有标题足够多、会渲染目录的页面');
      return;
    }

    await page.goto(href);

    /*
     * 取中间一项，不取首尾：
     * 第一项常常本来就在视口内，点了看不出「跳过去」；最后一项则可能因为页面
     * 已经滚到底而无处可去——高亮规则是「视口上方最后一个标题」，末尾那几个
     * 标题永远到不了头部区域，那样断言就会冤枉组件。
     */
    const item = page.locator('.toc__link').nth(1);
    await item.click();

    await expect(page).toHaveURL(/#.+/);
    await expect(item).toHaveAttribute('aria-current', 'true');
  });

  test('滚动时高亮跟着当前小节走', async ({ page }) => {
    const href = await findPageWithToc(page, 3);
    if (!href) {
      test.skip(true, '站内没有标题足够多、会渲染目录的页面');
      return;
    }

    await page.goto(href);
    await page.evaluate(() => window.scrollTo(0, Math.round(document.body.scrollHeight * 0.5)));

    // 有且只有一个高亮项
    const current = page.locator('.toc__link[aria-current="true"]');
    await expect(current).toHaveCount(1);

    const currentHref = await current.getAttribute('href');
    const firstHref = await page.locator('.toc__link').first().getAttribute('href');

    // 滚到中段还停在第一项，说明高亮根本没跟着走
    expect(currentHref, '滚到页面中段后高亮仍停在第一项').not.toBe(firstHref);

    // 高亮的那一项对应的标题必须真的已经越过头部区域——这正是「当前小节」的定义
    // （见 Toc.astro 的 HEADER_OFFSET = 120）
    const slug = decodeURIComponent(currentHref!.slice(1));
    const top = await page
      .locator(`.prose [id="${slug}"]`)
      .evaluate((node) => node.getBoundingClientRect().top);
    expect(top, `高亮的是「${slug}」，但该标题还在视口下方`).toBeLessThanOrEqual(120);
  });
});

test.describe('文章目录 · 窄屏', () => {
  test.use({ viewport: { width: 700, height: 900 } });

  test('目录移到正文上方，且不再吸顶', async ({ page }) => {
    const href = await findPageWithToc(page, 2);
    if (!href) {
      test.skip(true, '站内没有标题足够多、会渲染目录的页面');
      return;
    }

    await page.goto(href);

    const toc = page.locator('.toc');
    await expect(toc).toBeVisible();

    const tocBox = await toc.boundingBox();
    const bodyBox = await page.locator('.detail__body').boundingBox();

    expect(tocBox!.y).toBeLessThan(bodyBox!.y);
    expect(await toc.evaluate((node) => getComputedStyle(node).position)).toBe('static');
  });

  test('窄屏下页面不出现横向滚动', async ({ page }) => {
    for (const url of await collectDetailHrefs(page)) {
      await page.goto(url);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );

      expect(overflow, `${url} 在窄屏下横向溢出`).toBeLessThanOrEqual(1);
    }
  });
});
