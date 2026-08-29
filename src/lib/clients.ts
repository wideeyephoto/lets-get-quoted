import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUsPhone } from '@/lib/phone';
import { applyTestRecordFilter, type TestRecordOptions } from '@/lib/test-records';

export type Client = {
  id: string;
  account_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  last_rebook_invite_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientWithStats = Client & {
  jobCount: number;
  totalValue: number;
  /**
   * When their most recent job was CREATED. Not when the work happened — every
   * job imported or added in one sitting shares roughly this timestamp, which
   * is why the two fields below exist rather than this one being reused.
   */
  lastJobAt: string | null;
  /** Soonest scheduled date still ahead of today, 'YYYY-MM-DD'. */
  nextJobAt: string | null;
  /** Most recent scheduled date already past, 'YYYY-MM-DD'. */
  lastVisitAt: string | null;
  /** Jobs with no date on them at all — quoted but never put on the calendar. */
  unscheduledJobs: number;
};

function cleanEmail(email: string | null | undefined): string | null {
  const value = (email ?? '').trim().toLowerCase();
  return value || null;
}

// Find the existing client for this contact, or create one. Dedupe is by phone
// first (the strongest signal), then email. Returns null only when there's
// nothing to key on. Best-effort by contract — callers treat a null as "no
// client linked" rather than an error, so job creation never fails on this.
export async function findOrCreateClientId(
  supabase: SupabaseClient,
  accountId: string,
  input: { name?: string | null; phone?: string | null; email?: string | null; address?: string | null },
): Promise<string | null> {
  const name = (input.name ?? '').trim();
  const phone = input.phone ? normalizeUsPhone(input.phone) : null;
  const email = cleanEmail(input.email);
  if (!name && !phone && !email) return null;

  if (phone) {
    const { data } = await supabase.from('clients').select('id').eq('account_id', accountId).eq('phone', phone).limit(1).maybeSingle();
    if (data?.id) return data.id as string;
  }
  if (email) {
    const { data } = await supabase.from('clients').select('id').eq('account_id', accountId).eq('email', email).limit(1).maybeSingle();
    if (data?.id) return data.id as string;
  }

  const { data, error } = await supabase
    .from('clients')
    .insert({ account_id: accountId, name: name || 'Client', phone, email, address: input.address?.trim() || null })
    .select('id')
    .single();
  if (error || !data) return null;
  return data.id as string;
}

// `excludeTestRecords` leaves out the rows a seeding or probe script stamped as
// its own — see src/lib/test-records.ts. It is ON now that the column is in the
// database and the rows already there have been stamped; pass it as `false` to
// see everything. The jobs side is filtered too, because a seeded client's repeat
// visits and quoted totals are the numbers that actually move.
export async function listClientsWithStats(
  supabase: SupabaseClient,
  accountId: string,
  options?: { todayKey?: string } & TestRecordOptions,
): Promise<ClientWithStats[]> {
  const [{ data: clients }, { data: jobs }] = await Promise.all([
    applyTestRecordFilter(supabase.from('clients').select('*').eq('account_id', accountId), options),
    applyTestRecordFilter(
      supabase
        .from('jobs')
        .select('client_id, quoted_amount, created_at, scheduled_for')
        .eq('account_id', accountId)
        .not('client_id', 'is', null),
      options,
    ),
  ]);

  // The caller passes today so the split between "booked" and "been" is made
  // in the owner's zone rather than the server's — on UTC Vercel an Eastern
  // evening would otherwise roll tomorrow's jobs into the past.
  const todayKey = options?.todayKey ?? new Date().toISOString().slice(0, 10);

  type Entry = Omit<ClientWithStats, keyof Client>;
  const blank = (): Entry => ({ jobCount: 0, totalValue: 0, lastJobAt: null, nextJobAt: null, lastVisitAt: null, unscheduledJobs: 0 });

  const stats = new Map<string, Entry>();
  for (const job of jobs ?? []) {
    const key = job.client_id as string;
    const entry = stats.get(key) ?? blank();
    entry.jobCount += 1;
    entry.totalValue += Number(job.quoted_amount) || 0;
    if (!entry.lastJobAt || job.created_at > entry.lastJobAt) entry.lastJobAt = job.created_at;

    const scheduled = (job.scheduled_for as string | null)?.slice(0, 10) ?? null;
    if (!scheduled) {
      entry.unscheduledJobs += 1;
    } else if (scheduled >= todayKey) {
      // Soonest upcoming, not latest — "when are we next there" is the question.
      if (!entry.nextJobAt || scheduled < entry.nextJobAt) entry.nextJobAt = scheduled;
    } else if (!entry.lastVisitAt || scheduled > entry.lastVisitAt) {
      entry.lastVisitAt = scheduled;
    }
    stats.set(key, entry);
  }

  return (clients ?? [])
    .map((client) => ({ ...(client as Client), ...(stats.get(client.id) ?? blank()) }))
    // Most recently active first; clients with jobs above those without.
    .sort((a, b) => {
      const aKey = a.lastJobAt ?? a.created_at;
      const bKey = b.lastJobAt ?? b.created_at;
      return bKey.localeCompare(aKey);
    });
}

export type StatementJob = {
  id: string;
  ref: string;
  date: string;
  status: string;
  quoted: number;
  paid: number;
  balance: number;
};

export type StatementPayment = {
  id: string;
  jobRef: string;
  label: string | null;
  kind: string;
  amount: number;
  status: string;
  at: string;
};

export type ClientStatement = {
  totalQuoted: number;
  totalPaid: number;
  outstanding: number;
  jobCount: number;
  jobs: StatementJob[];
  payments: StatementPayment[];
};

const round2 = (value: number) => Math.round(value * 100) / 100;

// A per-client financial ledger: each job's agreed (quoted) amount vs. what's
// actually been paid, plus the full payment history and lifetime totals. Powers
// the printable client statement.
export async function getClientStatement(supabase: SupabaseClient, accountId: string, clientId: string): Promise<ClientStatement> {
  const { data: jobRows } = await supabase
    .from('jobs')
    .select('id, ref, status, quoted_amount, created_at')
    .eq('account_id', accountId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  const jobs = jobRows ?? [];
  const jobIds = jobs.map((job) => job.id as string);

  let payments: Record<string, unknown>[] = [];
  if (jobIds.length > 0) {
    const { data } = await supabase
      .from('payments')
      // refunded_amount was NOT selected, so a refund was invisible here and the
      // statement told the customer they had paid money that had gone back to
      // them.
      .select('id, job_id, label, kind, amount, refunded_amount, status, paid_at, requested_at')
      .eq('account_id', accountId)
      .in('job_id', jobIds)
      .order('requested_at', { ascending: false });
    payments = data ?? [];
  }

  /**
   * Priority-visit fees are booked as a payment on the JOB, and they do not pay
   * for the job.
   *
   * `/pay/[id]` tells the homeowner in as many words that the fee "is not taken
   * off the cost of the job", and then this credited it against the quote
   * anyway. The discriminator is the link, not the shape: quick-stop-payments
   * creates an ordinary `kind: 'deposit'` row and records its id on
   * `extra_stop_requests.payment_id`. Filtering on `invoice_id` instead would
   * have dropped genuine deposits, which do not all carry one.
   */
  const feePaymentIds = new Set<string>();
  if (payments.length > 0) {
    const { data: feeRows } = await supabase
      .from('extra_stop_requests')
      .select('payment_id')
      .eq('account_id', accountId)
      .not('payment_id', 'is', null);
    for (const row of feeRows ?? []) feePaymentIds.add(String((row as { payment_id: unknown }).payment_id));
  }

  const paidByJob = new Map<string, number>();
  for (const payment of payments) {
    if (payment.status === 'paid' && !feePaymentIds.has(String(payment.id))) {
      const key = payment.job_id as string;
      // Net of refunds. What the customer has actually paid is what they sent
      // minus what came back.
      const net = (Number(payment.amount) || 0) - (Number(payment.refunded_amount) || 0);
      paidByJob.set(key, (paidByJob.get(key) ?? 0) + net);
    }
  }
  const refById = new Map(jobs.map((job) => [job.id as string, job.ref as string]));

  const statementJobs: StatementJob[] = jobs.map((job) => {
    const quoted = Number(job.quoted_amount) || 0;
    const paid = paidByJob.get(job.id as string) ?? 0;
    return {
      id: job.id as string,
      ref: job.ref as string,
      date: job.created_at as string,
      status: job.status as string,
      quoted: round2(quoted),
      paid: round2(paid),
      balance: round2(quoted - paid),
    };
  });

  const totalQuoted = statementJobs.reduce((sum, job) => sum + job.quoted, 0);
  const totalPaid = statementJobs.reduce((sum, job) => sum + job.paid, 0);

  const statementPayments: StatementPayment[] = payments.map((payment) => ({
    id: payment.id as string,
    jobRef: refById.get(payment.job_id as string) ?? '—',
    label: (payment.label as string | null) ?? null,
    kind: payment.kind as string,
    amount: round2(Number(payment.amount) || 0),
    status: payment.status as string,
    at: (payment.paid_at as string | null) || (payment.requested_at as string),
  }));

  return {
    totalQuoted: round2(totalQuoted),
    totalPaid: round2(totalPaid),
    outstanding: round2(totalQuoted - totalPaid),
    jobCount: jobs.length,
    jobs: statementJobs,
    payments: statementPayments,
  };
}

export async function getClient(supabase: SupabaseClient, accountId: string, clientId: string): Promise<Client | null> {
  const { data } = await supabase.from('clients').select('*').eq('account_id', accountId).eq('id', clientId).maybeSingle();
  return (data as Client) ?? null;
}

export async function updateClient(
  supabase: SupabaseClient,
  accountId: string,
  clientId: string,
  input: { name: string; phone: string | null; email: string | null; address: string | null; notes: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({
      name: input.name.trim() || 'Client',
      phone: input.phone ? normalizeUsPhone(input.phone) : null,
      email: cleanEmail(input.email),
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('id', clientId);
  if (error) throw error;
}
