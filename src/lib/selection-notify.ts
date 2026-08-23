import type { SupabaseClient } from '@supabase/supabase-js';
import { createClientJobAccessToken, createJobFeedEvent } from '@/lib/job-feed';
import { sendSelectionRequestEmail } from '@/lib/email';
import { sendSelectionRequestSms } from '@/lib/sms';
import { normalizeUsPhone } from '@/lib/phone';
import { pickBusinessName } from '@/lib/business-name';
import { isJobRemindable } from '@/lib/choice-reminders';
import { selectionRequestText } from '@/lib/sms-templates';
import { todayKey } from '@/lib/selections';

// "Here is the board." The contractor pressing send, once.
//
// The SCHEDULED chasing that used to live here is gone to lib/choice-reminders
// (the rules) and lib/choice-reminder-sweep (the sending). Two jobs in one file
// had become the source of the trouble: this one shares a board on demand, that
// one nags on a schedule, and they were sharing both a message and a pair of
// timestamps that only one of them should ever have owned.
//
// WHAT THAT SEPARATION FIXED, beyond tidiness:
//
//   Pressing "Send these to them" used to stamp chase_sent_at on EVERY open,
//   dated choice on the job — the sweep's own bookkeeping, written by a button
//   that is not the sweep. One press therefore suppressed the first scheduled
//   reminder for every choice on that job, permanently and invisibly, including
//   for deadlines weeks away. Reminder state now lives in selection_reminders,
//   which nothing but the sweep writes, so this function cannot silence it.

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

export type SelectionSendOutcome =
  | { ok: true; channel: 'sms' | 'email'; count: number }
  | { ok: false; reason: 'no_selections' | 'no_contact' | 'job_closed' | 'opted_out' | 'disabled' | 'failed'; message?: string };

type JobContact = {
  id: string;
  clientName: string;
  phone: string | null;
  email: string | null;
  status: string;
};

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
    // `status` was missing from this list, which is why nothing here could ever
    // check it — see the job_closed guard below.
    .select('id, client_name, client_phone, client_email, status')
    .eq('account_id', accountId)
    .eq('id', jobId)
    .maybeSingle();
  if (!job) return { ok: false, reason: 'no_contact' };

  const contact: JobContact = {
    id: job.id as string,
    clientName: (job.client_name as string) || 'there',
    phone: normalizeUsPhone(String(job.client_phone ?? '')),
    email: (job.client_email as string | null) || null,
    status: (job.status as string) ?? 'in_progress',
  };

  // A finished or cancelled job needs no decisions. `archived` is how this
  // product files a cancellation, so both are a hard stop — asking a homeowner
  // to pick tile for a job that was called off is the worst message this
  // feature could send, and it was previously possible from this button and
  // from the sweep alike.
  if (!isJobRemindable(contact)) return { ok: false, reason: 'job_closed' };

  // Which selections this is actually about: open, with something to pick
  // between. A caller may narrow it further.
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

  // Consent is per phone number and checked here rather than assumed.
  //
  // THIS QUERY WAS WRONG FOR THE WHOLE LIFE OF THE FEATURE. It filtered on
  // `phone`, and the column is `phone_number` — so PostgREST rejected it, the
  // error was dropped on the floor by a destructure that took only `data`, and
  // canText was false for every customer who ever existed. Choice requests have
  // therefore been email-only since they shipped, and a homeowner with a mobile,
  // a recorded opt-in and no email address was told "there is nowhere to send
  // it". The error is captured now precisely so this class of bug cannot be
  // silent a second time.
  let canText = false;
  let optedOut = false;
  if (contact.phone) {
    const { data: consent, error } = await admin
      .from('sms_consent')
      .select('status')
      .eq('account_id', accountId)
      .eq('phone_number', contact.phone)
      .maybeSingle();
    if (error) {
      // Fail closed, and say so out loud. Unreadable consent means we do not text.
      console.error('Selection consent lookup failed:', error.message);
    } else {
      canText = consent?.status === 'opted_in';
      optedOut = consent?.status === 'opted_out';
    }
  }
  if (!(canText && contact.phone) && !contact.email) {
    return { ok: false, reason: optedOut ? 'opted_out' : 'no_contact' };
  }

  const [{ data: account }, { data: site }] = await Promise.all([
    admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);
  const businessName = pickBusinessName(site, account);

  const token = await createClientJobAccessToken(admin, accountId, jobId, {
    clientPhone: contact.phone,
    clientEmail: contact.email,
  });
  const url = `${APP_ORIGIN}/client/jobs/${token}`;

  let channel: 'sms' | 'email';
  let smsEventId: string | null = null;
  try {
    if (canText && contact.phone) {
      smsEventId = await sendSelectionRequestSms({
        phone: contact.phone,
        accountId,
        message: selectionRequestText({
          businessName,
          clientName: contact.clientName,
          count: sendable.length,
          overdue: Boolean(options.overdue),
          url,
        }),
        // The persisted portal token is the identity of this deliberate send.
        // A later resend mints a new token (and therefore a new message intent),
        // while retries inside this action resolve to the same durable event.
        idempotencyKey: `selection-request:${jobId}:${token}`,
      });
      // null means the number opted out between the consent read and the send.
      // Reporting that as a successful text is how a contractor comes to believe
      // a customer was told something they were not.
      if (smsEventId === null) return { ok: false, reason: 'opted_out' };
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

  await createJobFeedEvent(admin, accountId, jobId, {
    kind: 'selection_requested',
    title: channel === 'sms' ? 'Choices queued for the customer' : 'Choices emailed to the customer',
    body: `${sendable.length} ${sendable.length === 1 ? 'choice' : 'choices'} ${channel === 'sms' ? 'queued for' : 'sent to'} ${contact.clientName}${
      options.overdue ? ' (past the date we needed them)' : ''
    }.`,
    visibility: 'internal',
    meta: {
      channel,
      count: sendable.length,
      overdue: Boolean(options.overdue),
      delivery_state: channel === 'sms' ? 'queued' : 'sent',
      sms_event_id: smsEventId,
    },
  }).catch(() => {});

  return { ok: true, channel, count: sendable.length };
}

/**
 * How many homeowners are sitting on a decision, for the daily digest.
 *
 * Counts JOBS, not selections: "3 jobs waiting on choices" is a to-do list, and
 * "11 choices outstanding" is a number nobody can act on.
 *
 * Completed and archived jobs are excluded. They were not, which is how a
 * contractor's morning digest came to list jobs they finished last month as
 * still waiting on the customer.
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

  const jobIds = [...new Set(data.map((row) => row.job_id as string))];
  const { data: jobRows } = await supabase
    .from('jobs')
    .select('id, status')
    .eq('account_id', accountId)
    .in('id', jobIds);
  const live = new Set(
    ((jobRows ?? []) as { id: string; status: string }[])
      .filter((job) => isJobRemindable(job))
      .map((job) => job.id),
  );

  const jobs = new Set<string>();
  const overdue = new Set<string>();
  for (const row of data) {
    const jobId = row.job_id as string;
    if (!live.has(jobId)) continue;
    jobs.add(jobId);
    const decideBy = row.decide_by as string | null;
    if (decideBy && decideBy < today) overdue.add(jobId);
  }
  return { jobs: jobs.size, overdue: overdue.size };
}
