import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { normalizeUsPhone } from '@/lib/phone';
import { formatJobSchedule } from '@/lib/jobs';
import { createJobFeedEvent } from '@/lib/job-feed';
import { resolveAccountForPhone } from '@/lib/messages';
import { sendAppointmentReminderSms } from '@/lib/sms';
import { sendAppointmentReminderEmail } from '@/lib/email';

// Bound the work one cron invocation will do.
const MAX_SENDS_PER_RUN = 200;

export type ReminderRunSummary = {
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
  reason?: string;
};

// The date key (YYYY-MM-DD) for "tomorrow" in UTC. The cron runs late-day UTC
// (afternoon in US timezones), so a reminder for tomorrow's job lands the
// afternoon before — the classic day-before nudge.
function tomorrowDateKey(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

// Sweep for jobs scheduled tomorrow and remind the client, texting when they
// have SMS consent and emailing otherwise. Idempotent per (job, scheduled date):
// a job already reminded for that date is skipped, so re-runs — and a job later
// rescheduled to a different day — behave correctly. Best-effort per job so one
// failure never sinks the run. Opt-in per account.
export async function runAppointmentReminders(): Promise<ReminderRunSummary> {
  const admin = createAdminClient();
  const target = tomorrowDateKey();

  // Accounts that opted in. Defensive: if the column doesn't exist yet, bail
  // cleanly rather than throwing.
  const { data: accounts, error: accountsError } = await admin
    .from('accounts')
    .select('id')
    .eq('appointment_reminders_enabled', true);
  if (accountsError) {
    return { candidates: 0, sent: 0, skipped: 0, failed: 0, reason: 'reminders not enabled/available' };
  }
  const enabledIds = new Set((accounts ?? []).map((account) => account.id as string));
  if (enabledIds.size === 0) {
    return { candidates: 0, sent: 0, skipped: 0, failed: 0, reason: 'no accounts enabled' };
  }

  // Jobs scheduled for tomorrow in an enabled account, still active (a completed
  // or archived job doesn't need a reminder).
  const { data: jobs } = await admin
    .from('jobs')
    .select('id, account_id, ref, client_name, client_phone, client_email, address, scheduled_for, scheduled_time, status')
    .eq('scheduled_for', target)
    .in('status', ['new_lead', 'in_progress'])
    .in('account_id', [...enabledIds])
    .limit(1000);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of jobs ?? []) {
    if (sent >= MAX_SENDS_PER_RUN) break;
    try {
      // Idempotency: already reminded for this scheduled date?
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
      if (alreadyReminded) {
        skipped++;
        continue;
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
      if (!(canText && phone) && !email) {
        skipped++;
        continue;
      }

      const [{ data: account }, { data: site }] = await Promise.all([
        admin.from('accounts').select('business_name').eq('id', job.account_id).maybeSingle(),
        admin.from('sites').select('company_name').eq('account_id', job.account_id).maybeSingle(),
      ]);
      const businessName = site?.company_name || account?.business_name || "Let's Get Quoted contractor";
      const firstName = (job.client_name || 'there').trim().split(/\s+/)[0] || 'there';
      const whenLabel = formatJobSchedule(job.scheduled_for, job.scheduled_time);

      let channel: 'sms' | 'email';
      if (canText && phone) {
        await sendAppointmentReminderSms({ phone, businessName, clientName: firstName, whenLabel, address: job.address, accountId: job.account_id });
        channel = 'sms';
      } else {
        await sendAppointmentReminderEmail({ recipientEmail: email as string, businessName, clientName: firstName, whenLabel, address: job.address, jobRef: job.ref });
        channel = 'email';
      }

      await createJobFeedEvent(admin, job.account_id, job.id, {
        kind: 'appointment_reminder',
        title: channel === 'sms' ? 'Appointment reminder texted' : 'Appointment reminder emailed',
        body: `Reminded ${job.client_name} their appointment is coming up ${whenLabel}.`,
        visibility: 'internal',
        meta: { channel, scheduled_for: job.scheduled_for, scheduled_time: job.scheduled_time ?? null },
      });
      sent++;
    } catch (error) {
      console.error(`Appointment reminder failed for job ${job.id}:`, error instanceof Error ? error.message : error);
      failed++;
    }
  }

  return { candidates: (jobs ?? []).length, sent, skipped, failed };
}

export type ConfirmResult = {
  confirmed: boolean;
  job?: { ref: string; whenLabel: string; businessName: string; clientFirst: string };
};

// A client texted "C" (or "confirm"/"yes") — find their most imminent upcoming
// scheduled job for the account that texted them and mark it confirmed. Returns
// confirmed:false (a no-op) when there's nothing to confirm, so the caller just
// treats the text as an ordinary inbound message.
export async function confirmUpcomingAppointment(admin: SupabaseClient, phone: string): Promise<ConfirmResult> {
  const accountId = await resolveAccountForPhone(admin, phone);
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
  const businessName = site?.company_name || account?.business_name || "Let's Get Quoted contractor";
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
