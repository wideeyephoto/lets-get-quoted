/**
 * Can a homeowner pay this invoice, and how much is actually left?
 *
 * The public invoice page could show the total, the line items and a signature
 * box, and offered no way to pay — the customer had to wait for a separate
 * payment text, or ring up. This decides what that page offers instead.
 *
 * Pure on purpose. Which invoices are payable, and for how much, is the kind of
 * rule that has to be right on a Sunday for somebody who part-paid a deposit
 * three weeks ago, and it should be provable without a database.
 */

export type InvoicePayState =
  /** Nothing owing: fully covered by payments already made. */
  | { state: 'settled'; due: 0; paid: number }
  /** Payable. `paymentId` is an existing open request to reuse, when there is one. */
  | { state: 'payable'; due: number; paid: number; paymentId: string | null }
  /** A payment is with the bank. ACH takes days; showing "Pay" again invites a double charge. */
  | { state: 'processing'; due: number; paid: number; paymentId: string }
  /** Draft, void, or a zero invoice — no button at all. */
  | { state: 'unavailable'; due: number; paid: number; reason: 'draft' | 'void' | 'zero' };

export type PayableInvoice = { status: string };

export type InvoicePayment = {
  id: string;
  amount: number;
  status: string;
  /** Which invoice this payment was raised against; null for ad-hoc requests. */
  invoice_id: string | null;
  refunded_amount?: number | null;
  /**
   * Set only when Stripe has confirmed a completed Checkout Session whose money
   * is still moving. Absent means `processing` is a checkout that was STARTED,
   * which is not the same thing at all — see below.
   */
  async_payment_pending_at?: string | null;
};

/**
 * Payments that count toward THIS invoice.
 *
 * Scoped by invoice_id rather than by job. A job routinely carries a deposit and
 * a final invoice, and counting every payment on the job against whichever
 * invoice was open would show a $2,000 invoice as settled because a $2,000
 * deposit was paid against a different one.
 */
export function paymentsForInvoice<T extends InvoicePayment>(payments: T[], invoiceId: string): T[] {
  return payments.filter((payment) => payment.invoice_id === invoiceId);
}

/** What has actually landed, net of anything refunded back out. */
export function paidTowardInvoice(payments: InvoicePayment[]): number {
  const total = payments
    .filter((payment) => payment.status === 'paid')
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0) - (Number(payment.refunded_amount) || 0), 0);
  return round2(Math.max(0, total));
}

export function invoicePayState(
  invoice: PayableInvoice,
  total: number,
  invoicePayments: InvoicePayment[],
): InvoicePayState {
  const paid = paidTowardInvoice(invoicePayments);
  const due = round2(Math.max(0, (Number(total) || 0) - paid));

  // A draft has not been sent to anybody and its numbers are still moving. If a
  // customer has the link anyway, they must not be able to pay a figure the
  // contractor is mid-way through editing.
  if (invoice.status === 'draft') return { state: 'unavailable', due, paid, reason: 'draft' };
  /**
   * A VOID INVOICE IS NOT OWED, and it used to return the full amount.
   *
   * `due` above is total - paid. A full refund sets the payment to `refunded`
   * and the invoice to `void` (payments.ts:884, :910-912, and again in the
   * Stripe webhook) -- and `paidTowardInvoice` counts only `paid`, so the
   * refunded payment drops out entirely, paid falls to 0 and due becomes the
   * whole original total.
   *
   * The portal headline sums `due` across every invoice it loads, void
   * included, so a fully refunded homeowner opened their branded link and read
   * "Balance due $4,237.50" with no invoice listed beneath it and no way to pay.
   */
  if (invoice.status === 'void') return { state: 'unavailable', due: 0, paid, reason: 'void' };

  if (due <= 0) return { state: 'settled', due: 0, paid };
  if ((Number(total) || 0) <= 0) return { state: 'unavailable', due, paid, reason: 'zero' };

  // A bank transfer sits in `processing` for days. Offering "Pay" over the top of
  // one is how a homeowner pays the same invoice twice.
  //
  // BUT `processing` DOES NOT MEAN THAT ON ITS OWN. It is written when a Checkout
  // Session is CREATED, so it equally means "opened Stripe and closed the tab" --
  // and that reading is far the more common of the two. Treating those the same
  // told a homeowner their transfer was clearing when nothing had happened, AND
  // withheld the Pay button, so the invoice they had just tried to pay became
  // unpayable from the link. Until Stripe expires the abandoned session and the
  // expired webhook moves the row to `failed`, which is its DEFAULT 24 HOURS,
  // because no expires_at is set on these sessions.
  //
  // async_payment_pending_at is written only by checkout.session.completed with
  // the payment still unpaid, which is the ACH case and cannot be reached by
  // abandonment. So it is the difference between the two, and an abandoned
  // checkout now falls through to `payable` -- which the server already allows,
  // since createCheckoutSessionForPayment accepts `processing` precisely so an
  // abandoned checkout can be resumed.
  const inFlight = invoicePayments.find(
    (payment) => payment.status === 'processing' && Boolean(payment.async_payment_pending_at),
  );
  if (inFlight) return { state: 'processing', due, paid, paymentId: inFlight.id };

  // Reuse an open request for the right amount rather than minting a second one.
  // Two live payment links for one invoice is two ways to pay it and one of them
  // is wrong the moment a part-payment lands.
  //
  // `processing` BELONGS IN THIS LIST, and only became safe to include once the
  // in-flight test above stopped matching every one of them. Anything reaching
  // here in `processing` is an abandoned checkout: the row already exists, the
  // server will happily open a fresh Session against it, and leaving it out
  // would mint a SECOND payment row for the same invoice -- which is precisely
  // the failure the paragraph above is about.
  const open = invoicePayments.find(
    (payment) => (payment.status === 'requested' || payment.status === 'failed' || payment.status === 'processing')
      && round2(Number(payment.amount) || 0) === due,
  );
  return { state: 'payable', due, paid, paymentId: open?.id ?? null };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
