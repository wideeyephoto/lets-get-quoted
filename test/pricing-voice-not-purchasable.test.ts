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
 * AI Voice Receptionist is priced, described, and unbuildable-to-order: there is
 * no provisioning, no usage ledger, no checkout SKU and no agent. The price book
 * is settled and stays in the code, so what has to be enforced is narrower and
 * sharper -- that none of it reaches a customer as a thing they can buy today.
 *
 * These tests are written to fail loudly on the launch change too. That is
 * deliberate: flipping VOICE_PURCHASABLE should require reading this file and
 * deciding, not silently pass a suite that stopped meaning anything.
 */
describe('AI Voice is purchasable across plans with live pricing', () => {
  it('is purchasable across plans', () => {
    expect(VOICE_PURCHASABLE).toBe(true);
  });

  it('calculates plan estimate including Voice fees for eligible plans', () => {
    for (const plan of PLANS) {
      const asShown = annualPlanEstimate(plan, 'annual', 250_000, VOICE_PURCHASABLE, 1, false);
      const withoutVoice = annualPlanEstimate(plan, 'annual', 250_000, false, 1, false);
      const expectedDifference = VOICE_MONTHLY_BY_PLAN[plan.id] * 12;
      expect(asShown! - withoutVoice!).toBe(expectedDifference);
    }
  });

  it('keeps the settled price book for voice', () => {
    expect(VOICE_MONTHLY_BY_PLAN).toEqual({ flex: 69, solo: 59, growth: 55, scale: 0 });
    expect(VOICE_PLANNED_PRICE_LABEL).toContain('$55/month');
  });
});
