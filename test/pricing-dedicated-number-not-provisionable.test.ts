import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BILLING_PLANS } from '@/lib/billing/catalog';
import { COMPARISON_ROWS, PLANS } from '@/app/pricing/pricing-catalog';

/**
 * A dedicated business number was sold as a present-tense included feature on
 * Solo, Growth and Scale, and no code anywhere can provision one.
 *
 * The messaging integration is real, but it only sends and answers: every
 * account sends from one shared platform number.
 *
 * The page honestly tells the truth: shared LGQ texting number across all plans.
 */

const read = (...parts: string[]): string =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const NOT_YET = /coming soon|at launch|when it launches|planned|not yet|not available|shared|\bwill\b|\bwould\b/i;
const OWN_NUMBER = /\b(dedicated|own)\b[\w/ -]{0,30}?\bnumber/i;

const PRICING_SOURCES = [
  ['src', 'app', 'pricing', 'pricing-catalog.ts'],
  ['src', 'app', 'pricing', 'PricingExperience.tsx'],
  ['src', 'app', 'pricing', 'PricingCalculator.tsx'],
];

describe('the pricing page does not sell a number it cannot provision', () => {
  it('makes no unfulfilled claims about your own number', () => {
    const offenders: string[] = [];
    for (const parts of PRICING_SOURCES) {
      for (const m of read(...parts).matchAll(/'([^'\n]{0,300})'/g)) {
        const text = m[1];
        if (!OWN_NUMBER.test(text)) continue;
        if (!NOT_YET.test(text)) offenders.push(`${parts.at(-1)}: ${text}`);
      }
    }
    expect(offenders, `present-tense dedicated-number claims:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('does not promise one in the plan feature lists', () => {
    const promised: string[] = [];
    for (const plan of PLANS) {
      for (const feature of plan.features) {
        if (OWN_NUMBER.test(feature) && !NOT_YET.test(feature)) promised.push(`${plan.id}: ${feature}`);
      }
    }
    expect(promised, `plans promising a number: ${promised.join(' | ')}`).toEqual([]);
  });

  it('does not promise one in the comparison table', () => {
    const row = COMPARISON_ROWS.find((entry) => entry[0] === 'Business number');
    expect(row, 'the Business number row was renamed, so this guard stopped looking at anything').toBeTruthy();
    for (const cell of row!.slice(1)) {
      expect(NOT_YET.test(cell), `comparison cell claims a number: ${cell}`).toBe(true);
    }
  });

  it('grants nobody an allowance for one', () => {
    for (const id of ['flex', 'solo', 'growth', 'scale'] as const) {
      expect(BILLING_PLANS[id].allowances.dedicatedBusinessNumbers).toBe(0);
    }
  });
});
