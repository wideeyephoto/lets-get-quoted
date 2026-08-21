import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jobMoney } from '@/lib/job-lifecycle';
import { PAYMENT_STATUS_LABEL } from '@/lib/job-detail-labels';
import { paymentBannerMessage } from '@/lib/payment-banner';
import { resolvePaymentView } from '@/lib/payment-view';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const PAYMENTS = read('src', 'lib', 'payments.ts');
const ACTIONS = read('src', 'app', 'dashboard', 'jobs', 'payments-actions.ts');
const FEED = read('src', 'lib', 'job-feed.ts');
const PAY_PAGE = read('src', 'app', 'pay', '[id]', 'page.tsx');
const JOB_PAGE = read('src', 'app', 'dashboard', 'jobs', '[id]', 'page.tsx');
const MIGRATION = read('migrations', '2026-08-15-payment-canceled.sql');

/**
 * From a declaration to the next top-level one.
 *
 * Line endings normalized first: the repo is CRLF and every anchor written
 * here uses \n, so a slice keyed on "\n}\n" silently matches nothing and the
 * assertion passes against two characters of nonsense.
 */
const region = (source: string, from: string): string => {
  const flat = source.split('\r\n').join('\n');
  const at = flat.indexOf(from);
  expect(at, from).toBeGreaterThan(-1);
  const rest = flat.slice(at + from.length);
  const end = rest.search(/\nexport (async function|function|const|type) /);
  return rest.slice(0, end === -1 ? rest.length : end);
};

/**
 * THE REPORTED SCREEN. A money strip reading Requested $0.00 and Paid $0.00, a
 * payment section reading "No payment requests yet", and a feed carrying two
 * $250 deposit requests — all at once, all true of a different set of rows.
 *
 * The cause was one line: cancelling a payment request DELETED it. The feed
 * events were the only surviving trace of an ask that existed nowhere else.
 */
describe('a cancelled payment request is a record, not an absence', () => {
  it('marks the row instead of deleting it', () => {
    const body = region(PAYMENTS, 'export async function cancelPaymentRequest');
    expect(body).toContain("update({ status: 'canceled' })");
    // Still only from 'requested': once Stripe holds a processing intent,
    // withdrawing is a refund question.
    expect(body).toContain(".eq('status', 'requested')");
  });

  /** It ships ahead of its migration, so an un-migrated enum must not brick
   *  the one button somebody presses when something has gone wrong. */
  it('falls back to the old delete where the enum value is not there yet', () => {
    const fn = PAYMENTS.slice(PAYMENTS.indexOf('export async function cancelPaymentRequest'));
    expect(fn.slice(0, fn.indexOf('\n}\n'))).toContain(".delete()");
    expect(MIGRATION).toContain("alter type payment_status add value if not exists 'canceled'");
  });

  it('stops erasing the feed row that says it was sent', () => {
    const fn = ACTIONS.slice(ACTIONS.indexOf('export async function cancelPaymentRequestAction'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).not.toContain("from('job_feed')");
    // Sent, then cancelled, in order, IS the history.
    expect(body).toContain("kind: 'payment_cancelled'");
  });

  /**
   * The money summary needed no change, and that is the point of it being one
   * function: a cancelled row is neither asked for nor collected.
   */
  it('counts a cancelled ask as neither requested nor paid', () => {
    const money = jobMoney({
      quotedAmount: 1000,
      payments: [
        { amount: 250, status: 'canceled' },
        { amount: 250, status: 'canceled' },
        { amount: 400, status: 'requested' },
        { amount: 100, status: 'paid' },
      ],
    });
    expect(money.requestedCents).toBe(40000);
    expect(money.paidCents).toBe(10000);
    expect(money.overRequestedCents).toBe(0);
  });

  it('offers no live payment link for a withdrawn ask', () => {
    expect(FEED).toContain("payment.status !== 'canceled'");
  });

  it('tells the homeowner rather than leaving a working card form', () => {
    // The copy moved into payment-banner.ts, keyed on the banner rather than on
    // the stored status, and the status list it used to be checked against moved
    // into resolvePaymentView's OPEN_STATUSES. Both halves are asserted as
    // behaviour instead: a cancelled request says so, and offers no button.
    const view = resolvePaymentView({
      status: 'canceled',
      moneyInFlight: false,
      returnedFromCheckout: false,
      cancelledCheckout: false,
      payableRail: true,
      refunded: 0,
    });
    expect(view).toMatchObject({ banner: 'cancelled', canPay: false });
    expect(paymentBannerMessage('cancelled', 0, String)?.body)
      .toContain('This payment request was cancelled by your contractor');
  });

  it('has a label wherever a status is printed', () => {
    expect(PAYMENT_STATUS_LABEL.canceled).toBe('Cancelled');
  });

  /** Row actions name the statuses they apply to, so a cancelled row offers
   *  none of them rather than a Cancel button for something already cancelled. */
  it('shows no actions on a cancelled row', () => {
    const buttons = read('src', 'app', 'dashboard', 'jobs', '[id]', 'PaymentActionButtons.tsx');
    expect(buttons).toContain("const showActions = status === 'paid' || status === 'processing' || status === 'failed' || status === 'requested';");
  });
});

/**
 * The header badge said "Scheduled", this select said "In progress", and the
 * button beside them said "Job started". Three vocabularies over one job.
 */
describe('one status, derived, and one stored field it reads from', () => {
  it('stops calling the stored enum "Status"', () => {
    expect(JOB_PAGE).toContain('<label htmlFor="status">Record state</label>');
  });

  it('names what the job actually resolves to, next to the field', () => {
    expect(JOB_PAGE).toContain('this job currently reads as');
    expect(JOB_PAGE).toContain('<strong>{JOB_STAGE_LABEL[stage]}</strong>');
  });

  /** The badge in the hero is the canonical one and always was. */
  it('leaves the hero badge as the single status', () => {
    expect(JOB_PAGE).toContain('{JOB_STAGE_LABEL[stage]}');
    expect(JOB_PAGE).toContain('const stage = jobStage({');
  });
});
