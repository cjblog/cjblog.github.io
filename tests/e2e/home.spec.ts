import { expect, test } from '@playwright/test';

test.describe('首页模块切换', () => {
  test('默认展示「项目浏览」', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#projects')).toBeVisible();
    await expect(page.locator('#posts')).toBeHidden();
    await expect(page.locator('[data-module="projects"]')).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  test('点击导航切到「技术文章」，页面不整页刷新', async ({ page }) => {
    await page.goto('/');

    await page.locator('[data-module="posts"]').click();

    await expect(page.locator('#posts')).toBeVisible();
    await expect(page.locator('#projects')).toBeHidden();
    await expect(page.locator('[data-module="posts"]')).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(page.locator('[data-module="projects"]')).not.toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(new URL(page.url()).hash).toBe('#posts');
  });

  test('可以直接访问 /#posts 并停在「技术文章」', async ({ page }) => {
    await page.goto('/#posts');

    await expect(page.locator('#posts')).toBeVisible();
    await expect(page.locator('#projects')).toBeHidden();
  });

  test('切换回「项目浏览」也正常', async ({ page }) => {
    await page.goto('/#posts');
    await expect(page.locator('#posts')).toBeVisible();

    await page.locator('[data-module="projects"]').click();

    await expect(page.locator('#projects')).toBeVisible();
    await expect(page.locator('#posts')).toBeHidden();
  });

  test('两个模块的内容都渲染进 HTML', async ({ page }) => {
    const response = await page.goto('/');
    const html = (await response?.text()) ?? '';

    // 靠 CSS 的 :target 切换，所以两块内容都必须渲染进 HTML
    expect(html).toContain('id="projects"');
    expect(html).toContain('id="posts"');
    expect(html).toContain('card-grid');
    expect(html).toContain('blog-layout');
  });
});

test.describe('首页无 JS 场景', () => {
  test.use({ javaScriptEnabled: false });

  test('禁用 JS 时「技术文章」依然可达', async ({ page }) => {
    await page.goto('/#posts');

    await expect(page.locator('#posts')).toBeVisible();
    await expect(page.locator('#projects')).toBeHidden();
  });
});
