import { createAdminClient } from '@/lib/auth';
import { arrivalSettingsFromAccount, firstName, formatClockTime, zonedInstant, type ArrivalSettings } from '@/lib/arrival';
import { accountToday } from '@/lib/route-plan-day';
import { sendPushToCrew } from '@/lib/push';
import { sendArrivalSms } from '@/lib/sms';

// The two things that happen without anybody pressing a button.
//
// Both are deliberately conservative. A system that texts customers and buzzes
// staff on a timer earns distrust fast, so each of these fires at most once per
// thing, skips anything already handled by a human, and does nothing at all
// unless the account opted in.

// -- Running late -------------------------------------------------------------

/**
 * How far past the promised window before we say anything.
 *
 * Not zero. A tech pulling into the driveway at the exact moment their window
 * closes does not need a phone buzzing at them, and a notification that fires
 * on a technicality is one that gets swiped away forever after.
 */
export const LATE_GRACE_MINUTES = 5;

export type LateSweepSummary = { checked: number; notified: number; skipped: number };

/**
 * Nudge the person who can still fix it.
 *
 * Notifies the CREW, never the customer. An automatic "your contractor is
 * running late" text is the system apologising on somebody's behalf for
 * something they might already be handling — the tech gets told, and they
 * decide what the customer hears. That is the whole difference between this and
 * an automated excuse generator.
 */
export async function runLateArrivalSweep(now = new Date()): Promise<LateSweepSummary> {
  const admin = createAdminClient();
  const cutoff = new Date(now.getTime() - LATE_GRACE_MINUTES * 60_000).toISOString();

  const { data, error } = await admin
    .from('job_tracking')
    .select('id, account_id, job_id, crew_id, sent_by, arrival_end, status, late_notified_at')
    .in('status', ['en_route', 'delayed'])
    .not('arrival_end', 'is', null)
    .lt('arrival_end', cutoff)
    .is('late_notified_at', null)
    .limit(200);

  if (error || !data?.length) return { checked: 0, notified: 0, skipped: 0 };

  let notified = 0;
  let skipped = 0;

  for (const row of data) {
    // Stamp FIRST. A push that fails is a lost nudge; a stamp that fails is a
    // notification loop every fifteen minutes until the tech turns them off.
    const { error: stampError } = await admin
      .from('job_tracking')
      .update({ late_notified_at: now.toISOString() })
      .eq('id', row.id)
      .is('late_notified_at', null);
    if (stampError) { skipped += 1; continue; }

    if (!row.crew_id) { skipped += 1; continue; }

    const { data: job } = await admin
      .from('jobs').select('client_name').eq('id', row.job_id).maybeSingle();
    const who = firstName((job?.client_name as string | undefined) ?? '') || 'your customer';
    const over = Math.round((now.getTime() - new Date(row.arrival_end as string).getTime()) / 60_000);

    const sent = await sendPushToCrew(row.account_id as string, row.crew_id as string, {
      title: `You're ${over} min past the time you gave`,
      body: `${who} was told you'd be there by now. Send an updated time?`,
      url: `/field/jobs/${row.job_id}`,
      tag: `arrival-late-${row.id}`,
    }).catch(() => 0);

    if (sent > 0) notified += 1; else skipped += 1;
  }

  return { checked: data.length, notified, skipped };
}

// -- Morning-of confirmation --------------------------------------------------

export type MorningSweepSummary = { accounts: number; sent: number; skipped: number };

/**
 * Tell today's customers their window, before anybody sets off.
 *
 * Distinct from the day-before appointment reminder, which says "you have an
 * appointment tomorrow". This says "today, between 9 and 11" — the thing a
 * person actually plans their morning around.
 *
 * Skipped for any job whose crew has already sent an "on my way": a
 * "we'll be there today" text arriving after "I'm 15 minutes out" is the system
 * talking over its own users.
 */
export async function runMorningConfirmationSweep(now = new Date()): Promise<MorningSweepSummary> {
  const admin = createAdminClient();

  const { data: accounts, error } = await admin
    .from('accounts')
    .select('id, business_name, timezone, arrival_window_style, arrival_window_minutes, arrival_message_template, arrival_location_policy, arrival_location_precision, arrival_link_hours, arrival_default_minutes')
    .eq('arrival_morning_confirmation', true);

  if (error || !accounts?.length) return { accounts: 0, sent: 0, skipped: 0 };

  let sent = 0;
  let skipped = 0;

  for (const account of accounts) {
    const settings = arrivalSettingsFromAccount(account as Record<string, unknown>);
    const today = accountToday(settings.timeZone, now);

    const { data: jobs } = await admin
      .from('jobs')
      .select('id, client_name, client_phone, scheduled_for, scheduled_time, status')
      .eq('account_id', account.id)
      .eq('scheduled_for', today)
      .is('arrival_confirm_sent_at', null)
      .not('client_phone', 'is', null)
      .in('status', ['new_lead', 'in_progress'])
      .limit(100);

    const { data: site } = await admin
      .from('sites').select('company_name').eq('account_id', account.id).limit(1).maybeSingle();
    const businessName = (site?.company_name as string | undefined)
      || (account.business_name as string | undefined) || 'Your contractor';

    for (const job of jobs ?? []) {
      // No time on the job means no window to confirm, and "sometime today" is
      // not worth a text message.
      if (!job.scheduled_time) { skipped += 1; continue; }

      // Already announced by a human — don't talk over them.
      const { data: live } = await admin
        .from('job_tracking')
        .select('id')
        .eq('job_id', job.id)
        .in('status', ['en_route', 'delayed', 'arrived'])
        .limit(1)
        .maybeSingle();
      if (live) { skipped += 1; continue; }

      // Stamp first, for the same reason as the late sweep: a duplicate text to
      // a customer is worse than a missed one.
      const { error: stampError } = await admin
        .from('jobs')
        .update({ arrival_confirm_sent_at: now.toISOString() })
        .eq('id', job.id)
        .is('arrival_confirm_sent_at', null);
      if (stampError) { skipped += 1; continue; }

      const label = morningWindowLabel(today, job.scheduled_time as string, settings);
      const message =
        `${businessName}: ${firstName((job.client_name as string) ?? '')}, we're booked in with you today` +
        `${label ? ` — arriving ${label}` : ''}. We'll text you when we're on the way. Reply STOP to opt out.`;

      const outcome = await sendArrivalSms({
        accountId: account.id as string,
        phone: job.client_phone as string,
        message,
      });
      if (outcome.status === 'sent') sent += 1; else skipped += 1;
    }
  }

  return { accounts: accounts.length, sent, skipped };
}

/**
 * The window for a scheduled time, in the account's own timezone.
 *
 * The appointment time is the START of the window here, not its middle — same
 * rule as a live "on my way", so a customer never hears two different shapes of
 * promise from the same business.
 */
export function morningWindowLabel(
  day: string,
  scheduledTime: string,
  settings: Pick<ArrivalSettings, 'windowStyle' | 'windowMinutes' | 'timeZone'>,
): string | null {
  const start = zonedInstant(day, scheduledTime, settings.timeZone);
  if (!start) return null;

  const startLabel = formatClockTime(start, settings.timeZone);
  if (settings.windowStyle !== 'window' || settings.windowMinutes <= 0) return `around ${startLabel}`;
  const end = new Date(start.getTime() + settings.windowMinutes * 60_000);
  return `between ${startLabel} and ${formatClockTime(end, settings.timeZone)}`;
}
