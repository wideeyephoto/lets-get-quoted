import type { SupabaseClient } from '@supabase/supabase-js';
import { getClient, getClientStatement } from '@/lib/clients';
import { formatMoneyExact } from '@/lib/jobs';
import { JOB_STATUS_LABEL, cityFromAddress, formatLeadDate } from '@/lib/lead-detail-labels';
import { formatPhoneDashes, normalizeUsPhone } from '@/lib/phone';
import type { JobStatus } from '@/lib/jobs';

/**
 * One customer, deep enough for the Focus pane's tabs.
 *
 * The same contract the leads and jobs panes work to: the LIST already carries
 * everything the header needs, so a click paints instantly, and this is only
 * what sits behind the tabs. Anything the row already knows (name, totals, last
 * job) is deliberately NOT re-fetched here — two sources for one number is two
 * numbers, eventually.
 *
 * Money is formatted here rather than in the component. Every money helper in
 * this app lives in a module that also reaches the database, so importing one
 * into a 'use client' file drags server code into the browser bundle.
 */

export type ClientDetailJob = {
  id: string;
  ref: string;
  status: string;
  statusLabel: string;
  dateLabel: string;
  quotedLabel: string;
  paidLabel: string;
  balance: number;
  balanceLabel: string;
};

export type ClientDetailPayment = {
  id: string;
  jobRef: string;
  label: string;
  amountLabel: string;
  status: string;
  dateLabel: string;
};

export type ClientDetailDto = {
  id: string;
  name: string;
  phone: string | null;
  /** Digits only, for a tel: link — the display string may carry punctuation. */
  phoneDigits: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  customerSinceLabel: string;
  jobCount: number;
  openJobCount: number;
  totals: {
    quoted: number;
    paid: number;
    outstanding: number;
    quotedLabel: string;
    paidLabel: string;
    outstandingLabel: string;
  };
  jobs: ClientDetailJob[];
  payments: ClientDetailPayment[];
  /** Inquiries from this customer that never became a job. */
  openRequestCount: number;
  lastInvitedLabel: string | null;
};

// A job that is neither finished nor filed away is one you still owe them.
const OPEN_STATUSES = new Set(['new_lead', 'in_progress']);

export async function loadClientDetail(
  supabase: SupabaseClient,
  accountId: string,
  clientId: string,
): Promise<ClientDetailDto | null> {
  const client = await getClient(supabase, accountId, clientId);
  if (!client) return null;

  const [statement, { count: requestCount }] = await Promise.all([
    getClientStatement(supabase, accountId, clientId),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('client_id', clientId)
      .not('status', 'in', '("won","lost")'),
  ]);

  // To the cent. These are the amounts a customer has paid and still owes, read
  // off the same payments the pay page and the invoice state exactly. The
  // rounding formatMoney is right for a summary and wrong for a balance, and
  // lib/jobs says so where it is defined.
  const money = (value: number) => formatMoneyExact(value);

  return {
    id: client.id,
    name: client.name,
    // Punctuated for reading. The book stores whatever was typed or imported,
    // and an unformatted string of ten digits beside the same number formatted
    // in the list reads as two different numbers.
    phone: client.phone ? formatPhoneDashes(client.phone) : null,
    phoneDigits: client.phone ? normalizeUsPhone(client.phone) ?? client.phone : null,
    email: client.email,
    address: client.address,
    city: cityFromAddress(client.address),
    notes: client.notes,
    customerSinceLabel: formatLeadDate(client.created_at),
    jobCount: statement.jobCount,
    openJobCount: statement.jobs.filter((job) => OPEN_STATUSES.has(job.status)).length,
    totals: {
      quoted: statement.totalQuoted,
      paid: statement.totalPaid,
      outstanding: statement.outstanding,
      quotedLabel: money(statement.totalQuoted),
      paidLabel: money(statement.totalPaid),
      outstandingLabel: money(statement.outstanding),
    },
    // Capped: the pane is a summary with a way through to the full profile, and
    // a customer with sixty jobs should not ship sixty rows to render eight.
    jobs: statement.jobs.slice(0, 12).map((job) => ({
      id: job.id,
      ref: job.ref,
      status: job.status,
      statusLabel: JOB_STATUS_LABEL[job.status as JobStatus] ?? job.status,
      dateLabel: formatLeadDate(job.date),
      quotedLabel: money(job.quoted),
      paidLabel: money(job.paid),
      balance: job.balance,
      balanceLabel: money(job.balance),
    })),
    payments: statement.payments.slice(0, 12).map((payment) => ({
      id: payment.id,
      jobRef: payment.jobRef,
      label: payment.label || payment.kind,
      amountLabel: money(payment.amount),
      status: payment.status,
      dateLabel: formatLeadDate(payment.at),
    })),
    openRequestCount: requestCount ?? 0,
    lastInvitedLabel: client.last_rebook_invite_at ? formatLeadDate(client.last_rebook_invite_at) : null,
  };
}
