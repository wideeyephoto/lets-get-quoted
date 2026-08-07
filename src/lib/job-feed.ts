import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { getJob, formatJobSchedule, formatMoney, parseQuoteItems, computeQuoteTotal, type QuoteItem } from '@/lib/jobs';
import { getLeadByConvertedJob, updateLeadStatus } from '@/lib/leads';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { addInvoiceItem, createInvoice, listInvoices, selectPrimaryInvoice, type Invoice } from '@/lib/invoices';
import { createDepositRequest, type Payment } from '@/lib/payments';
import { planSchedulePreview } from '@/lib/payment-plan-math';
import { sendPaymentSmsEvent } from '@/lib/sms';
import { normalizeUsPhone } from '@/lib/phone';
import { loadClientMilestones } from '@/lib/milestones-data';
import type { MilestoneStatus } from '@/lib/milestones';
import { CONTRACTOR_BRAND_COLUMNS, shapeContractorBrand, type ContractorBrand } from '@/lib/contractor-brand';
import { pickBusinessName } from '@/lib/business-name';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

export type JobFeedVisibility = 'internal' | 'client' | 'client_financial';

export type JobFeedEvent = {
  id: string;
  account_id: string;
  job_id: string;
  kind: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
  author: string | null;
  meta: Record<string, unknown> | null;
  visibility: JobFeedVisibility;
  amount: number | null;
  source_table: string | null;
  source_id: string | null;
  action_url: string | null;
  published_at: string | null;
  created_at: string;
};

/**
 * A milestone as the HOMEOWNER sees it.
 *
 * Deliberately not the owner's shape. It carries the promise, the evidence and
 * the amount — and none of the contractor's own machinery: no "ready to bill",
 * no blocker list, no photo requirements. A customer being told "2 of 3
 * checklist items still to tick off" is being shown a contractor's to-do list
 * and invited to police it.
 */
export type ClientMilestone = {
  id: string;
  title: string;
  scope: string | null;
  amount: number;
  status: MilestoneStatus;
  statusLabel: string;
  progressPct: number;
  tasks: Array<{ title: string; done: boolean }>;
  photos: Array<{ id: string; phase: 'before' | 'after'; caption: string | null; url: string }>;
  /** Present only once payment has actually been requested. */
  payHref: string | null;
  paidAt: string | null;
};

export type ClientJobDashboard = {
  businessName: string;
  /** Logo, colour and website — everything the page needs to wear the
   *  contractor's brand rather than ours. See @/lib/contractor-brand. */
  brand: ContractorBrand;
  job: {
    id: string;
    ref: string;
    client_name: string;
    address: string | null;
    status: string;
    scheduled_for: string | null;
    scheduled_time: string | null;
    schedule_label: string;
    quote_items: QuoteItem[];
  };
  feed: JobFeedEvent[];
  payments: Payment[];
  invoices: Invoice[];
  tasks: { title: string; done: boolean }[];
  /** Proof-to-Pay stages, with the evidence behind each one. */
  milestones: ClientMilestone[];
  scheduleRequest: {
    id: string;
    options: Array<{ date: string; time: string | null }>;
    status: 'open' | 'selected' | 'needs_more_options' | 'revoked';
    selected_index: number | null;
    client_notes: string | null;
  } | null;
  quoteApproved: boolean;
  depositBlocksScheduling: boolean;
  // Present when the job was quoted on Payment Plan terms. All money in dollars
  // except the *Cents fields; balances derive only from webhook-confirmed paid
  // rows.
  paymentPlan: {
    id: string;
    status: 'pending_deposit' | 'active' | 'paid_off' | 'canceled';
    totalCents: number;
    depositCents: number;
    paidCents: number;
    remainingCents: number;
    authorized: boolean;
    frequency: string;
    card: { brand: string | null; last4: string | null } | null;
    deposit: { paymentId: string; amount: number; status: string } | null;
    // The planned schedule (amounts + dates), shown before signing.
    schedule: Array<{ seq: number; amount: number; dueDate: string; label: string }>;
    // The actual installment rows once the plan is active (carry live statuses).
    installments: Array<{ id: string; seq: number; amount: number; dueDate: string | null; status: string }>;
    nextInstallment: { seq: number; amount: number; dueDate: string | null } | null;
    payoffInFlight: boolean;
  } | null;
};

function hasFeedAction(feed: JobFeedEvent[], sourceTable: string, sourceId: string, actionUrl: string): boolean {
  return feed.some((event) => event.source_table === sourceTable && event.source_id === sourceId && event.action_url === actionUrl);
}

export function createLinkedFeedItems(feed: JobFeedEvent[], payments: Payment[], invoices: Invoice[], accountId: string, jobId: string): JobFeedEvent[] {
  const paymentItems = payments
    .filter((payment) => !hasFeedAction(feed, 'payments', payment.id, `/pay/${payment.id}`))
    .map((payment): JobFeedEvent => ({
      id: `payment-link-${payment.id}`,
      account_id: accountId,
      job_id: jobId,
      kind: 'payment_requested',
      title: 'Payment request link available',
      body: payment.label ?? 'Payment request',
      image_url: null,
      author: 'Owner',
      meta: null,
      visibility: 'client_financial',
      amount: Number(payment.amount),
      source_table: 'payments',
      source_id: payment.id,
      action_url: `/pay/${payment.id}`,
      published_at: payment.requested_at,
      created_at: payment.requested_at,
    }));

  const invoiceItems = invoices
    .filter((invoice) => invoice.status !== 'void')
    .filter((invoice) => !hasFeedAction(feed, 'invoices', invoice.id, `/invoice/${invoice.id}`))
    .map((invoice): JobFeedEvent => ({
      id: `invoice-signoff-link-${invoice.id}`,
      account_id: accountId,
      job_id: jobId,
      kind: 'invoice_signoff_link',
      title: 'Client sign-off link available',
      body: invoice.ref,
      image_url: null,
      author: 'Owner',
      meta: null,
      visibility: invoice.status === 'draft' ? 'internal' : 'client_financial',
      amount: Number(invoice.total),
      source_table: 'invoices',
      source_id: invoice.id,
      action_url: `/invoice/${invoice.id}`,
      published_at: invoice.status === 'draft' ? null : invoice.created_at,
      created_at: invoice.created_at,
    }));

  return [...paymentItems, ...invoiceItems];
}

export function sortJobFeed(feed: JobFeedEvent[]): JobFeedEvent[] {
  return [...feed].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createAccessToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function listJobFeed(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  options?: { clientOnly?: boolean }
): Promise<JobFeedEvent[]> {
  let query = supabase
    .from('job_feed')
    .select('*')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (options?.clientOnly) {
    query = query.in('visibility', ['client', 'client_financial']);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as JobFeedEvent[];
}

export async function createJobFeedEvent(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  input: {
    kind: string;
    title: string;
    body?: string | null;
    visibility?: JobFeedVisibility;
    amount?: number | null;
    sourceTable?: string | null;
    sourceId?: string | null;
    actionUrl?: string | null;
    author?: string | null;
    meta?: Record<string, unknown> | null;
  }
): Promise<JobFeedEvent> {
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found for this account.');

  if (input.sourceTable && input.sourceId) {
    const { data: existing, error: existingError } = await supabase
      .from('job_feed')
      .select('*')
      .eq('source_table', input.sourceTable)
      .eq('source_id', input.sourceId)
      .eq('kind', input.kind)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return existing as JobFeedEvent;
  }

  const visibility = input.visibility ?? 'internal';
  const { data, error } = await supabase
    .from('job_feed')
    .insert({
      account_id: accountId,
      job_id: jobId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      author: input.author ?? 'Owner',
      meta: input.meta ?? null,
      visibility,
      amount: input.amount ?? null,
      source_table: input.sourceTable ?? null,
      source_id: input.sourceId ?? null,
      action_url: input.actionUrl ?? null,
      published_at: visibility === 'internal' ? null : new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('Unable to create job feed event.');
  return data as JobFeedEvent;
}

export async function createClientJobAccessToken(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  input?: { clientPhone?: string | null; clientEmail?: string | null }
): Promise<string> {
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found for this account.');

  const token = createAccessToken();
  const { error } = await supabase.from('client_job_access').insert({
    account_id: accountId,
    job_id: jobId,
    token_hash: hashToken(token),
    client_phone: input?.clientPhone ?? job.client_phone ?? null,
    client_email: input?.clientEmail ?? null,
  });

  if (error) throw error;
  return token;
}

export async function revokeClientJobAccess(supabase: SupabaseClient, accountId: string, jobId: string): Promise<void> {
  const { error } = await supabase
    .from('client_job_access')
    .update({ revoked_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .is('revoked_at', null);

  if (error) throw error;
}

export async function getActiveClientAccessCount(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('client_job_access')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .is('revoked_at', null);

  if (error) throw error;
  return count ?? 0;
}

export async function getClientJobDashboard(token: string): Promise<ClientJobDashboard | null> {
  const admin = createAdminClient();
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();

  const { data: access, error: accessError } = await admin
    .from('client_job_access')
    .select('id, account_id, job_id, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (accessError || !access || access.revoked_at || (access.expires_at && access.expires_at < now)) {
    return null;
  }

  await admin.from('client_job_access').update({ last_viewed_at: now }).eq('id', access.id);

  const [{ data: account }, { data: site }, { data: job }, feedResult, { data: payments }, { data: invoices }, { data: scheduleRequest }] = await Promise.all([
    admin.from('accounts').select('business_name').eq('id', access.account_id).maybeSingle(),
    admin.from('sites').select(CONTRACTOR_BRAND_COLUMNS).eq('account_id', access.account_id).maybeSingle(),
    admin
      .from('jobs')
      .select('id, ref, client_name, address, status, scheduled_for, scheduled_time')
      .eq('account_id', access.account_id)
      .eq('id', access.job_id)
      .maybeSingle(),
    listJobFeed(admin, access.account_id, access.job_id, { clientOnly: true }),
    admin
      .from('payments')
      .select('*')
      .eq('account_id', access.account_id)
      .eq('job_id', access.job_id)
      .in('status', ['requested', 'processing', 'paid'])
      .order('requested_at', { ascending: false }),
    admin
      .from('invoices')
      .select('*')
      .eq('account_id', access.account_id)
      .eq('job_id', access.job_id)
      .in('status', ['sent', 'signed', 'paid'])
      .order('created_at', { ascending: false }),
    admin
      .from('job_schedule_requests')
      .select('id, options, status, selected_index, client_notes')
      .eq('account_id', access.account_id)
      .eq('job_id', access.job_id)
      .in('status', ['open', 'selected', 'needs_more_options'])
      .or(`expires_at.is.null,expires_at.gte.${now}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!job) return null;

  // Fetch the itemized quote separately and defensively: on a DB where the
  // migration hasn't run the column is absent, so this degrades to no line
  // items instead of blanking every client job link.
  const { data: quoteRow } = await admin
    .from('jobs')
    .select('quote_items, deposit_gate')
    .eq('account_id', access.account_id)
    .eq('id', access.job_id)
    .maybeSingle();
  const quoteItems = parseQuoteItems(quoteRow?.quote_items);
  // A 'before_schedule' deposit blocks scheduling until it's paid. Derived from
  // the already-loaded payments — no extra query.
  const depositPaid = ((payments ?? []) as Payment[]).some((payment) => payment.kind === 'deposit' && payment.status === 'paid');
  const depositBlocksScheduling = quoteRow?.deposit_gate === 'before_schedule' && !depositPaid;

  // The job checklist, client-facing (read-only progress). Defensive: an
  // un-migrated DB (no job_tasks table) shows no checklist rather than erroring.
  const { data: taskRows, error: taskError } = await admin
    .from('job_tasks')
    .select('title, done')
    .eq('account_id', access.account_id)
    .eq('job_id', access.job_id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  const tasks = taskError ? [] : (taskRows ?? []).map((task) => ({ title: task.title as string, done: Boolean(task.done) }));

  // Proof-to-Pay stages. Only ones that have actually been billed OR started
  // are shown: a customer does not need to see a contractor's private plan for
  // how they intend to invoice, and an untouched stage is exactly that.
  const milestones = await loadClientMilestones(admin, access.account_id, access.job_id);

  const feed = sortJobFeed([
    ...feedResult,
    ...createLinkedFeedItems(feedResult, (payments ?? []) as Payment[], (invoices ?? []) as Invoice[], access.account_id, access.job_id),
  ]).filter((event) => event.visibility === 'client' || event.visibility === 'client_financial');

  const quoteApproved = feed.some((event) => event.kind === 'quote_approved') || job.status !== 'new_lead';

  // Payment plan (if this job was quoted on installment terms). Defensive: an
  // un-migrated DB (no payment_plans table) simply shows no plan.
  let paymentPlan: ClientJobDashboard['paymentPlan'] = null;
  const { data: planRow } = await admin
    .from('payment_plans')
    .select('*')
    .eq('account_id', access.account_id)
    .eq('job_id', access.job_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (planRow) {
    const { data: planPaymentRows } = await admin
      .from('payments')
      .select('id, kind, amount, status, due_date, installment_seq')
      .eq('payment_plan_id', planRow.id);
    const rows = (planPaymentRows ?? []) as Payment[];
    const toC = (dollars: number) => Math.round(Number(dollars) * 100);
    const paidCents = rows.filter((row) => row.status === 'paid').reduce((sum, row) => sum + toC(row.amount), 0);
    const installments = rows
      .filter((row) => row.kind === 'plan_installment')
      .map((row) => ({ id: row.id, seq: row.installment_seq ?? 0, amount: Number(row.amount), dueDate: row.due_date ?? null, status: row.status }))
      .sort((a, b) => a.seq - b.seq);
    const depositRow = rows.find((row) => row.kind === 'deposit') ?? null;
    const nextInstallment = installments.find((row) => row.status === 'requested' || row.status === 'failed') ?? null;
    const schedule = planSchedulePreview({
      total_cents: planRow.total_cents as number,
      deposit_cents: planRow.deposit_cents as number,
      installment_count: planRow.installment_count as number,
      frequency: planRow.frequency as 'weekly' | 'biweekly' | 'monthly',
      first_installment_date: planRow.first_installment_date as string,
    }).map((entry) => ({ seq: entry.seq, amount: entry.amountCents / 100, dueDate: entry.dueDate, label: entry.label }));
    paymentPlan = {
      id: planRow.id as string,
      status: planRow.status as NonNullable<ClientJobDashboard['paymentPlan']>['status'],
      totalCents: planRow.total_cents as number,
      depositCents: planRow.deposit_cents as number,
      paidCents,
      remainingCents: Math.max(0, (planRow.total_cents as number) - paidCents),
      authorized: Boolean(planRow.authorized_at),
      frequency: planRow.frequency as string,
      card: planRow.card_last4 ? { brand: planRow.card_brand as string | null, last4: planRow.card_last4 as string } : null,
      deposit: depositRow ? { paymentId: depositRow.id, amount: Number(depositRow.amount), status: depositRow.status } : null,
      schedule,
      installments,
      nextInstallment: nextInstallment ? { seq: nextInstallment.seq, amount: nextInstallment.amount, dueDate: nextInstallment.dueDate } : null,
      payoffInFlight: Boolean(planRow.payoff_locked_at),
    };
  }

  // One fallback ladder for whose name this is, shared with the invoice, the
  // payment page and the portal — rather than four copies of
  // `company_name || business_name || something`, which is how they drift.
  const brand = shapeContractorBrand(account, site);

  return {
    businessName: brand.businessName,
    brand,
    job: {
      ...job,
      schedule_label: formatJobSchedule(job.scheduled_for, job.scheduled_time),
      quote_items: quoteItems,
    },
    feed,
    payments: (payments ?? []) as Payment[],
    invoices: (invoices ?? []) as Invoice[],
    tasks,
    milestones,
    scheduleRequest: scheduleRequest as ClientJobDashboard['scheduleRequest'],
    quoteApproved,
    depositBlocksScheduling,
    paymentPlan,
  };
}

// Public, token-guarded: the client clicks "Approve quote" on their dashboard.
// Records approval idempotently, promotes the job out of the quote stage,
// advances the originating lead to won, and alerts the owner (best-effort).
export async function approveClientJobQuote(clientToken: string, selectedAddonIds: string[] = []): Promise<void> {
  const admin = createAdminClient();
  const tokenHash = hashToken(clientToken);
  const now = new Date().toISOString();

  const { data: access, error: accessError } = await admin
    .from('client_job_access')
    .select('account_id, job_id, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (accessError || !access || access.revoked_at || (access.expires_at && access.expires_at < now)) {
    throw new Error('This job link is no longer available.');
  }

  const accountId = access.account_id as string;
  const jobId = access.job_id as string;

  const job = await getJob(admin, accountId, jobId);
  if (!job) throw new Error('Job not found.');

  // Idempotency guard: gate ALL side effects on there being no prior approval,
  // so a double-submit can't re-email the owner or churn the lead. (The feed
  // insert also dedupes on (source_table, source_id, kind), but it returns the
  // existing row silently, so the explicit pre-check is what stops the rest.)
  const { data: existingApproval } = await admin
    .from('job_feed')
    .select('id')
    .eq('source_table', 'jobs')
    .eq('source_id', jobId)
    .eq('kind', 'quote_approved')
    .maybeSingle();
  if (existingApproval) return;

  // Lock in the client's add-on choices on an itemized quote and recompute the
  // total before recording approval, so quoted_amount reflects exactly what they
  // agreed to. Legacy single-amount quotes (no items) keep quoted_amount as-is.
  const items = parseQuoteItems(job.quote_items);
  let quotedAmount = Number(job.quoted_amount) || 0;
  if (items.length > 0) {
    const selectedSet = new Set(selectedAddonIds);
    const finalized = items.map((item) => (item.kind === 'addon' ? { ...item, selected: selectedSet.has(item.id) } : item));
    quotedAmount = computeQuoteTotal(finalized);
    await admin.from('jobs').update({ quote_items: finalized, quoted_amount: quotedAmount }).eq('account_id', accountId).eq('id', jobId);
  }

  const acceptedAddons = items.filter((item) => item.kind === 'addon' && selectedAddonIds.includes(item.id));
  const addonNote = acceptedAddons.length > 0 ? ` Added: ${acceptedAddons.map((item) => item.label).join(', ')}.` : '';

  await createJobFeedEvent(admin, accountId, jobId, {
    kind: 'quote_approved',
    title: 'Client approved the quote',
    body: `${job.client_name} approved the quote${quotedAmount > 0 ? ` (${formatMoney(quotedAmount)})` : ''}.${addonNote}`,
    visibility: 'client',
    amount: quotedAmount > 0 ? quotedAmount : null,
    sourceTable: 'jobs',
    sourceId: jobId,
  });

  // Only ever promote from the quote stage — never downgrade an in-progress,
  // complete, or archived job.
  if (job.status === 'new_lead') {
    await admin.from('jobs').update({ status: 'in_progress' }).eq('account_id', accountId).eq('id', jobId);
  }

  // Deposit-on-approval: turn the approval straight into a deposit ask when the
  // account opts in — a % of the just-finalized quote, created once and texted
  // when the client has SMS consent (otherwise it simply shows on their
  // dashboard). Best-effort: a deposit or SMS failure must never fail approval,
  // and the settings read is defensive so an un-migrated DB just skips it.
  try {
    const { data: depositSettings } = await admin
      .from('accounts')
      .select('deposit_on_approval, deposit_percent')
      .eq('id', accountId)
      .maybeSingle();
    const depositPercent = Number(depositSettings?.deposit_percent);
    if (depositSettings?.deposit_on_approval && quotedAmount > 0 && Number.isFinite(depositPercent) && depositPercent > 0) {
      // Never stack a second deposit on a job that already has one.
      const { data: existingDeposit } = await admin
        .from('payments')
        .select('id')
        .eq('account_id', accountId)
        .eq('job_id', jobId)
        .eq('kind', 'deposit')
        .limit(1)
        .maybeSingle();
      const depositAmount = Math.round(quotedAmount * (depositPercent / 100) * 100) / 100;
      if (!existingDeposit && depositAmount > 0) {
        // Ensure a primary invoice (mirrors the manual deposit flow) so the
        // deposit links to it and the balance math stays correct.
        const invoices = await listInvoices(admin, accountId, jobId);
        const invoice = selectPrimaryInvoice(invoices) ?? await createInvoice(admin, accountId, jobId, 'draft');
        if (Number(invoice.total) <= 0) {
          await addInvoiceItem(admin, accountId, invoice.id, { description: 'Quoted job total', amount: quotedAmount });
        }

        const normalizedPhone = job.client_phone ? normalizeUsPhone(job.client_phone) : null;
        let smsConsent = false;
        if (normalizedPhone) {
          const { data: consent } = await admin
            .from('sms_consent')
            .select('status')
            .eq('account_id', accountId)
            .eq('phone_number', normalizedPhone)
            .maybeSingle();
          smsConsent = consent?.status === 'opted_in';
        }

        const deposit = await createDepositRequest(admin, accountId, jobId, {
          label: `Deposit (${depositPercent}% of quote)`,
          amount: depositAmount,
          kind: 'deposit',
          invoiceId: invoice.id,
          homeownerPhone: normalizedPhone,
          smsConsent,
        });
        await createPaymentFeedEvent(admin, deposit.id, 'payment_requested');
        if (smsConsent) await sendPaymentSmsEvent(deposit.id, 'payment_requested');
      }
    }
  } catch (error) {
    console.error(`Deposit-on-approval failed for job ${jobId}:`, error instanceof Error ? error.message : error);
  }

  const lead = await getLeadByConvertedJob(admin, accountId, jobId);
  if (lead && lead.status !== 'won') {
    await updateLeadStatus(admin, accountId, lead.id, 'won');
  }

  // Best-effort owner alert — approval must never fail because the email failed.
  try {
    const ownerEmail = await getAccountOwnerEmail(admin, accountId);
    if (ownerEmail) {
      const [{ data: account }, { data: site }] = await Promise.all([
        admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
        admin.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
      ]);
      const businessName = pickBusinessName(site, account);
      await sendContractorAlertEmail({
        recipientEmail: ownerEmail,
        businessName,
        subject: `${job.client_name} approved the quote`,
        heading: `${job.client_name} approved the quote`,
        bodyLines: [
          `${job.client_name} approved the quote for ${job.ref}.`,
          ...(quotedAmount > 0 ? [`Quote total: ${formatMoney(quotedAmount)}.`] : []),
          'The job is now marked in progress.',
        ],
        ctaLabel: 'Open the job',
        ctaUrl: `${APP_ORIGIN}/dashboard/jobs/${jobId}`,
        tone: 'info',
      });
    }
  } catch (error) {
    console.error(`Unable to email owner about quote approval for job ${jobId}:`, error);
  }
}

export async function createPaymentFeedEvent(
  supabase: SupabaseClient,
  paymentId: string,
  kind: 'payment_requested' | 'payment_paid' | 'payment_failed' | 'payment_refunded'
): Promise<void> {
  const { data: payment, error } = await supabase
    .from('payments')
    .select('id, account_id, job_id, label, amount')
    .eq('id', paymentId)
    .maybeSingle();

  if (error || !payment) return;

  const titleByKind: Record<typeof kind, string> = {
    payment_requested: 'Payment request sent',
    payment_paid: 'Payment received',
    payment_failed: 'Payment needs attention',
    payment_refunded: 'Payment refunded',
  };

  await createJobFeedEvent(supabase, payment.account_id, payment.job_id, {
    kind,
    title: titleByKind[kind],
    body: payment.label ?? null,
    visibility: 'client_financial',
    amount: Number(payment.amount),
    sourceTable: 'payments',
    sourceId: payment.id,
    actionUrl: `/pay/${payment.id}`,
  });
}

// Chargeback lifecycle events. Deliberately INTERNAL visibility — a dispute is
// between the contractor, the homeowner's bank, and the platform; it must never
// surface on the homeowner's client dashboard. Distinct `kind` per stage so the
// created/won/lost events coexist under job_feed's (source, kind) uniqueness.
export async function createDisputeFeedEvent(
  supabase: SupabaseClient,
  paymentId: string,
  kind: 'payment_disputed' | 'dispute_won' | 'dispute_lost',
  title: string,
  body: string | null
): Promise<void> {
  const { data: payment, error } = await supabase
    .from('payments')
    .select('id, account_id, job_id, amount')
    .eq('id', paymentId)
    .maybeSingle();

  if (error || !payment) return;

  await createJobFeedEvent(supabase, payment.account_id, payment.job_id, {
    kind,
    title,
    body,
    visibility: 'internal',
    amount: Number(payment.amount),
    sourceTable: 'payments',
    sourceId: payment.id,
  });
}