import { describe, expect, it } from 'vitest';
import {
  contentPathToUrl,
  parseInternalTarget,
  rewriteContentLink,
  toDraftsPath,
} from '../../src/lib/links';

describe('parseInternalTarget', () => {
  it('站内绝对路径解析成 path', () => {
    expect(parseInternalTarget('/posts/attention-mechanism/')).toEqual({
      path: '/posts/attention-mechanism/',
      hash: null,
    });
  });

  it('带上锚点时 path 与 hash 分开', () => {
    expect(parseInternalTarget('/posts/attention-mechanism/#掩码注意力')).toEqual({
      path: '/posts/attention-mechanism/',
      hash: '掩码注意力',
    });
  });

  it('站点根路径与模块锚点也算站内', () => {
    expect(parseInternalTarget('/')).toEqual({ path: '/', hash: null });
    // 首页的模块切换就是这种写法
    expect(parseInternalTarget('/#posts')).toEqual({ path: '/', hash: 'posts' });
  });

  it('同页锚点解析成当前页 + 该锚点', () => {
    expect(parseInternalTarget('#小结', '/posts/attention-mechanism/')).toEqual({
      path: '/posts/attention-mechanism/',
      hash: '小结',
    });
  });

  it('相对路径按当前页解析成绝对路径', () => {
    // 只认绝对路径的话，作者换一种写法这条检查就静默失效了
    expect(parseInternalTarget('../docker-layer-cache/', '/posts/attention-mechanism/')).toEqual({
      path: '/posts/docker-layer-cache/',
      hash: null,
    });
    expect(parseInternalTarget('page/2/', '/posts/')).toEqual({
      path: '/posts/page/2/',
      hash: null,
    });
  });

  it('百分号编码的中文路径与锚点被解码', () => {
    // 渲染出来的 href 里中文就是编码过的，不解码就跟页面上的 id 对不上
    expect(parseInternalTarget('/posts/attention-mechanism/#%E5%A5%BD')).toEqual({
      path: '/posts/attention-mechanism/',
      hash: '好',
    });
    expect(parseInternalTarget('/projects/%E7%AC%AC1%E7%AB%A0/')).toEqual({
      path: '/projects/第1章/',
      hash: null,
    });
  });

  it('落单的 % 不会抛错，原样返回', () => {
    // 解码失败不该中断整轮扫描——那会把后面所有链接一起漏掉
    expect(parseInternalTarget('/posts/100%/')).toEqual({ path: '/posts/100%/', hash: null });
  });

  it('查询串被丢掉，不影响判断页面存不存在', () => {
    expect(parseInternalTarget('/posts/x/?from=list')).toEqual({ path: '/posts/x/', hash: null });
  });

  it('站内静态资源也算站内目标', () => {
    // 图片、PDF 这些同样是「换个文件名就静默失效」的引用
    expect(parseInternalTarget('/images/douyin.webp')).toEqual({
      path: '/images/douyin.webp',
      hash: null,
    });
  });

  it('外链一律返回 null', () => {
    expect(parseInternalTarget('https://example.com/x')).toBeNull();
    expect(parseInternalTarget('http://example.com/x')).toBeNull();
    // 协议相对写法同样会换 origin
    expect(parseInternalTarget('//example.com/x')).toBeNull();
  });

  it('非 http 协议返回 null', () => {
    expect(parseInternalTarget('mailto:me@example.com')).toBeNull();
    expect(parseInternalTarget('tel:10086')).toBeNull();
    expect(parseInternalTarget('data:text/plain,hi')).toBeNull();
  });

  it('空值返回 null', () => {
    expect(parseInternalTarget(null)).toBeNull();
    expect(parseInternalTarget(undefined)).toBeNull();
    expect(parseInternalTarget('')).toBeNull();
  });
});

describe('toDraftsPath', () => {
  it('去掉 sync 插入的 chapters/ 层', () => {
    // 作者在 drafts/ 下看不到 chapters/，相对链接是按没有它写的
    expect(toDraftsPath('projects/书/chapters/第1章/01-起步.md')).toBe('projects/书/第1章/01-起步.md');
    expect(toDraftsPath('projects/书/chapters/第1章.md')).toBe('projects/书/第1章.md');
  });

  it('非书路径原样返回', () => {
    expect(toDraftsPath('projects/书/index.md')).toBe('projects/书/index.md');
    expect(toDraftsPath('posts/x.md')).toBe('posts/x.md');
    // 章名恰好叫 chapters 时不该被误删——只有第 3 段才是 sync 插的那层
    expect(toDraftsPath('projects/书/第1章/chapters.md')).toBe('projects/书/第1章/chapters.md');
  });
});

describe('contentPathToUrl', () => {
  it('文章与独立页面', () => {
    expect(contentPathToUrl('posts/attention-mechanism.md')).toBe('/posts/attention-mechanism/');
    expect(contentPathToUrl('pages/about.md')).toBe('/about/');
  });

  it('单文件项目与书的首页', () => {
    expect(contentPathToUrl('projects/llm-wiki.md')).toBe('/projects/llm-wiki/');
    expect(contentPathToUrl('projects/llm-wiki-laws-v1/index.md')).toBe('/projects/llm-wiki-laws-v1/');
  });

  it('projects/<目录>/<文件>.md 按「书的章」解析', () => {
    // 这个形状与「单文件项目」不冲突（后者是 projects/<文件>.md，只有两层），
    // 所以目录名写错了也会照常给出地址 —— 存不存在由 e2e 负责，见下面那条用例
    expect(contentPathToUrl('projects/第1章/02-x.md')).toBe('/projects/第1章/x/');
  });

  it('书的章与节要去掉文件名数字前缀', () => {
    // 内容层 id 保留前缀（<书>/01-入门），URL 段去掉（入门），两套并存是刻意的
    expect(contentPathToUrl('projects/书/01-第1章.md')).toBe('/projects/书/第1章/');
    expect(contentPathToUrl('projects/书/第1章/02-系统总览.md')).toBe('/projects/书/第1章/系统总览/');
    // 带 chapters/ 的生成目录路径也能解析（sync 插进去的那层）
    expect(contentPathToUrl('projects/书/chapters/第1章/02-系统总览.md')).toBe(
      '/projects/书/第1章/系统总览/',
    );
  });

  it('认不出的形状返回 null，不猜地址', () => {
    expect(contentPathToUrl('posts/sub/x.md')).toBeNull();
    expect(contentPathToUrl('projects/书/第1章/第2章/03-x.md')).toBeNull();
    expect(contentPathToUrl('posts/x.txt')).toBeNull();
    expect(contentPathToUrl('unknown/x.md')).toBeNull();
  });
});

describe('rewriteContentLink', () => {
  it('章节之间互引：解析到目标真文件再映射成地址', () => {
    expect(
      rewriteContentLink(
        '../第4章-工程化开发/07-短期记忆CLI与结构化日志.md',
        'projects/书/chapters/第5章-测试与评估/08-评估与指标.md',
      ),
    ).toBe('/projects/书/第4章-工程化开发/短期记忆CLI与结构化日志/');
  });

  it('书首页指向章节：同级引用', () => {
    expect(rewriteContentLink('./第1章-项目概述/01-入门.md', 'projects/书/index.md')).toBe(
      '/projects/书/第1章-项目概述/入门/',
    );
  });

  it('保留锚点', () => {
    expect(rewriteContentLink('../第2章/03-x.md#小结', 'projects/书/第1章/02-y.md')).toBe(
      '/projects/书/第2章/x/#小结',
    );
  });

  it('只按形状映射地址；目标存不存在由 e2e 负责', () => {
    /*
     * 改写器看的是路径形状，看不到内容目录里到底有什么文件。
     * 从书根往上跳一层会落到 `projects/<别的目录>/x.md`——形状上就是
     * 「另一本书的章」，改写器分辨不出这叫「跑出了这本书」还是「确实指向别的项目」，
     * 所以照常给出一个地址。这种地址显然打不开，由 content.spec.ts 里那条
     * 站内链接检查报出来。**这正是那条 e2e 存在的意义**：
     * 源文件里那 8 处 `../第…` 就是这么写错的。
     */
    expect(rewriteContentLink('../第1章/01-x.md', 'projects/书/index.md')).toBe('/projects/第1章/x/');
    expect(rewriteContentLink('../不存在的章/01-x.md', 'projects/书/第1章/02-y.md')).toBe(
      '/projects/书/不存在的章/x/',
    );
  });

  it('形状本身就不成立的返回 null，不猜地址', () => {
    // `..` 用过头，跳出内容根
    expect(rewriteContentLink('../../../x.md', 'projects/书/第1章/02-y.md')).toBeNull();
    // 章节下面还有第三层，书最多两级
    expect(rewriteContentLink('./第2章/第3节/04-x.md', 'projects/书/第1章/02-y.md')).toBeNull();
  });

  it('不该管的链接一律不碰', () => {
    expect(rewriteContentLink('/posts/x/', 'projects/书/index.md')).toBeNull();
    expect(rewriteContentLink('https://example.com/x.md', 'projects/书/index.md')).toBeNull();
    expect(rewriteContentLink('#小结', 'projects/书/index.md')).toBeNull();
    expect(rewriteContentLink('./图.png', 'projects/书/index.md')).toBeNull();
    expect(rewriteContentLink(null, 'projects/书/index.md')).toBeNull();
  });
});
