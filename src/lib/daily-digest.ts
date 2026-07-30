import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { getAccountOwnerEmail, sendDailyDigestEmail } from '@/lib/email';
import { countRebookCandidates } from '@/lib/rebook';
import { formatJobTime } from '@/lib/jobs';

// Owner "here's your business today" digest — one email that ties together the
// day's money, pipeline, schedule, and reputation so the app reads as one
// system. Opt-in per account; only sends on days with something to report.

const DAY_MS = 24 * 60 * 60 * 1000;
const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
// Bound the accounts one cron invocation processes.
const MAX_ACCOUNTS_PER_RUN = 500;

export type DigestJob = { clientName: string; time: string | null; ref: string };

export type DailyDigest = {
  dateLabel: string;
  // Whether anything happened in the last 24h (or is scheduled today) worth an
  // email. Standing states (open requests, rebook-due) are shown as context but
  // don't, on their own, trigger a send — so a quiet day stays quiet.
  hasSignal: boolean;
  moneyInCount: number;
  moneyInTotal: number;
  openRequestsCount: number;
  openRequestsTotal: number;
  failedCount: number;
  failedTotal: number;
  newLeads: number;
  quotesApproved: number;
  confirmations: number;
  newReviews: number;
  newReviewsAvg: number | null;
  privateFeedback: number;
  todaysJobs: DigestJob[];
  todaysJobsCount: number;
  rebookDue: number;
};

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Compute the digest for one account. Works with either the owner session client
// (Settings "send test" preview) or the admin client (cron) — every read is
// account-scoped, which owners can do and the admin client bypasses.
export async function buildDailyDigest(supabase: SupabaseClient, accountId: string, now: Date = new Date()): Promise<DailyDigest> {
  const cutoff = new Date(now.getTime() - DAY_MS).toISOString();
  const todayKey = utcDateKey(now);

  const [
    { data: paidRows },
    { data: openRows },
    { data: failedRows },
    { count: leadCount },
    { count: approvedCount },
    { count: confirmedCount },
    { data: reviewRows },
    { data: todayJobRows },
  ] = await Promise.all([
    supabase.from('payments').select('amount').eq('account_id', accountId).eq('status', 'paid').gte('paid_at', cutoff),
    supabase.from('payments').select('amount').eq('account_id', accountId).in('status', ['requested', 'processing']),
    supabase.from('payments').select('amount').eq('account_id', accountId).eq('status', 'failed').gte('requested_at', cutoff),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('account_id', accountId).gte('created_at', cutoff),
    supabase.from('job_feed').select('id', { count: 'exact', head: true }).eq('account_id', accountId).eq('kind', 'quote_approved').gte('created_at', cutoff),
    supabase.from('job_feed').select('id', { count: 'exact', head: true }).eq('account_id', accountId).eq('kind', 'appointment_confirmed').gte('created_at', cutoff),
    supabase.from('review_invites').select('rating, routed_to, responded_at').eq('account_id', accountId).gte('responded_at', cutoff),
    supabase.from('jobs').select('ref, client_name, scheduled_time').eq('account_id', accountId).eq('scheduled_for', todayKey).in('status', ['new_lead', 'in_progress']).order('scheduled_time', { ascending: true }).limit(25),
  ]);

  const sum = (rows: { amount: unknown }[] | null | undefined) => (rows ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const moneyInCount = (paidRows ?? []).length;
  const moneyInTotal = sum(paidRows);
  const openRequestsCount = (openRows ?? []).length;
  const openRequestsTotal = sum(openRows);
  const failedCount = (failedRows ?? []).length;
  const failedTotal = sum(failedRows);
  const newLeads = leadCount ?? 0;
  const quotesApproved = approvedCount ?? 0;
  const confirmations = confirmedCount ?? 0;

  const reviews = reviewRows ?? [];
  const rated = reviews.filter((r) => typeof r.rating === 'number' && (r.rating as number) >= 1);
  const newReviews = rated.length;
  const newReviewsAvg = newReviews > 0 ? Math.round((rated.reduce((s, r) => s + (r.rating as number), 0) / newReviews) * 10) / 10 : null;
  const privateFeedback = reviews.filter((r) => r.routed_to === 'private').length;

  const todaysJobs: DigestJob[] = (todayJobRows ?? []).map((j) => ({
    clientName: (j.client_name as string) || 'Client',
    time: formatJobTime(j.scheduled_time as string | null) || null,
    ref: (j.ref as string) || '',
  }));
  const todaysJobsCount = todaysJobs.length;

  // Best-effort: rebook-due is a heavier aggregate and shouldn't sink the digest.
  let rebookDue = 0;
  try { rebookDue = await countRebookCandidates(supabase, accountId); } catch { rebookDue = 0; }

  const hasSignal =
    moneyInCount > 0 || failedCount > 0 || newLeads > 0 || quotesApproved > 0 ||
    confirmations > 0 || newReviews > 0 || privateFeedback > 0 || todaysJobsCount > 0;

  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return {
    dateLabel, hasSignal,
    moneyInCount, moneyInTotal, openRequestsCount, openRequestsTotal, failedCount, failedTotal,
    newLeads, quotesApproved, confirmations, newReviews, newReviewsAvg, privateFeedback,
    todaysJobs, todaysJobsCount, rebookDue,
  };
}

export type DigestRunSummary = { accounts: number; sent: number; skippedQuiet: number; skippedNoEmail: number; failed: number; reason?: string };

// Resolve an account's display name for the digest subject/header.
async function resolveBusinessName(admin: SupabaseClient, accountId: string): Promise<string> {
  const [{ data: site }, { data: account }] = await Promise.all([
    admin.from('sites').select('company_name').eq('account_id', accountId).limit(1).maybeSingle(),
    admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
  ]);
  return site?.company_name || account?.business_name || 'Your business';
}

// Daily cron entry point. For each opted-in account, build the digest and email
// the owner when there's something to report. Idempotent per UTC day via
// accounts.last_digest_date, and best-effort per account.
export async function runDailyDigests(now: Date = new Date()): Promise<DigestRunSummary> {
  const admin = createAdminClient();
  const todayKey = utcDateKey(now);

  // Filter "already sent today" IN the query (not after the limit) and sort
  // un-served accounts first, so with more than MAX_ACCOUNTS_PER_RUN opted-in
  // owners the tail can't be starved of digests. todayKey is our own YYYY-MM-DD.
  const { data: accounts, error } = await admin
    .from('accounts')
    .select('id, last_digest_date')
    .eq('daily_digest_enabled', true)
    .or(`last_digest_date.is.null,last_digest_date.neq.${todayKey}`)
    .order('last_digest_date', { ascending: true, nullsFirst: true })
    .limit(MAX_ACCOUNTS_PER_RUN);
  if (error) {
    return { accounts: 0, sent: 0, skippedQuiet: 0, skippedNoEmail: 0, failed: 0, reason: 'digest not enabled/available' };
  }
  const due = (accounts ?? []).filter((a) => (a.last_digest_date as string | null) !== todayKey);
  if (due.length === 0) {
    return { accounts: 0, sent: 0, skippedQuiet: 0, skippedNoEmail: 0, failed: 0, reason: 'nothing due' };
  }

  let sent = 0, skippedQuiet = 0, skippedNoEmail = 0, failed = 0;
  for (const account of due) {
    const accountId = account.id as string;
    try {
      // Stamp the date up front so a concurrent/retried run doesn't double-send,
      // regardless of whether this account ends up quiet.
      await admin.from('accounts').update({ last_digest_date: todayKey }).eq('id', accountId);

      const digest = await buildDailyDigest(admin, accountId, now);
      if (!digest.hasSignal) { skippedQuiet++; continue; }

      const to = await getAccountOwnerEmail(admin, accountId);
      if (!to) { skippedNoEmail++; continue; }

      const businessName = await resolveBusinessName(admin, accountId);
      await sendDailyDigestEmail({
        recipientEmail: to,
        businessName,
        digest,
        dashboardUrl: `${APP_ORIGIN}/dashboard`,
        manageUrl: `${APP_ORIGIN}/dashboard/settings#daily-digest`,
      });
      sent++;
    } catch (err) {
      failed++;
      console.error(`Daily digest failed for account ${accountId}:`, err instanceof Error ? err.message : err);
    }
  }

  return { accounts: due.length, sent, skippedQuiet, skippedNoEmail, failed };
}

// Owner-triggered "send me a test digest now" from Settings. Builds the digest
// for the signed-in owner's account and emails it to them (does NOT stamp
// last_digest_date — a preview, not the daily send).
export async function sendTestDigest(supabase: SupabaseClient, accountId: string): Promise<{ ok: boolean; message: string }> {
  const admin = createAdminClient();
  // Send to the account owner's login email (resolved via the membership).
  const to = await getAccountOwnerEmail(admin, accountId);
  if (!to) return { ok: false, message: 'No email on file to send a test digest to.' };
  const digest = await buildDailyDigest(supabase, accountId);
  const businessName = await resolveBusinessName(admin, accountId);
  await sendDailyDigestEmail({
    recipientEmail: to,
    businessName,
    digest,
    dashboardUrl: `${APP_ORIGIN}/dashboard`,
    manageUrl: `${APP_ORIGIN}/dashboard/settings#daily-digest`,
    isTest: true,
  });
  return { ok: true, message: `Sent a test digest to ${to}.` };
}
