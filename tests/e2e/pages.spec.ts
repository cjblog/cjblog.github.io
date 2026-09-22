import { expect, test } from '@playwright/test';

/** 独立页面（drafts/pages/*.md）。目前只有「关于作者」。 */
test.describe('独立页面', () => {
  test('关于作者页可以访问', async ({ page }) => {
    const response = await page.goto('/about/');

    expect(response?.status()).toBe(200);
    await expect(page.locator('.detail__title')).toHaveText('关于作者');
  });

  test('导航上高亮的是「关于作者」这一项', async ({ page }) => {
    await page.goto('/about/');

    await expect(page.locator('.site-nav__link[aria-current="true"]')).toHaveText('关于作者');
  });

  test('从导航点得进来', async ({ page }) => {
    await page.goto('/');
    await page.locator('.site-nav__link', { hasText: '关于作者' }).click();

    await expect(page).toHaveURL(/\/about\/$/);
    await expect(page.locator('.detail__title')).toHaveText('关于作者');
  });

  /*
   * 只断言「模板保证的东西」：正文容器在、markdown 真的变成了元素。
   *
   * 别去断言具体的表格 / 列表 / 站内链接是否出现——那些是正文内容，不是模板行为。
   * 这条用例原本断言 .prose table 与 .prose li，结果作者精简了一下「关于作者」，
   * 模板一个字没改，CI 却挂了、连带部署被卡住（测试失败就不部署）。
   * 独立页面只有这一个，把断言绑在它的正文上就等于绑在作者随时会改的稿子上。
   *
   * 表格、图片、公式的渲染回归由 projects.spec.ts 的「详情页渲染表格、图片与公式」
   * 兜底——项目页与独立页面用的是同一个 .prose 容器、同一条 markdown 流水线。
   */
  test('正文的 markdown 被渲染成了真正的元素', async ({ page }) => {
    await page.goto('/about/');

    await expect(page.locator('.prose')).toBeVisible();
    await expect(page.locator('.prose h2').first()).toBeVisible();
    await expect(page.locator('.prose p').first()).toBeVisible();
  });
});

test.describe('首页与独立页面互不干扰', () => {
  test('首页导航只高亮两个模块，不碰「关于作者」', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.site-nav__link[aria-current="true"]')).toHaveText('项目浏览');

    await page.locator('[data-module="posts"]').click();
    await expect(page.locator('.site-nav__link[aria-current="true"]')).toHaveText('技术文章');

    // 关于作者不在首页的模块切换里，任何时候都不该被首页脚本点亮
    await expect(page.locator('.site-nav__link', { hasText: '关于作者' })).not.toHaveAttribute(
      'aria-current',
      'true',
    );
  });
});
