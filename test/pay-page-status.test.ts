import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PAYMENT_BANNER_STATUS_WORD, paymentBannerMessage } from '@/lib/payment-banner';
import { resolvePaymentView, type PaymentBanner, type PaymentViewInput } from '@/lib/payment-view';

/**
 * The page's words moved into src/lib/payment-banner.ts, keyed on the banner
 * resolvePaymentView returns, so the assertions below IMPORT them instead of
 * hunting for literals in the page source. That is the point of the move: this
 * file is full of slices, and twice one of them went on passing against a
 * neighbouring block after the code it was named for had moved.
 *
 * The tests keep their names and their reasons. Only the place they look changed.
 */
const bannerText = (banner: PaymentBanner, refunded = 0): string => {
  const m = paymentBannerMessage(banner, refunded, (n) => `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`);
  return m ? `${m.lead ?? ''} ${m.body}`.trim() : '';
};

/** The banner a real combination of row and URL resolves to. */
const bannerFor = (over: Partial<PaymentViewInput>): PaymentBanner => resolvePaymentView({
  status: 'requested',
  moneyInFlight: false,
  returnedFromCheckout: false,
  cancelledCheckout: false,
  payableRail: true,
  refunded: 0,
  ...over,
}).banner;

/**
 * Line endings normalised at the READ site, not worked around per assertion.
 *
 * These files are CRLF on disk, so any assertion spanning two lines fails
 * silently against a \n written in the test. The fix is here, once — pasting
 * \r\n into an expectation makes the test unreadable and only moves the trap.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

const PAGE = read('src/app/pay/[id]/page.tsx');
const PAYMENTS = read('src/lib/payments.ts');

/**
 * The public payment page is the last thing a homeowner looks at before they
 * type a card number into it. Everything on it should read like it was written
 * for them, not like a row.
 */
describe('the payment page shows words, not stored values', () => {
  it('never prints the raw status enum', () => {
    // It used to render {payment.status} directly, so a $3,500 charge was
    // labelled with a lowercase "requested" in the same weight as the amount.
    expect(PAGE).not.toMatch(/\{payment\.status\}/);
    expect(PAGE).toContain('STATUS_LABEL[payment.status] ?? payment.status');
  });

  it('labels every status the type allows, so none can fall through', () => {
    const union = PAYMENTS.match(/export type PaymentStatus =([^;]+);/)?.[1] ?? '';
    const statuses = [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(statuses.length).toBeGreaterThan(4);

    const block = PAGE.slice(PAGE.indexOf('const STATUS_LABEL'), PAGE.indexOf('};', PAGE.indexOf('const STATUS_LABEL')));
    for (const status of statuses) {
      expect(block, status).toContain(`${status}: '`);
    }
  });

  it('capitalizes in the markup rather than with a CSS transform', () => {
    // A transform leaves the raw enum in the DOM, which is what gets read
    // aloud, copied, and pasted into an email asking what it means.
    const block = PAGE.slice(PAGE.indexOf('const STATUS_LABEL'), PAGE.indexOf('};', PAGE.indexOf('const STATUS_LABEL')));
    for (const [, label] of block.matchAll(/: '([A-Za-z ]+)'/g)) {
      expect(label[0], label).toBe(label[0].toUpperCase());
    }
  });
});

/**
 * "Processing" meant two different things and the page only said one of them.
 *
 * `payments.status` becomes 'processing' when a Checkout Session is CREATED, so
 * it covers both a bank transfer genuinely clearing and a homeowner who opened
 * Stripe and closed the tab. The page told both the first story — "you'll be
 * confirmed once it settles" — and rendered a Pay button underneath it.
 */
describe('telling a clearing bank transfer apart from an abandoned checkout', () => {
  const WEBHOOK = readFileSync(join(process.cwd(), 'src/app/api/stripe/webhook/route.ts'), 'utf8');

  it('records the ACH case the webhook used to drop', () => {
    // checkout.session.completed fires for a delayed method with payment_status
    // 'unpaid'. The settle branch only runs on 'paid', so nothing was written at
    // all and the row stayed indistinguishable from an abandoned one.
    expect(WEBHOOK).toContain("session.payment_status === 'unpaid'");
    expect(WEBHOOK).toContain('async_payment_pending_at: new Date().toISOString()');
  });

  it('requires a payment intent before claiming money is moving', () => {
    // Belt and braces: the intent is the object that later succeeds or fails.
    // Without one there is nothing actually in flight to report.
    const branch = WEBHOOK.slice(WEBHOOK.indexOf("session.payment_status === 'unpaid'"));
    expect(branch.slice(0, 120)).toContain('session.payment_intent');
  });

  it('clears the flag in the same UPDATE that settles or fails the payment', () => {
    // A second write could fail on its own and leave the page telling somebody
    // their settled payment is still clearing.
    const settle = WEBHOOK.slice(WEBHOOK.indexOf("status: 'paid',"));
    expect(settle.slice(0, 900)).toContain('async_payment_pending_at: null');
    const fail = WEBHOOK.slice(WEBHOOK.indexOf("status: 'failed',"));
    expect(fail.slice(0, 900)).toContain('async_payment_pending_at: null');
  });

  it('reads the flag only after status, never instead of it', () => {
    // The column is advisory and cleared best-effort, so a stale value on a
    // settled row is expected. Believing it alone would show "your transfer is
    // clearing" over a payment that completed days ago.
    expect(PAGE).toContain("payment.status === 'processing'");
    const guard = PAGE.slice(PAGE.indexOf('const moneyIsInFlight'));
    expect(guard.slice(0, 200)).toContain("payment.status === 'processing'");
    expect(guard.slice(0, 200)).toContain('async_payment_pending_at');
  });

  it('withholds the Pay button from a transfer already clearing', () => {
    // The expensive failure: inviting a second payment while an ACH is in
    // flight. The SERVER still allows the retry so an abandoned checkout can be
    // resumed — this withholds the invitation, it does not close the door.
    //
    // This used to slice the inline canPay expression and look for
    // `!moneyIsInFlight`. That decision now lives in resolvePaymentView, and the
    // slice kept passing — against the checkoutNotFinished block below it, which
    // is not what the test is named after. So it asserts the wiring here and the
    // behaviour is covered exhaustively in payment-view.test.ts.
    expect(PAGE).toContain('resolvePaymentView({');
    expect(PAGE).toContain('moneyInFlight: moneyIsInFlight');
    expect(PAGE).toContain('const canPay = paymentView.canPay;');
  });

  it('tells an abandoned checkout that nothing was charged', () => {
    // The common case, and the one that used to read as "your payment is
    // processing" — leaving somebody believing they had paid when they had not.
    expect(bannerFor({ status: 'processing' })).toBe('not_finished');
    expect(bannerText('not_finished')).toContain('wasn’t completed');
    expect(bannerText('not_finished')).toContain('nothing has been charged');
  });

  it('does not offer to pay below on a rail that cannot be paid from', () => {
    // Both used to render, one saying "you can pay below" and the other "you
    // cannot". They were separate booleans that happened not to overlap because
    // one of them remembered to name the rail; now they are two values of one
    // decision, so overlapping is not a thing that can be got wrong.
    expect(bannerFor({ status: 'processing', payableRail: false })).toBe('unavailable_here');
    expect(bannerText('unavailable_here')).not.toContain('You can pay below');
    expect(bannerText('not_finished')).toContain('You can pay below');
  });
});

describe('the processing fee is a number a person can read', () => {
  it('does not multiply the rate inline any more', () => {
    // `${rate * 100}%` is exact for the four rates shipping today and not in
    // general: 175 bps renders "1.7500000000000002%". fee_rate is read off the
    // row, so it is whatever was stored at checkout, not what the catalog holds.
    expect(PAGE).not.toContain('displayFeeRate * 100}%');
    expect(PAGE).toContain('formatFeeRate(displayFeeRate)');
  });

  it('keeps exact rates exact rather than padding them', () => {
    // Reimplemented here rather than imported: the helper is local to a server
    // component, and the assertion worth making is about the output.
    const formatFeeRate = (rate: number) => `${Number((rate * 100).toFixed(4))}%`;
    expect(formatFeeRate(0.0125)).toBe('1.25%');
    expect(formatFeeRate(0.005)).toBe('0.5%');
    expect(formatFeeRate(0.001)).toBe('0.1%');
    // The two that were broken.
    expect(formatFeeRate(0.0175)).toBe('1.75%');
    expect(formatFeeRate(0.0007)).toBe('0.07%');
  });
});

describe('the fee disclosure is legible in the theme it actually renders in', () => {
  it('states no color as a literal hex', () => {
    // Two lines carried `color: '#666'` inline -- the processing-fee
    // explanation and the bank-transfer note. This app's DEFAULT theme is dark
    // (:root is dark, [data-theme='light'] is the override), and --bg there is
    // #06131f, so those two lines rendered at 3.26:1 against their background.
    // AA body text needs 4.5:1. In light mode the same grey is 5.12:1 and
    // passes, which is exactly why it survived: it only fails in the default.
    //
    // An inline style also beats any class, and .payment-fee-note has no CSS
    // rule at all -- so the hardcoded value was the only thing deciding.
    // var(--muted) is #c8d0dc on dark (12.06:1) and #323a4b on light (10.16:1).
    expect(PAGE).not.toMatch(/color: '#[0-9a-fA-F]{3,6}'/);
    expect(PAGE).toContain("color: 'var(--muted)'");
  });

  it('uses a variable that is defined in both themes', () => {
    // A var() that resolves to nothing inherits, which on this page would be
    // body text -- legible, but not the muted treatment these notes want.
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    const dark = css.slice(css.indexOf(':root {'), css.indexOf(":root[data-theme='light']"));
    const light = css.slice(css.indexOf(":root[data-theme='light']"));
    expect(dark).toContain('--muted:');
    expect(light).toContain('--muted:');
  });
});

describe('a failed checkout does not look like a crash', () => {
  const BOUNDARY = readFileSync(
    join(process.cwd(), 'src/app/pay/[id]/error.tsx'), 'utf8');
  const PAYMENTS_LIB = readFileSync(join(process.cwd(), 'src/lib/payments.ts'), 'utf8');

  it('exists at all', () => {
    // It did not. An uncaught throw fell through to Next's own screen --
    // "Application error: a client-side exception has occurred", blank page --
    // in front of somebody who just pressed a button labelled Pay.
    expect(BOUNDARY).toContain("'use client'");
    expect(BOUNDARY).toContain('export default function');
  });

  it('says the card was not charged, first and without hedging', () => {
    // The likeliest visitor is somebody who ALREADY PAID, in another tab or a
    // week ago. Nothing on /pay/[id] charges anything -- Stripe collects the
    // card on the page after it -- so this can be promised outright.
    expect(BOUNDARY).toContain('has not been charged');
    const beforeActions = BOUNDARY.slice(0, BOUNDARY.indexOf('workspace-actions'));
    expect(beforeActions, 'the reassurance must come before the buttons').toContain('has not been charged');
  });

  it('offers a reload, not only reset()', () => {
    // reset() re-renders against the same props that just failed. A reload
    // re-reads the payment, and the page's own status card then says Paid,
    // Cancelled or Refunded in words -- which is the actual answer.
    expect(BOUNDARY).toContain('window.location.reload()');
  });

  it('logs the digest and never renders it', () => {
    expect(BOUNDARY).toContain('error.digest');
    expect(BOUNDARY).toContain('console.error');
    expect(BOUNDARY).not.toMatch(/\{\s*error\.digest\s*\}/);
    expect(BOUNDARY).not.toMatch(/\{\s*error\.message\s*\}/);
  });

  it('covers throws a homeowner can actually reach', () => {
    // Not exotic failures. Every one of these is one reasonable action away:
    // paying in another tab, opening a texted link late, double-clicking.
    for (const message of [
      'This payment has already been completed.',
      'This payment request is no longer available.',
      'This Quick Stop offer has expired.',
    ]) {
      expect(PAYMENTS_LIB, message).toContain(message);
    }
  });
});

describe('the words match what actually happened', () => {
  it('does not tell somebody their payment failed when it merely lapsed', () => {
    // "Failed" reads as "your bank said no". On this rail that is usually not
    // what happened: a card declined inside Stripe Checkout does not complete
    // the session -- Stripe keeps the customer there to retry -- so the common
    // route to `failed` is checkout.session.expired, hours after somebody closed
    // the tab. The third route is an ACH debit bouncing.
    expect(PAGE).not.toContain('The last payment attempt failed');
    expect(bannerText('not_finished')).toContain('wasn’t completed');
    expect(bannerText('not_finished')).not.toMatch(/\bfailed\b/i);
    // A `failed` row and an abandoned checkout say the same thing, which is the
    // reason the wording is careful in the first place.
    expect(bannerFor({ status: 'failed' })).toBe('not_finished');
  });

  it('says the same thing the text message says', () => {
    // The payment_failed SMS has always been careful here: "was not completed".
    // A page and a text describing one event in two ways is how somebody decides
    // one of them is wrong.
    const templates = readFileSync(join(process.cwd(), 'src/lib/sms-templates.ts'), 'utf8');
    expect(templates).toContain('was not completed');
  });
});

describe('no surface invites a second payment for money already moving', () => {
  /**
   * The whole `processing` story, checked in one place at the end.
   *
   * Four customer-facing surfaces can show or offer a payment. Each had to learn
   * the same distinction, because `status = 'processing'` is written when a
   * Checkout Session is CREATED and therefore covers both a bank transfer in
   * flight and a checkout somebody abandoned.
   */
  const SURFACES = [
    ['pay page', 'src/app/pay/[id]/page.tsx'],
    ['invoice state machine', 'src/lib/invoice-pay.ts'],
    ['client job page', 'src/app/client/jobs/[token]/page.tsx'],
  ] as const;

  for (const [name, file] of SURFACES) {
    it(`${name} consults async_payment_pending_at, not status alone`, () => {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source).toContain('async_payment_pending_at');
      expect(source).toContain("'processing'");
    });
  }

  it('the client job page still LISTS an in-flight payment', () => {
    // It is outstanding, and hiding it would look like it had vanished. What it
    // must not do is drive the "Pay $3,500" call to action.
    const source = readFileSync(join(process.cwd(), 'src/app/client/jobs/[token]/page.tsx'), 'utf8');
    expect(source).toContain('const openPayments');
    expect(source).toContain('const payableNow');
    expect(source).toContain('openPayment: payableNow[0]');
  });

  it('an abandoned checkout still says Pay everywhere', () => {
    // The other half, and the easier one to lose: withholding the button from
    // every `processing` payment is what made an invoice unpayable for a day.
    const invoicePay = readFileSync(join(process.cwd(), 'src/lib/invoice-pay.ts'), 'utf8');
    expect(invoicePay).toContain("payment.status === 'processing' && Boolean(payment.async_payment_pending_at)");
    const clientPage = readFileSync(join(process.cwd(), 'src/app/client/jobs/[token]/page.tsx'), 'utf8');
    expect(clientPage).toContain("!(payment.status === 'processing' && payment.async_payment_pending_at)");
  });
});

describe('a partial refund is not invisible', () => {
  const WEBHOOK = readFileSync(join(process.cwd(), 'src/app/api/stripe/webhook/route.ts'), 'utf8');

  it('is a state the page can genuinely be in', () => {
    // Only a FULL refund moves the status to `refunded`. A partial one leaves it
    // at `paid` and records the amount -- deliberate, because the refund text
    // message states the whole amount and would be wrong for a partial.
    expect(WEBHOOK).toContain("status: isFull ? 'refunded' : 'paid'");
    expect(WEBHOOK).toContain('refunded_amount: refundedTotal');
  });

  it('says how much went back', () => {
    // Somebody who paid $4,200 and was refunded $1,200 saw "This payment has
    // already been completed. Thank you!" over a $4,200 figure, with the $1,200
    // nowhere. Their bank statement disagrees with the only page they have, and
    // the page is the one that looks wrong.
    expect(bannerFor({ status: 'paid', refunded: 1200 })).toBe('partly_refunded');
    expect(bannerText('partly_refunded', 1200)).toContain('has since been refunded to you');
    expect(bannerText('partly_refunded', 1200)).toContain('$1,200.00');
  });

  it('keeps the plain message when nothing was refunded', () => {
    expect(bannerFor({ status: 'paid', refunded: 0 })).toBe('paid');
    expect(bannerText('paid')).toBe('Payment received in full. Thank you!');
  });

  it('does not print null at somebody', () => {
    // refunded_amount is null on rows predating the column, and "$null" on a
    // payment page is its own support call.
    expect(PAGE).toContain('Number(payment.refunded_amount) || 0');
  });

  it('sets expectations about when the money lands', () => {
    // The question somebody reading this actually has next.
    //
    // Asserted against the refund message itself, not against the page. When the
    // copy moved this went on passing -- against the ACH offer note further down
    // ("a bank transfer takes a few business days to clear"), which is a
    // different sentence about a different direction of travel, in a describe
    // block named for refunds. It had stopped testing and did not fail.
    expect(bannerText('partly_refunded', 1200)).toContain('few business days');
  });
});

describe('a priority visit fee is not called a deposit', () => {
  const QUICK_STOP_PAYMENTS = readFileSync(
    join(process.cwd(), 'src/lib/quick-stop-payments.ts'), 'utf8');
  const PAYMENTS_LIB2 = readFileSync(join(process.cwd(), 'src/lib/payments.ts'), 'utf8');

  it('is stored as a deposit, which is why the label was wrong', () => {
    // quick-stop-payments writes kind: 'deposit' because it is the closest
    // existing kind. The page then rendered "Deposit" over a $75 priority fee,
    // which tells a homeowner it comes off the job total.
    expect(QUICK_STOP_PAYMENTS).toContain("kind: 'deposit'");
  });

  it('labels it from the offer, not from the kind', () => {
    // Written across lines now that a third label joined it, so the assertion
    // checks the branch rather than a formatting accident.
    const label = PAGE.slice(PAGE.indexOf('const kindLabel'), PAGE.indexOf('const payByClock'));
    expect(label).toContain('quickStop');
    expect(label).toContain("'Priority visit'");
    // All three places the label appears must use it, or the brand bar says
    // "Deposit" while the heading says "Priority visit".
    expect(PAGE).toContain('context={kindLabel}');
    expect(PAGE).toContain('<h1 className="workspace-title">{kindLabel}</h1>');
  });

  it('says the fee is not credited against the job', () => {
    // The booking flow says this twice before they get here: "That fee reserves
    // the visit -- the service itself is quoted and billed separately." The page
    // where they actually pay said the opposite word.
    expect(PAGE).toContain('not taken off');
    expect(PAGE).toContain('billed separately');
  });

  it('shows the deadline the server already enforces', () => {
    // createCheckoutSessionForPayment refuses after payment_deadline_at with
    // "This Quick Stop offer has expired." Somebody could open a texted link,
    // take twenty minutes over it, and press a live-looking button into that.
    //
    // The rule itself now lives in quick-stop.ts as quickStopOfferAllowsPayment,
    // asked by BOTH the server and this page -- which is the half that was
    // missing. Showing the deadline was mistaken for applying it: the page
    // printed "Please pay by 3:45 PM" and left a live button under it.
    expect(PAYMENTS_LIB2).toContain('quickStopOfferAllowsPayment');
    expect(PAYMENTS_LIB2).toContain('This Quick Stop offer has expired.');
    expect(PAGE).toContain('Please pay by');
    expect(PAGE).toContain('payment_deadline_at');
  });

  it('only says any of it while the payment can still be made', () => {
    // A deadline on an already-paid Quick Stop is noise, and "pay by 3:45" under
    // "This payment has already been completed" reads as a second demand.
    //
    // And only while the OFFER can be paid, which is not the same question. A
    // slot released an hour ago must not still be advertising the time by which
    // it should have been paid for.
    expect(PAGE).toContain('quickStop && quickStop.payable && canPay');
  });

  it('degrades quietly when the offer cannot be read', () => {
    // Most payments are not Quick Stops, and an unreadable row must leave the
    // page exactly as it was rather than blanking the label.
    expect(PAGE).toContain('if (error || !data) return null');
  });
});

describe('an installment says which one it is', () => {
  it('reads installment_seq, which was on the row all along', () => {
    // Somebody paying month three of four saw "Installment" and a figure -- the
    // same three words as month one. A plan texts every month; being unable to
    // tell #2 from #4 is the difference between "fine" and ringing to ask.
    expect(PAGE).toContain('loadInstallmentPosition');
    expect(PAGE).toContain('payment.installment_seq');
    expect(PAGE).toContain('Installment ${installment.seq} of ${installment.total}');
  });

  it('refuses to guess when either half is unknown', () => {
    // "3 of 0" and "5 of 4" are both worse than the plain word this replaces.
    expect(PAGE).toContain('!Number.isInteger(total) || total < 1 || seq > total');
    expect(PAGE).toContain('if (!planId || !seq || seq < 1) return null');
  });

  it('falls back to the kind map, not to nothing', () => {
    // A plan payment whose count cannot be read must still say "Installment".
    expect(PAGE).toContain("(KIND_LABEL[payment.kind] || 'Payment')");
  });

  it('does not collide with the Quick Stop label', () => {
    // A Quick Stop is also stored as kind 'deposit' and could in principle
    // carry a plan id. Priority visit wins, because that is what it is.
    const label = PAGE.slice(PAGE.indexOf('const kindLabel'), PAGE.indexOf('const payByClock'));
    expect(label.indexOf('Priority visit')).toBeLessThan(label.indexOf('Installment ${'));
  });
});

describe('the page does not pay for lookups it cannot use', () => {
  it('skips the Quick Stop read for a kind that cannot be one', () => {
    // Every Quick Stop is written as kind 'deposit'. A final bill or a stage
    // payment can never match, so the round trip can only return nothing --
    // on the most-loaded customer-facing route in the product.
    expect(PAGE).toContain("if (kind !== 'deposit') return null");
    expect(PAGE).toContain('loadQuickStopOffer(admin, payment.id, payment.kind)');
  });

  it('skips the installment read with no plan to read', () => {
    expect(PAGE).toContain('if (!planId || !seq || seq < 1) return null');
  });

  it('runs what it does need concurrently', () => {
    // Three reads that do not depend on each other. Sequential awaits here would
    // be three round trips deep on a page somebody is waiting to pay from.
    expect(PAGE).toContain('await Promise.all([');
    const block = PAGE.slice(PAGE.indexOf('await Promise.all(['), PAGE.indexOf('])', PAGE.indexOf('await Promise.all([')));
    expect(block).toContain('loadContractorBrand');
    expect(block).toContain('loadQuickStopOffer');
    expect(block).toContain('loadInstallmentPosition');
  });
});

describe('the status card agrees with the sentence beside it', () => {
  it('does not say Processing for a checkout nobody finished', () => {
    // One stored value, THREE situations. The card read "Processing" directly
    // beside a banner saying "You started a payment but it wasn't completed" --
    // and the card is the thing people quote back on the phone.
    expect(PAYMENT_BANNER_STATUS_WORD[bannerFor({ status: 'processing' })]).toBe('Not completed');
    expect(PAYMENT_BANNER_STATUS_WORD[bannerFor({ status: 'processing', moneyInFlight: true })]).toBe('Clearing');
  });

  it('resolves it the same way the banner does', () => {
    // They cannot drift apart into saying different things about one payment,
    // because there is now one decision rather than two that happened to read
    // the same boolean.
    //
    // THE THIRD SITUATION IS WHY THIS MATTERS. The card knew about a transfer in
    // flight and about an abandoned checkout, and nothing else -- so a card payer
    // standing on the success redirect got "Not completed" beside "Thanks, that
    // went through".
    //
    // The old assertion sliced between `const statusLabel` and
    // `const directCheckoutUnavailable`. The second anchor no longer exists,
    // which makes indexOf return -1 and the slice run to the end of the file, so
    // it went on passing against essentially the whole page. It could not have
    // caught the defect it was named for even before that.
    expect(bannerFor({ status: 'processing', returnedFromCheckout: true })).toBe('settling');
    expect(PAYMENT_BANNER_STATUS_WORD.settling).toBe('Confirming');
    expect(PAYMENT_BANNER_STATUS_WORD.settling).not.toBe('Not completed');
  });

  it('keeps the unknown-status fallback', () => {
    // On a payment page a blank where the state should be is worse than an
    // unfamiliar word, which is why the original had this.
    expect(PAGE).toContain('STATUS_LABEL[payment.status] ?? payment.status');
  });
});

describe('the success redirect, which races the webhook', () => {
  const PAYMENTS_LIB3 = read('src/lib/payments.ts');

  it('is a URL Stripe actually sends people to', () => {
    // The premise. If success_url ever stopped carrying this, every assertion
    // below would be guarding a branch nothing reaches.
    expect(PAYMENTS_LIB3).toContain('success_url: `${origin}/pay/${payment.id}?status=success`');
  });

  it('does not tell somebody who just paid that nothing was charged', () => {
    // MY OWN REGRESSION. Stripe redirects the instant checkout completes,
    // routinely before the webhook lands, so the row is still `processing` with
    // no async flag -- which the abandoned-checkout wording I added renders as
    // "This payment wasn't completed, so nothing has been charged". Seconds
    // after their card was charged.
    //
    // Stated as the outcome now rather than as the presence of a `!` in a
    // source slice: whatever the row says, arriving on the success URL must not
    // produce the nothing-was-charged wording.
    expect(bannerFor({ status: 'processing', returnedFromCheckout: true })).toBe('settling');
    expect(bannerText('settling')).not.toContain('nothing has been charged');
    expect(bannerText('settling')).not.toContain('wasn’t completed');
  });

  it('does not offer to pay again during the gap', () => {
    // Same story as the assertion above: the decision moved into
    // resolvePaymentView, and the old source slice went on passing against a
    // neighbouring block. The behaviour itself is a property test over every
    // combination in payment-view.test.ts -- "never offers to pay while telling
    // somebody money is already moving".
    expect(PAGE).toContain('returnedFromCheckout,');
    expect(PAGE).toContain('const canPay = paymentView.canPay;');
  });

  it('says what happened rather than going quiet', () => {
    expect(bannerText('settling')).toContain('Thanks — that went through');
    expect(bannerText('settling')).toContain('don’t need to pay again');
  });

  it('does not claim the payment is settled', () => {
    // The webhook is the only authority for `paid`, and an ACH checkout
    // completes at this same URL with the money still days away. The banner
    // therefore says it went through and is being confirmed -- not that it is
    // paid.
    //
    // This used to slice the JSX and then slice again to reach the rendered <p>,
    // because the guard condition around it legitimately contained the word
    // "paid" (`payment.status !== 'paid'`) and the first version of the
    // assertion caught that instead of the copy. The copy is a value now, so
    // there is no surrounding condition to accidentally read.
    expect(bannerText('settling')).not.toMatch(/\bpaid\b/i);
    expect(bannerText('settling')).not.toMatch(/payment received|has been received/i);
    expect(bannerText('settling')).toContain('confirming it with your bank');
  });

  it('stands down once the webhook has landed', () => {
    // With status 'paid' the ordinary settled message is the right one, and two
    // success banners stacked would read as two payments.
    //
    // The old guard was `returnedFromCheckout && payment.status !== 'paid'`,
    // which excluded exactly one status -- so a refunded, disputed or cancelled
    // payment opened on a stale success URL stacked "Thanks, that went through"
    // on top of the terminal message. Standing down is a consequence of the
    // resolver's ordering now: every terminal state outranks the redirect.
    for (const status of ['paid', 'refunded', 'disputed', 'canceled']) {
      expect(bannerFor({ status, returnedFromCheckout: true }), status).not.toBe('settling');
    }
    expect(bannerFor({ status: 'paid', returnedFromCheckout: true })).toBe('paid');
  });
});

describe('a second checkout cannot be created for money already taken', () => {
  it('asks Stripe before resuming a processing payment', () => {
    // `processing` usually means an abandoned checkout, and resuming one is the
    // point. But it also covers the seconds between Stripe redirecting a
    // successful payer and the webhook landing -- and in that window every
    // surface treats the payment as unpaid and offers to start it again.
    const guard = PAYMENTS.slice(
      PAYMENTS.indexOf('THE WEBHOOK RACE'),
      PAYMENTS.indexOf('"processing" means a checkout session was started'),
    );
    expect(guard).toContain("payment.status === 'processing' && payment.stripe_checkout_session");
    expect(guard).toContain('checkout.sessions.retrieve');
    expect(guard).toContain("priorSession.payment_status === 'paid'");
  });

  it('sits in the one function every route to a charge passes through', () => {
    // The pay page, the invoice page, the portal and the contractor's Retry all
    // reach a charge through createCheckoutSessionForPayment, so one guard here
    // settles it for all of them rather than four that can drift.
    const fn = PAYMENTS.slice(PAYMENTS.indexOf('export async function createCheckoutSessionForPayment'));
    expect(fn.slice(0, 4000)).toContain('THE WEBHOOK RACE');
  });

  it('only pays for the lookup in the ambiguous case', () => {
    // An ordinary first payment is `requested` with no session recorded and must
    // add no round trip to the thing somebody is waiting on.
    expect(PAYMENTS).toContain("payment.status === 'processing' && payment.stripe_checkout_session");
  });

  it('fails OPEN when Stripe cannot be reached', () => {
    // Refusing on a network blip would block a payment somebody is standing
    // there trying to make. The pre-existing behaviour is the safe fallback.
    const guard = PAYMENTS.slice(
      PAYMENTS.indexOf('THE WEBHOOK RACE'),
      PAYMENTS.indexOf('"processing" means a checkout session was started'),
    );
    expect(guard).toContain('console.error');
    expect(guard).toContain('Could not confirm prior checkout session');
  });

  it('still rethrows its own refusal', () => {
    // The catch must not swallow the very error the guard exists to raise.
    const guard = PAYMENTS.slice(
      PAYMENTS.indexOf('THE WEBHOOK RACE'),
      PAYMENTS.indexOf('"processing" means a checkout session was started'),
    );
    expect(guard).toContain("error.message === 'This payment has already been completed.'");
    expect(guard).toContain('throw error');
  });
});
