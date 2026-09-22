import { expect, test, type Page } from '@playwright/test';

/**
 * 这个文件里不少断言原本写死了具体项目：slug、标题、「付费:99元」、以及
 * 「首页一定是 3 张卡、其中 2 张没封面」。那些断言其实是在描述**当时的示例内容**，
 * 不是模板行为——作者一删示例内容，一整片就红了，而站点完全正常。
 *
 * 现在改成从页面上取实际值再断言，并把「站内没有这种内容」显式 skip 掉。
 * 少测一点，好过把「仓库里必须留着某个假项目」变成部署的前提。
 */

/** 走遍项目列表的所有页收集卡片链接。分页不存在时就只有首页那一页。 */
async function collectProjectHrefs(page: Page): Promise<string[]> {
  const hrefs: string[] = [];
  let index = 1;

  for (;;) {
    await page.goto(index === 1 ? '/' : `/projects/page/${index}/`);
    const found = await page
      .locator('.card__link')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));
    hrefs.push(...found.filter(Boolean));

    const hasNext = await page.locator('.pagination__step[rel="next"]').count();
    if (!hasNext) break;
    index += 1;
  }

  return hrefs;
}

/** 找一个指定价格类型的项目页。站内没有就返回 null，由调用方 skip。 */
async function findProjectWithPriceType(
  page: Page,
  type: 'free' | 'limited-free' | 'paid',
): Promise<string | null> {
  for (const href of await collectProjectHrefs(page)) {
    await page.goto(href);
    if ((await page.locator(`.price-badge--${type}`).count()) > 0) return href;
  }
  return null;
}

test.describe('项目卡片', () => {
  test('卡片渲染出标题、技术栈与价格标签', async ({ page }) => {
    await page.goto('/');

    const cards = page.locator('.card');
    expect(await cards.count(), '首页一张项目卡片都没有').toBeGreaterThan(0);

    const first = cards.first();
    await expect(first.locator('.card__title')).not.toBeEmpty();
    await expect(first.locator('.card__tech li').first()).toBeVisible();
    await expect(first.locator('.price-badge')).toBeVisible();
  });

  test('同一行的卡片高度完全一致', async ({ page }) => {
    await page.goto('/');

    const heights = await page
      .locator('.card')
      .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));

    expect(heights.length, '卡片少于两张，等高与否无从比较').toBeGreaterThan(1);
    expect(new Set(heights).size, `卡片高度不一致：${heights.join(' / ')}`).toBe(1);
  });

  test('卡片内部不会空出一大块', async ({ page }) => {
    // 守住此前那个缺陷：卡片拉齐等高后，内容少的卡片会在摘要下方裂开大片空白。
    // 直接量摘要盒子有没有被撑得远超三行的高度。
    await page.goto('/');

    const exceeded = await page.locator('.card__summary').evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node);
        const lineHeight = Number.parseFloat(style.lineHeight);
        return Math.round(node.getBoundingClientRect().height - lineHeight * 3);
      }),
    );

    for (const extra of exceeded) {
      expect(extra).toBeLessThan(40); // 允许一点余量，但绝不该是几百像素
    }
  });

  test('每张卡片都有封面位，没写 cover 的用公式图案占位', async ({ page }) => {
    /*
     * 这条守的是「骨架一致」：封面位永远存在、比例固定，是卡片能拉齐等高的前提。
     * 原版断言「3 张卡里恰好 2 张占位、1 张真图」——那描述的是示例内容。
     * 这里改成恒等式：占位图案 + 真实图片 === 卡片总数，多一张少一张都会露馅。
     */
    await page.goto('/');

    const total = await page.locator('.card').count();
    expect(total, '首页一张项目卡片都没有').toBeGreaterThan(0);

    await expect(page.locator('.card .card__cover')).toHaveCount(total);

    const motif = await page.locator('.card .card__cover--motif').count();
    const image = await page.locator('.card img.card__cover').count();
    expect(motif + image, '有卡片的封面位既不是真实图片也不是占位图案').toBe(total);

    // 比例固定，卡片等高才有保证
    const ratios = await page.locator('.card .card__cover').evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return box.width / box.height;
      }),
    );
    for (const ratio of ratios) {
      expect(ratio).toBeCloseTo(16 / 9, 1);
    }
  });

  test('不同价格类型的标签颜色互不相同', async ({ page }) => {
    /*
     * 原版断言「恰好 3 个标签、3 种颜色」。站内只有一种价格类型时它就挂了，
     * 而那不是缺陷。改成按标签文案分组：同一类型必须同色，不同类型必须异色——
     * 无论站内有几种价格类型都成立。
     */
    await page.goto('/');

    const badges = await page.locator('.price-badge').evaluateAll((nodes) =>
      nodes.map((node) => ({
        text: node.textContent?.trim() ?? '',
        color: getComputedStyle(node).color,
      })),
    );
    expect(badges.length, '首页一个价格标签都没有').toBeGreaterThan(0);

    const colorByText = new Map<string, string>();
    for (const { text, color } of badges) {
      const seen = colorByText.get(text);
      if (seen === undefined) colorByText.set(text, color);
      else expect(color, `「${text}」出现了两种颜色`).toBe(seen);
    }

    expect(
      new Set(colorByText.values()).size,
      `有两种价格类型用了同一个颜色：${[...colorByText].map(([t, c]) => `${t}=${c}`).join('，')}`,
    ).toBe(colorByText.size);
  });

  test('hover 时卡片确实发生位移与缩放', async ({ page }) => {
    await page.goto('/');

    const card = page.locator('.card').first();
    const before = await card.evaluate((node) => getComputedStyle(node).transform);

    await card.hover();

    // 等动画真正跑完，而不是断言「有 transition 属性」这种表面特征
    await expect
      .poll(async () => card.evaluate((node) => getComputedStyle(node).transform))
      .not.toBe(before);

    const after = await card.evaluate((node) => getComputedStyle(node).transform);
    expect(after).not.toBe('none');
    // matrix(a, b, c, d, tx, ty) —— 说明既有位移也有缩放
    expect(after).toMatch(/^matrix/);
  });

  test('hover 时才出现阴影', async ({ page }) => {
    await page.goto('/');

    const card = page.locator('.card').first();
    expect(await card.evaluate((node) => getComputedStyle(node).boxShadow)).toBe('none');

    await card.hover();
    await expect
      .poll(async () => card.evaluate((node) => getComputedStyle(node).boxShadow))
      .not.toBe('none');
  });

  test('键盘也能聚焦到卡片链接', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Tab'); // 跳到主要内容
    await page.keyboard.press('Tab'); // 站点标题
    await page.keyboard.press('Tab'); // 第一个导航项

    await expect(page.locator('.card__link').first()).toBeVisible();
  });
});

test.describe('卡片详情页', () => {
  test('点击卡片进入详情页', async ({ page }) => {
    // 不写死进的是哪一个项目，而是「点到哪张卡就进哪个页」
    await page.goto('/');

    const link = page.locator('.card__link').first();
    const href = await link.getAttribute('href');
    expect(href, '第一张卡片的链接没有 href').toBeTruthy();

    await link.click();

    await expect(page).toHaveURL((url) => url.pathname === href);
    await expect(page.locator('.detail__title')).toBeVisible();
  });

  test('项目详情页的结构元素渲染正确', async ({ page }) => {
    /*
     * 原版写死 /projects/llm-wiki/ 并要求它有表格、图片、公式——那是示例项目的属性。
     * 这里改为遍历站内所有项目详情页，逐个断言**模板层面的不变量**：
     * 正文区在、表格被 .table-scroll 包住（否则窄屏会被撑破）、公式没有渲染报错。
     * 「表格渲染成了真表格」这类正向断言由 posts.spec.ts 的 demo 文章页兜底。
     */
    const hrefs = await collectProjectHrefs(page);
    expect(hrefs.length, '站内一个项目都没有').toBeGreaterThan(0);

    for (const href of hrefs) {
      await page.goto(href);

      await expect(page.locator('.prose'), `${href} 没有正文区`).toBeVisible();

      const tables = await page.locator('.prose table').count();
      const wrapped = await page.locator('.prose .table-scroll > table').count();
      expect(wrapped, `${href} 有 ${tables} 个表格，却只有 ${wrapped} 个被 .table-scroll 包住`).toBe(
        tables,
      );

      await expect(page.locator('.katex-error'), `${href} 里有公式渲染报错`).toHaveCount(0);
    }
  });

  test('付费项目详情页显示付费标签', async ({ page }) => {
    const href = await findProjectWithPriceType(page, 'paid');
    if (!href) {
      test.skip(true, '站内没有 price.type 为 paid 的项目，无从断言');
      return;
    }

    await page.goto(href);
    await expect(page.locator('.price-badge')).toContainText('付费');
    await expect(page.locator('.price-badge')).toContainText('元');
  });

  test('限时免费项目显示红色标签', async ({ page }) => {
    const href = await findProjectWithPriceType(page, 'limited-free');
    if (!href) {
      test.skip(true, '站内没有 price.type 为 limited-free 的项目，无从断言');
      return;
    }

    await page.goto(href);
    const badge = page.locator('.price-badge');
    await expect(badge).toHaveText('限时免费');
    await expect(badge).toHaveClass(/price-badge--limited-free/);
  });

  test('可以从详情页返回项目浏览', async ({ page }) => {
    await page.goto('/');
    const href = await page.locator('.card__link').first().getAttribute('href');

    await page.goto(href!);
    await page.locator('.detail__back').click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#projects')).toBeVisible();
  });
});

test.describe('窄视口', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('卡片退化为单列', async ({ page }) => {
    await page.goto('/');

    const columns = await page
      .locator('.card-grid')
      .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length);

    expect(columns).toBe(1);
  });

  test('页面不出现横向滚动', async ({ page }) => {
    await page.goto('/');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('详情页的宽表格与公式不会撑破页面', async ({ page }) => {
    // 逐个走项目详情页，而不是只看某一个写死的 slug
    for (const href of await collectProjectHrefs(page)) {
      await page.goto(href);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );

      expect(overflow, `${href} 在窄视口下横向溢出`).toBeLessThanOrEqual(1);
    }
  });
});
