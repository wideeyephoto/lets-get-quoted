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
describe('AI Voice is presented as coming soon, not as a purchase', () => {
  it('is not purchasable, which every other test here assumes', () => {
    // When this legitimately becomes true, the rest of this file must be
    // rewritten rather than deleted -- the launch assertions are the mirror
    // image of these, not the absence of them.
    expect(VOICE_PURCHASABLE).toBe(false);
  });

  it('contributes no money to any calculator estimate', () => {
    // The strongest form of the check: the estimate is computed twice, once as
    // the page computes it and once with voice forced on, and they must differ.
    // A test that only asserted the current number would still pass if the page
    // started charging for voice AND the expected number were updated to match.
    let plansWhereItWouldHaveCost = 0;
    for (const plan of PLANS) {
      const asShown = annualPlanEstimate(plan, 'annual', 250_000, VOICE_PURCHASABLE, 1, false);
      const withVoice = annualPlanEstimate(plan, 'annual', 250_000, true, 1, false);
      if (asShown === null) continue;
      // Scale's add-on price is 0 because voice sits in its base plan, so voice
      // moves its estimate by nothing whether it is offered or not. Asserting
      // "strictly cheaper" for every plan would fail there for a correct reason.
      expect((withVoice as number) - asShown).toBe(VOICE_MONTHLY_BY_PLAN[plan.id] * 12);
      if (VOICE_MONTHLY_BY_PLAN[plan.id] > 0) {
        expect(asShown).toBeLessThan(withVoice as number);
        plansWhereItWouldHaveCost += 1;
      }
    }
    // Guards the guard: if PLANS or the price map were emptied, every assertion
    // above would vacuously pass.
    expect(plansWhereItWouldHaveCost).toBe(3);
  });

  it('contributes nothing to the plan crossover a contractor is shown', () => {
    const growth = PLANS.find((p) => p.id === 'growth')!;
    const scale = PLANS.find((p) => p.id === 'scale')!;
    const asShown = planCrossover(growth, scale, 'annual', VOICE_PURCHASABLE);
    expect(asShown).not.toBe(planCrossover(growth, scale, 'annual', true));
  });

  it('never puts a voice intent on a signup link', () => {
    // Signup would have carried an intent to buy something nothing can
    // provision, leaving the far side to guess what to do with it.
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
    // The most dangerous claim on the page: "Included" reads as something
    // already paid for, so a Scale subscriber would believe they are owed it.
    const rows = COMPARISON_ROWS.filter((row) => row[0].includes('AI Voice Receptionist'));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
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

  it('does not claim it in the page component either, where no guard reached', () => {
    // The check above reads COMPARISON_ROWS and PLANS[].features out of the
    // catalog module. It never opened PricingExperience.tsx -- which is how a
    // plan-card bullet reading "AI Voice Receptionist included" and a stat tile
    // reading "Included / AI Voice Receptionist arrives with Scale" came to sit
    // inches above a comparison table that already said "Coming soon".
    //
    // A blocklist of the exact wrong strings would only forbid the mistakes
    // already made. This requires the opposite: every claim naming the feature
    // has to carry a not-yet marker, so a newly invented present-tense claim
    // fails too.
    const NOT_YET = /coming soon|not available|at launch|planned|will |in build/i;
    const source = experience();

    const literals = [...source.matchAll(/'([^'\n]*AI Voice Receptionist[^'\n]*)'/g)]
      .map((m) => m[1])
      // A bare occurrence of the name is a label, not a claim -- the section nav
      // entry has to be allowed to say what the section is called.
      .filter((s) => s.replace(/AI Voice Receptionist/gi, '').replace(/[^a-z0-9]/gi, '') !== '');
    // Guards the guard: renaming the feature, or switching these to double
    // quotes, would otherwise empty the list and pass silently.
    expect(literals.length).toBeGreaterThan(2);
    const unmarked = literals.filter((s) => !NOT_YET.test(s));
    expect(unmarked, `present-tense AI Voice claims: ${unmarked.join(' | ')}`).toEqual([]);
    const priced = literals.filter((s) => /\$\d/.test(s));
    expect(priced, `priced AI Voice claims: ${priced.join(' | ')}`).toEqual([]);

    // The tooltip body is JSX text, not a string literal, so the sweep above
    // cannot see it. It is the surface that duplicated the very sentence the
    // voice section 380 lines below had already been corrected to future tense.
    const tooltip = source.match(/function AIVoiceReceptionistInfoBubble\(\)[\s\S]*?\n}/)?.[0];
    expect(tooltip, 'AIVoiceReceptionistInfoBubble not found').toBeTruthy();
    expect(tooltip!).toMatch(NOT_YET);
    expect(tooltip!).not.toMatch(/\bis included on\b/i);
    expect(tooltip!).not.toMatch(/\$\d/);
  });

  it('does not sell it in the page metadata, which is what a search result shows', () => {
    expect(read('src', 'app', 'pricing', 'page.tsx')).not.toMatch(/add AI Voice Receptionist/i);
  });

  it('says what it will cost without saying it is for sale', () => {
    expect(VOICE_PLANNED_PRICE_LABEL).toBe('Planned launch pricing from $55/month');
    // "Planned" and "from" are both load-bearing: one marks it unavailable, the
    // other stops the cheapest plan's price reading as everyone's price.
    expect(VOICE_PLANNED_PRICE_LABEL).toMatch(/planned/i);
    expect(experience()).toContain('VOICE_PLANNED_PRICE_LABEL');
    expect(experience()).toContain('Coming soon');
  });

  it('keeps the settled price book, because it is correct and returns', () => {
    // Withholding the sale is not the same as forgetting the prices. Losing
    // these would make the launch change a re-decision rather than a flag flip.
    expect(VOICE_MONTHLY_BY_PLAN).toEqual({ flex: 69, solo: 59, growth: 55, scale: 0 });
  });
});
