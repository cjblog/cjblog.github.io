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

  test('页面的 markdown 正常渲染', async ({ page }) => {
    await page.goto('/about/');

    await expect(page.locator('.prose h2').first()).toBeVisible();
    await expect(page.locator('.prose table')).toBeVisible();
    await expect(page.locator('.prose li').first()).toBeVisible();
  });

  test('正文里的站内链接可以走通', async ({ page }) => {
    await page.goto('/about/');

    const link = page.locator('.prose a[href^="/"]').first();
    const href = await link.getAttribute('href');
    await link.click();

    await expect(page).toHaveURL(new RegExp(`${href!.replace(/\/$/, '')}/?$`));
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
