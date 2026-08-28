import { describe, it, expect } from 'vitest';
import { TRADES, getTrade } from '@/lib/trades';
import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';
import { TITLE_MAX, DESCRIPTION_MAX } from '@/lib/seo/marketing-seo';

describe('trade records integrity', () => {
  it('contains exactly 100 unique trades', () => {
    expect(TRADES).toHaveLength(100);
    const slugs = TRADES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(100);
  });

  it('every trade has complete required fields', () => {
    const templateIds = new Set(AVAILABLE_TEMPLATES.map((t) => t.id));

    for (const trade of TRADES) {
      expect(trade.slug).toMatch(/^[a-z0-9-]+$/);
      expect(trade.name.trim().length).toBeGreaterThan(3);
      expect(trade.work.trim().length).toBeGreaterThan(2);
      expect(trade.headline.trim().length).toBeGreaterThan(5);
      expect(trade.subhead.trim().length).toBeGreaterThan(10);
      expect(trade.metaTitle.length).toBeLessThanOrEqual(TITLE_MAX);
      expect(trade.metaDescription.length).toBeLessThanOrEqual(DESCRIPTION_MAX);

      // Services check (at least 5 distinct services)
      expect(trade.services.length).toBeGreaterThanOrEqual(5);
      expect(new Set(trade.services).size).toBe(trade.services.length);

      // Pain points check (at least 3 pains)
      expect(trade.pains.length).toBeGreaterThanOrEqual(3);
      for (const pain of trade.pains) {
        expect(pain.title.trim().length).toBeGreaterThan(3);
        expect(pain.body.trim().length).toBeGreaterThan(10);
      }

      // Valid template IDs
      expect(trade.templateIds.length).toBeGreaterThan(0);
      for (const id of trade.templateIds) {
        expect(templateIds.has(id), `Template ${id} in trade ${trade.slug} must exist`).toBe(true);
      }

      // Related slugs (if present) must be valid
      if (trade.relatedSlugs) {
        for (const related of trade.relatedSlugs) {
          expect(getTrade(related), `Related slug ${related} in ${trade.slug} must be valid trade`).toBeDefined();
          expect(related).not.toBe(trade.slug);
        }
      }
    }
  });

  it('includes newly added seasonal and service trades', () => {
    const holiday = getTrade('holiday-lighting');
    expect(holiday).toBeDefined();
    expect(holiday?.name).toBe('Holiday Light Installers');
    expect(holiday?.seasonality?.activeMonthsPerYear).toBe(4);

    const lawn = getTrade('lawn-care');
    expect(lawn).toBeDefined();
    expect(lawn?.name).toBe('Lawn Care Companies');
    expect(lawn?.relatedSlugs).toContain('landscapers');

    const mosquito = getTrade('mosquito-tick-control');
    expect(mosquito).toBeDefined();
    expect(mosquito?.name).toBe('Mosquito & Tick Control Companies');
    expect(mosquito?.relatedSlugs).toContain('pest-control');

    const duct = getTrade('air-duct-cleaning');
    expect(duct).toBeDefined();
    expect(duct?.name).toBe('Air Duct & Dryer Vent Cleaners');
    expect(duct?.relatedSlugs).toContain('hvac');

    const pond = getTrade('pond-services');
    expect(pond).toBeDefined();
    expect(pond?.name).toBe('Pond & Water Feature Services');
    expect(pond?.relatedSlugs).toContain('landscapers');
  });

  it('rescopes landscapers and pest control appropriately', () => {
    const landscapers = getTrade('landscapers')!;
    expect(landscapers.name).toBe('Landscapers');
    expect(landscapers.work).toBe('landscaping');
    expect(landscapers.relatedSlugs).toContain('lawn-care');
    expect(landscapers.services.some((s) => s.toLowerCase().includes('mowing'))).toBe(false);

    const pest = getTrade('pest-control')!;
    expect(pest.relatedSlugs).toContain('mosquito-tick-control');
  });
});
