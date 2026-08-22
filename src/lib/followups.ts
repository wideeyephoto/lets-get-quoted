import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import { normalizeUsPhone } from '@/lib/phone';
import { createClientJobAccessToken, createJobFeedEvent } from '@/lib/job-feed';
import { sendQuoteFollowupSms } from '@/lib/sms';
import { sendQuoteFollowupEmail } from '@/lib/email';
import { pickBusinessName } from '@/lib/business-name';
import { zonedNowParts } from '@/lib/quick-stop';
import {
  dayKeyDiff,
  dueFollowupIndex,
  followupMaxAgeDays,
  followupSettingsFromAccount,
  isFollowupHourNow,
  isFollowupWindowOpen,
  isWeekendDateKey,
  type FollowupSettings,
} from '@/lib/quote-followups';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

// Bound the work one cron invocation will do.
const MAX_SENDS_PER_RUN = 100;

export type FollowupRunSummary = {
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
};

/** An account with follow-ups switched on, and the schedule it chose. */
type FollowupAccount = FollowupSettings & {
  id: string;
  timezone: string;
  /** The account's own local date this run — what "days since the quote" counts to. */
  todayKey: string;
};

/** The columns every read of the follow-up settings needs. */
const FOLLOWUP_SETTINGS_COLUMNS =
  'id, timezone, quote_followup_days, quote_followup_hour, quote_followup_channel, quote_followup_skip_weekends';

/**
 * Quotes this account would be chasing if follow-ups were on.
 *
 * Shown on the Automations card before you flip the switch, because "turn this
 * on and see what happens" is a bad deal when what happens is texts to real
 * customers. A number here turns it into a decision: three open quotes, so three
 * people hear from you.
 *
 * Counts the same population the sweep does — an unrevoked client link on a job
 * still in the quote stage, shared inside the window the schedule covers — minus
 * the per-job checks the sweep can only make one at a time. It is therefore an
 * upper bound, and the card says "up to".
 */
export async function countEligibleQuotes(
  client: SupabaseClient,
  accountId: string,
): Promise<number> {
  const { data: accountRow } = await client
    .from('accounts')
    .select(FOLLOWUP_SETTINGS_COLUMNS)
    .eq('id', accountId)
    .maybeSingle();
  const settings = followupSettingsFromAccount(accountRow as Record<string, unknown> | null);

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const sharedAfter = new Date(now - followupMaxAgeDays(settings.days) * 24 * 60 * 60 * 1000).toISOString();

  const { data: links } = await client
    .from('client_job_access')
    .select('job_id, created_at')
    .eq('account_id', accountId)
    .is('revoked_at', null)
    .gte('created_at', sharedAfter)
    .or(`expires_at.is.null,expires_at.gte.${nowIso}`)
    .limit(500);
  const jobIds = Array.from(new Set((links ?? []).map((link) => link.job_id as string)));
  if (jobIds.length === 0) return 0;

  // Still in the quote stage — approval promotes a job to in_progress, which is
  // the same test the sweep applies.
  const { count } = await client
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('status', 'new_lead')
    .in('id', jobIds);
  return count ?? 0;
}

/**
 * Sweep for quotes that were shared with a client but never approved, and nudge
 * the client to review them.
 *
 * RUNS HOURLY, and only acts for accounts whose OWN clock has reached their
 * chosen hour. It used to run once a day at 16:00 UTC, which meant the send time
 * was a side effect of the cron schedule — 11am in New York, 8am in Los Angeles,
 * 6am in Honolulu.
 *
 * ABSOLUTE DAY OFFSETS, not relative gaps. The old sweep nudged when it had been
 * two days since the share and three days since the last nudge, which matches
 * "day 2 and day 5" only if every run lands on time. A quote first seen on day 9
 * got the first nudge on day 9 and the second on day 12, while the settings card
 * promised day 2 and day 5. Now the schedule is read literally and a missed day
 * is skipped rather than replayed late — see dueFollowupIndex.
 *
 * Best-effort per job so one failure never sinks the run. Opt-in per account.
 */
export async function runStalledQuoteFollowups(now = new Date()): Promise<FollowupRunSummary & { reason?: string }> {
  const admin = createAdminClient();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  // Accounts that opted in. Defensive: if the columns don't exist yet, bail
  // cleanly rather than throwing.
  const { data: accountRows, error: accountsError } = await admin
    .from('accounts')
    .select(FOLLOWUP_SETTINGS_COLUMNS)
    .eq('quote_followups_enabled', true);
  if (accountsError) {
    return { candidates: 0, sent: 0, skipped: 0, failed: 0, reason: 'followups not enabled/available' };
  }
  if ((accountRows ?? []).length === 0) {
    return { candidates: 0, sent: 0, skipped: 0, failed: 0, reason: 'no accounts enabled' };
  }

  // Whose hour is it? Each account resolves its own local date and time, so two
  // accounts an hour apart can be chasing different calendar days in one run.
  const due = new Map<string, FollowupAccount>();
  for (const row of accountRows ?? []) {
    const settings = followupSettingsFromAccount(row as Record<string, unknown>);
    const timezone = ((row as { timezone?: string }).timezone as string) || 'America/New_York';
    const { dateKey, time } = zonedNowParts(now, timezone);
    if (!isFollowupHourNow(time, settings.hour)) continue;
    // A weekend skip is a wait, not a cancellation: nothing is sent today, and
    // Monday's run finds the same quote a day or two further along and sends the
    // nudge that is due by then.
    if (settings.skipWeekends && isWeekendDateKey(dateKey)) continue;
    due.set(row.id as string, { ...settings, id: row.id as string, timezone, todayKey: dateKey });
  }
  if (due.size === 0) {
    return { candidates: 0, sent: 0, skipped: 0, failed: 0, reason: 'no account is due this hour' };
  }

  // One query for every due account, bounded by the widest schedule among them;
  // the per-account window is applied below, where that account's own days are
  // in hand.
  //
  // A DAY OF SLACK ON EACH EDGE, because these bounds are elapsed milliseconds
  // and the real test is calendar days in the account's zone. A quote shared at
  // 11pm is one local day old after 60 elapsed minutes, and an exact ms bound
  // would filter it out before dueFollowupIndex ever got to say so. Widening
  // cannot over-send: every row this admits still has to pass the local-calendar
  // window and the schedule below.
  const earliestFirstDay = Math.min(...Array.from(due.values(), (account) => account.days[0]));
  const widestMaxAge = Math.max(...Array.from(due.values(), (account) => followupMaxAgeDays(account.days)));
  const DAY = 24 * 60 * 60 * 1000;
  const sharedBefore = new Date(nowMs - Math.max(0, earliestFirstDay - 1) * DAY).toISOString();
  const sharedAfter = new Date(nowMs - (widestMaxAge + 1) * DAY).toISOString();

  // Active client links shared inside the follow-up window.
  const { data: links } = await admin
    .from('client_job_access')
    .select('account_id, job_id, client_phone, client_email, created_at')
    .is('revoked_at', null)
    .lte('created_at', sharedBefore)
    .gte('created_at', sharedAfter)
    .in('account_id', Array.from(due.keys()))
    .or(`expires_at.is.null,expires_at.gte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(1000);

  // One entry per job (earliest share = when the quote first went out).
  const byJob = new Map<string, { account_id: string; job_id: string; client_phone: string | null; client_email: string | null; created_at: string }>();
  for (const link of links ?? []) {
    if (!due.has(link.account_id)) continue;
    if (!byJob.has(link.job_id)) byJob.set(link.job_id, link);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const [jobId, link] of byJob) {
    if (sent >= MAX_SENDS_PER_RUN) break;
    const account = due.get(link.account_id);
    if (!account) {
      skipped++;
      continue;
    }
    try {
      // Days counted in the account's own calendar, not in elapsed milliseconds:
      // a quote shared at 11pm Monday is one day old on Tuesday morning, which is
      // what "day 1" means to the person who sent it.
      const sharedKey = zonedNowParts(new Date(link.created_at), account.timezone).dateKey;
      const daysSinceShare = dayKeyDiff(sharedKey, account.todayKey);
      if (!isFollowupWindowOpen(daysSinceShare, account.days)) {
        skipped++;
        continue;
      }

      const job = await getJob(admin, link.account_id, jobId);
      // Only quotes still in the quote stage — approval promotes to in_progress.
      if (!job || job.status !== 'new_lead') {
        skipped++;
        continue;
      }

      // Belt-and-suspenders: never nudge an already-approved quote.
      const { data: approved } = await admin
        .from('job_feed')
        .select('id')
        .eq('account_id', link.account_id)
        .eq('job_id', jobId)
        .eq('kind', 'quote_approved')
        .limit(1)
        .maybeSingle();
      if (approved) {
        skipped++;
        continue;
      }

      // How far through the schedule this quote already is. Taken from the
      // highest followup_number rather than a row count, because skipping a
      // missed day makes the two disagree — three rows can end at number 3 while
      // two rows can also end at number 3. Legacy rows written before the number
      // existed fall back to the count, which is what they meant.
      const { data: prior } = await admin
        .from('job_feed')
        .select('created_at, meta')
        .eq('account_id', link.account_id)
        .eq('job_id', jobId)
        .eq('kind', 'quote_followup')
        .order('created_at', { ascending: false });
      const priorRows = prior ?? [];
      const numbered = priorRows
        .map((row) => Number((row.meta as { followup_number?: unknown } | null)?.followup_number))
        .filter((value) => Number.isFinite(value) && value > 0);
      const sentCount = numbered.length > 0 ? Math.max(...numbered) : priorRows.length;

      const index = dueFollowupIndex({ daysSinceShare, sentCount, days: account.days });
      if (index === null) {
        skipped++;
        continue;
      }

      // Resolve a channel before minting a link, so we don't leave stray tokens.
      const phone = job.client_phone || link.client_phone;
      const normalizedPhone = phone ? normalizeUsPhone(phone) : null;
      let canText = false;
      // 'email' never texts. See FOLLOWUP_CHANNELS for why there is no mirror of
      // this that never emails.
      if (account.channel !== 'email' && normalizedPhone) {
        const { data: consent } = await admin
          .from('sms_consent')
          .select('status')
          .eq('account_id', link.account_id)
          .eq('phone_number', normalizedPhone)
          .maybeSingle();
        canText = consent?.status === 'opted_in';
      }
      const email = job.client_email || link.client_email;
      if (!(canText && normalizedPhone) && !email) {
        skipped++;
        continue;
      }

      const [{ data: nameRow }, { data: site }] = await Promise.all([
        admin.from('accounts').select('business_name').eq('id', link.account_id).maybeSingle(),
        admin.from('sites').select('company_name').eq('account_id', link.account_id).maybeSingle(),
      ]);
      const businessName = pickBusinessName(site, nameRow);
      const firstName = (job.client_name || 'there').trim().split(/\s+/)[0] || 'there';

      // Tokens are stored hashed and can't be recovered, so a follow-up mints a
      // fresh link (older ones keep working).
      const token = await createClientJobAccessToken(admin, link.account_id, jobId, { clientPhone: normalizedPhone, clientEmail: email });
      const url = `${APP_ORIGIN}/client/jobs/${token}`;

      let channel: 'sms' | 'email';
      let smsEventId: string | null = null;
      if (canText && normalizedPhone) {
        smsEventId = await sendQuoteFollowupSms({
          phone: normalizedPhone,
          businessName,
          clientName: firstName,
          url,
          accountId: link.account_id,
          idempotencyKey: `quote-followup:${jobId}:${index + 1}`,
        });
        channel = 'sms';
      } else {
        await sendQuoteFollowupEmail({ recipientEmail: email as string, businessName, clientName: firstName, url, accountId: link.account_id });
        channel = 'email';
      }

      const number = index + 1;
      await createJobFeedEvent(admin, link.account_id, jobId, {
        kind: 'quote_followup',
        title: channel === 'sms' ? 'Quote follow-up queued' : 'Quote follow-up emailed',
        body: `${channel === 'sms' ? 'Queued a nudge for' : 'Nudged'} ${job.client_name} to review their quote (follow-up ${number} of ${account.days.length}, day ${account.days[index]}).`,
        visibility: 'internal',
        meta: {
          channel,
          followup_number: number,
          scheduled_day: account.days[index],
          days_since_share: daysSinceShare,
          delivery_state: channel === 'sms' ? 'queued' : 'sent',
          sms_event_id: smsEventId,
        },
      });
      sent++;
    } catch (error) {
      console.error(`Quote follow-up failed for job ${jobId}:`, error instanceof Error ? error.message : error);
      failed++;
    }
  }

  return { candidates: byJob.size, sent, skipped, failed };
}
