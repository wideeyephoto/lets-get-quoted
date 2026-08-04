import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { createClientJobAccessToken, createJobFeedEvent } from '@/lib/job-feed';
import { sendSelectionRequestEmail } from '@/lib/email';
import { sendSelectionRequestSms } from '@/lib/sms';
import { normalizeUsPhone } from '@/lib/phone';
import { chaseNeeded, chaseMessage, todayKey, type ChaseKind } from '@/lib/selections';

// Telling somebody there is a decision waiting.
//
// The board had none of this. DECISION_CHASE_DAYS existed only to colour a
// label: no sweep, no text, no email, nothing in the digest — so a homeowner
// found out they had a choice to make only if they happened to open their job
// link, and the contractor found out one had been made only by refreshing.
//
// Two rules run through everything here:
//
//   1. ONE message per job. A kitchen with six choices due the same day is one
//      text. Six reads as a malfunction and gets the whole thread muted.
//   2. Nothing is sent for a selection with no options on it. "You have a
//      choice to make" with nothing to choose between wastes the one bit of
//      attention the message buys.

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
/** Bound one cron invocation. */
const MAX_JOBS_PER_RUN = 200;

export type SelectionSendOutcome =
  | { ok: true; channel: 'sms' | 'email'; count: number }
  | { ok: false; reason: 'no_selections' | 'no_contact' | 'disabled' | 'failed'; message?: string };

type JobContact = { id: string; clientName: string; phone: string | null; email: string | null };

/**
 * Send "here are the choices we need from you" for one job.
 *
 * Text if they've opted in and we have a mobile; email otherwise. A fresh link
 * is minted each time — tokens are stored hashed and can't be recovered, and
 * older ones keep working.
 */
export async function sendSelectionRequest(
  admin: SupabaseClient,
  accountId: string,
  jobId: string,
  options: { overdue?: boolean; selectionIds?: string[] } = {},
): Promise<SelectionSendOutcome> {
  const { data: job } = await admin
    .from('jobs')
    .select('id, client_name, client_phone, client_email')
    .eq('account_id', accountId)
    .eq('id', jobId)
    .maybeSingle();
  if (!job) return { ok: false, reason: 'no_contact' };

  const contact: JobContact = {
    id: job.id as string,
    clientName: (job.client_name as string) || 'there',
    phone: normalizeUsPhone(String(job.client_phone ?? '')),
    email: (job.client_email as string | null) || null,
  };

  // Which selections this is actually about: open, with something to pick
  // between. A caller may narrow it further (the sweep passes the ones due).
  const { data: rows } = await admin
    .from('job_selections')
    .select('id')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('status', 'open');
  let ids = (rows ?? []).map((row) => row.id as string);
  if (options.selectionIds) ids = ids.filter((id) => options.selectionIds!.includes(id));
  if (ids.length === 0) return { ok: false, reason: 'no_selections' };

  const { data: optionRows } = await admin
    .from('selection_options')
    .select('selection_id')
    .eq('account_id', accountId)
    .in('selection_id', ids);
  const withOptions = new Set((optionRows ?? []).map((row) => row.selection_id as string));
  const sendable = ids.filter((id) => withOptions.has(id));
  if (sendable.length === 0) return { ok: false, reason: 'no_selections' };

  // Consent is per phone number and checked here rather than assumed, exactly
  // as the quote follow-ups do.
  let canText = false;
  if (contact.phone) {
    const { data: consent } = await admin
      .from('sms_consent')
      .select('status')
      .eq('account_id', accountId)
      .eq('phone', contact.phone)
      .maybeSingle();
    canText = consent?.status === 'opted_in';
  }
  if (!(canText && contact.phone) && !contact.email) return { ok: false, reason: 'no_contact' };

  const [{ data: account }, { data: site }] = await Promise.all([
    admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);
  const businessName = (site?.company_name as string) || (account?.business_name as string) || 'Your contractor';

  const token = await createClientJobAccessToken(admin, accountId, jobId, {
    clientPhone: contact.phone,
    clientEmail: contact.email,
  });
  const url = `${APP_ORIGIN}/client/jobs/${token}`;

  let channel: 'sms' | 'email';
  try {
    if (canText && contact.phone) {
      await sendSelectionRequestSms({
        phone: contact.phone,
        accountId,
        message: chaseMessage({
          businessName,
          clientName: contact.clientName,
          count: sendable.length,
          overdue: Boolean(options.overdue),
          url,
        }),
      });
      channel = 'sms';
    } else {
      await sendSelectionRequestEmail({
        recipientEmail: contact.email as string,
        businessName,
        clientName: contact.clientName,
        count: sendable.length,
        overdue: Boolean(options.overdue),
        url,
        accountId,
      });
      channel = 'email';
    }
  } catch (error) {
    return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : undefined };
  }

  // Stamp AFTER the send. A stamp that lands on a send that failed is a
  // homeowner who is never told at all.
  const stamp = new Date().toISOString();
  await admin
    .from('job_selections')
    .update(options.overdue ? { overdue_sent_at: stamp } : { chase_sent_at: stamp })
    .eq('account_id', accountId)
    .in('id', sendable);

  await createJobFeedEvent(admin, accountId, jobId, {
    kind: 'selection_requested',
    title: channel === 'sms' ? 'Choices texted to the customer' : 'Choices emailed to the customer',
    body: `${sendable.length} ${sendable.length === 1 ? 'choice' : 'choices'} sent to ${contact.clientName}${
      options.overdue ? ' (past the date we needed them)' : ''
    }.`,
    visibility: 'internal',
    meta: { channel, count: sendable.length, overdue: Boolean(options.overdue) },
  }).catch(() => {});

  return { ok: true, channel, count: sendable.length };
}

export type ChaseSweepSummary = { jobs: number; sent: number; skipped: number };

/**
 * The daily chase.
 *
 * Groups everything due on a job into one message, and sends at most two in a
 * selection's life — once as the date approaches, once after it passes. The
 * decision about WHICH is pure (chaseNeeded); this only does the sending.
 */
export async function runSelectionChaseSweep(now: Date = new Date()): Promise<ChaseSweepSummary> {
  const admin = createAdminClient();
  const today = todayKey(now);

  const { data: rows, error } = await admin
    .from('job_selections')
    .select('id, account_id, job_id, status, decide_by, chase_sent_at, overdue_sent_at')
    .eq('status', 'open')
    .not('decide_by', 'is', null)
    .limit(2000);
  if (error || !rows?.length) return { jobs: 0, sent: 0, skipped: 0 };

  // Accounts that switched this off. Read once rather than per row, and
  // tolerant of the column being absent on a pre-migration database.
  const accountIds = [...new Set(rows.map((row) => row.account_id as string))];
  const off = new Set<string>();
  try {
    const { data: accounts } = await admin
      .from('accounts')
      .select('id, selection_reminders_enabled')
      .in('id', accountIds);
    for (const account of accounts ?? []) {
      if (account.selection_reminders_enabled === false) off.add(account.id as string);
    }
  } catch {
    /* pre-migration: nobody has switched it off, because they cannot yet */
  }

  // One bucket per (job, kind). Overdue wins where a job has both, because it
  // is the more urgent sentence and they are getting one message either way.
  const buckets = new Map<string, { accountId: string; jobId: string; kind: ChaseKind; ids: string[] }>();
  let skipped = 0;

  for (const row of rows) {
    const accountId = row.account_id as string;
    if (off.has(accountId)) { skipped += 1; continue; }
    const kind = chaseNeeded(
      {
        status: 'open',
        decideBy: row.decide_by as string,
        chaseSentAt: (row.chase_sent_at as string | null) ?? null,
        overdueSentAt: (row.overdue_sent_at as string | null) ?? null,
      },
      today,
    );
    if (kind === 'none') continue;

    const key = `${row.job_id}:${kind}`;
    const existing = buckets.get(key);
    if (existing) existing.ids.push(row.id as string);
    else buckets.set(key, { accountId, jobId: row.job_id as string, kind, ids: [row.id as string] });
  }

  const jobsWithOverdue = new Set(
    [...buckets.values()].filter((bucket) => bucket.kind === 'overdue').map((bucket) => bucket.jobId),
  );

  let sent = 0;
  let jobs = 0;
  for (const bucket of [...buckets.values()].slice(0, MAX_JOBS_PER_RUN)) {
    // Don't also send the gentler message to a job that is getting the urgent one.
    if (bucket.kind === 'due' && jobsWithOverdue.has(bucket.jobId)) { skipped += bucket.ids.length; continue; }
    jobs += 1;
    const outcome = await sendSelectionRequest(admin, bucket.accountId, bucket.jobId, {
      overdue: bucket.kind === 'overdue',
      selectionIds: bucket.ids,
    });
    if (outcome.ok) sent += 1; else skipped += bucket.ids.length;
  }

  return { jobs, sent, skipped };
}

/**
 * How many homeowners are sitting on a decision, for the daily digest.
 *
 * Counts JOBS, not selections: "3 jobs waiting on choices" is a to-do list, and
 * "11 choices outstanding" is a number nobody can act on.
 */
export async function countJobsAwaitingSelections(
  supabase: SupabaseClient,
  accountId: string,
  today = todayKey(),
): Promise<{ jobs: number; overdue: number }> {
  const { data } = await supabase
    .from('job_selections')
    .select('job_id, decide_by')
    .eq('account_id', accountId)
    .eq('status', 'open')
    .limit(500);
  if (!data?.length) return { jobs: 0, overdue: 0 };

  const jobs = new Set<string>();
  const overdue = new Set<string>();
  for (const row of data) {
    jobs.add(row.job_id as string);
    const decideBy = row.decide_by as string | null;
    if (decideBy && decideBy < today) overdue.add(row.job_id as string);
  }
  return { jobs: jobs.size, overdue: overdue.size };
}
