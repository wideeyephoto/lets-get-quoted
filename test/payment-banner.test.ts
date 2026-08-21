import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CANCELLED_NOTE,
  CANCELLED_NOTE_ONLY_TONE,
  PAYMENT_BANNER_STATUS_WORD,
  PAYMENT_BANNER_TONE,
  paymentBannerMessage,
} from '@/lib/payment-banner';
import { resolvePaymentView, type PaymentBanner, type PaymentViewInput } from '@/lib/payment-view';

/**
 * The words, checked by enumeration rather than by slicing the page.
 *
 * Every previous assertion about this copy read src/app/pay/[id]/page.tsx as
 * text and looked for a literal between two anchors, because there is no jsdom
 * in this suite and a JSX block cannot be rendered. Twice in this repo such a
 * slice went on passing against a NEIGHBOURING block after the code it was named
 * for had moved -- a test that has stopped testing does not fail. The copy lives
 * in a module now, so these import it.
 *
 * `formatMoney` is injected everywhere below exactly as the page injects its
 * own, so nothing here depends on a default that could round a payment.
 */

const money = (n: number) => `$${n.toFixed(2)}`;

const ALL_BANNERS: PaymentBanner[] = [
  'none', 'settling', 'clearing', 'not_finished', 'paid',
  'partly_refunded', 'refunded', 'cancelled', 'disputed', 'unavailable_here',
];

const message = (banner: PaymentBanner, refunded = 0) => paymentBannerMessage(banner, refunded, money);

/** The text a reader actually sees, lead and body run together. */
const text = (banner: PaymentBanner, refunded = 0) => {
  const m = message(banner, refunded);
  return m ? `${m.lead ?? ''} ${m.body}`.trim() : '';
};

describe('every state has been given words', () => {
  it('covers the whole union, with `none` the only silent one', () => {
    // The type already forces a decision per member -- all three tables are
    // Record<PaymentBanner, ...>, so adding one without copy fails typecheck.
    // This is the runtime half: a member could still be given an empty string.
    for (const banner of ALL_BANNERS) {
      if (banner === 'none') {
        expect(message(banner)).toBeNull();
        expect(PAYMENT_BANNER_TONE[banner]).toBeNull();
        continue;
      }
      expect(message(banner), banner).not.toBeNull();
      expect(text(banner, 1200).length, banner).toBeGreaterThan(20);
      expect(PAYMENT_BANNER_TONE[banner], banner).toMatch(/^payment-banner/);
    }
  });

  it('gives words to every banner the resolver can actually return', () => {
    // Ties the two modules together. A banner reachable from resolvePaymentView
    // but absent from the copy tables would render an empty box on a payment
    // page, and neither file's own tests would notice.
    const STATUSES = ['requested', 'processing', 'failed', 'paid', 'refunded', 'disputed', 'canceled', 'unknown'];
    const BOOLS = [false, true];
    const seen = new Set<PaymentBanner>();

    for (const status of STATUSES) {
      for (const moneyInFlight of BOOLS) {
        for (const returnedFromCheckout of BOOLS) {
          for (const payableRail of BOOLS) {
            for (const refunded of [0, 1200]) {
              const input: PaymentViewInput = {
                status, moneyInFlight, returnedFromCheckout, cancelledCheckout: false, payableRail, refunded,
              };
              seen.add(resolvePaymentView(input).banner);
            }
          }
        }
      }
    }

    expect(seen.size).toBeGreaterThan(5);
    for (const banner of seen) {
      if (banner === 'none') continue;
      expect(message(banner, 1200), `${banner} is reachable but has no copy`).not.toBeNull();
    }
  });
});

/**
 * THE REGRESSION THIS CONVERSION EXISTS TO END.
 *
 * The status card used to be a fourth derivation of the payment's state. It
 * branched on the stored status and on whether a transfer was in flight, and
 * never on whether the visitor had just come back from a completed checkout --
 * so a card payer standing on the success redirect, which is the single most
 * common post-payment view there is, read "Not completed" six lines beneath a
 * banner reading "Thanks, that went through".
 *
 * Keying both on the banner is what makes that unsayable. These state it as a
 * property rather than trusting the table below to stay right.
 */
describe('the status card cannot contradict the banner beside it', () => {
  const SAYS_MONEY_MOVED = new Set<PaymentBanner>([
    'settling', 'clearing', 'paid', 'partly_refunded', 'refunded',
  ]);

  it('never puts a not-completed word beside a money-moved message', () => {
    for (const banner of SAYS_MONEY_MOVED) {
      const word = PAYMENT_BANNER_STATUS_WORD[banner];
      expect(word, `${banner} took the stored word instead of deciding`).not.toBeNull();
      expect(word, banner).not.toBe('Not completed');
      expect(word, banner).not.toBe('Failed');
    }
  });

  it('never says money moved beside a nothing-was-charged message', () => {
    expect(PAYMENT_BANNER_STATUS_WORD.not_finished).toBe('Not completed');
    expect(text('not_finished')).toContain('nothing has been charged');
  });

  it('holds across every input the resolver accepts', () => {
    // The end-to-end form: resolve a real combination, then look up what BOTH
    // surfaces would show, and check they tell one story. This is the assertion
    // the old source slice was standing in for, and it could not have caught the
    // defect it was named after.
    const STATUSES = ['requested', 'processing', 'failed', 'paid', 'refunded', 'disputed', 'canceled', 'unknown'];
    const BOOLS = [false, true];

    for (const status of STATUSES) {
      for (const moneyInFlight of BOOLS) {
        for (const returnedFromCheckout of BOOLS) {
          for (const payableRail of BOOLS) {
            const { banner } = resolvePaymentView({
              status, moneyInFlight, returnedFromCheckout, cancelledCheckout: false, payableRail, refunded: 0,
            });
            const word = PAYMENT_BANNER_STATUS_WORD[banner];
            const said = text(banner);
            const where = `${status} inflight=${moneyInFlight} success=${returnedFromCheckout} rail=${payableRail} -> ${banner}`;

            if (/nothing has been charged/.test(said)) {
              expect(word, where).not.toBe('Paid');
              expect(word, where).not.toBe('Clearing');
              expect(word, where).not.toBe('Confirming');
            }
            if (/went through|on its way|already been completed/.test(said)) {
              expect(word, where).not.toBe('Not completed');
            }
          }
        }
      }
    }
  });

  it('names the redirect gap without claiming the payment settled', () => {
    // The webhook is the only authority for `paid`, and an ACH checkout
    // completes at this same URL with the money still days away.
    expect(PAYMENT_BANNER_STATUS_WORD.settling).toBe('Confirming');
    expect(text('settling')).toMatch(/confirming it with your bank/);
    expect(text('settling')).not.toMatch(/\bpaid\b/i);
    expect(text('settling')).not.toMatch(/payment received|has been received/i);
  });

  it('hands the word back only where one banner spans several stored statuses', () => {
    // `none` and `unavailable_here` each cover requested/processing/failed, so
    // the card is the place that still says which -- and an unrecognised status
    // falls through to its own raw value, because a blank where the state should
    // be is worse than an unfamiliar word.
    const deferring = ALL_BANNERS.filter((b) => PAYMENT_BANNER_STATUS_WORD[b] === null);
    expect(deferring.sort()).toEqual(['none', 'unavailable_here']);
  });
});

describe('what the money messages say', () => {
  it('names the amount that went back on a partial refund', () => {
    // Somebody who paid $4,200 and was refunded $1,200 saw "This payment has
    // already been completed. Thank you!" over a $4,200 figure, with the $1,200
    // mentioned nowhere. Their bank statement disagrees with the only page they
    // have, and the page is the one that looks wrong.
    expect(text('partly_refunded', 1200)).toContain(money(1200));
    expect(text('partly_refunded', 1200)).toContain('has since been refunded to you');
    expect(text('partly_refunded', 1200)).toContain('few business days');
  });

  it('keeps the plain message when nothing was refunded', () => {
    expect(text('paid')).toBe('This payment has already been completed. Thank you!');
  });

  it('formats the refund with the caller’s own formatter', () => {
    // The page charges to the cent. A lib that reached for a default is exactly
    // where a $437.50 refund quietly becomes $438.
    expect(text('partly_refunded', 437.5)).toContain('$437.50');
  });

  it('tells an abandoned checkout that nothing was charged, and keeps its button', () => {
    // The common case, and the one that used to read as "your payment is
    // processing" -- leaving somebody believing they had paid when they had not.
    expect(text('not_finished')).toContain('wasn’t completed');
    expect(text('not_finished')).toContain('nothing has been charged');
    expect(text('not_finished')).toContain('You can pay below');
  });

  it('does not tell somebody their payment failed when it merely lapsed', () => {
    // "Failed" reads as "your bank said no". On this rail the usual route is
    // checkout.session.expired -- somebody closed the tab -- and the third is an
    // ACH debit bouncing. It is also the wording the payment_failed SMS uses.
    expect(text('not_finished')).not.toMatch(/\bfailed\b/i);
    const templates = readFileSync(join(process.cwd(), 'src/lib/sms-templates.ts'), 'utf8');
    expect(templates).toContain('was not completed');
  });

  it('says a bank transfer is moving without inviting a second payment', () => {
    expect(text('clearing')).toContain('few business days');
    expect(text('clearing')).toMatch(/don’t pay again|nothing more to do/);
  });

  it('says plainly that a cancelled request has nothing to pay', () => {
    expect(text('cancelled')).toContain('cancelled by your contractor');
    expect(text('cancelled')).toContain('nothing to pay here');
  });

  it('states the unpayable rail once, not twice', () => {
    // This message absorbed a near-duplicate that used to sit above it in a
    // different tone. Only one of them survives, and it is this one.
    expect(text('unavailable_here')).toContain('Online checkout cannot be started or retried from this link.');
    expect(text('unavailable_here')).toContain('No payment can be submitted from this page.');
    expect(text('unavailable_here')).not.toMatch(/contact your contractor.*contact your contractor/s);
  });
});

describe('the tone follows the state, not the URL', () => {
  it('does not let a query string recolour what happened to the money', () => {
    // The old expression tested `status === 'failed' || cancelledJustNow` BEFORE
    // it tested `refunded`, so a refunded payment opened with ?status=cancelled
    // rendered its refund copy in a warning box. Keyed on the banner there is
    // nowhere for the parameter to get in.
    expect(PAYMENT_BANNER_TONE.refunded).toBe('payment-banner muted');
    expect(PAYMENT_BANNER_TONE.paid).toBe('payment-banner success');
    expect(PAYMENT_BANNER_TONE.settling).toBe('payment-banner success');
    expect(PAYMENT_BANNER_TONE.not_finished).toBe('payment-banner warning');
    expect(PAYMENT_BANNER_TONE.unavailable_here).toBe('payment-banner muted');
  });

  it('leaves the cancelled note a box of its own to live in', () => {
    // banner 'none' has no container -- and showCancelledNote can be true
    // underneath it, which is a legacy-rail `requested` payment whose visitor
    // pressed Cancel inside Stripe. Without a fallback tone that visitor loses
    // the words "You have not been charged" entirely.
    expect(PAYMENT_BANNER_TONE.none).toBeNull();
    expect(CANCELLED_NOTE_ONLY_TONE).toMatch(/^payment-banner/);
    expect(CANCELLED_NOTE).toContain('have not been charged');

    const page = readFileSync(join(process.cwd(), 'src/app/pay/[id]/page.tsx'), 'utf8').replace(/\r\n/g, '\n');
    expect(page).toContain('bannerTone ?? CANCELLED_NOTE_ONLY_TONE');
    expect(page).toContain('{bannerMessage || paymentView.showCancelledNote ? (');
  });
});

describe('the page reads all three outputs and re-derives none of them', () => {
  const page = readFileSync(join(process.cwd(), 'src/app/pay/[id]/page.tsx'), 'utf8').replace(/\r\n/g, '\n');
  /**
   * Comments are stripped: an assertion about the code must not be able to match
   * the prose explaining the code. That has happened here before.
   *
   * Block comments go WHOLE, not line by line. A per-line filter keyed on a
   * leading `*` leaves every continuation line of a JSX `/* ... *\/` in place,
   * and those lines are exactly where a comment discusses the symbol it is
   * explaining the absence of.
   */
  const code = page
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');

  it('takes the banner, the tone and the word from the resolver', () => {
    expect(code).toContain('const canPay = paymentView.canPay;');
    expect(code).toContain('paymentBannerMessage(paymentView.banner, refundedSoFar, formatMoney)');
    expect(code).toContain('PAYMENT_BANNER_TONE[paymentView.banner]');
    expect(code).toContain('PAYMENT_BANNER_STATUS_WORD[paymentView.banner]');
    expect(code).toContain('paymentView.showCancelledNote');
  });

  it('has stopped rebuilding the state from the raw booleans', () => {
    // Each of these was an independent derivation of something the resolver
    // already decided. If one comes back, so does the class of bug.
    expect(code).not.toContain('const statusMessage');
    expect(code).not.toContain('const checkoutNotFinished');
    expect(code).not.toContain('const directCheckoutUnavailable');
    expect(code).not.toContain('const statusTone');
    expect(code).not.toContain("returnedFromCheckout && payment.status !== 'paid'");
    expect(code).not.toContain("payment.status === 'processing'\n    ? (moneyIsInFlight");
  });

  it('renders exactly one state banner', () => {
    // The whole point. Six sibling blocks with independent conditions could
    // co-fire; one block keyed on one banner cannot. Counted on code only, so
    // the examples quoted in the comments above cannot pad the number.
    const stateBanners = code.match(/className=\{bannerTone/g) ?? [];
    expect(stateBanners).toHaveLength(1);
  });

  it('still owns the notices that are not statements about the state', () => {
    // Additive page content that legitimately stacks: these are NOT banner
    // values and must not be folded into one.
    //
    // The not-onboarded notice is named by its PREDICATE rather than by the
    // column it used to read. This assertion originally looked for
    // `connect_onboarded`, which was the weaker two-thirds check the page made
    // before it was corrected to canCreateConnectCharge -- so the assertion was
    // pinning the defect in place. See test/connect-charge-guard.test.ts.
    expect(code).toContain('{quickStop && canPay ? (');
    expect(code).toContain('canCreateConnectCharge(payment.account)');
  });
});
