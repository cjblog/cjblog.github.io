import { describe, expect, it } from 'vitest';
import {
  selectPinnedPosts,
  sortPostsByDateDesc,
  sortProjects,
} from '../../src/lib/sort';

/**
 * 这里的测试数据刻意用 Astro CollectionEntry 的形状（内容挂在 data 下）。
 * 曾经因为按拍平的 { date, title } 写测试，单测全绿但站点构建报
 * 「date 不是合法日期：undefined」—— 形状对齐本身就是回归测试的一部分。
 */
const post = (title: string, date: string | Date, pinned = false) => ({
  data: { title, date, pinned },
});

const project = (title: string, order: number) => ({ data: { title, order } });

describe('sortPostsByDateDesc', () => {
  it('按发布时间倒序，最新的在最前', () => {
    const sorted = sortPostsByDateDesc([
      post('旧', '2026-01-01'),
      post('新', '2026-09-01'),
      post('中', '2026-05-01'),
    ]);
    expect(sorted.map((entry) => entry.data.title)).toEqual(['新', '中', '旧']);
  });

  it('同一天按标题兜底，结果与输入顺序无关', () => {
    const forward = sortPostsByDateDesc([post('乙', '2026-01-01'), post('甲', '2026-01-01')]);
    const backward = sortPostsByDateDesc([post('甲', '2026-01-01'), post('乙', '2026-01-01')]);
    expect(forward.map((entry) => entry.data.title)).toEqual(
      backward.map((entry) => entry.data.title),
    );
  });

  it('接受字符串与 Date 两种日期', () => {
    const sorted = sortPostsByDateDesc([
      post('字符串', '2026-01-01'),
      post('Date', new Date('2026-05-01')),
    ]);
    expect(sorted[0].data.title).toBe('Date');
  });

  it('带时分秒的日期按真实时间点比较', () => {
    const sorted = sortPostsByDateDesc([
      post('早', new Date('2026-01-01T08:00:00Z')),
      post('晚', new Date('2026-01-01T20:00:00Z')),
    ]);
    expect(sorted[0].data.title).toBe('晚');
  });

  it('不修改传入的数组', () => {
    const input = [post('A', '2026-01-01'), post('B', '2026-06-01')];
    const snapshot = [...input];
    sortPostsByDateDesc(input);
    expect(input).toEqual(snapshot);
  });

  it('日期非法时抛出可读错误', () => {
    // 需要至少两个元素，Array.sort 才会调用比较器
    expect(() =>
      sortPostsByDateDesc([post('坏', '不是日期'), post('好', '2026-01-01')]),
    ).toThrow(/不是合法日期/);
  });
});

describe('selectPinnedPosts', () => {
  it('只挑出置顶文章，并保持时间倒序', () => {
    const pinned = selectPinnedPosts([
      post('普通一', '2026-09-01'),
      post('置顶旧', '2026-02-01', true),
      post('普通二', '2026-08-01'),
      post('置顶新', '2026-07-01', true),
    ]);
    expect(pinned.map((entry) => entry.data.title)).toEqual(['置顶新', '置顶旧']);
  });

  it('没有置顶文章时返回空数组', () => {
    expect(selectPinnedPosts([post('普通', '2026-01-01')])).toEqual([]);
  });

  it('空列表返回空数组', () => {
    expect(selectPinnedPosts([])).toEqual([]);
  });
});

describe('sortProjects', () => {
  it('按 order 升序，小的靠前', () => {
    const sorted = sortProjects([
      project('第三', 30),
      project('第一', 10),
      project('第二', 20),
    ]);
    expect(sorted.map((entry) => entry.data.title)).toEqual(['第一', '第二', '第三']);
  });

  it('order 相同时按标题兜底，结果确定', () => {
    const forward = sortProjects([project('乙', 10), project('甲', 10)]);
    const backward = sortProjects([project('甲', 10), project('乙', 10)]);
    expect(forward.map((entry) => entry.data.title)).toEqual(
      backward.map((entry) => entry.data.title),
    );
  });

  it('负数 order 也能正确排序', () => {
    const sorted = sortProjects([project('后', 5), project('前', -5)]);
    expect(sorted[0].data.title).toBe('前');
  });

  it('不修改传入的数组', () => {
    const input = [project('A', 2), project('B', 1)];
    const snapshot = [...input];
    sortProjects(input);
    expect(input).toEqual(snapshot);
  });
});
