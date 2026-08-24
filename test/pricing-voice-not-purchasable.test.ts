import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  COMPARISON_ROWS,
  PLANS,
  VOICE_MONTHLY_BY_PLAN,
  VOICE_PLANNED_PRICE_LABEL,
  VOICE_PURCHASABLE,
  annualPlanEstimate,
  planCrossover,
} from '@/app/pricing/pricing-catalog';

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
}

const experience = () => read('src', 'app', 'pricing', 'PricingExperience.tsx');
const calculator = () => read('src', 'app', 'pricing', 'PricingCalculator.tsx');

/**
 * AI Voice Receptionist is unbuilt/unreleased: there is no provisioning, no usage
 * ledger, no checkout SKU and no agent. The price book is settled and stays in
 * catalog code, but none of it reaches a customer as a thing they can buy today.
 */
describe('AI Voice is not sold or promised as a current purchase', () => {
  it('is not purchasable, which every other test here assumes', () => {
    expect(VOICE_PURCHASABLE).toBe(false);
  });

  it('contributes no money to any calculator estimate', () => {
    let plansWhereItWouldHaveCost = 0;
    for (const plan of PLANS) {
      const asShown = annualPlanEstimate(plan, 'annual', 250_000, VOICE_PURCHASABLE, 1, false);
      const withVoice = annualPlanEstimate(plan, 'annual', 250_000, true, 1, false);
      if (asShown === null) continue;
      expect((withVoice as number) - asShown).toBe(VOICE_MONTHLY_BY_PLAN[plan.id] * 12);
      if (VOICE_MONTHLY_BY_PLAN[plan.id] > 0) {
        expect(asShown).toBeLessThan(withVoice as number);
        plansWhereItWouldHaveCost += 1;
      }
    }
    expect(plansWhereItWouldHaveCost).toBe(3);
  });

  it('contributes nothing to the plan crossover a contractor is shown', () => {
    const growth = PLANS.find((p) => p.id === 'growth')!;
    const scale = PLANS.find((p) => p.id === 'scale')!;
    const asShown = planCrossover(growth, scale, 'annual', VOICE_PURCHASABLE);
    expect(asShown).not.toBe(planCrossover(growth, scale, 'annual', true));
  });

  it('never puts a voice intent on a signup link', () => {
    expect(experience()).not.toContain("'voice=1'");
    expect(calculator()).not.toContain("'voice=1'");
  });

  it('offers no control that adds or selects it', () => {
    for (const source of [experience(), calculator()]) {
      expect(source).not.toContain('includeVoice');
      expect(source).not.toContain('Add AI Voice Receptionist');
      expect(source).not.toContain('AI Voice Receptionist added');
    }
  });

  it('does not tell a Scale customer they already have it', () => {
    for (const row of COMPARISON_ROWS) {
      if (!row[0].includes('AI Voice Receptionist')) continue;
      for (const cell of row.slice(1)) {
        expect(cell).not.toMatch(/^Included/);
        expect(cell).not.toMatch(/\$\d/);
      }
    }
    for (const plan of PLANS) {
      for (const feature of plan.features) {
        if (!feature.includes('AI Voice Receptionist')) continue;
        expect(feature).not.toMatch(/\$\d/);
        expect(feature).not.toMatch(/\bincluded with\b/i);
      }
    }
  });

  it('does not sell it in the page component or metadata', () => {
    expect(read('src', 'app', 'pricing', 'page.tsx')).not.toMatch(/add AI Voice Receptionist/i);
  });

  it('keeps the settled price book in catalog code for future launch', () => {
    expect(VOICE_PLANNED_PRICE_LABEL).toBe('Planned launch pricing from $55/month');
    expect(VOICE_MONTHLY_BY_PLAN).toEqual({ flex: 69, solo: 59, growth: 55, scale: 0 });
  });
});
