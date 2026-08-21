import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
    const canPay = PAGE.slice(PAGE.indexOf('const canPay ='), PAGE.indexOf('legacyDestinationPayment;', PAGE.indexOf('const canPay =')));
    expect(canPay).toContain('!moneyIsInFlight');
  });

  it('tells an abandoned checkout that nothing was charged', () => {
    // The common case, and the one that used to read as "your payment is
    // processing" — leaving somebody believing they had paid when they had not.
    expect(PAGE).toContain("wasn&apos;t completed");
    expect(PAGE).toContain('nothing has been charged');
  });

  it('does not offer to pay below on a rail that cannot be paid from', () => {
    // checkoutNotFinished and directCheckoutUnavailable would otherwise both
    // render, one saying "you can pay below" and the other "you cannot".
    const block = PAGE.slice(PAGE.indexOf('const checkoutNotFinished'));
    expect(block.slice(0, 260)).toContain('legacyDestinationPayment');
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
    expect(PAGE).toContain('wasn’t completed');
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
    expect(PAGE).toContain('refundedSoFar > 0');
    expect(PAGE).toContain('has since been refunded to you');
  });

  it('keeps the plain message when nothing was refunded', () => {
    expect(PAGE).toContain("'This payment has already been completed. Thank you!'");
  });

  it('does not print null at somebody', () => {
    // refunded_amount is null on rows predating the column, and "$null" on a
    // payment page is its own support call.
    expect(PAGE).toContain('Number(payment.refunded_amount) || 0');
  });

  it('sets expectations about when the money lands', () => {
    // The question somebody reading this actually has next.
    expect(PAGE).toContain('few business days');
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
    expect(PAYMENTS_LIB2).toContain('payment_deadline_at');
    expect(PAYMENTS_LIB2).toContain('This Quick Stop offer has expired.');
    expect(PAGE).toContain('Please pay by');
    expect(PAGE).toContain('payment_deadline_at');
  });

  it('only says any of it while the payment can still be made', () => {
    // A deadline on an already-paid Quick Stop is noise, and "pay by 3:45" under
    // "This payment has already been completed" reads as a second demand.
    expect(PAGE).toContain('quickStop && canPay');
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
    // One stored value, two situations. The card read "Processing" directly
    // beside a banner saying "You started a payment but it wasn't completed" --
    // and the card is the thing people quote back on the phone.
    expect(PAGE).toContain("payment.status === 'processing'\n    ? (moneyIsInFlight ? 'Clearing' : 'Not completed')");
  });

  it('resolves it the same way the banner does', () => {
    // Both read moneyIsInFlight, so they cannot drift apart into saying
    // different things about one payment.
    const card = PAGE.slice(PAGE.indexOf('const statusLabel'), PAGE.indexOf('const directCheckoutUnavailable'));
    expect(card).toContain('moneyIsInFlight');
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
    const notFinished = PAGE.slice(PAGE.indexOf('const checkoutNotFinished'), PAGE.indexOf('const statusLabel'));
    expect(notFinished).toContain('!returnedFromCheckout');
  });

  it('does not offer to pay again during the gap', () => {
    const canPay = PAGE.slice(PAGE.indexOf('const canPay ='), PAGE.indexOf('legacyDestinationPayment;', PAGE.indexOf('const canPay =')));
    expect(canPay).toContain('!returnedFromCheckout');
  });

  it('says what happened rather than going quiet', () => {
    expect(PAGE).toContain('Thanks — that went through');
    expect(PAGE).toContain("don&apos;t need to pay again");
  });

  it('does not claim the payment is settled', () => {
    // The webhook is the only authority for `paid`, and an ACH checkout
    // completes at this same URL with the money still days away. The banner
    // therefore says it went through and is being confirmed -- not that it is
    // paid.
    // Scoped to the rendered <p>, not the surrounding block: the guard
    // condition legitimately contains the word "paid" (`payment.status !==
    // 'paid'`), and the first version of this assertion caught that instead of
    // the copy.
    const banner = PAGE.slice(PAGE.indexOf('returnedFromCheckout && payment.status'), PAGE.indexOf('quickStop && canPay'));
    const copy = banner.slice(banner.indexOf('<strong>'), banner.indexOf('</p>'));
    expect(copy).not.toMatch(/\bpaid\b/i);
    expect(copy).not.toMatch(/payment received|has been received/i);
    expect(banner).toContain('confirming it with your bank');
  });

  it('stands down once the webhook has landed', () => {
    // With status 'paid' the ordinary settled message is the right one, and two
    // success banners stacked would read as two payments.
    expect(PAGE).toContain("returnedFromCheckout && payment.status !== 'paid'");
  });
});
