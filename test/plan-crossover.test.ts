import { describe, expect, it } from 'vitest';

import {
  PLANS,
  VOICE_PURCHASABLE,
  planCrossover,
} from '@/app/pricing/pricing-catalog';
import { BILLING_PLANS, type BillingCycle, type BillingPlanId } from '@/lib/billing/catalog';
import {
  annualFixedCents,
  crossoverAnnualBasisCents,
  planLadder,
} from '@/lib/billing/plan-crossover';

/**
 * The number the Codex mockup got 26% low on all three plans, which is why this
 * file exists and why the first block is an equivalence test rather than a
 * hand-checked table. /pricing has computed this correctly for the public page
 * since before the dashboard wanted it; the only defensible way to have it in
 * two places is to prove they are the same number.
 */

const CYCLES: BillingCycle[] = ['monthly', 'annual'];
const IDS: BillingPlanId[] = ['flex', 'solo', 'growth', 'scale'];

describe('it is the same arithmetic the public page already publishes', () => {
  it('agrees with planCrossover to the cent, every pair, both cycles', () => {
    for (const billing of CYCLES) {
      for (const from of IDS) {
        for (const to of IDS) {
          const mine = crossoverAnnualBasisCents(from, to, billing);
          const lower = PLANS.find((p) => p.id === from);
          const higher = PLANS.find((p) => p.id === to);
          if (!lower || !higher) throw new Error(`missing pricing plan ${from}/${to}`);

          const theirs = planCrossover(lower, higher, billing, VOICE_PURCHASABLE);
          const label = `${from}->${to} ${billing}`;

          if (mine === null) {
            // Their "never" is Infinity; mine is null. Same claim, and null is
            // used deliberately because Infinity renders as the word.
            expect(Number.isFinite(theirs), label).toBe(false);
            continue;
          }
          expect(Number.isFinite(theirs), label).toBe(true);
          // Theirs is dollars, mine is cents.
          expect(mine / 100, label).toBeCloseTo(theirs, 6);
        }
      }
    }
  });

  it('excludes AI Voice, because the public calculator does', () => {
    // VOICE_PURCHASABLE is false: every Voice SKU is withheld and has no live
    // Price. If it ever flips true, the equivalence test above starts failing
    // rather than this surface silently quoting a different threshold.
    expect(VOICE_PURCHASABLE).toBe(false);
  });
});

describe('the fixed cost a plan carries before a dollar is collected', () => {
  it('is zero for Flex on either cycle', () => {
    expect(annualFixedCents('flex', 'monthly')).toBe(0);
    expect(annualFixedCents('flex', 'annual')).toBe(0);
  });

  it('is twelve monthly charges, or the annual price, and the annual one is cheaper', () => {
    for (const plan of ['solo', 'growth', 'scale'] as const) {
      expect(annualFixedCents(plan, 'monthly')).toBe(BILLING_PLANS[plan].monthlyPriceCents * 12);
      expect(annualFixedCents(plan, 'annual')).toBe(BILLING_PLANS[plan].annualPriceCents);
      expect(annualFixedCents(plan, 'annual')).toBeLessThan(annualFixedCents(plan, 'monthly'));
    }
  });
});

describe('the thresholds themselves', () => {
  // Worked by hand from the catalog so a silent change to a price or a rate
  // fails here with a number, not just somewhere downstream with a shrug.
  // Flex 125bps/$0, Solo 50bps/$39mo/$420yr, Growth 25bps/$129mo/$1,188yr,
  // Scale 10bps/$329mo/$3,588yr.
  it('are exact on monthly billing', () => {
    expect(crossoverAnnualBasisCents('flex', 'solo', 'monthly')).toBe(6_240_000);      // $62,400/yr
    expect(crossoverAnnualBasisCents('solo', 'growth', 'monthly')).toBe(43_200_000);   // $432,000/yr
    expect(crossoverAnnualBasisCents('growth', 'scale', 'monthly')).toBe(160_000_000); // $1,600,000/yr
  });

  it('are lower on annual billing, because the fixed cost it has to beat is lower', () => {
    expect(crossoverAnnualBasisCents('flex', 'solo', 'annual')).toBe(5_600_000);
    expect(crossoverAnnualBasisCents('solo', 'growth', 'annual')).toBe(30_720_000);
    for (const [from, to] of [['flex', 'solo'], ['solo', 'growth']] as const) {
      expect(crossoverAnnualBasisCents(from, to, 'annual')!)
        .toBeLessThan(crossoverAnnualBasisCents(from, to, 'monthly')!);
    }
  });

  it('refuses a direction that never crosses rather than returning a number', () => {
    // Downgrading gives back no fee rate, so there is no volume at which the
    // cheaper-per-dollar argument starts working.
    expect(crossoverAnnualBasisCents('scale', 'flex', 'monthly')).toBeNull();
    expect(crossoverAnnualBasisCents('growth', 'solo', 'annual')).toBeNull();
  });

  it('returns the same plan as never crossing itself', () => {
    for (const plan of IDS) {
      expect(crossoverAnnualBasisCents(plan, plan, 'monthly'), plan).toBeNull();
    }
  });
});

describe('the ladder is contiguous and in order', () => {
  it('covers every volume exactly once, with no gap and no overlap', () => {
    for (const billing of CYCLES) {
      const bands = planLadder('flex', billing);
      expect(bands, billing).not.toBeNull();
      expect(bands!.map((b) => b.planCode)).toEqual(['flex', 'solo', 'growth', 'scale']);
      expect(bands![0].fromAnnualBasisCents).toBe(0);
      expect(bands!.at(-1)!.toAnnualBasisCents).toBeNull();
      for (let i = 1; i < bands!.length; i += 1) {
        // Each band starts exactly where the last one ended.
        expect(bands![i].fromAnnualBasisCents, `${billing} band ${i}`)
          .toBe(bands![i - 1].toAnnualBasisCents);
      }
    }
  });

  it('rises, so a dearer plan never wins at a lower volume', () => {
    const bands = planLadder('flex', 'monthly')!;
    const edges = bands.map((b) => b.fromAnnualBasisCents);
    expect([...edges].sort((a, b) => a - b)).toEqual(edges);
  });

  it('marks the workspace it was built for, and only that one', () => {
    for (const plan of IDS) {
      const bands = planLadder(plan, 'monthly')!;
      expect(bands.filter((b) => b.isCurrent).map((b) => b.planCode)).toEqual([plan]);
    }
  });

  it('agrees with the pairwise crossover it is built from', () => {
    const bands = planLadder('flex', 'monthly')!;
    expect(bands[1].fromAnnualBasisCents).toBe(crossoverAnnualBasisCents('flex', 'solo', 'monthly'));
    expect(bands[2].fromAnnualBasisCents).toBe(crossoverAnnualBasisCents('solo', 'growth', 'monthly'));
    expect(bands[3].fromAnnualBasisCents).toBe(crossoverAnnualBasisCents('growth', 'scale', 'monthly'));
  });
});
