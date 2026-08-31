import { describe, it, expect } from 'vitest';
import { TRADES } from '@/lib/trades';
import { getTradeTopicCluster } from '@/lib/trade-clusters';
import { ARTICLES } from '@/lib/resources';
import { COMPARISONS } from '@/app/compare/compare-data';

describe('trade topic clusters and internal linking', () => {
  it('every trade in catalog resolves to a complete topic cluster', () => {
    const articleSlugs = new Set(ARTICLES.map((a) => `/resources/${a.slug}`));
    const comparisonSlugs = new Set(Object.keys(COMPARISONS).map((c) => `/compare/${c}`));
    const validToolHrefs = new Set([
      '/tools/estimate-generator',
      '/tools/hourly-rate-calculator',
      '/tools/leakage-calculator',
    ]);
    const validFeatureHrefs = new Set([
      '/features/ai-vision',
      '/features/quick-stops',
      '/features/payments',
      '/features/ai-intake',
      '/features/quotes',
      '/features/website-builder',
      '/features/reviews',
      '/features/scheduling',
    ]);

    expect(TRADES).toHaveLength(150);

    for (const trade of TRADES) {
      const cluster = getTradeTopicCluster(trade);

      // Best Guide verification
      expect(cluster.bestGuide).toBeDefined();
      expect(cluster.bestGuide.title.length).toBeGreaterThan(10);
      expect(cluster.bestGuide.anchorText.length).toBeGreaterThan(15);
      expect(cluster.bestGuide.blurb.length).toBeGreaterThan(20);
      expect(articleSlugs.has(cluster.bestGuide.href), `Guide ${cluster.bestGuide.href} for ${trade.slug} must exist in ARTICLES`).toBe(true);

      // Best Tool verification
      expect(cluster.bestTool).toBeDefined();
      expect(cluster.bestTool.title.length).toBeGreaterThan(5);
      expect(cluster.bestTool.anchorText.length).toBeGreaterThan(15);
      expect(validToolHrefs.has(cluster.bestTool.href), `Tool ${cluster.bestTool.href} for ${trade.slug} must be valid`).toBe(true);

      // Best Feature verification
      expect(cluster.bestFeature).toBeDefined();
      expect(cluster.bestFeature.title.length).toBeGreaterThan(5);
      expect(cluster.bestFeature.anchorText.length).toBeGreaterThan(15);
      expect(validFeatureHrefs.has(cluster.bestFeature.href), `Feature ${cluster.bestFeature.href} for ${trade.slug} must be valid`).toBe(true);

      // Best Comparison verification
      expect(cluster.bestComparison).toBeDefined();
      expect(cluster.bestComparison.title.length).toBeGreaterThan(5);
      expect(cluster.bestComparison.anchorText.length).toBeGreaterThan(15);
      expect(comparisonSlugs.has(cluster.bestComparison.href), `Comparison ${cluster.bestComparison.href} for ${trade.slug} must exist in COMPARISONS`).toBe(true);

      // Related Trades verification
      expect(cluster.relatedTrades.length).toBeGreaterThanOrEqual(2);
      for (const rel of cluster.relatedTrades) {
        expect(rel.slug).not.toBe(trade.slug);
        expect(TRADES.some((t) => t.slug === rel.slug)).toBe(true);
      }
    }
  });

  it('connects high-ticket trades with Good/Better/Best quoting playbook', () => {
    const roofing = TRADES.find((t) => t.slug === 'roofers')!;
    const cluster = getTradeTopicCluster(roofing);
    expect(cluster.bestGuide.href).toBe('/resources/good-better-best-quoting-guide');
    expect(cluster.bestGuide.anchorText).toContain('Good, Better, Best Quoting Playbook');
  });

  it('connects emergency trades with speed-to-lead playbook', () => {
    const plumbing = TRADES.find((t) => t.slug === 'plumbers')!;
    const cluster = getTradeTopicCluster(plumbing);
    expect(cluster.bestGuide.href).toBe('/resources/speed-to-lead-contractor-playbook');
    expect(cluster.bestGuide.anchorText).toContain('Speed-to-Lead Playbook');
  });

  it('connects mobile/route trades with Quick Stops dispatch feature', () => {
    const pressureWashing = TRADES.find((t) => t.slug === 'pressure-washing')!;
    const cluster = getTradeTopicCluster(pressureWashing);
    expect(cluster.bestFeature.href).toBe('/features/quick-stops');
    expect(cluster.bestFeature.anchorText).toContain('Quick Stops');
  });
});
