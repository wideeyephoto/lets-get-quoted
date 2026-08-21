import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  QUICK_STOP_PAYABLE_COLUMNS,
  quickStopOfferAllowsPayment,
  type QuickStopPayableOffer,
} from '@/lib/quick-stop';

/**
 * Whether a Quick Stop offer may still be paid for.
 *
 * A Quick Stop holds a slot for a fixed window. Stripe Checkout's own minimum
 * session expiry is 30 minutes, so a 15-minute hold cannot be enforced by the
 * session -- createCheckoutSessionForPayment enforces it, and throws "This Quick
 * Stop offer has expired."
 *
 * The public pay page did not ask. It read `payment_deadline_at` in order to
 * PRINT the deadline -- "Please pay by 3:45 PM, after that the slot is released
 * to somebody else and this link stops working" -- and rendered a live Pay
 * button underneath whether or not that moment had passed. Showing the rule was
 * mistaken for applying it.
 */

const OPEN: QuickStopPayableOffer = {
  status: 'awaiting_customer_payment',
  payment_deadline_at: '2026-08-21T12:00:00.000Z',
};
const NOON = Date.parse('2026-08-21T12:00:00.000Z');

describe('quickStopOfferAllowsPayment', () => {
  it('allows an offer still awaiting payment inside its window', () => {
    expect(quickStopOfferAllowsPayment(OPEN, NOON - 60_000)).toBe(true);
  });

  it('refuses one whose window has passed', () => {
    expect(quickStopOfferAllowsPayment(OPEN, NOON + 1)).toBe(false);
  });

  it('treats the deadline itself as still payable', () => {
    // The boundary is stated rather than left to whichever comparison somebody
    // typed. The sweep uses `lt('payment_deadline_at', now)`, so the instant
    // itself has not elapsed there either.
    expect(quickStopOfferAllowsPayment(OPEN, NOON)).toBe(true);
  });

  it('refuses an offer that is no longer awaiting payment, however early it is', () => {
    // The deadline is not the only way an offer stops being payable, and this is
    // the half the page could not have got right by reading the deadline alone.
    // quick-stop-sweep moves a lapsed offer to `offer_expired` AND fails its
    // payment -- and a failed payment resolves to the abandoned-checkout banner,
    // which offers a button. So the button outlived the offer permanently, not
    // just until the sweep ran.
    for (const status of ['offer_expired', 'confirmed', 'customer_declined', 'customer_canceled', 'contractor_canceled']) {
      expect(quickStopOfferAllowsPayment({ ...OPEN, status }, NOON - 60_000), status).toBe(false);
    }
  });

  it('allows an offer with no deadline recorded', () => {
    expect(quickStopOfferAllowsPayment({ status: 'awaiting_customer_payment', payment_deadline_at: null }, NOON))
      .toBe(true);
  });

  it('treats an absent status as not awaiting payment', () => {
    // Fail closed on the status, matching the inline check this replaced: a row
    // selected without the column must not read as permission.
    expect(quickStopOfferAllowsPayment({ payment_deadline_at: null }, NOON)).toBe(false);
    expect(quickStopOfferAllowsPayment({}, NOON)).toBe(false);
  });

  it('lets a payment that is not a Quick Stop through untouched', () => {
    // No row means the rule does not apply. A deposit or a final bill must not be
    // refused by a condition about a feature it has nothing to do with -- which
    // is how checkout has always read it, its guard sitting inside `if (es)`.
    expect(quickStopOfferAllowsPayment(null, NOON)).toBe(true);
    expect(quickStopOfferAllowsPayment(undefined, NOON)).toBe(true);
  });

  it('fails OPEN on a deadline it cannot parse', () => {
    // Deliberate, and preserved from the inline check rather than tightened
    // while extracting it. This predicate stands between somebody and a payment
    // they are trying to make; refusing on a value we failed to read is the more
    // expensive way to be wrong. NaN compares false, so it reads as not lapsed.
    expect(quickStopOfferAllowsPayment({ ...OPEN, payment_deadline_at: 'not a date' }, NOON)).toBe(true);
  });

  it('names every column it reads, so a select cannot under-fetch', () => {
    for (const column of ['status', 'payment_deadline_at']) {
      expect(QUICK_STOP_PAYABLE_COLUMNS).toContain(column);
    }
  });
});

/**
 * The lesson from canCreateConnectCharge, applied before it can be relearned.
 *
 * A shared predicate is worth nothing if a site paraphrases it instead of
 * calling it. That has now happened twice on this page -- Connect chargeability
 * and this -- and both times the test suite covered the rule in isolation and
 * never checked that anybody asked it.
 */
describe('both sides of the Quick Stop window ask the same predicate', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

  const SITES = [
    ['checkout', 'src/lib/payments.ts'],
    ['public pay page', 'src/app/pay/[id]/page.tsx'],
  ] as const;

  for (const [name, file] of SITES) {
    it(`${name} calls quickStopOfferAllowsPayment`, () => {
      expect(read(file)).toContain('quickStopOfferAllowsPayment');
    });
  }

  it('neither compares the deadline to the clock by hand', () => {
    // The tell. Both sites used to build `new Date(deadline).getTime() < now`
    // inline -- one of them enforcing it, the other only printing it.
    //
    // Block comments are stripped WHOLE: the prose at both sites quotes the old
    // expression while explaining why it went, and an assertion about the code
    // must not be satisfiable by the comment about the code.
    for (const [name, file] of SITES) {
      const code = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => !/^\s*\/\//.test(line))
        .join('\n');
      // Scoped to the COMPARISON, not to the column. The page still reads
      // `payment_deadline_at` and must: it prints the deadline. Reading it was
      // never the mistake -- deciding with it was.
      expect(code, name).not.toContain('.getTime() < Date.now()');
      expect(code, name).not.toContain("status !== 'awaiting_customer_payment'");
    }
  });

  it('the page withholds the button rather than only hiding the deadline', () => {
    // Hiding the notice and leaving the button is the shape of the original bug
    // in reverse: the homeowner would then press a button with nothing on screen
    // explaining the refusal that follows.
    const page = read('src/app/pay/[id]/page.tsx');
    expect(page).toContain("? 'quick_stop_expired'");
    expect(page).toContain('quickStop && quickStop.payable && canPay');
  });
});
