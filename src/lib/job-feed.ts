import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { getJob, formatJobSchedule } from '@/lib/jobs';
import type { Invoice } from '@/lib/invoices';
import type { Payment } from '@/lib/payments';

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

export type ClientJobDashboard = {
  businessName: string;
  job: {
    id: string;
    ref: string;
    client_name: string;
    address: string | null;
    status: string;
    scheduled_for: string | null;
    scheduled_time: string | null;
    schedule_label: string;
  };
  feed: JobFeedEvent[];
  payments: Payment[];
  invoices: Invoice[];
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

  const [{ data: account }, { data: site }, { data: job }, feedResult, { data: payments }, { data: invoices }] = await Promise.all([
    admin.from('accounts').select('business_name').eq('id', access.account_id).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', access.account_id).maybeSingle(),
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
  ]);

  if (!job) return null;

  const feed = sortJobFeed([
    ...feedResult,
    ...createLinkedFeedItems(feedResult, (payments ?? []) as Payment[], (invoices ?? []) as Invoice[], access.account_id, access.job_id),
  ]).filter((event) => event.visibility === 'client' || event.visibility === 'client_financial');

  return {
    businessName: site?.company_name || account?.business_name || "Let's Get Quoted contractor",
    job: {
      ...job,
      schedule_label: formatJobSchedule(job.scheduled_for, job.scheduled_time),
    },
    feed,
    payments: (payments ?? []) as Payment[],
    invoices: (invoices ?? []) as Invoice[],
  };
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