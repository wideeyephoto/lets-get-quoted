import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { normalizeUsPhone } from '@/lib/phone';
import { formatJobSchedule } from '@/lib/jobs';
import { createJobFeedEvent } from '@/lib/job-feed';
import { resolveAccountForInbound } from '@/lib/messages';
import { sendAppointmentReminderSms } from '@/lib/sms';
import { getAccountOwnerEmail, sendAppointmentReminderEmail, sendReminderRunSummaryEmail } from '@/lib/email';
import { wantsConfirmation } from '@/lib/confirmation-prefs';
import { zonedNowParts } from '@/lib/quick-stop';
import { pickBusinessName } from '@/lib/business-name';
import {
  isReminderHourNow,
  normalizeReminderHour,
  normalizeReminderLeadDays,
  reminderTargetDateKey,
} from '@/lib/appointment-reminders';

// Bound the work one cron invocation will do.
const MAX_SENDS_PER_RUN = 200;

export type ReminderRunSummary = {
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
  reason?: string;
};

/**
 * An account that has reminders switched on, and when it wants them sent.
 *
 * The timezone is not decoration: it is the only thing that turns "9" into a
 * moment. Every account carries one already (accounts.timezone, IANA, defaulted
 * to America/New_York), so there is no case where this is unknown.
 */
type ReminderAccount = {
  id: string;
  timezone: string;
  leadDays: number;
  hour: number;
};

/** The job fields a reminder needs. Anything that can supply these can send one. */
export type RemindableJob = {
  id: string;
  account_id: string;
  ref: string;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  address: string | null;
  scheduled_for: string | null;
  scheduled_time: string | null;
};

export type ReminderSendResult = {
  sent: boolean;
  channel?: 'sms' | 'email';
  /** Why nothing was sent — shown to an owner who pressed a button expecting one. */
  reason?: 'already-reminded' | 'no-channel';
};

/**
 * Remind one customer that their appointment is coming up.
 *
 * Lifted out of the nightly sweep so the sweep and the "remind them now" button
 * on a recurring plan are the same code rather than two implementations of the
 * same message that drift apart on consent, channel choice or wording.
 *
 * `force` is the difference between the two callers. The sweep must never send
 * twice for the same visit date, so it checks the feed first. An owner pressing
 * the button has decided to send this one, and the feed entry it writes then
 * stops tonight's sweep sending a second — a manual reminder REPLACES the
 * automatic one rather than preceding it.
 */
export async function sendJobAppointmentReminder(
  admin: SupabaseClient,
  job: RemindableJob,
  options: { force?: boolean } = {},
): Promise<ReminderSendResult> {
  if (!options.force) {
    const { data: priorReminders } = await admin
      .from('job_feed')
      .select('meta')
      .eq('account_id', job.account_id)
      .eq('job_id', job.id)
      .eq('kind', 'appointment_reminder')
      .order('created_at', { ascending: false })
      .limit(10);
    const alreadyReminded = (priorReminders ?? []).some(
      (row) => (row.meta as { scheduled_for?: string } | null)?.scheduled_for === job.scheduled_for,
    );
    if (alreadyReminded) return { sent: false, reason: 'already-reminded' };
  }

  // Resolve a channel: text an opted-in mobile, else email.
  const phone = job.client_phone ? normalizeUsPhone(job.client_phone) : null;
  let canText = false;
  if (phone) {
    const { data: consent } = await admin
      .from('sms_consent')
      .select('status')
      .eq('account_id', job.account_id)
      .eq('phone_number', phone)
      .maybeSingle();
    canText = consent?.status === 'opted_in';
  }
  const email = job.client_email || null;
  if (!(canText && phone) && !email) return { sent: false, reason: 'no-channel' };

  const [{ data: account }, { data: site }] = await Promise.all([
    admin.from('accounts').select('business_name').eq('id', job.account_id).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', job.account_id).maybeSingle(),
  ]);
  const businessName = pickBusinessName(site, account);
  const firstName = (job.client_name || 'there').trim().split(/\s+/)[0] || 'there';
  const whenLabel = formatJobSchedule(job.scheduled_for, job.scheduled_time);

  let channel: 'sms' | 'email';
  if (canText && phone) {
    await sendAppointmentReminderSms({ phone, businessName, clientName: firstName, whenLabel, address: job.address, accountId: job.account_id });
    channel = 'sms';
  } else {
    await sendAppointmentReminderEmail({ recipientEmail: email as string, businessName, clientName: firstName, whenLabel, address: job.address, jobRef: job.ref, accountId: job.account_id });
    channel = 'email';
  }

  await createJobFeedEvent(admin, job.account_id, job.id, {
    kind: 'appointment_reminder',
    title: channel === 'sms' ? 'Appointment reminder texted' : 'Appointment reminder emailed',
    body: `Reminded ${job.client_name} their appointment is coming up ${whenLabel}.`,
    visibility: 'internal',
    meta: { channel, scheduled_for: job.scheduled_for, scheduled_time: job.scheduled_time ?? null, manual: Boolean(options.force) },
  });

  return { sent: true, channel };
}

/**
 * Sweep for jobs whose reminder is due right now and tell the client.
 *
 * RUNS HOURLY, and only acts for accounts whose OWN clock has reached their
 * chosen hour. It used to run once a day at 22:00 UTC and remind about "one UTC
 * day from now", which meant the send time was a side effect of the cron
 * schedule — 6pm in New York, noon in Honolulu — and was correct at all only
 * because 22:00 UTC falls after the UTC date rollover for every US zone.
 *
 * Still idempotent per (job, scheduled date): a job already reminded for that
 * date is skipped. That property is what makes the catch-up window safe, and
 * what makes a rescheduled job get a fresh reminder for its new day.
 *
 * Best-effort per job so one failure never sinks the run. Opt-in per account.
 */
export async function runAppointmentReminders(now = new Date()): Promise<ReminderRunSummary> {
  const admin = createAdminClient();

  // Accounts that opted in. Defensive: if the columns don't exist yet, bail
  // cleanly rather than throwing.
  const { data: accountRows, error: accountsError } = await admin
    .from('accounts')
    .select('id, timezone, appointment_reminder_lead_days, appointment_reminder_hour')
    .eq('appointment_reminders_enabled', true);
  if (accountsError) {
    return { candidates: 0, sent: 0, skipped: 0, failed: 0, reason: 'reminders not enabled/available' };
  }
  if ((accountRows ?? []).length === 0) {
    return { candidates: 0, sent: 0, skipped: 0, failed: 0, reason: 'no accounts enabled' };
  }

  const accounts: ReminderAccount[] = (accountRows ?? []).map((row) => ({
    id: row.id as string,
    timezone: (row.timezone as string) || 'America/New_York',
    leadDays: normalizeReminderLeadDays((row as { appointment_reminder_lead_days?: unknown }).appointment_reminder_lead_days),
    hour: normalizeReminderHour((row as { appointment_reminder_hour?: unknown }).appointment_reminder_hour),
  }));

  // Whose hour is it? Each account resolves its own local date and time, and
  // then its own target date — two accounts an hour apart can be reminding
  // about different calendar days in the same run, which is the entire point.
  const due = new Map<string, string>();
  for (const account of accounts) {
    const { dateKey, time } = zonedNowParts(now, account.timezone);
    if (!isReminderHourNow(time, account.hour)) continue;
    due.set(account.id, reminderTargetDateKey(dateKey, account.leadDays));
  }
  if (due.size === 0) {
    return { candidates: 0, sent: 0, skipped: 0, failed: 0, reason: 'no account is due this hour' };
  }

  // Group by target date so this is one query per distinct date rather than one
  // per account — in practice every US account due in the same hour shares a
  // date, so this is almost always a single round trip.
  const idsByTarget = new Map<string, string[]>();
  for (const [accountId, target] of due) {
    idsByTarget.set(target, [...(idsByTarget.get(target) ?? []), accountId]);
  }

  const jobs: RemindableJob[] = [];
  for (const [target, accountIds] of idsByTarget) {
    // Still active only — a completed or archived job doesn't need a reminder,
    // and archiving is how this product expresses a cancellation.
    const { data: rows } = await admin
      .from('jobs')
      .select('id, account_id, ref, client_name, client_phone, client_email, address, scheduled_for, scheduled_time, status')
      .eq('scheduled_for', target)
      .in('status', ['new_lead', 'in_progress'])
      .in('account_id', accountIds)
      .limit(1000);
    jobs.push(...((rows ?? []) as RemindableJob[]));
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  // Per-account tallies for the end-of-run summary, so a contractor hears once
  // about their own customers rather than once per customer.
  const byAccount = new Map<string, { sent: number; failed: number }>();
  const tally = (accountId: string, key: 'sent' | 'failed') => {
    const row = byAccount.get(accountId) ?? { sent: 0, failed: 0 };
    row[key] += 1;
    byAccount.set(accountId, row);
  };

  for (const job of jobs) {
    if (sent >= MAX_SENDS_PER_RUN) break;
    try {
      const result = await sendJobAppointmentReminder(admin, job);
      if (!result.sent) {
        skipped++;
        continue;
      }
      sent++;
      tally(job.account_id, 'sent');
    } catch (error) {
      console.error(`Appointment reminder failed for job ${job.id}:`, error instanceof Error ? error.message : error);
      failed++;
      tally(job.account_id, 'failed');
    }
  }

  await sendReminderSummaries(admin, byAccount);

  return { candidates: jobs.length, sent, skipped, failed };
}

export type ConfirmResult = {
  confirmed: boolean;
  job?: { ref: string; whenLabel: string; businessName: string; clientFirst: string };
};

// A client texted "C" (or "confirm"/"yes") — find their most imminent upcoming
// scheduled job for the account that texted them and mark it confirmed. Returns
// confirmed:false (a no-op) when there's nothing to confirm, so the caller just
// treats the text as an ordinary inbound message.
export async function confirmUpcomingAppointment(
  admin: SupabaseClient,
  phone: string,
  toNumber?: string | null,
): Promise<ConfirmResult> {
  // Same routing as the inbox, and for the same reason: confirming the wrong
  // contractor's appointment is worse than mis-filing a message, because a job
  // gets marked confirmed for somebody who never heard from this customer.
  const accountId = await resolveAccountForInbound(admin, phone, toNumber);
  if (!accountId) return { confirmed: false };

  const today = new Date().toISOString().slice(0, 10);
  const { data: jobs } = await admin
    .from('jobs')
    .select('id, ref, client_name, client_phone, scheduled_for, scheduled_time, appointment_confirmed_at')
    .eq('account_id', accountId)
    .gte('scheduled_for', today)
    .in('status', ['new_lead', 'in_progress'])
    .order('scheduled_for', { ascending: true })
    .limit(50);

  const match = (jobs ?? []).find(
    (job) => job.client_phone && normalizeUsPhone(job.client_phone) === phone && !job.appointment_confirmed_at,
  );
  if (!match) return { confirmed: false };

  await admin.from('jobs').update({ appointment_confirmed_at: new Date().toISOString() }).eq('id', match.id);

  const [{ data: account }, { data: site }] = await Promise.all([
    admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);
  const businessName = pickBusinessName(site, account);
  const whenLabel = formatJobSchedule(match.scheduled_for, match.scheduled_time);

  try {
    await createJobFeedEvent(admin, accountId, match.id as string, {
      kind: 'appointment_confirmed',
      title: 'Appointment confirmed by client',
      body: `${match.client_name} confirmed their appointment ${whenLabel} by text.`,
      visibility: 'internal',
    });
  } catch (error) {
    console.error('Appointment confirmed feed event failed:', error instanceof Error ? error.message : error);
  }

  return {
    confirmed: true,
    job: { ref: match.ref as string, whenLabel, businessName, clientFirst: (match.client_name || '').trim().split(/\s+/)[0] || '' },
  };
}

// One summary per account per run, for contractors who opted in. Off by default:
// reminders go out for every job booked tomorrow, so a per-customer confirmation
// would be a stack of mail at 10pm rather than a signal worth reading.
//
// Entirely best-effort — the reminders themselves have already been sent, and a
// failure here must not colour the run's result.
async function sendReminderSummaries(
  admin: SupabaseClient,
  byAccount: Map<string, { sent: number; failed: number }>,
): Promise<void> {
  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'https://letsgetquoted.com').replace(/\/$/, '');
  for (const [accountId, counts] of byAccount) {
    if (counts.sent === 0 && counts.failed === 0) continue;
    try {
      if (!(await wantsConfirmation(admin, accountId, 'reminder_confirmation_email'))) continue;
      const [ownerEmail, { data: account }] = await Promise.all([
        getAccountOwnerEmail(admin, accountId),
        admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
      ]);
      if (!ownerEmail) continue;
      await sendReminderRunSummaryEmail({
        recipientEmail: ownerEmail,
        businessName: (account?.business_name as string) || 'Your business',
        sentCount: counts.sent,
        failedCount: counts.failed,
        dashboardUrl: `${origin}/dashboard/schedule`,
      });
    } catch (error) {
      console.error(`Reminder summary failed for account ${accountId}:`, error instanceof Error ? error.message : error);
    }
  }
}
