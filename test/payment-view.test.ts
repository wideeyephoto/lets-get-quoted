import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolvePaymentView, type PaymentViewInput } from '@/lib/payment-view';

/**
 * Six interacting booleans decided what /pay/[id] said, read in sequence down
 * the page. One combination bit: `processing` with no in-flight flag was made to
 * read "This payment wasn't completed, so nothing has been charged" -- correct
 * for an abandoned checkout, and shown to somebody who had just paid by card,
 * because Stripe redirects before its webhook lands.
 *
 * These tests enumerate the space rather than sampling it.
 */

const base: PaymentViewInput = {
  status: 'requested',
  moneyInFlight: false,
  returnedFromCheckout: false,
  cancelledCheckout: false,
  payableRail: true,
  refunded: 0,
};

const view = (over: Partial<PaymentViewInput> = {}) => resolvePaymentView({ ...base, ...over });

describe('the ordinary path', () => {
  it('offers to pay an open request with nothing to say about it', () => {
    expect(view()).toMatchObject({ banner: 'none', canPay: true });
  });
});

describe('the three states a `processing` row can be in', () => {
  it('just came back from a completed checkout', () => {
    // The regression. Stripe redirects the instant checkout completes, so the
    // row is still `processing` and there is no async flag on a card payment.
    expect(view({ status: 'processing', returnedFromCheckout: true }))
      .toMatchObject({ banner: 'settling', canPay: false });
  });

  it('has a bank transfer genuinely in flight', () => {
    expect(view({ status: 'processing', moneyInFlight: true }))
      .toMatchObject({ banner: 'clearing', canPay: false });
  });

  it('was started and abandoned, and keeps its button', () => {
    // The common case, and the half that is easy to lose: withholding the button
    // from every `processing` payment is what made an invoice unpayable for a
    // day.
    expect(view({ status: 'processing' }))
      .toMatchObject({ banner: 'not_finished', canPay: true });
  });

  it('prefers the completed checkout over the in-flight flag', () => {
    // Both true is reachable: an ACH checkout completes at the success URL with
    // the money days away. "That went through, we're confirming" is right for
    // somebody standing on the redirect; "your transfer is clearing" is what
    // they see when they come back later.
    expect(view({ status: 'processing', returnedFromCheckout: true, moneyInFlight: true }))
      .toMatchObject({ banner: 'settling', canPay: false });
  });
});

describe('terminal states outrank everything about a checkout attempt', () => {
  it('says paid even on the success redirect', () => {
    // Two success banners stacked would read as two payments.
    expect(view({ status: 'paid', returnedFromCheckout: true }))
      .toMatchObject({ banner: 'paid', canPay: false });
  });

  it('names a partial refund separately', () => {
    // A partial refund leaves the status at `paid`, so without this the money
    // that went back is mentioned nowhere.
    expect(view({ status: 'paid', refunded: 1200 })).toMatchObject({ banner: 'partly_refunded' });
    expect(view({ status: 'paid', refunded: 0 })).toMatchObject({ banner: 'paid' });
  });

  it('never offers to pay a settled, refunded, disputed or cancelled payment', () => {
    for (const status of ['paid', 'refunded', 'disputed', 'canceled']) {
      expect(view({ status }).canPay, status).toBe(false);
    }
  });

  it('ignores the in-flight flag once the payment has settled', () => {
    // The flag is advisory and cleared best-effort, so a stale value on a
    // settled row is expected and must not be believed.
    expect(view({ status: 'paid', moneyInFlight: true })).toMatchObject({ banner: 'paid' });
  });
});

describe('the rail this page cannot charge on', () => {
  it('says so instead of offering a button', () => {
    expect(view({ payableRail: false })).toMatchObject({ banner: 'unavailable_here', canPay: false });
  });

  it('outranks the abandoned-checkout wording', () => {
    // Otherwise the page reads "you can pay below" directly above "checkout
    // cannot be started from this link".
    expect(view({ status: 'processing', payableRail: false }))
      .toMatchObject({ banner: 'unavailable_here', canPay: false });
  });

  it('does not override a terminal state', () => {
    // A paid payment on any rail is paid.
    expect(view({ status: 'paid', payableRail: false })).toMatchObject({ banner: 'paid' });
  });
});

describe('the cancelled-checkout note rides alongside', () => {
  it('shows with an open request', () => {
    expect(view({ cancelledCheckout: true })).toMatchObject({ showCancelledNote: true, canPay: true });
  });

  it('shows even when the payment is already settled', () => {
    // Backing out of a second checkout says nothing about the first.
    expect(view({ status: 'paid', cancelledCheckout: true }))
      .toMatchObject({ banner: 'paid', showCancelledNote: true });
  });
});

describe('an unrecognised status is not payable', () => {
  it('offers nothing rather than guessing', () => {
    // Defaulting the other way would put a Pay button under a state nobody has
    // reasoned about.
    expect(view({ status: 'some_future_state' })).toMatchObject({ banner: 'none', canPay: false });
  });
});

describe('every combination resolves, and only sensibly', () => {
  const STATUSES = ['requested', 'processing', 'failed', 'paid', 'refunded', 'disputed', 'canceled', 'unknown'];
  const BOOLS = [false, true];

  it('never returns a banner outside the union', () => {
    const allowed = new Set([
      'none', 'settling', 'clearing', 'not_finished', 'paid',
      'partly_refunded', 'refunded', 'cancelled', 'disputed', 'unavailable_here',
    ]);
    for (const status of STATUSES) {
      for (const moneyInFlight of BOOLS) {
        for (const returnedFromCheckout of BOOLS) {
          for (const payableRail of BOOLS) {
            for (const refunded of [0, 1200]) {
              const result = resolvePaymentView({
                ...base, status, moneyInFlight, returnedFromCheckout, payableRail, refunded,
              });
              expect(allowed.has(result.banner), `${status} ${result.banner}`).toBe(true);
            }
          }
        }
      }
    }
  });

  it('never offers to pay while telling somebody money is already moving', () => {
    // The expensive failure, checked across the whole space rather than by
    // example: no combination may produce a Pay button beside a banner that says
    // their money is on its way or already through.
    const saysMoneyMoved = new Set(['settling', 'clearing', 'paid', 'partly_refunded', 'refunded']);
    for (const status of STATUSES) {
      for (const moneyInFlight of BOOLS) {
        for (const returnedFromCheckout of BOOLS) {
          for (const payableRail of BOOLS) {
            const result = resolvePaymentView({
              ...base, status, moneyInFlight, returnedFromCheckout, payableRail,
            });
            if (saysMoneyMoved.has(result.banner)) {
              expect(result.canPay, `${status}/${result.banner} offered a Pay button`).toBe(false);
            }
          }
        }
      }
    }
  });

  it('never says nothing was charged to somebody who just completed checkout', () => {
    // The exact regression, stated as a property.
    for (const status of STATUSES) {
      for (const moneyInFlight of BOOLS) {
        const result = resolvePaymentView({
          ...base, status, moneyInFlight, returnedFromCheckout: true,
        });
        expect(result.banner, `${status} after a completed checkout`).not.toBe('not_finished');
      }
    }
  });
});

describe('the page uses it', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
  const PAGE = read('src/app/pay/[id]/page.tsx');

  it('takes canPay from the resolver rather than rebuilding it', () => {
    expect(PAGE).toContain('resolvePaymentView({');
    expect(PAGE).toContain('const canPay = paymentView.canPay;');
  });

  it('feeds it every input it decides on', () => {
    const call = PAGE.slice(PAGE.indexOf('resolvePaymentView({'), PAGE.indexOf('});', PAGE.indexOf('resolvePaymentView({')));
    for (const field of [
      'status:', 'moneyInFlight:', 'returnedFromCheckout', 'cancelledCheckout:', 'payableRail:', 'refunded:',
    ]) {
      expect(call, field).toContain(field);
    }
  });

  it('no longer assembles the button condition inline', () => {
    // The six-boolean chain is what let the regression through. If it comes
    // back, so does the class of bug.
    expect(PAGE).not.toContain("(payment.status === 'requested' || payment.status === 'failed' || payment.status === 'processing') &&");
  });

  it('says out loud that the banners have not moved yet', () => {
    // Half-wiring without saying so is how the next person assumes the resolver
    // is the whole authority and edits only it.
    expect(PAGE).toContain('DELIBERATELY NOT DRIVING THE BANNERS TOO');
  });
});
