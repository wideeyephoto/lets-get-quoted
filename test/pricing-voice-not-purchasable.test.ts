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
 * AI Voice Receptionist is active with dedicated number carrier vetting (10DLC).
 */
describe('AI Voice is available and purchasable', () => {
  it('is purchasable across eligible plans', () => {
    expect(VOICE_PURCHASABLE).toBe(true);
  });

  it('contributes to calculator estimates when selected', () => {
    let plansWhereItCosts = 0;
    for (const plan of PLANS) {
      const withoutVoice = annualPlanEstimate(plan, 'annual', 250_000, false, 1, false);
      const withVoice = annualPlanEstimate(plan, 'annual', 250_000, true, 1, false);
      if (withoutVoice === null) continue;
      expect((withVoice as number) - withoutVoice).toBe(VOICE_MONTHLY_BY_PLAN[plan.id] * 12);
      if (VOICE_MONTHLY_BY_PLAN[plan.id] > 0) {
        expect(withoutVoice).toBeLessThan(withVoice as number);
        plansWhereItCosts += 1;
      }
    }
    expect(plansWhereItCosts).toBe(3);
  });

  it('calculates the plan crossover for Growth vs Scale with voice', () => {
    const growth = PLANS.find((p) => p.id === 'growth')!;
    const scale = PLANS.find((p) => p.id === 'scale')!;
    const withVoice = planCrossover(growth, scale, 'annual', true);
    const withoutVoice = planCrossover(growth, scale, 'annual', false);
    expect(withVoice).toBe(1_160_000);
    expect(withoutVoice).toBe(1_600_000);
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
