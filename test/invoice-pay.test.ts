import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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
  it('waits while a payment is genuinely with the bank', () => {
    const state = invoicePayState({ status: 'sent' }, 4200, [
      payment({ id: 'ach', status: 'processing', async_payment_pending_at: '2026-08-21T00:00:00.000Z' }),
    ]);
    expect(state).toMatchObject({ state: 'processing', paymentId: 'ach' });
  });

  it('does not mistake an abandoned checkout for a bank transfer', () => {
    // `processing` is written when a Checkout Session is CREATED, so it equally
    // means "opened Stripe and closed the tab" -- which is the commoner reading.
    // This assertion used to expect 'processing' for exactly this row, which is
    // how the invoice told a homeowner their transfer was clearing when nothing
    // had happened, and withheld the Pay button so they could not correct it.
    //
    // For up to 24 hours: no expires_at is set on these sessions, so the
    // expired webhook that moves the row to `failed` fires on Stripe's default.
    const state = invoicePayState({ status: 'sent' }, 4200, [
      payment({ id: 'abandoned', status: 'processing', amount: 4200 }),
    ]);
    expect(state).toMatchObject({ state: 'payable' });
  });

  it('resumes the abandoned request rather than minting a second one', () => {
    // The row already exists and the server will open a fresh Session against
    // it -- createCheckoutSessionForPayment accepts `processing` for this exact
    // reason. Leaving `processing` out of the reuse list would create a SECOND
    // payment row for one invoice, which is two ways to pay it and one of them
    // goes wrong the moment a part-payment lands.
    const state = invoicePayState({ status: 'sent' }, 4200, [
      payment({ id: 'abandoned', status: 'processing', amount: 4200 }),
    ]);
    expect(state).toMatchObject({ state: 'payable', paymentId: 'abandoned' });
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

describe('every caller feeds invoicePayState the column it decides on', () => {
  /**
   * invoicePayState tells a bank transfer in flight apart from an abandoned
   * checkout using `async_payment_pending_at`. Both are `status = 'processing'`,
   * so a caller that does not SELECT the column silently gets the abandoned
   * reading for every payment.
   *
   * That is not hypothetical. When the distinction was introduced, the invoice
   * page's query was updated and payInvoiceAction's was not -- so the action
   * could never reach its own `processing` branch, and the page and the action
   * disagreed about the same invoice while calling the same function. The portal
   * had the same gap.
   *
   * Checked as a set, because the failure is a NEW caller being added without
   * it, and nothing else would notice.
   */
  const CALLERS = [
    'src/app/invoice/[id]/page.tsx',
    'src/app/invoice/[id]/actions.ts',
    'src/lib/client-portal-data.ts',
  ] as const;

  for (const file of CALLERS) {
    it(`${file.split('/').slice(-2).join('/')} selects async_payment_pending_at`, () => {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source).toContain('invoicePayState');
      const selects = source.match(/\.select\('[^']*'\)/g) ?? [];
      const paymentSelect = selects.find((s) => s.includes('refunded_amount'));
      expect(paymentSelect, 'no payments select found').toBeDefined();
      expect(paymentSelect).toContain('async_payment_pending_at');
    });
  }

  it('finds every caller there is, so the list cannot go stale', () => {
    // If invoicePayState grows a caller outside this list, this fails rather
    // than the new caller silently getting the wrong reading.
    const roots = ['src/app', 'src/lib'];
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry.name)) {
          const source = readFileSync(join(process.cwd(), rel), 'utf8');
          // The definition itself, and re-export sites, are not callers.
          if (source.includes('invoicePayState(') && !rel.endsWith('invoice-pay.ts')) found.push(rel);
        }
      }
    };
    for (const root of roots) walk(root);
    expect(found.sort()).toEqual([...CALLERS].sort());
  });
});
