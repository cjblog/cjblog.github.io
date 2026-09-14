import { describe, expect, it } from 'vitest';
import { PRICE_COLORS, resolvePriceBadge } from '../../src/lib/pricing';

describe('resolvePriceBadge', () => {
  it('免费 → 绿色标签', () => {
    const badge = resolvePriceBadge({ type: 'free' });
    expect(badge.label).toBe('免费');
    expect(badge.className).toBe('price-badge--free');
    expect(badge.color).toBe(PRICE_COLORS.free);
  });

  it('限时免费 → 红色标签', () => {
    const badge = resolvePriceBadge({ type: 'limited-free' });
    expect(badge.label).toBe('限时免费');
    expect(badge.className).toBe('price-badge--limited-free');
    expect(badge.color).toBe(PRICE_COLORS['limited-free']);
  });

  it('付费 → 紫色标签并带上价格', () => {
    const badge = resolvePriceBadge({ type: 'paid', amount: 99 });
    expect(badge.label).toBe('付费:99元');
    expect(badge.className).toBe('price-badge--paid');
    expect(badge.color).toBe(PRICE_COLORS.paid);
  });

  it('三种类型的颜色互不相同', () => {
    const colors = [
      resolvePriceBadge({ type: 'free' }).color,
      resolvePriceBadge({ type: 'limited-free' }).color,
      resolvePriceBadge({ type: 'paid', amount: 1 }).color,
    ];
    expect(new Set(colors).size).toBe(3);
  });

  it('整数金额不显示小数点', () => {
    expect(resolvePriceBadge({ type: 'paid', amount: 10.0 }).label).toBe('付费:10元');
    expect(resolvePriceBadge({ type: 'paid', amount: 199 }).label).toBe('付费:199元');
  });

  it('小数金额保留有效位、去掉尾随 0', () => {
    expect(resolvePriceBadge({ type: 'paid', amount: 9.5 }).label).toBe('付费:9.5元');
    expect(resolvePriceBadge({ type: 'paid', amount: 9.99 }).label).toBe('付费:9.99元');
    expect(resolvePriceBadge({ type: 'paid', amount: 9.9 }).label).toBe('付费:9.9元');
  });

  it('付费缺 amount 时抛错，而不是渲染出「付费:undefined元」', () => {
    // schema 层已经拦得住，这里模拟绕过 schema 的调用方
    expect(() => resolvePriceBadge({ type: 'paid' } as never)).toThrow(/amount/);
    expect(() =>
      resolvePriceBadge({ type: 'paid', amount: Number.NaN } as never),
    ).toThrow(/amount/);
  });
});

describe('PRICE_COLORS', () => {
  it('需求规定的三色：免费绿、限时免费红、付费紫', () => {
    expect(PRICE_COLORS.free).toBe('#16a34a');
    expect(PRICE_COLORS['limited-free']).toBe('#dc2626');
    expect(PRICE_COLORS.paid).toBe('#7c3aed');
  });
});
