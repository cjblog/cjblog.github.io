import { expect, test } from '@playwright/test';

test.describe('项目卡片', () => {
  test('三张卡片都渲染出来，含标题、技术栈与价格标签', async ({ page }) => {
    await page.goto('/');

    const cards = page.locator('.card');
    await expect(cards).toHaveCount(3);

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

    expect(heights).toHaveLength(3);
    expect(new Set(heights).size).toBe(1);
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

  test('没写 cover 的项目也有封面位，骨架才一致', async ({ page }) => {
    await page.goto('/');

    // 三张卡片都有封面位：两张是公式图案占位，一张是真实封面图
    await expect(page.locator('.card .card__cover')).toHaveCount(3);
    await expect(page.locator('.card .card__cover--motif')).toHaveCount(2);
    await expect(page.locator('.card img.card__cover')).toHaveCount(1);
  });

  test('三种价格标签的颜色互不相同', async ({ page }) => {
    await page.goto('/');

    const colors = await page
      .locator('.price-badge')
      .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).color));

    expect(colors).toHaveLength(3);
    expect(new Set(colors).size).toBe(3);
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
    await page.goto('/');
    await page.locator('.card__link').first().click();

    await expect(page).toHaveURL(/\/projects\/llm-wiki\/$/);
    await expect(page.locator('.detail__title')).toBeVisible();
  });

  test('详情页渲染表格、图片与公式', async ({ page }) => {
    await page.goto('/projects/llm-wiki/');

    await expect(page.locator('.prose table')).toBeVisible();
    await expect(page.locator('.prose img')).toBeVisible();
    // 断言是 KaTeX 真正渲染出来的标记，而不是原文里的 $ 符号
    await expect(page.locator('.prose .katex').first()).toBeVisible();
    await expect(page.locator('.prose .katex-display').first()).toBeVisible();
    await expect(page.locator('.prose')).not.toContainText('$');
  });

  test('付费项目详情页显示价格与项目链接', async ({ page }) => {
    await page.goto('/projects/math-typesetting-toolkit/');

    await expect(page.locator('.price-badge')).toHaveText('付费:99元');
    await expect(page.locator('.detail__title')).toHaveText('数学排版工具集');
  });

  test('限时免费项目显示红色标签', async ({ page }) => {
    await page.goto('/projects/rag-qa-system/');

    const badge = page.locator('.price-badge');
    await expect(badge).toHaveText('限时免费');
    await expect(badge).toHaveClass(/price-badge--limited-free/);
  });

  test('可以从详情页返回项目浏览', async ({ page }) => {
    await page.goto('/projects/llm-wiki/');
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
    await page.goto('/posts/markdown-rendering-demo/');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBeLessThanOrEqual(1);
  });
});
