import { describe, it, expect } from 'vitest';
import { SEASONAL_TRADE_SLUGS, seasonalTrades, tradeCollectionProblems } from '@/lib/trade-collections';
import { TRADES, getTrade } from '@/lib/trades';

describe('trade collections', () => {
  it('identifies all seasonal trades without orphan slugs', () => {
    expect(tradeCollectionProblems()).toEqual([]);
  });

  it('contains the expected seasonal trades', () => {
    expect(SEASONAL_TRADE_SLUGS).toContain('holiday-lighting');
    expect(SEASONAL_TRADE_SLUGS).toContain('lawn-care');
    expect(SEASONAL_TRADE_SLUGS).toContain('mosquito-tick-control');
    expect(SEASONAL_TRADE_SLUGS).toContain('snow-removal');
    expect(SEASONAL_TRADE_SLUGS).toContain('pool-services');
    expect(SEASONAL_TRADE_SLUGS).toContain('chimney-sweep');
    expect(SEASONAL_TRADE_SLUGS).toContain('irrigation');
    expect(SEASONAL_TRADE_SLUGS).toContain('gutters');
    expect(SEASONAL_TRADE_SLUGS).toContain('pressure-washing');
    expect(SEASONAL_TRADE_SLUGS).toHaveLength(9);
  });

  it('resolves seasonal trades to real trade objects', () => {
    const list = seasonalTrades();
    expect(list).toHaveLength(SEASONAL_TRADE_SLUGS.length);
    for (const trade of list) {
      expect(trade).toBeDefined();
      expect(trade.slug).toBeDefined();
      expect(trade.seasonality).toBeDefined();
      expect(trade.seasonality?.activeMonthsPerYear).toBeGreaterThan(0);
      expect(trade.seasonality?.activeMonthsPerYear).toBeLessThanOrEqual(12);
    }
  });

  it('every seasonal trade exists in TRADES', () => {
    for (const slug of SEASONAL_TRADE_SLUGS) {
      const trade = getTrade(slug);
      expect(trade, `Trade ${slug} should exist`).toBeDefined();
      expect(TRADES.some((t) => t.slug === slug)).toBe(true);
    }
  });
});
