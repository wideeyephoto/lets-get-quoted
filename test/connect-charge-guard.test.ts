import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { canCreateConnectCharge, CONNECT_CHARGE_COLUMNS } from '@/lib/stripe';

// Whether money may be moved to a contractor's Connect account.
//
// This exists as one predicate because the condition is duplicated across four
// charge-creation sites — lib/payments.ts, lib/recurring.ts, lib/payment-plans.ts
// and lib/dunning.ts — and it only takes one of them disagreeing for a payout
// restriction to have a hole. It had exactly that: dunning checked
// stripe_connect_id and connect_onboarded but not payouts_restricted_at, so the
// retry cron kept charging saved cards and routing funds to accounts staff had
// explicitly restricted. The plan that introduced the restriction listed three
// call sites; there were four.

describe('canCreateConnectCharge', () => {
  const connected = {
    stripe_connect_id: 'acct_123',
    connect_onboarded: true,
    payouts_restricted_at: null,
  };

  it('allows a fully connected, unrestricted account', () => {
    expect(canCreateConnectCharge(connected)).toBe(true);
  });

  it('refuses an account that never connected Stripe', () => {
    expect(canCreateConnectCharge({ ...connected, stripe_connect_id: null })).toBe(false);
  });

  it('refuses an account that started onboarding but never finished', () => {
    expect(canCreateConnectCharge({ ...connected, connect_onboarded: false })).toBe(false);
  });

  it('REFUSES A RESTRICTED ACCOUNT even when Stripe is fully connected', () => {
    // The whole point. A restricted account looks perfectly chargeable on the
    // first two fields, which is why the missing check was invisible.
    expect(canCreateConnectCharge({ ...connected, payouts_restricted_at: '2026-08-07T00:00:00.000Z' })).toBe(false);
  });

  it('treats a missing account as not chargeable', () => {
    expect(canCreateConnectCharge(null)).toBe(false);
    expect(canCreateConnectCharge(undefined)).toBe(false);
  });

  it('treats absent fields as not chargeable rather than assuming the best', () => {
    // A row selected without these columns must not read as permission. This is
    // the failure mode that matters: a caller that forgets CONNECT_CHARGE_COLUMNS
    // should be denied, never allowed.
    expect(canCreateConnectCharge({})).toBe(false);
    expect(canCreateConnectCharge({ stripe_connect_id: 'acct_123' })).toBe(false);
  });

  it('names every column the predicate reads, so a select cannot under-fetch', () => {
    for (const column of ['stripe_connect_id', 'connect_onboarded', 'payouts_restricted_at']) {
      expect(CONNECT_CHARGE_COLUMNS).toContain(column);
    }
  });
});

/**
 * ONE PREDICATE IS ONLY WORTH ANYTHING IF EVERY SITE ASKS IT.
 *
 * Nothing above this block checked that anybody CALLS canCreateConnectCharge --
 * it tested the predicate in isolation, which is exactly the gap that let the
 * original hole exist in dunning. The pay page then repeated the same mistake on
 * the display side: it asked `!account?.connect_onboarded`, two thirds of the
 * condition, so an account staff had restricted got a live Pay button whose
 * submit threw "This contractor has not finished setting up payments yet."
 *
 * The page is listed here with the four charge-creation sites because the same
 * rule governs it. It decides only what a homeowner SEES -- the server still
 * refuses -- but a button that is certain to fail is its own kind of defect: the
 * homeowner has no way to know the refusal was not their card.
 */
describe('every site that gates on Connect chargeability asks the predicate', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

  const SITES = [
    ['checkout', 'src/lib/payments.ts'],
    ['recurring', 'src/lib/recurring.ts'],
    ['payment plans', 'src/lib/payment-plans.ts'],
    ['dunning', 'src/lib/dunning.ts'],
    // The display side, and the one that drifted most recently.
    ['public pay page', 'src/app/pay/[id]/page.tsx'],
  ] as const;

  for (const [name, file] of SITES) {
    it(`${name} calls canCreateConnectCharge`, () => {
      expect(read(file)).toContain('canCreateConnectCharge');
    });
  }

  it('the pay page does not paraphrase it back into a weaker check', () => {
    // The tell is reading the column directly to make a decision. Comment lines
    // are stripped first: the prose above that check names the column while
    // explaining why it must not be read, and an assertion about the code must
    // not be satisfiable by the comment about the code.
    //
    // Scoped to the page because the lib sites legitimately name the column in
    // their SELECT strings -- getPublicPayment fetches all three, which is what
    // made the page's narrower test possible in the first place.
    // Block comments are removed WHOLE rather than line by line. A per-line
    // filter keyed on a leading `*` misses the continuation lines of a JSX
    // `/* ... */`, which is how the first version of this assertion failed
    // against the very comment above the code it was checking.
    const code = read('src/app/pay/[id]/page.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !/^\s*\/\//.test(line))
      .join('\n');
    expect(code).not.toContain('connect_onboarded');
    expect(code).toContain('canCreateConnectCharge(payment.account)');
  });
});
