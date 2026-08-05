/**
 * Turning our invoices and payments into QuickBooks objects.
 *
 * Pure on purpose — no database, no fetch. Everything that decides what lands in
 * a contractor's real books is testable without a network, because the cost of
 * being wrong here is not a 500, it is a wrong number in somebody's accounts
 * that nobody notices until their bookkeeper asks about it.
 *
 * One-way, us to QuickBooks. Reading their books back is a different feature
 * with a different failure mode (ours overwriting theirs) and is not this.
 */

export type SyncClient = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  qboCustomerId: string | null;
  /**
   * False when this came off a JOB rather than a client row — an invoice can
   * predate the customer book. There is nowhere to cache the QuickBooks id in
   * that case, so it is looked up by name every sweep instead of written to a
   * row id that belongs to a different table.
   */
  isClientRow: boolean;
};

export type SyncInvoice = {
  id: string;
  ref: string;
  total: number;
  status: string;
  createdAt: string;
  discountPercent: number;
  taxRate: number;
  items: { description: string; amount: number }[];
  /**
   * What the work was, for an invoice that has a total but no itemisation —
   * the job's scope. Plenty of real invoices are one number agreed on the
   * phone, and imported history is almost always shaped that way.
   */
  fallbackDescription: string | null;
};

export type SyncPayment = {
  id: string;
  amount: number;
  refundedAmount: number;
  status: string;
  paidAt: string | null;
  requestedAt: string;
  invoiceId: string | null;
};

/**
 * Escape a value for QuickBooks' query language.
 *
 * The query endpoint takes a SQL-ish string, so a customer called O'Brien ends
 * the string early and the query either errors or — worse — matches the wrong
 * customer and files their invoice under somebody else's name. Backslash first,
 * or escaping the quote would then be escaped itself.
 */
export function escapeQboString(value: string): string {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** QuickBooks wants a plain calendar day, and never a day that doesn't exist. */
export function qboDate(iso: string | null | undefined, fallback: string): string {
  const source = iso || fallback;
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return String(fallback).slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

/** Money as QuickBooks stores it: dollars, two places, never a float artefact. */
export function money(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Why this invoice is NOT being sent, or null if it can go.
 *
 * Refusing loudly beats sending something approximate. Every branch here is a
 * case where the invoice would land in QuickBooks carrying a number that isn't
 * what the contractor billed.
 */
export function invoiceHoldReason(
  invoice: SyncInvoice,
  client: SyncClient | null,
  automatedSalesTax: boolean | null,
): string | null {
  // Drafts aren't bills yet and a void invoice is one somebody deliberately
  // took back — pushing either would put work in the books that nobody owes.
  // No reason string: not-yet-billable is not a problem anybody needs telling
  // about, and the sweep filters these out before it gets here anyway.
  if (!invoiceIsSendable(invoice)) return null;
  if (!client || !client.name.trim()) {
    return 'No customer name on this invoice — QuickBooks files everything under a customer.';
  }
  if (!(invoice.total > 0)) {
    return 'This invoice totals zero.';
  }
  // An invoice with a total but no itemisation is not a broken invoice — it is
  // a number agreed on the phone, and it is the shape of almost all imported
  // history. It goes across as one line described from the job.
  //
  // The exception is when it also carries a discount or a tax rate. With no
  // items there is no subtotal to apply them to, so there is no way to tell
  // whether `total` is before or after them — and a guess there is a wrong
  // number in somebody's books.
  if (invoice.items.length === 0 && (invoice.discountPercent > 0 || invoice.taxRate > 0)) {
    return 'This invoice has a discount or tax but no line items, so we can’t tell what the total is made up of.';
  }
  if (invoice.taxRate > 0) {
    // Not a limitation we can shrug at. Booking sales tax as a revenue line
    // overstates income and understates a tax liability — a real misstatement,
    // in the one place a contractor cannot afford one.
    if (automatedSalesTax === null) {
      return 'Waiting to check how this QuickBooks company handles sales tax.';
    }
    if (automatedSalesTax) {
      return 'QuickBooks calculates sales tax for this company, so it would ignore the tax on this invoice and post a different total. Send this one across by hand.';
    }
  }
  return null;
}

/** True when the invoice is in a state worth attempting at all. */
export function invoiceIsSendable(invoice: SyncInvoice): boolean {
  return invoice.status === 'sent' || invoice.status === 'signed' || invoice.status === 'paid';
}

export function paymentHoldReason(payment: SyncPayment, invoiceQboId: string | null): string | null {
  if (payment.status !== 'paid') return null;
  if (!(payment.amount > 0)) return 'This payment is for zero.';
  if (!payment.invoiceId || !invoiceQboId) {
    // An unapplied credit sitting on a customer is a thing a bookkeeper has to
    // clear by hand. Better it stays here, where it is still attached to a job.
    return 'This payment isn’t attached to an invoice that reached QuickBooks yet.';
  }
  if (payment.refundedAmount > 0) {
    // A refund is a credit memo or a refund receipt, not a smaller payment.
    // Sending the net would silently rewrite what the customer actually paid.
    return 'This payment has been refunded — refunds have to be entered in QuickBooks by hand.';
  }
  return null;
}

export function buildCustomerPayload(client: SyncClient): Record<string, unknown> {
  const payload: Record<string, unknown> = { DisplayName: client.name.trim().slice(0, 100) };
  if (client.email) payload.PrimaryEmailAddr = { Address: client.email };
  if (client.phone) payload.PrimaryPhone = { FreeFormNumber: client.phone };
  if (client.address) payload.BillAddr = { Line1: client.address.slice(0, 500) };
  return payload;
}

/**
 * An invoice, as QuickBooks wants it.
 *
 * Every line points at ONE service item rather than a QuickBooks item per line
 * description. Our line descriptions are free text — "replace 40gal heater,
 * haul away old" — and minting an item for each would leave a contractor's
 * price list full of thousands of one-use entries that they, not us, would have
 * to clean up.
 *
 * The discount is sent as a real DiscountLine, which QuickBooks understands and
 * reports on, rather than by quietly shrinking the line amounts.
 */
export function buildInvoicePayload(
  invoice: SyncInvoice,
  customerId: string,
  itemId: string,
  automatedSalesTax: boolean | null,
): Record<string, unknown> {
  const line = (amount: number, description: string) => ({
    DetailType: 'SalesItemLineDetail',
    Amount: money(amount),
    Description: description.slice(0, 4000),
    SalesItemLineDetail: { ItemRef: { value: itemId } },
  });

  // No itemisation: one line for the whole total, described from the job.
  // invoiceHoldReason has already refused this shape if it carries a discount
  // or tax, so the total is the whole story and nothing is applied to it below.
  const lines: Record<string, unknown>[] = invoice.items.length
    ? invoice.items.map((item) => line(item.amount, item.description))
    : [line(invoice.total, invoice.fallbackDescription?.trim() || `Work on ${invoice.ref}`)];

  const subtotal = invoice.items.reduce((sum, item) => sum + money(item.amount), 0);
  const discount = money((subtotal * (Number(invoice.discountPercent) || 0)) / 100);
  if (discount > 0) {
    // Must come after the item lines — QuickBooks applies a discount line to
    // everything above it.
    lines.push({
      DetailType: 'DiscountLineDetail',
      Amount: discount,
      DiscountLineDetail: { PercentBased: false },
    });
  }

  const payload: Record<string, unknown> = {
    CustomerRef: { value: customerId },
    // Our own invoice number, so the two systems say the same thing when
    // somebody is holding a printout and looking at a screen.
    DocNumber: invoice.ref.slice(0, 21),
    TxnDate: qboDate(invoice.createdAt, invoice.createdAt),
    Line: lines,
  };

  const tax = money(((subtotal - discount) * (Number(invoice.taxRate) || 0)) / 100);
  // Only ever on a company that does NOT calculate its own tax — invoiceHoldReason
  // refuses the invoice outright otherwise, so this is the safe branch only.
  if (tax > 0 && automatedSalesTax === false) {
    payload.TxnTaxDetail = { TotalTax: tax };
  }

  return payload;
}

export function buildPaymentPayload(
  payment: SyncPayment,
  customerId: string,
  invoiceQboId: string,
): Record<string, unknown> {
  return {
    CustomerRef: { value: customerId },
    TotalAmt: money(payment.amount),
    TxnDate: qboDate(payment.paidAt, payment.requestedAt),
    Line: [
      {
        Amount: money(payment.amount),
        LinkedTxn: [{ TxnId: invoiceQboId, TxnType: 'Invoice' }],
      },
    ],
  };
}

/**
 * What the owner is told after a run.
 *
 * Names the held-back count separately from the failed count. "3 didn't go" is
 * a support ticket; "3 are waiting on you because they carry sales tax" is
 * something somebody can act on.
 */
export function summarize(counts: {
  invoices: number;
  payments: number;
  held: number;
  failed: number;
}): string {
  const parts: string[] = [];
  if (counts.invoices) parts.push(`${counts.invoices} invoice${counts.invoices === 1 ? '' : 's'}`);
  if (counts.payments) parts.push(`${counts.payments} payment${counts.payments === 1 ? '' : 's'}`);
  const sent = parts.length ? `Sent ${parts.join(' and ')}` : 'Nothing new to send';
  const tail: string[] = [];
  if (counts.held) tail.push(`${counts.held} waiting on you`);
  if (counts.failed) tail.push(`${counts.failed} failed`);
  return tail.length ? `${sent} · ${tail.join(' · ')}` : sent;
}
