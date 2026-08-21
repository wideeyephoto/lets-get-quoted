import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  SELLABLE_TOP_UP_IDS,
  TOP_UPS,
  describeTopUpCadence,
  describeTopUpUnits,
  type TopUpDefinition,
  type TopUpId,
} from '@/lib/billing/catalog';

/**
 * The buy card told a contractor a subscription was a one-time purchase.
 *
 * It wrote its detail line by hand:
 *
 *   `${units} ${resourceCode.replace(/_/g, ' ')} · one-time · never expires`
 *
 * True for every SKU on sale the day it was written -- all five were one-time
 * credit packs. `crew_user` went on sale on 2026-08-20 and is `recurring: true`,
 * so the same line started rendering
 *
 *   "1 crew users · one-time · never expires"      $5.00      [Buy for $5.00]
 *
 * for a charge that repeats every month. Two false statements about a recurring
 * charge, on the button that starts it, plus a plural that gave the game away.
 */

const CARD = readFileSync(
  join(process.cwd(), 'src/app/dashboard/settings/TopUpPurchaseCheckout.tsx'), 'utf8');

const sellable = (): TopUpDefinition[] => SELLABLE_TOP_UP_IDS.map((id) => TOP_UPS[id]);

describe('the cadence is read from the SKU, never assumed', () => {
  it('never calls a recurring SKU one-time', () => {
    // The general form, so the NEXT recurring SKU put on sale is caught here
    // rather than by a customer reading their second invoice. office_user and
    // storage_100gb are both recurring and both withheld today.
    for (const sku of sellable()) {
      const cadence = describeTopUpCadence(sku);
      if (sku.recurring) {
        expect(cadence, sku.id).toContain('/month');
        expect(cadence, sku.id).not.toContain('one-time');
        expect(cadence, sku.id).not.toContain('never expires');
      } else {
        expect(cadence, sku.id).toContain('one-time');
        expect(cadence, sku.id).not.toContain('/month');
      }
    }
  });

  it('holds for every SKU in the price book, sellable or not', () => {
    // Withholding is a sales decision and can be reversed in one line -- it was,
    // for crew_user, which is how this bug shipped. The describer must already
    // be right for the ones still behind the curtain.
    for (const id of Object.keys(TOP_UPS) as TopUpId[]) {
      const sku = TOP_UPS[id];
      expect(describeTopUpCadence(sku).includes('/month'), id).toBe(sku.recurring);
    }
  });

  it('says renewal in words, not just a slash-month', () => {
    // "$5/month" is a rate. "renews until you cancel" is the commitment, and
    // it is the part somebody cancels on if nobody told them.
    const crew = TOP_UPS.crew_user;
    expect(describeTopUpCadence(crew)).toBe('$5/month · renews until you cancel');
  });
});

describe('the unit noun agrees with the number in front of it', () => {
  it('says one crew seat, not one crew users', () => {
    // Deriving the noun from the resource code produced the resource code.
    expect(describeTopUpUnits(TOP_UPS.crew_user)).toBe('1 crew seat');
    expect(describeTopUpUnits(TOP_UPS.office_user)).toBe('1 office seat');
  });

  it('pluralizes everything else correctly', () => {
    expect(describeTopUpUnits(TOP_UPS.text_1000)).toBe('1,000 text credits');
    expect(describeTopUpUnits(TOP_UPS.marketing_email_5000)).toBe('5,000 marketing emails');
    expect(describeTopUpUnits(TOP_UPS.ai_intake_100)).toBe('100 AI Intake credits');
  });

  it('never leaks a resource code into the sentence', () => {
    // The old line printed `crew_users` with the underscore swapped for a space.
    // Anything still doing that reads as a column name to the person paying.
    for (const id of Object.keys(TOP_UPS) as TopUpId[]) {
      const text = describeTopUpUnits(TOP_UPS[id]);
      expect(text, id).not.toContain('_');
      expect(text.toLowerCase(), id).not.toContain('users');
    }
  });

  it('keeps the thousands separator', () => {
    expect(describeTopUpUnits(TOP_UPS.text_1000)).toContain(',');
  });
});

describe('the card renders what the catalog says', () => {
  it('no longer builds the line itself', () => {
    expect(CARD).not.toContain("resourceCode.replace(/_/g, ' ')");
    expect(CARD).not.toContain('one-time · never expires');
    expect(CARD).toContain('describeTopUpUnits(sku)');
    expect(CARD).toContain('describeTopUpCadence(sku)');
  });

  it('puts the period on the button for a recurring SKU', () => {
    // The last thing read before checkout opens.
    expect(CARD).toContain('Subscribe for');
    expect(CARD).toContain('/month`');
  });

  it('stops claiming everything never expires', () => {
    // The intro and the success note both said "credits" and "balances" for a
    // card that now also sells a seat. Both are conditional on what is offered.
    expect(CARD).toContain('hasRecurring');
    expect(CARD).toContain('hasCredits');
    expect(CARD).not.toContain('Credits are added to the balances above once Stripe');
  });
});
