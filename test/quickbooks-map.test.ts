import { describe, it, expect } from 'vitest';
import {
  buildCustomerPayload,
  buildInvoicePayload,
  buildPaymentPayload,
  escapeQboString,
  invoiceHoldReason,
  invoiceIsSendable,
  money,
  paymentHoldReason,
  qboDate,
  summarize,
  type SyncClient,
  type SyncInvoice,
  type SyncPayment,
} from '../src/lib/quickbooks/map';

const CLIENT: SyncClient = {
  id: 'c1', name: 'Dana Whitfield', email: 'dana@example.com', phone: '(248) 555-0112',
  address: '1418 S Main St, Royal Oak, MI 48067', qboCustomerId: null, isClientRow: true,
};

function invoice(over: Partial<SyncInvoice> = {}): SyncInvoice {
  return {
    id: 'i1', ref: 'INV-1042', total: 480, status: 'sent', createdAt: '2026-08-01T14:00:00.000Z',
    discountPercent: 0, taxRate: 0,
    items: [{ description: 'Replace 40gal heater', amount: 400 }, { description: 'Haul away old unit', amount: 80 }],
    fallbackDescription: 'Basement repipe — copper to PEX',
    ...over,
  };
}

function payment(over: Partial<SyncPayment> = {}): SyncPayment {
  return {
    id: 'p1', amount: 480, refundedAmount: 0, status: 'paid',
    paidAt: '2026-08-03T10:00:00.000Z', requestedAt: '2026-08-01T14:00:00.000Z', invoiceId: 'i1',
    ...over,
  };
}

describe('escapeQboString', () => {
  it("survives an apostrophe, which is what O'Brien is for", () => {
    // Unescaped, this closes the query string early and either errors or
    // matches the wrong customer — filing an invoice under somebody else.
    expect(escapeQboString("O'Brien")).toBe("O\\'Brien");
  });

  it('escapes the backslash first, so an escape cannot be escaped', () => {
    expect(escapeQboString("a\\'b")).toBe("a\\\\\\'b");
  });

  it('leaves an ordinary name alone', () => {
    expect(escapeQboString('Dana Whitfield')).toBe('Dana Whitfield');
  });
});

describe('money', () => {
  it('rounds to cents rather than carrying a float artefact into a ledger', () => {
    expect(money(0.1 + 0.2)).toBe(0.3);
    expect(money(19.999)).toBe(20);
    expect(money(Number.NaN)).toBe(0);
  });
});

describe('qboDate', () => {
  it('takes the calendar day', () => {
    expect(qboDate('2026-08-01T14:00:00.000Z', '2026-01-01')).toBe('2026-08-01');
  });
  it('falls back rather than sending an invalid date', () => {
    expect(qboDate('not a date', '2026-08-01T00:00:00.000Z')).toBe('2026-08-01');
    expect(qboDate(null, '2026-08-01T00:00:00.000Z')).toBe('2026-08-01');
  });
});

describe('invoiceIsSendable', () => {
  it('sends what has been billed and nothing else', () => {
    for (const status of ['sent', 'signed', 'paid']) {
      expect(invoiceIsSendable(invoice({ status })), status).toBe(true);
    }
    // A draft is not a bill and a void is one somebody took back. Either in the
    // books is work nobody owes.
    for (const status of ['draft', 'void']) {
      expect(invoiceIsSendable(invoice({ status })), status).toBe(false);
    }
  });
});

describe('invoiceHoldReason', () => {
  it('lets an ordinary invoice through', () => {
    expect(invoiceHoldReason(invoice(), CLIENT, false)).toBeNull();
  });

  it('refuses one with no customer to file it under', () => {
    expect(invoiceHoldReason(invoice(), null, false)).toMatch(/customer/i);
    expect(invoiceHoldReason(invoice(), { ...CLIENT, name: '   ' }, false)).toMatch(/customer/i);
  });

  it('refuses a zero invoice', () => {
    expect(invoiceHoldReason(invoice({ total: 0 }), CLIENT, false)).toMatch(/zero/i);
  });

  it('allows an invoice with a total but no itemisation', () => {
    // The shape of a number agreed on the phone, and of almost all imported
    // history. Refusing these held back every paid invoice on the first live
    // run — and with them, every payment.
    expect(invoiceHoldReason(invoice({ items: [] }), CLIENT, false)).toBeNull();
  });

  it('refuses an un-itemised invoice that also carries a discount or tax', () => {
    // With no items there is no subtotal, so there is no way to know whether
    // `total` is before or after them. A guess is a wrong number in the books.
    expect(invoiceHoldReason(invoice({ items: [], discountPercent: 10 }), CLIENT, false)).toMatch(/no line items/i);
    expect(invoiceHoldReason(invoice({ items: [], taxRate: 6 }), CLIENT, false)).toMatch(/no line items/i);
  });

  it('refuses a taxed invoice when QuickBooks calculates its own tax', () => {
    // The dangerous case. An Automated Sales Tax company ignores the tax we
    // send and posts a different total than the customer was given — silently.
    const reason = invoiceHoldReason(invoice({ taxRate: 6 }), CLIENT, true);
    expect(reason).toMatch(/calculates sales tax/i);
  });

  it('refuses a taxed invoice until we know how the company handles tax', () => {
    // null is "not asked yet", and unknown must never be treated as safe.
    expect(invoiceHoldReason(invoice({ taxRate: 6 }), CLIENT, null)).toMatch(/waiting/i);
  });

  it('allows a taxed invoice when the company does not calculate tax', () => {
    expect(invoiceHoldReason(invoice({ taxRate: 6 }), CLIENT, false)).toBeNull();
  });

  it('never holds an untaxed invoice over the tax question', () => {
    expect(invoiceHoldReason(invoice({ taxRate: 0 }), CLIENT, null)).toBeNull();
  });
});

describe('buildInvoicePayload', () => {
  it('sends one line per item, all pointed at the one service item', () => {
    const payload = buildInvoicePayload(invoice(), 'cust-1', 'item-9', false) as Record<string, unknown>;
    const lines = payload.Line as Record<string, unknown>[];
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      DetailType: 'SalesItemLineDetail',
      Amount: 400,
      Description: 'Replace 40gal heater',
      SalesItemLineDetail: { ItemRef: { value: 'item-9' } },
    });
    expect(payload.CustomerRef).toEqual({ value: 'cust-1' });
    expect(payload.DocNumber).toBe('INV-1042');
    expect(payload.TxnDate).toBe('2026-08-01');
  });

  it('sends a discount as a real discount line, after the items', () => {
    const payload = buildInvoicePayload(invoice({ discountPercent: 10 }), 'c', 'i', false);
    const lines = (payload as { Line: Record<string, unknown>[] }).Line;
    expect(lines).toHaveLength(3);
    // Order matters: QuickBooks applies a discount line to everything above it.
    expect(lines[2]).toMatchObject({ DetailType: 'DiscountLineDetail', Amount: 48 });
  });

  it('omits the discount line entirely at 0%', () => {
    const lines = (buildInvoicePayload(invoice(), 'c', 'i', false) as { Line: unknown[] }).Line;
    expect(lines).toHaveLength(2);
  });

  it('sends tax only when the company does not calculate its own', () => {
    const safe = buildInvoicePayload(invoice({ taxRate: 6 }), 'c', 'i', false);
    // 480 * 6% = 28.80
    expect(safe.TxnTaxDetail).toEqual({ TotalTax: 28.8 });

    // These two never reach here in practice — invoiceHoldReason refuses them
    // first — but the payload must not carry tax even if that guard is moved.
    expect(buildInvoicePayload(invoice({ taxRate: 6 }), 'c', 'i', true).TxnTaxDetail).toBeUndefined();
    expect(buildInvoicePayload(invoice({ taxRate: 6 }), 'c', 'i', null).TxnTaxDetail).toBeUndefined();
  });

  it('taxes the DISCOUNTED subtotal, not the gross', () => {
    // 480 - 10% = 432, 6% of that is 25.92. Taxing the gross would overstate
    // the liability by a dollar and a half on a $480 job.
    const payload = buildInvoicePayload(invoice({ discountPercent: 10, taxRate: 6 }), 'c', 'i', false);
    expect(payload.TxnTaxDetail).toEqual({ TotalTax: 25.92 });
  });

  it('sends an un-itemised invoice as one line at the full total', () => {
    const payload = buildInvoicePayload(invoice({ items: [], total: 6400 }), 'c', 'item-9', false);
    const lines = (payload as { Line: Record<string, unknown>[] }).Line;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      Amount: 6400,
      // The job's scope, so the contractor's books say what the work was
      // rather than repeating the invoice number back at them.
      Description: 'Basement repipe — copper to PEX',
      SalesItemLineDetail: { ItemRef: { value: 'item-9' } },
    });
  });

  it('falls back to the invoice number when there is no scope to describe', () => {
    const payload = buildInvoicePayload(invoice({ items: [], fallbackDescription: null }), 'c', 'i', false);
    expect((payload as { Line: Record<string, unknown>[] }).Line[0].Description).toBe('Work on INV-1042');
    expect((buildInvoicePayload(invoice({ items: [], fallbackDescription: '   ' }), 'c', 'i', false) as { Line: Record<string, unknown>[] })
      .Line[0].Description).toBe('Work on INV-1042');
  });

  it('keeps DocNumber inside the 21 characters QuickBooks allows', () => {
    const payload = buildInvoicePayload(invoice({ ref: 'INV-' + '9'.repeat(40) }), 'c', 'i', false);
    expect(String(payload.DocNumber)).toHaveLength(21);
  });
});

describe('paymentHoldReason', () => {
  it('lets a paid payment against a synced invoice through', () => {
    expect(paymentHoldReason(payment(), 'qbo-inv-1')).toBeNull();
  });

  it('holds a payment whose invoice has not reached QuickBooks', () => {
    // Sending it anyway leaves an unapplied credit for a bookkeeper to clear.
    expect(paymentHoldReason(payment(), null)).toMatch(/invoice/i);
    expect(paymentHoldReason(payment({ invoiceId: null }), null)).toMatch(/invoice/i);
  });

  it('holds a refunded payment rather than sending the net', () => {
    // A refund is a credit memo, not a smaller payment. Netting it would
    // rewrite what the customer actually paid.
    expect(paymentHoldReason(payment({ refundedAmount: 100 }), 'qbo-1')).toMatch(/refunded/i);
  });

  it('ignores a payment that is not paid', () => {
    for (const status of ['requested', 'processing', 'failed', 'refunded']) {
      expect(paymentHoldReason(payment({ status }), 'qbo-1'), status).toBeNull();
    }
  });

  it('holds a zero payment', () => {
    expect(paymentHoldReason(payment({ amount: 0 }), 'qbo-1')).toMatch(/zero/i);
  });
});

describe('buildPaymentPayload', () => {
  it('links the payment to the invoice it pays', () => {
    const payload = buildPaymentPayload(payment(), 'cust-1', 'qbo-inv-7');
    expect(payload).toMatchObject({
      CustomerRef: { value: 'cust-1' },
      TotalAmt: 480,
      TxnDate: '2026-08-03',
    });
    expect((payload as { Line: Record<string, unknown>[] }).Line[0]).toMatchObject({
      Amount: 480,
      LinkedTxn: [{ TxnId: 'qbo-inv-7', TxnType: 'Invoice' }],
    });
  });

  it('dates an unpaid-at payment by when it was requested, not today', () => {
    const payload = buildPaymentPayload(payment({ paidAt: null }), 'c', 'i');
    expect(payload.TxnDate).toBe('2026-08-01');
  });
});

describe('buildCustomerPayload', () => {
  it('sends only the fields we actually hold', () => {
    expect(buildCustomerPayload(CLIENT)).toEqual({
      DisplayName: 'Dana Whitfield',
      PrimaryEmailAddr: { Address: 'dana@example.com' },
      PrimaryPhone: { FreeFormNumber: '(248) 555-0112' },
      BillAddr: { Line1: '1418 S Main St, Royal Oak, MI 48067' },
    });
    expect(buildCustomerPayload({ ...CLIENT, email: null, phone: null, address: null }))
      .toEqual({ DisplayName: 'Dana Whitfield' });
  });
});

describe('summarize', () => {
  it('separates what is waiting on you from what broke', () => {
    // "3 didn't go" is a support ticket; "3 are waiting on you" is a task.
    expect(summarize({ invoices: 2, payments: 1, held: 3, failed: 0 }))
      .toBe('Sent 2 invoices and 1 payment · 3 waiting on you');
    expect(summarize({ invoices: 1, payments: 0, held: 0, failed: 2 }))
      .toBe('Sent 1 invoice · 2 failed');
    expect(summarize({ invoices: 0, payments: 0, held: 0, failed: 0 }))
      .toBe('Nothing new to send');
  });
});
