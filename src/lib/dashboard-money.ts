/**
 * THE FOUR MONEY NUMBERS ON THE DASHBOARD, defined once.
 *
 * The dashboard's old "Business snapshot" repeated things the page had already
 * said — open leads, jobs next week — and answered none of the questions a
 * contractor actually opens their phone to ask. These are those questions: what
 * am I owed, what is out for approval, what is booked, what came in.
 *
 * WHY THIS MODULE EXISTS RATHER THAN A FEW INLINE REDUCES. Three of these
 * numbers already have an implementation somewhere in this codebase, and two of
 * them already have TWO:
 *
 *   - "what we're owed" is invoice FACE VALUE in insights (invoices with status
 *     sent/signed, summed whole) and NET OF PAYMENTS in the cash forecast. A
 *     $10k invoice with $4k collected is $10,000 to one and $6,000 to the other.
 *   - "quotes awaiting approval" is priced new_lead JOBS in insights and
 *     `status='quoted'` LEADS on this very dashboard — two counts that disagree,
 *     one above the other, on one screen.
 *
 * Neither of the insights versions is individually callable: both are computed
 * inline inside buildInsights, which is a twenty-one-query Promise.all. So the
 * only way to reuse them was to run all twenty-one — which is precisely the
 * pressure that produces a fifth definition. These are pure functions over rows,
 * the IO stays in dashboard-home-data, and every figure below is labelled in the
 * UI with the definition it actually implements.
 */

export type InvoiceRow = {
  id: string;
  total: number | string;
  status: string;
  job_id?: string | null;
};

export type PaymentRow = {
  amount: number | string;
  refunded_amount?: number | string | null;
  status?: string | null;
  paid_at?: string | null;
  invoice_id?: string | null;
};

export type QuotedJobRow = {
  id: string;
  status: string;
  quoted_amount: number | string;
  scheduled_for?: string | null;
};

function money(value: number | string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * What is still owed on invoices that have gone out.
 *
 * NET OF WHAT HAS BEEN COLLECTED, deliberately — and this is the one place the
 * dashboard departs from the Insights definition, so it is worth being explicit
 * about why.
 *
 * `invoices.status` only flips to 'paid' when collections reach the FULL total
 * (see the `collected + 0.005 < total` guard in lib/invoices). So a $10,000
 * invoice with a $4,000 deposit already banked is still 'sent', and summing face
 * value tells the owner they are owed $10,000 when they are owed $6,000. On an
 * analytics page, where "outstanding invoice value" is a portfolio measure, face
 * value is defensible. On a dashboard tile that a contractor reads as "chase
 * this", it is simply wrong by the size of every deposit they have taken.
 */
export function outstandingInvoices(
  invoices: InvoiceRow[],
  payments: PaymentRow[],
): { total: number; count: number } {
  const collectedByInvoice = new Map<string, number>();
  for (const payment of payments) {
    if (payment.status !== 'paid' || !payment.invoice_id) continue;
    const net = Math.max(0, money(payment.amount) - money(payment.refunded_amount));
    collectedByInvoice.set(payment.invoice_id, (collectedByInvoice.get(payment.invoice_id) ?? 0) + net);
  }

  let total = 0;
  let count = 0;
  for (const invoice of invoices) {
    // Same set Insights calls outstanding: out to the customer, not yet settled.
    // Drafts have not been sent and void ones do not exist.
    if (invoice.status !== 'sent' && invoice.status !== 'signed') continue;
    const owed = money(invoice.total) - (collectedByInvoice.get(invoice.id) ?? 0);
    // A negative balance means over-collection — a rounding artefact or a
    // duplicate payment. It is a real thing to look into and NOT a credit
    // against the next invoice, so it is floored rather than allowed to reduce
    // what other customers owe.
    if (owed <= 0.005) continue;
    total += owed;
    count += 1;
  }
  return { total: Math.round(total * 100) / 100, count };
}

/**
 * Quotes sitting with the customer, and what they are worth.
 *
 * The JOBS definition, matching Insights — still at the quote stage, with a
 * price on them. The dashboard's other "quotes awaiting approval" row counted
 * LEADS with `status='quoted'`, which is a different set for two reasons: leads
 * carry no amount test, and listJobs hides new_lead jobs whose originating lead
 * is quoted or lost. Two counts of the same thing on one screen is worse than
 * either being slightly off, so both rows now read this.
 */
export function quotesAwaitingApproval(jobs: QuotedJobRow[]): { total: number; count: number } {
  let total = 0;
  let count = 0;
  for (const job of jobs) {
    if (job.status !== 'new_lead') continue;
    const amount = money(job.quoted_amount);
    if (amount <= 0) continue;
    total += amount;
    count += 1;
  }
  return { total: Math.round(total * 100) / 100, count };
}

/**
 * The quoted value of work already on the calendar in the window.
 *
 * WORK VALUE, NOT CASH, and the label in the UI has to say so. A job with a
 * deposit already collected contributes its whole quoted amount here, and that
 * same dollar also appears in "collected this month" — which is correct for two
 * questions that are genuinely different ("how much work is booked" vs "how much
 * money arrived") and would be double-counting if either tile claimed to be the
 * other. The cash forecast on /dashboard/cash-flow is the netted, payment-lagged
 * answer to the cash question and stays the place to ask it.
 *
 * Both keys are 'YYYY-MM-DD' and compared as strings, which is exactly right for
 * that format and avoids inventing a timezone here — the caller supplies days
 * already cut in the account's zone.
 */
export function scheduledWorkValue(
  jobs: QuotedJobRow[],
  fromDateKey: string,
  toDateKey: string,
): { total: number; count: number } {
  let total = 0;
  let count = 0;
  for (const job of jobs) {
    // Unapproved quotes with a date on them are excluded: a date somebody
    // pencilled in is not booked work, and counting it would let the same job
    // appear as both "awaiting approval" and "booked".
    if (job.status !== 'in_progress') continue;
    const day = job.scheduled_for;
    if (!day || day < fromDateKey || day > toDateKey) continue;
    total += money(job.quoted_amount);
    count += 1;
  }
  return { total: Math.round(total * 100) / 100, count };
}

/**
 * Money that arrived and stayed, inside a window.
 *
 * Net of refunds, matching netPaidInRange in insights-metrics: a partial refund
 * leaves the row 'paid' with a refunded_amount, and a contractor who refunded
 * half of a job did not collect that half.
 *
 * The window is passed in as ISO instants because the boundary has to be cut in
 * the ACCOUNT'S timezone, not the server's. Every money figure in insights uses
 * server-local Date methods today, which means a payment taken at 5pm on the
 * 31st in Los Angeles lands in next month for a UTC server — the owner will call
 * that a July payment and the dashboard will call it August. The caller gets its
 * boundaries from resolvePayPeriod('monthly', 0, { now, timeZone }), which is the
 * zone-correct month cut crew pay already uses, so this adds no fifth convention.
 */
export function collectedInWindow(
  payments: PaymentRow[],
  startIso: string,
  endIso: string,
): { total: number; count: number } {
  const from = Date.parse(startIso);
  const to = Date.parse(endIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return { total: 0, count: 0 };

  let total = 0;
  let count = 0;
  for (const payment of payments) {
    if (payment.status !== 'paid' || !payment.paid_at) continue;
    const at = Date.parse(payment.paid_at);
    // End-exclusive, matching resolvePayPeriod's own contract.
    if (!Number.isFinite(at) || at < from || at >= to) continue;
    total += Math.max(0, money(payment.amount) - money(payment.refunded_amount));
    count += 1;
  }
  return { total: Math.round(total * 100) / 100, count };
}
