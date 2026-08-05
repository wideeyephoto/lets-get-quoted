import { describe, expect, it } from 'vitest';
import {
  invoicePayState,
  paidTowardInvoice,
  paymentsForInvoice,
  type InvoicePayment,
} from '@/lib/invoice-pay';

const INV = 'inv-1';

function payment(over: Partial<InvoicePayment> = {}): InvoicePayment {
  return { id: 'p1', amount: 1000, status: 'paid', invoice_id: INV, refunded_amount: 0, ...over };
}

describe('which payments count toward an invoice', () => {
  // The bug this exists to prevent: a job carries a deposit AND a final bill.
  // Counting every payment on the job would show a $4,200 invoice as settled
  // because a $4,200 deposit was paid against a different one.
  it('is scoped by invoice, not by job', () => {
    const rows = [payment({ id: 'mine' }), payment({ id: 'other', invoice_id: 'inv-2' }), payment({ id: 'adhoc', invoice_id: null })];
    expect(paymentsForInvoice(rows, INV).map((row) => row.id)).toEqual(['mine']);
  });

  it('counts only settled money', () => {
    expect(paidTowardInvoice([payment({ status: 'requested' })])).toBe(0);
    expect(paidTowardInvoice([payment({ status: 'processing' })])).toBe(0);
    expect(paidTowardInvoice([payment({ status: 'failed' })])).toBe(0);
    expect(paidTowardInvoice([payment({ status: 'paid' })])).toBe(1000);
  });

  it('nets off a refund', () => {
    expect(paidTowardInvoice([payment({ amount: 1000, refunded_amount: 400 })])).toBe(600);
  });

  it('never reads as negative when more was refunded than paid', () => {
    expect(paidTowardInvoice([payment({ amount: 100, refunded_amount: 250 })])).toBe(0);
  });
});

describe('what the invoice page offers', () => {
  it('is payable for the full total when nothing has been paid', () => {
    const state = invoicePayState({ status: 'sent' }, 4200, []);
    expect(state).toMatchObject({ state: 'payable', due: 4200, paid: 0, paymentId: null });
  });

  // The figure on the button has to be what is LEFT. A customer who sent a
  // deposit and is asked for the full total again is being asked twice.
  it('asks only for the remainder after a part payment', () => {
    const state = invoicePayState({ status: 'sent' }, 4200, [payment({ amount: 1200 })]);
    expect(state).toMatchObject({ state: 'payable', due: 3000, paid: 1200 });
  });

  it('is settled once the payments cover it', () => {
    expect(invoicePayState({ status: 'sent' }, 4200, [payment({ amount: 4200 })])).toMatchObject({
      state: 'settled',
      due: 0,
      paid: 4200,
    });
  });

  it('is settled when MORE than the total was taken', () => {
    // Overpayment is not a reason to show a negative amount owing.
    expect(invoicePayState({ status: 'sent' }, 100, [payment({ amount: 150 })])).toMatchObject({ state: 'settled', due: 0 });
  });

  // A bank transfer sits in `processing` for days. Offering "Pay" over the top
  // of one is how somebody pays the same invoice twice.
  it('waits while a payment is with the bank', () => {
    const state = invoicePayState({ status: 'sent' }, 4200, [payment({ id: 'ach', status: 'processing' })]);
    expect(state).toMatchObject({ state: 'processing', paymentId: 'ach' });
  });

  it('reuses an open request for the same amount rather than minting a second', () => {
    const state = invoicePayState({ status: 'sent' }, 4200, [payment({ id: 'open', status: 'requested', amount: 4200 })]);
    expect(state).toMatchObject({ state: 'payable', paymentId: 'open' });
  });

  it('lets a failed attempt be retried through the same request', () => {
    const state = invoicePayState({ status: 'sent' }, 4200, [payment({ id: 'retry', status: 'failed', amount: 4200 })]);
    expect(state).toMatchObject({ state: 'payable', paymentId: 'retry' });
  });

  // The stale-link case: a request was raised for the full amount, then a
  // deposit landed. That old link would now charge too much.
  it('will not reuse a request whose amount no longer matches what is owed', () => {
    const state = invoicePayState({ status: 'sent' }, 4200, [
      payment({ id: 'stale', status: 'requested', amount: 4200 }),
      payment({ id: 'deposit', status: 'paid', amount: 1200 }),
    ]);
    expect(state).toMatchObject({ state: 'payable', due: 3000, paymentId: null });
  });

  it('refuses a draft — its numbers are still being edited', () => {
    expect(invoicePayState({ status: 'draft' }, 4200, [])).toMatchObject({ state: 'unavailable', reason: 'draft' });
  });

  it('refuses a voided invoice', () => {
    expect(invoicePayState({ status: 'void' }, 4200, [])).toMatchObject({ state: 'unavailable', reason: 'void' });
  });

  it('offers nothing on a zero invoice', () => {
    expect(invoicePayState({ status: 'sent' }, 0, [])).toMatchObject({ state: 'settled', due: 0 });
  });

  it('survives money that arrives as strings', () => {
    // Supabase returns numeric(12,2) as a string often enough that this is the
    // realistic input, not a defensive hypothetical.
    const rows = [{ id: 'p', amount: '1200.00', status: 'paid', invoice_id: INV, refunded_amount: '0' } as unknown as InvoicePayment];
    expect(invoicePayState({ status: 'sent' }, 4200, rows)).toMatchObject({ due: 3000, paid: 1200 });
  });

  it('does not drift on cents', () => {
    const state = invoicePayState({ status: 'sent' }, 100.1, [payment({ amount: 33.37 })]);
    expect(state.due).toBe(66.73);
  });
});
