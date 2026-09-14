import type { Price, PriceType } from './schema';

/**
 * 价格 → 展示标签与颜色。需求规定的映射：免费=绿，限时免费=红，付费=紫。
 *
 * 颜色只在这里定义一次，组件消费 resolvePriceBadge() 的结果，
 * 不在组件或样式里散落硬编码色值，否则改配色一定会漏改。
 */

export const PRICE_COLORS: Record<PriceType, string> = {
  free: '#16a34a',
  'limited-free': '#dc2626',
  paid: '#7c3aed',
};

export interface PriceBadge {
  type: PriceType;
  /** 卡片上显示的文案 */
  label: string;
  /** 供 CSS 命中的类名 */
  className: string;
  color: string;
}

export function resolvePriceBadge(price: Price): PriceBadge {
  switch (price.type) {
    case 'free':
      return {
        type: price.type,
        label: '免费',
        className: 'price-badge--free',
        color: PRICE_COLORS.free,
      };
    case 'limited-free':
      return {
        type: price.type,
        label: '限时免费',
        className: 'price-badge--limited-free',
        color: PRICE_COLORS['limited-free'],
      };
    case 'paid':
      // schema 已经保证 paid 必有 amount，这里是纵深防御：
      // 万一有调用方绕过 schema 传进来，宁可抛错也不要渲染出「付费:undefined元」。
      if (typeof price.amount !== 'number' || !Number.isFinite(price.amount)) {
        throw new Error('price.type 为 paid 时必须提供合法的 amount');
      }
      return {
        type: price.type,
        label: `付费:${formatAmount(price.amount)}元`,
        className: 'price-badge--paid',
        color: PRICE_COLORS.paid,
      };
  }
}

/** 整数不带小数点，小数最多保留两位且去掉尾随 0（99 → "99"，9.5 → "9.5"）。 */
function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : String(Number(amount.toFixed(2)));
}
