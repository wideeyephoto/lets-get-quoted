import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BILLING_PLANS } from '@/lib/billing/catalog';
import { COMPARISON_ROWS, PLANS } from '@/app/pricing/pricing-catalog';

/**
 * A dedicated business number was sold as a present-tense included feature on
 * Solo, Growth and Scale, and no code anywhere can provision one.
 *
 * The messaging integration is real, but it only sends and answers: the
 * provisioning API surface is absent on purpose (AvailablePhoneNumbers,
 * IncomingPhoneNumbers and SignalWire's Relay REST get zero hits across src,
 * scripts and migrations, and the only mentions are comments in sms-provider.ts
 * saying it is out of scope). Every account sends from one shared platform
 * number read from a single process-level env var, with no per-account sender
 * lookup in the send path. accounts.sms_number and
 * messaging_registrations.assigned_number exist and nothing writes them --
 * both the schema and the migration say so in as many words.
 *
 * It is also not merely unbuilt. US carriers require each downstream business to
 * be registered before it can send, and the repo records twice that the provider
 * has not opened that process, so there is nothing for a contractor to submit.
 *
 * The logged-in product already told the truth -- MessagingSetup says "Your own
 * texting number -- coming soon". Only the pre-sale surface claimed otherwise,
 * which is the worst way round for the claim to be wrong.
 */

const read = (...parts: string[]): string =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

/** The phrasings the page is allowed to use about a number nobody can have yet. */
const NOT_YET = /coming soon|at launch|when it launches|planned|not yet|not available|shared|\bwill\b|\bwould\b/i;

/**
 * Anything that reads as "you get your own number".
 *
 * Deliberately tolerant of what sits between the adjective and the noun. The
 * first version of this spelled the qualifiers out as an alternation and could
 * not match "1 dedicated voice/text business number" -- which is the exact
 * string it was written to forbid, so it passed while the claim was still there.
 */
const OWN_NUMBER = /\b(dedicated|own)\b[\w/ -]{0,30}?\bnumber/i;

const PRICING_SOURCES = [
  ['src', 'app', 'pricing', 'pricing-catalog.ts'],
  ['src', 'app', 'pricing', 'PricingExperience.tsx'],
  ['src', 'app', 'pricing', 'PricingCalculator.tsx'],
];

describe('the pricing page does not sell a number it cannot provision', () => {
  it('marks every claim about your own number as not yet', () => {
    const offenders: string[] = [];
    let claims = 0;
    for (const parts of PRICING_SOURCES) {
      for (const m of read(...parts).matchAll(/'([^'\n]{0,300})'/g)) {
        const text = m[1];
        if (!OWN_NUMBER.test(text)) continue;
        claims += 1;
        if (!NOT_YET.test(text)) offenders.push(`${parts.at(-1)}: ${text}`);
      }
    }
    // Guards the guard: a reworded claim that no longer matches OWN_NUMBER would
    // empty this and pass, so the count has to stay meaningful.
    expect(claims).toBeGreaterThan(3);
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
    // The copy above and this allowance have to agree. The allowance is not
    // decoration: entitlement-catalog writes it into persisted subscription
    // featureLimits, and Settings shows it to the customer as a number they
    // have. A page saying "coming soon" beside a plan card saying "1" is the
    // same defect in two voices.
    //
    // Zeroing it in TypeScript alone would have been fatal, not cosmetic:
    // project_stripe_billing_subscription_event_v1_unchecked recomputes
    // feature_limits from its own hardcoded copy and raises 22000 when the two
    // disagree, so every paid activation would have dead-lettered -- charged and
    // never entitled. Migration 20260820150000 moves the SQL copy in step, and
    // test/subscription-entitlement-limits-catalog.test.ts is what holds them
    // together.
    for (const id of ['flex', 'solo', 'growth', 'scale'] as const) {
      expect(BILLING_PLANS[id].allowances.dedicatedBusinessNumbers).toBe(0);
    }
  });
});
