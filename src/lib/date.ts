/**
 * 日期归一化。frontmatter 里的日期可能是 Date（YAML 无引号）也可能是 string
 * （YAML 带引号），这里统一成 Date，并提供一个稳定的展示格式。
 */

export function toDate(value: string | Date, fieldName = 'date'): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} 不是合法日期：${String(value)}`);
  }
  return date;
}

/** 归一化成 `YYYY-MM-DD`，用于展示与排序键。 */
export function formatDate(value: string | Date): string {
  const date = toDate(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 更新时间缺省时回落到发布时间。 */
export function resolveUpdated(date: string | Date, updated?: string | Date): Date {
  return updated === undefined ? toDate(date) : toDate(updated, 'updated');
}
