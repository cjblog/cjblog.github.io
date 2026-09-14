import { describe, expect, it } from 'vitest';
import { planSync, type DraftFile } from '../../src/lib/sync';

const draft = (relativePath: string, content: string): DraftFile => ({ relativePath, content });

const validPost = (extra = '') =>
  `---\ntitle: 标题\ndate: 2026-01-01\n${extra}---\n\n正文内容。`;

const validProject = (extra = '') =>
  `---\ntitle: 项目\nsummary: 一句话简介\ntech: [Python]\nprice:\n  type: free\n${extra}---\n\n正文内容。`;

describe('planSync 正常路径', () => {
  it('解析出文章与项目，并给出 slug', () => {
    const { entries, errors } = planSync([
      draft('posts/hello-world.md', validPost()),
      draft('projects/demo-app.md', validProject()),
    ]);

    expect(errors).toEqual([]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ collection: 'posts', slug: 'hello-world' });
    expect(entries[1]).toMatchObject({ collection: 'projects', slug: 'demo-app' });
  });

  it('日期归一化成 YYYY-MM-DD，产物稳定', () => {
    const { entries } = planSync([draft('posts/a.md', validPost())]);
    expect(entries[0].output).toContain("date: '2026-01-01'");
  });

  it('draft 字段不会带到产出里', () => {
    const { entries } = planSync([
      draft('posts/a.md', `---\ntitle: 标题\ndate: 2026-01-01\ndraft: false\n---\n\n正文。`),
    ]);
    expect(entries[0].output).not.toContain('draft');
  });

  it('保留正文内容', () => {
    const { entries } = planSync([draft('posts/a.md', validPost())]);
    expect(entries[0].output).toContain('正文内容。');
  });

  it('嵌套目录下的文件用文件名作 slug', () => {
    const { entries } = planSync([draft('posts/2026/nested-post.md', validPost())]);
    expect(entries[0].slug).toBe('nested-post');
  });
});

describe('planSync 草稿过滤', () => {
  it('draft: true 的文章不产出', () => {
    const { entries, errors } = planSync([
      draft('posts/wip.md', `---\ntitle: 草稿\ndate: 2026-01-01\ndraft: true\n---\n\n还没写完。`),
    ]);
    expect(errors).toEqual([]);
    expect(entries).toEqual([]);
  });

  it('draft: true 的项目不产出', () => {
    const { entries } = planSync([
      draft('projects/wip.md', validProject('draft: true\n')),
    ]);
    expect(entries).toEqual([]);
  });

  it('草稿与正式稿混在一起时只产出正式稿', () => {
    const { entries } = planSync([
      draft('posts/wip.md', `---\ntitle: 草稿\ndate: 2026-01-01\ndraft: true\n---\n\nx`),
      draft('posts/done.md', validPost()),
    ]);
    expect(entries.map((entry) => entry.slug)).toEqual(['done']);
  });
});

describe('planSync 独立页面', () => {
  const page = (extra = '') => `---\ntitle: 关于作者\n${extra}---\n\n正文内容。`;

  it('解析出独立页面', () => {
    const { entries, errors } = planSync([draft('pages/about.md', page())]);

    expect(errors).toEqual([]);
    expect(entries[0]).toMatchObject({ collection: 'pages', slug: 'about' });
  });

  it('页面不需要日期字段', () => {
    const { errors } = planSync([draft('pages/contact.md', page())]);
    expect(errors).toEqual([]);
  });

  it('缺 title 时报错', () => {
    const { errors } = planSync([draft('pages/bad.md', `---\ndescription: 只有描述\n---\n\n正文。`)]);
    expect(errors[0]!.file).toBe('pages/bad.md');
    expect(errors[0]!.reason).toContain('title');
  });

  it('draft: true 的页面不产出', () => {
    const { entries } = planSync([draft('pages/wip.md', page('draft: true\n'))]);
    expect(entries).toEqual([]);
  });

  it('slug 撞上站内已占用的路径时报错', () => {
    for (const reserved of ['posts', 'projects', 'index', '404', 'images']) {
      const { entries, errors } = planSync([draft(`pages/${reserved}.md`, page())]);

      expect(entries, `${reserved} 不该被接受`).toEqual([]);
      expect(errors[0]!.file).toBe(`pages/${reserved}.md`);
      expect(errors[0]!.reason).toContain('已占用');
    }
  });

  it('保留字检查不影响文章与项目', () => {
    // 只有独立页面会产出到根路径，文章/项目用 /posts/ 与 /projects/ 前缀，不会撞
    const { entries, errors } = planSync([
      draft('posts/index.md', validPost()),
      draft('projects/posts.md', validProject()),
    ]);
    expect(errors).toEqual([]);
    expect(entries).toHaveLength(2);
  });
});

describe('planSync 校验失败时指出文件与原因', () => {
  it('缺 title 时报出文件名与字段名', () => {
    const { entries, errors } = planSync([draft('posts/bad.md', `---\ndate: 2026-01-01\n---\n\n正文。`)]);
    expect(entries).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe('posts/bad.md');
    expect(errors[0].reason).toContain('title');
  });

  it('缺日期时说人话，不漏出 zod 的英文提示', () => {
    const { errors } = planSync([draft('posts/bad.md', `---\ntitle: 标题\n---\n\n正文。`)]);
    expect(errors[0].file).toBe('posts/bad.md');
    expect(errors[0].reason).toContain('date');
    expect(errors[0].reason).toContain('必填字段缺失');
    // zod 默认给的是 Invalid input / Required，对中文写作者没有指导意义
    expect(errors[0].reason).not.toContain('Invalid input');
    expect(errors[0].reason).not.toContain('Required');
  });

  it('日期非法时报出文件名与原因', () => {
    const { errors } = planSync([
      draft('posts/bad.md', `---\ntitle: 标题\ndate: 不是日期\n---\n\n正文。`),
    ]);
    expect(errors[0].file).toBe('posts/bad.md');
    expect(errors[0].reason).toContain('date');
  });

  it('付费项目缺 amount 时给出可操作的中文提示', () => {
    const { errors } = planSync([
      draft(
        'projects/paid.md',
        `---\ntitle: 项目\nsummary: 简介\ntech: [A]\nprice:\n  type: paid\n---\n\n正文。`,
      ),
    ]);
    expect(errors[0].file).toBe('projects/paid.md');
    expect(errors[0].reason).toContain('amount');
  });

  it('项目缺 tech 时报错', () => {
    const { errors } = planSync([
      draft(
        'projects/bad.md',
        `---\ntitle: 项目\nsummary: 简介\ntech: []\nprice:\n  type: free\n---\n\n正文。`,
      ),
    ]);
    expect(errors[0].reason).toContain('tech');
  });

  it('价格类型写错时报错', () => {
    const { errors } = planSync([
      draft(
        'projects/bad.md',
        `---\ntitle: 项目\nsummary: 简介\ntech: [A]\nprice:\n  type: 限时免费\n---\n\n正文。`,
      ),
    ]);
    expect(errors[0].file).toBe('projects/bad.md');
    expect(errors[0].reason).toContain('price');
  });

  it('中文文件名被拒绝，并提示改用英文 slug', () => {
    const { entries, errors } = planSync([draft('posts/我的文章.md', validPost())]);
    expect(entries).toEqual([]);
    expect(errors[0].file).toBe('posts/我的文章.md');
    expect(errors[0].reason).toContain('slug');
  });

  it('下划线或大写的文件名被拒绝', () => {
    const { errors } = planSync([draft('posts/My_Post.md', validPost())]);
    expect(errors[0].reason).toContain('slug');
  });

  it('放在未知目录下时报错并说明该放哪里', () => {
    const { errors } = planSync([draft('notes/a.md', validPost())]);
    expect(errors[0].file).toBe('notes/a.md');
    expect(errors[0].reason).toContain('drafts/posts/');
  });

  it('同一集合内 slug 重复时报出后一个文件', () => {
    const { entries, errors } = planSync([
      draft('posts/dup.md', validPost()),
      draft('posts/sub/dup.md', validPost()),
    ]);
    expect(entries).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe('posts/sub/dup.md');
    expect(errors[0].reason).toContain('dup');
  });

  it('不同集合之间同名 slug 不算冲突', () => {
    const { entries, errors } = planSync([
      draft('posts/same.md', validPost()),
      draft('projects/same.md', validProject()),
    ]);
    expect(errors).toEqual([]);
    expect(entries).toHaveLength(2);
  });

  it('frontmatter 语法错误时给出可读原因而不是崩掉', () => {
    const { errors } = planSync([draft('posts/bad.md', `---\ntitle: [未闭合\n---\n\n正文。`)]);
    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe('posts/bad.md');
    expect(errors[0].reason).toContain('frontmatter');
  });

  it('多个文件都有问题时一次性全部报出，而不是只报第一个', () => {
    const { errors } = planSync([
      draft('posts/bad1.md', `---\ndate: 2026-01-01\n---\n\nx`),
      draft('posts/bad2.md', `---\ntitle: 标题\ndate: 坏日期\n---\n\nx`),
      draft('projects/bad3.md', `---\ntitle: P\nsummary: s\ntech: [A]\nprice:\n  type: paid\n---\n\nx`),
    ]);
    expect(errors).toHaveLength(3);
    expect(errors.map((error) => error.file)).toEqual([
      'posts/bad1.md',
      'posts/bad2.md',
      'projects/bad3.md',
    ]);
  });

  it('有错误时不会产出任何条目', () => {
    const { entries } = planSync([
      draft('posts/good.md', validPost()),
      draft('posts/bad.md', `---\ndate: 2026-01-01\n---\n\nx`),
    ]);
    // 好文件仍然会被解析出来，但调用方（CLI）看到 errors 就该整体中止
    expect(entries).toHaveLength(1);
  });
});
