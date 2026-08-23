import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { invoicePayState, paidTowardInvoice } from '../src/lib/invoice-pay';

/**
 * A refund has to reach every surface that states a balance.
 *
 * Two of them disagreed with `/invoice/[id]`, which had it right all along:
 *
 *  - The customer PORTAL summed `due` across every invoice it loads, and its
 *    query deliberately includes `void`. A full refund sets the payment to
 *    `refunded` and the invoice to `void`; `paidTowardInvoice` counts only
 *    `paid`, so the refunded payment dropped out, paid fell to 0, and the void
 *    branch returned the entire original total as due. The homeowner opened
 *    their branded link and read a Balance due with no invoice under it.
 *
 *  - The contractor's JOB PAGE hand-rolled its own reduce, gross of refunds, and
 *    that number prefills the collect-payment box and feeds the component the
 *    file calls "THE INVOICE AS THE CLIENT WILL SEE IT".
 */

const paid = (over: Partial<{ id: string; invoice_id: string; status: string; amount: number; refunded_amount: number }> = {}) => ({
  id: 'p1', invoice_id: 'inv1', status: 'paid', amount: 1000, refunded_amount: 0, ...over,
});

describe('a voided invoice is not owed', () => {
  it('returns due 0 after a FULL refund, not the original total', () => {
    // The exact shape the refund path leaves behind: payment `refunded`,
    // invoice `void`. paidTowardInvoice ignores non-paid rows, so paid is 0 --
    // and due used to be total - 0.
    const state = invoicePayState(
      { status: 'void' } as never,
      4237.5,
      [paid({ status: 'refunded', amount: 4237.5, refunded_amount: 4237.5 })],
    );
    expect(state.due).toBe(0);
    // toMatchObject rather than state.reason: InvoicePayState is a union and
    // `reason` exists on only some branches, so the direct access compiles under
    // vitest and is rejected by tsc.
    expect(state).toMatchObject({ state: 'unavailable', reason: 'void' });
  });

  it('returns due 0 for a void invoice that was never paid at all', () => {
    // Voiding an unpaid invoice is the ordinary "cancel this bill" case, and it
    // was the same bug: the full amount came back as owed.
    const state = invoicePayState({ status: 'void' } as never, 500, []);
    expect(state.due).toBe(0);
  });

  it('leaves a SENT invoice owing what it owes', () => {
    // The fix must not zero anything else.
    const state = invoicePayState({ status: 'sent' } as never, 1000, [paid({ amount: 250 })]);
    expect(state.due).toBe(750);
  });
});

describe('paidTowardInvoice nets refunds', () => {
  it('subtracts a partial refund', () => {
    expect(paidTowardInvoice([paid({ amount: 1000, refunded_amount: 400 })])).toBe(600);
  });

  it('never reports a negative paid total', () => {
    expect(paidTowardInvoice([paid({ amount: 100, refunded_amount: 250 })])).toBe(0);
  });

  it('ignores payments belonging to another invoice only via paymentsForInvoice', () => {
    // paidTowardInvoice itself does not filter by invoice; that is the caller's
    // job, which is exactly what the job page was getting wrong.
    expect(paidTowardInvoice([paid({ invoice_id: 'other', amount: 999 })])).toBe(999);
  });
});

describe('both surfaces use the one implementation', () => {
  const jobPage = readFileSync(
    join(process.cwd(), 'src', 'app', 'dashboard', 'jobs', '[id]', 'page.tsx'), 'utf8',
  );

  it('the job page calls the shared helpers instead of its own reduce', () => {
    expect(jobPage).toContain('paidTowardInvoice(paymentsForInvoice(payments, jobInvoice.id))');
  });

  it('the job page no longer sums payment amounts by hand', () => {
    // The specific shape that was gross of refunds.
    expect(jobPage).not.toMatch(/payment\.status === 'paid'\)\.reduce\(\(sum, payment\) => sum \+ Number\(payment\.amount\)/);
  });
});
