import { stripMarkdown } from './markdown';

/** 中日韩字符：每个字符按一个词计。 */
const CJK_RE = /[㐀-䶿一-鿿豈-﫿぀-ヿㇰ-ㇿ가-힯]/g;
/** 拉丁词：字母数字，允许词内的连字符与撇号。 */
const LATIN_WORD_RE = /[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g;

/**
 * 中文技术文章的估算阅读速度（字/分钟）。
 *
 * 这个值决定站内所有「阅读 约 X 分钟」的数字，是产品设定而不是物理常数：
 * 调它会同时改变列表项、文章详情页与书的章节页。
 *
 * 当前值是按「把阅读时间在原有基础上翻一倍」定的（原为 300）。
 * 改这里之前先想清楚——全站每一处的阅读时长都会跟着变。
 */
export const DEFAULT_WORDS_PER_MINUTE = 150;

/**
 * 统计字数：中日韩字符按字计，拉丁文按词计。
 *
 * 代码块的内容计入字数（代码也是文章内容），markdown 语法符号与公式不计入
 * ——公式是符号而非可读文字，计入会明显高估阅读时长。
 */
export function countWords(markdown: string): number {
  const text = stripMarkdown(markdown, { keepCode: true });
  const cjk = text.match(CJK_RE)?.length ?? 0;
  // 先剔除中日韩字符再数拉丁词，否则中英混排时同一段文字会被数两遍
  const latin = text.replace(CJK_RE, ' ').match(LATIN_WORD_RE)?.length ?? 0;
  return cjk + latin;
}

/** 阅读时长（分钟），向上取整；没有正文时为 0。 */
export function estimateReadingMinutes(
  wordCount: number,
  wordsPerMinute: number = DEFAULT_WORDS_PER_MINUTE,
): number {
  if (!Number.isFinite(wordCount) || wordCount <= 0) return 0;
  if (!Number.isFinite(wordsPerMinute) || wordsPerMinute <= 0) {
    throw new Error('wordsPerMinute 必须是正数');
  }
  return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
}

/** 展示用的阅读时长文案。 */
export function formatReadingTime(minutes: number): string {
  return minutes <= 0 ? '不足 1 分钟' : `约 ${minutes} 分钟`;
}

/** 一步到位：markdown → 字数 + 分钟数 + 文案。 */
export function readingStats(markdown: string, wordsPerMinute = DEFAULT_WORDS_PER_MINUTE) {
  const wordCount = countWords(markdown);
  const minutes = estimateReadingMinutes(wordCount, wordsPerMinute);
  return { wordCount, minutes, label: formatReadingTime(minutes) };
}
