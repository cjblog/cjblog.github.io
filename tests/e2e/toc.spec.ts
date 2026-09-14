import { expect, test } from '@playwright/test';

/** 取出目录里每一项指向的标题 id（href 里的中文是编码过的，要解码） */
async function tocSlugs(page: import('@playwright/test').Page): Promise<string[]> {
  return page
    .locator('.toc__link')
    .evaluateAll((nodes) =>
      nodes.map((node) => decodeURIComponent((node as HTMLAnchorElement).hash.slice(1))),
    );
}

test.describe('文章目录', () => {
  test('文章页显示目录，且每个锚点都能找到对应标题', async ({ page }) => {
    await page.goto('/posts/latex-common-syntax/');

    await expect(page.locator('.toc')).toBeVisible();

    const slugs = await tocSlugs(page);
    expect(slugs.length).toBeGreaterThan(5);

    for (const slug of slugs) {
      // 用属性选择器而不是 #id，避免标题里出现 CSS 特殊字符时选择器失效
      await expect(page.locator(`.prose [id="${slug}"]`), `锚点 #${slug} 没有对应标题`).toHaveCount(
        1,
      );
    }
  });

  test('项目详情页同样有目录', async ({ page }) => {
    await page.goto('/projects/llm-wiki/');

    await expect(page.locator('.toc')).toBeVisible();
    await expect(page.locator('.toc__link').first()).toBeVisible();
  });

  test('目录项的文字与标题文字一致', async ({ page }) => {
    await page.goto('/posts/latex-common-syntax/');

    const tocTexts = await page.locator('.toc__link').allTextContents();
    const slugs = await tocSlugs(page);

    for (const [index, slug] of slugs.entries()) {
      const heading = await page.locator(`.prose [id="${slug}"]`).textContent();
      expect(tocTexts[index]?.trim()).toBe(heading?.trim());
    }
  });

  test('目录只收录 1–4 级标题', async ({ page }) => {
    for (const url of ['/posts/latex-common-syntax/', '/projects/llm-wiki/', '/about/']) {
      await page.goto(url);

      const tags = await page.locator('.toc__link').evaluateAll((nodes) =>
        nodes.map((node) => {
          const slug = decodeURIComponent((node as HTMLAnchorElement).hash.slice(1));
          return document.getElementById(slug)?.tagName ?? '';
        }),
      );

      expect(tags.length, `${url} 没有目录项`).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(['H1', 'H2', 'H3', 'H4'], `${url} 的目录收录了 ${tag}`).toContain(tag);
      }
    }
  });

  test('点击目录项跳到对应标题并标为当前', async ({ page }) => {
    await page.goto('/posts/latex-common-syntax/');

    const item = page.locator('.toc__link').nth(3);
    await item.click();

    await expect(page).toHaveURL(/#.+/);
    await expect(item).toHaveAttribute('aria-current', 'true');
  });

  test('滚动时高亮跟着当前小节走', async ({ page }) => {
    await page.goto('/posts/latex-common-syntax/');

    const heading = page.locator('.prose h2').nth(6);
    const title = (await heading.textContent())?.trim();
    await heading.evaluate((node) => node.scrollIntoView());

    await expect(page.locator('.toc__link[aria-current="true"]')).toHaveText(title as string);
  });
});

test.describe('文章目录 · 窄屏', () => {
  test.use({ viewport: { width: 700, height: 900 } });

  test('目录移到正文上方，且不再吸顶', async ({ page }) => {
    await page.goto('/posts/latex-common-syntax/');

    const toc = page.locator('.toc');
    await expect(toc).toBeVisible();

    const tocBox = await toc.boundingBox();
    const bodyBox = await page.locator('.detail__body').boundingBox();

    expect(tocBox!.y).toBeLessThan(bodyBox!.y);
    expect(await toc.evaluate((node) => getComputedStyle(node).position)).toBe('static');
  });

  test('窄屏下页面不出现横向滚动', async ({ page }) => {
    await page.goto('/posts/latex-common-syntax/');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBeLessThanOrEqual(1);
  });
});
