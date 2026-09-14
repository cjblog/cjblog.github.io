import { describe, expect, it } from 'vitest';
import {
  countWords,
  estimateReadingMinutes,
  formatReadingTime,
  readingStats,
} from '../../src/lib/reading-time';

describe('countWords', () => {
  it('空正文与纯空白返回 0', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n\n  \t ')).toBe(0);
  });

  it('只有 markdown 标记、没有正文时返回 0', () => {
    expect(countWords('## \n\n---\n\n> \n\n- ')).toBe(0);
  });

  it('纯中文按字计数', () => {
    expect(countWords('今天天气不错')).toBe(6);
  });

  it('纯英文按词计数', () => {
    expect(countWords('the quick brown fox')).toBe(4);
  });

  it('中英混排时同一段文字不会被数两遍', () => {
    // 4 个汉字 + 2 个英文词
    expect(countWords('模型 model 训练 training')).toBe(6);
  });

  it('中英混排且英文带连字符与撇号时按一个词计', () => {
    // state-of-the-art(1) + don't(1) + 与(1) + 都是词(3)
    expect(countWords("state-of-the-art 与 don't 都是词")).toBe(6);
  });

  it('公式不计入字数', () => {
    expect(countWords('$E = mc^2$')).toBe(0);
    expect(countWords('$$\n\\int_0^1 x \\, dx\n$$')).toBe(0);
    expect(countWords('\\[ a^2 + b^2 = c^2 \\]')).toBe(0);
  });

  it('公式旁边的正文照常计数', () => {
    // 能量(2) + 很有名(3)，公式贡献 0
    expect(countWords('能量 $E = mc^2$ 很有名')).toBe(5);
  });

  it('代码块内容计入字数', () => {
    // const / answer / 42
    expect(countWords('```js\nconst answer = 42\n```')).toBe(3);
  });

  it('行内代码的反引号本身不算字符', () => {
    expect(countWords('`npm run build`')).toBe(3);
  });

  it('HTML 标签不计入字数', () => {
    expect(countWords('<div class="note">提示</div>')).toBe(2);
  });

  it('图片保留 alt 文本、丢掉路径', () => {
    expect(countWords('![架构图](/images/a-b-c.svg)')).toBe(3);
  });
});

describe('estimateReadingMinutes', () => {
  it('没有字数时为 0', () => {
    expect(estimateReadingMinutes(0)).toBe(0);
    expect(estimateReadingMinutes(-5)).toBe(0);
    expect(estimateReadingMinutes(Number.NaN)).toBe(0);
  });

  it('不足一分钟的按一分钟计', () => {
    expect(estimateReadingMinutes(1)).toBe(1);
    expect(estimateReadingMinutes(300)).toBe(1);
  });

  it('超过一分钟后向上取整', () => {
    expect(estimateReadingMinutes(301)).toBe(2);
    expect(estimateReadingMinutes(1500)).toBe(5);
  });

  it('可以覆盖阅读速度', () => {
    expect(estimateReadingMinutes(100, 50)).toBe(2);
  });

  it('阅读速度非正数时抛错，而不是算出 Infinity', () => {
    expect(() => estimateReadingMinutes(100, 0)).toThrow(/wordsPerMinute/);
    expect(() => estimateReadingMinutes(100, -1)).toThrow(/wordsPerMinute/);
  });
});

describe('formatReadingTime', () => {
  it('0 分钟显示为不足 1 分钟', () => {
    expect(formatReadingTime(0)).toBe('不足 1 分钟');
  });

  it('正常分钟数带上「约」', () => {
    expect(formatReadingTime(5)).toBe('约 5 分钟');
  });
});

describe('readingStats', () => {
  it('一次性给出字数、分钟数与文案', () => {
    const stats = readingStats('啊'.repeat(900));
    expect(stats.wordCount).toBe(900);
    expect(stats.minutes).toBe(3);
    expect(stats.label).toBe('约 3 分钟');
  });

  it('空文章不会算出 0 分钟以外的怪值', () => {
    expect(readingStats('')).toEqual({ wordCount: 0, minutes: 0, label: '不足 1 分钟' });
  });
});
