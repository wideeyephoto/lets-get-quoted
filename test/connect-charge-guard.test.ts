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
