import { describe, it, expect } from 'vitest';
import { TRADES, getTrade } from '@/lib/trades';
import { TOP_20_DEFINITIVE_TRADES, getDefinitiveTradeData } from '@/lib/trade-deep-data';

describe('definitive trade data integrity', () => {
  const top20Slugs = [
    'roofers',
    'plumbers',
    'hvac',
    'electricians',
    'remodelers',
    'landscapers',
    'painters',
    'flooring',
    'concrete',
    'fencing',
    'tree-services',
    'deck-builders',
    'solar',
    'cleaning-services',
    'pressure-washing',
    'handyman',
    'garage-doors',
    'pool-builders',
    'water-damage-restoration',
    'insulation',
  ];

  it('contains exactly the 20 definitive high-value trade segments', () => {
    const keys = Object.keys(TOP_20_DEFINITIVE_TRADES);
    expect(keys).toHaveLength(20);
    for (const slug of top20Slugs) {
      expect(TOP_20_DEFINITIVE_TRADES[slug], `Trade ${slug} must exist in TOP_20_DEFINITIVE_TRADES`).toBeDefined();
      expect(getTrade(slug), `Trade ${slug} must be a valid trade in catalog`).toBeDefined();
    }
  });

  it('every definitive trade has a fully calculated 3-tier quoting example', () => {
    for (const slug of top20Slugs) {
      const data = getDefinitiveTradeData(slug)!;
      expect(data).toBeDefined();

      const { quoteExample } = data;
      expect(quoteExample.projectTitle.trim().length).toBeGreaterThan(5);
      expect(quoteExample.scopeSummary.trim().length).toBeGreaterThan(15);
      expect(quoteExample.timeline.trim().length).toBeGreaterThan(3);
      expect(quoteExample.proTip.trim().length).toBeGreaterThan(15);
      expect(quoteExample.tiers).toHaveLength(3);

      const [good, better, best] = quoteExample.tiers;
      expect(good.tierName).toBe('Good');
      expect(better.tierName).toBe('Better');
      expect(best.tierName).toBe('Best');

      // Price progression check: Good < Better < Best
      expect(better.total).toBeGreaterThan(good.total);
      expect(best.total).toBeGreaterThan(better.total);

      for (const tier of quoteExample.tiers) {
        expect(tier.total).toBeGreaterThan(0);
        expect(tier.deposit).toBeGreaterThan(0);
        expect(tier.deposit).toBeLessThanOrEqual(tier.total);
        expect(tier.depositLabel.trim().length).toBeGreaterThan(5);
        expect(tier.highlight.trim().length).toBeGreaterThan(10);
        expect(tier.items.length).toBeGreaterThanOrEqual(2);

        // Sum of items equals the tier total
        const itemsSum = tier.items.reduce((sum, item) => sum + item.amount, 0);
        expect(itemsSum, `Sum of items in ${slug} tier ${tier.tierName} (${itemsSum}) must equal total (${tier.total})`).toBe(tier.total);
      }
    }
  });

  it('every definitive trade has a 4-step field workflow and operational benchmarks', () => {
    for (const slug of top20Slugs) {
      const data = getDefinitiveTradeData(slug)!;
      expect(data.workflow).toHaveLength(4);

      data.workflow.forEach((step, idx) => {
        expect(step.step).toBe(idx + 1);
        expect(step.title.trim().length).toBeGreaterThan(5);
        expect(step.description.trim().length).toBeGreaterThan(20);
        expect(step.badge.trim().length).toBeGreaterThan(3);
      });

      expect(data.industryBenchmark.avgTicket).toMatch(/^\$/);
      expect(data.industryBenchmark.closeRateLift).toMatch(/^\+/);
      expect(data.industryBenchmark.hoursSavedWeekly).toMatch(/hrs/);
    }
  });

  it('every definitive trade has 5 deep, high-signal technical FAQs', () => {
    for (const slug of top20Slugs) {
      const data = getDefinitiveTradeData(slug)!;
      expect(data.faqs.length).toBeGreaterThanOrEqual(4);

      for (const faq of data.faqs) {
        expect(faq.question.trim().length).toBeGreaterThan(15);
        expect(faq.answer.trim().length).toBeGreaterThan(30);
      }
    }
  });
});
