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
  return String(value ?? '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
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
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
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
  if (!Number.isFinite(invoice.total) || !(invoice.total > 0)) {
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
  if (!Number.isFinite(payment.amount) || !(payment.amount > 0)) return 'This payment is for zero.';
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
  if (client.email?.trim()) payload.PrimaryEmailAddr = { Address: client.email.trim().slice(0, 100) };
  if (client.phone?.trim()) payload.PrimaryPhone = { FreeFormNumber: client.phone.trim().slice(0, 30) };
  if (client.address?.trim()) payload.BillAddr = { Line1: client.address.trim().slice(0, 500) };
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

export type InboundSyncClient = {
  qboCustomerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
};

export type InboundSyncPayment = {
  qboPaymentId: string;
  amount: number;
  paidAt: string | null;
  qboCustomerId: string | null;
  linkedInvoiceQboIds: string[];
};

export type InboundInvoiceStatus = {
  qboInvoiceId: string;
  docNumber: string | null;
  total: number;
  balance: number;
  isPaid: boolean;
  linkedPaymentQboIds: string[];
};

/**
 * Pure mapping of a QuickBooks Customer payload into our Client model.
 */
export function mapQboCustomerToClient(raw: Record<string, unknown>): InboundSyncClient | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.Id ?? '').trim();
  if (!id) return null;

  const displayName = typeof raw.DisplayName === 'string' ? raw.DisplayName.trim() : '';
  const givenName = typeof raw.GivenName === 'string' ? raw.GivenName.trim() : '';
  const familyName = typeof raw.FamilyName === 'string' ? raw.FamilyName.trim() : '';
  const companyName = typeof raw.CompanyName === 'string' ? raw.CompanyName.trim() : '';
  const nameCombined = [givenName, familyName].filter(Boolean).join(' ').trim();

  const name = displayName || nameCombined || companyName || '';
  if (!name) return null;

  const emailObj = raw.PrimaryEmailAddr as { Address?: string } | undefined;
  const email = emailObj?.Address?.trim().toLowerCase() || null;

  const phoneObj = raw.PrimaryPhone as { FreeFormNumber?: string } | undefined;
  const phone = phoneObj?.FreeFormNumber?.trim() || null;

  const billAddr = raw.BillAddr as {
    Line1?: string;
    Line2?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  } | undefined;

  let address: string | null = null;
  if (billAddr) {
    const lines = [billAddr.Line1, billAddr.Line2].filter(Boolean).map((s) => String(s).trim());
    const cityStateZip = [
      billAddr.City?.trim(),
      [billAddr.CountrySubDivisionCode?.trim(), billAddr.PostalCode?.trim()].filter(Boolean).join(' '),
    ].filter(Boolean).join(', ');
    const full = [...lines, cityStateZip].filter(Boolean).join(', ');
    address = full || null;
  }

  const notes = typeof raw.Notes === 'string' ? raw.Notes.trim() || null : null;
  const active = raw.Active !== false;

  return {
    qboCustomerId: id,
    name,
    email,
    phone,
    address,
    notes,
    active,
  };
}

/**
 * Pure mapping of a QuickBooks Payment payload.
 */
export function mapQboPaymentToInbound(raw: Record<string, unknown>): InboundSyncPayment | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.Id ?? '').trim();
  if (!id) return null;

  const amount = money(Number(raw.TotalAmt) || 0);
  const paidAt = typeof raw.TxnDate === 'string' ? raw.TxnDate : null;

  const customerRef = raw.CustomerRef as { value?: string } | undefined;
  const qboCustomerId = customerRef?.value ? String(customerRef.value).trim() : null;

  const lines = Array.isArray(raw.Line) ? raw.Line : [];
  const linkedInvoiceQboIds: string[] = [];

  for (const line of lines) {
    if (line && typeof line === 'object' && Array.isArray((line as { LinkedTxn?: unknown[] }).LinkedTxn)) {
      for (const link of (line as { LinkedTxn: Record<string, unknown>[] }).LinkedTxn) {
        if (link && (link.TxnType === 'Invoice' || link.TxnType === 'invoice') && link.TxnId) {
          linkedInvoiceQboIds.push(String(link.TxnId).trim());
        }
      }
    }
  }

  return {
    qboPaymentId: id,
    amount,
    paidAt,
    qboCustomerId,
    linkedInvoiceQboIds: [...new Set(linkedInvoiceQboIds)],
  };
}

/**
 * Pure mapping of a QuickBooks Invoice for balance / payment status reconciliation.
 */
export function mapQboInvoiceStatus(raw: Record<string, unknown>): InboundInvoiceStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.Id ?? '').trim();
  if (!id) return null;

  const docNumber = typeof raw.DocNumber === 'string' ? raw.DocNumber.trim() || null : null;
  const total = money(Number(raw.TotalAmt) || 0);
  const balance = money(Number(raw.Balance) || 0);
  const isPaid = balance === 0 && total > 0;

  const lines = Array.isArray(raw.LinkedTxn) ? raw.LinkedTxn : [];
  const linkedPaymentQboIds: string[] = [];
  for (const link of lines) {
    if (link && typeof link === 'object' && (link.TxnType === 'Payment' || link.TxnType === 'payment') && link.TxnId) {
      linkedPaymentQboIds.push(String(link.TxnId).trim());
    }
  }

  return {
    qboInvoiceId: id,
    docNumber,
    total,
    balance,
    isPaid,
    linkedPaymentQboIds: [...new Set(linkedPaymentQboIds)],
  };
}

function joinList(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Format summary for a 2-way bidirectional sync run.
 */
export function summarizeBidirectional(counts: {
  invoicesPushed?: number;
  paymentsPushed?: number;
  customersPulled?: number;
  paymentsPulled?: number;
  invoicesReconciled?: number;
  held?: number;
  failed?: number;
}): string {
  const pushParts: string[] = [];
  if (counts.invoicesPushed) {
    pushParts.push(`${counts.invoicesPushed} invoice${counts.invoicesPushed === 1 ? '' : 's'}`);
  }
  if (counts.paymentsPushed) {
    pushParts.push(`${counts.paymentsPushed} payment${counts.paymentsPushed === 1 ? '' : 's'}`);
  }
  const pushed = pushParts.length ? `Pushed ${joinList(pushParts)}` : null;

  const pullParts: string[] = [];
  if (counts.customersPulled) {
    pullParts.push(`${counts.customersPulled} customer${counts.customersPulled === 1 ? '' : 's'}`);
  }
  if (counts.paymentsPulled) {
    pullParts.push(`${counts.paymentsPulled} payment${counts.paymentsPulled === 1 ? '' : 's'}`);
  }
  if (counts.invoicesReconciled) {
    pullParts.push(`${counts.invoicesReconciled} invoice reconciliation${counts.invoicesReconciled === 1 ? '' : 's'}`);
  }
  const pulled = pullParts.length ? `Pulled ${joinList(pullParts)}` : null;

  const mainParts = [pushed, pulled].filter(Boolean);
  const actionText = mainParts.length ? mainParts.join(' · ') : 'Nothing new to sync';

  const tail: string[] = [];
  if (counts.held) tail.push(`${counts.held} waiting on you`);
  if (counts.failed) tail.push(`${counts.failed} failed`);

  return tail.length ? `${actionText} · ${tail.join(' · ')}` : actionText;
}


