import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGE = readFileSync(join(process.cwd(), 'src/app/pay/[id]/page.tsx'), 'utf8');
const PAYMENTS = readFileSync(join(process.cwd(), 'src/lib/payments.ts'), 'utf8');

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
