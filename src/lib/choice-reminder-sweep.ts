import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { createClientJobAccessToken, createJobFeedEvent } from '@/lib/job-feed';
import { sendSelectionRequestEmail } from '@/lib/email';
import { sendSelectionRequestSms } from '@/lib/sms';
import { normalizeUsPhone } from '@/lib/phone';
import { pickBusinessName } from '@/lib/business-name';
import { zonedNowParts } from '@/lib/quick-stop';
import { resolveClientChannel, type ClientChannelPreference } from '@/lib/client-channel';
import { loadJobMessageChannels } from '@/lib/client-channel-data';
import {
  choiceReminderSettingsFromAccount,
  choiceReminderText,
  isChoiceReminderHourNow,
  isJobRemindable,
  planChoiceReminders,
  type ChoiceReminderSend,
  type ChoiceReminderSettings,
  type PlannableChoice,
} from '@/lib/choice-reminders';

// Choice reminders: the sweep.
//
// Reading and sending, and nothing else. Every rule about WHO is owed WHAT lives
// in lib/choice-reminders.ts as a pure function over rows, so the schedule can
// be tested without a database, a clock or a mock — and so the settings panel
// renders the same sentences the cron acts on.
//
// THREE THINGS THIS FIXES, all of which were invisible from the outside.
//
//   1. The old sweep ran once a day at 17:00 UTC and had no idea what time it
//      was for the contractor. That is 1pm in New York and 7am in Honolulu, and
//      it appeared nowhere in the interface. This one runs hourly and each
//      account acts only in its own chosen hour.
//   2. It never looked at the job. A job cancelled last week still had its
//      homeowner chased for choices on it.
//   3. It checked texting consent against `sms_consent.phone`, and the column is
//      `phone_number`. PostgREST returned an error, the error was swallowed, and
//      `canText` was therefore false for EVERY customer — so choice reminders
//      have been silently email-only since the day they shipped, including for
//      the customers who explicitly opted in to texts.

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

/** Bound one cron invocation. */
const MAX_SENDS_PER_RUN = 200;
/** How many times one reminder may be re-attempted after a provider failure. */
const MAX_ATTEMPTS = 3;

export type ChoiceReminderRunSummary = {
  accounts: number;
  due: number;
  sent: number;
  skipped: number;
  failed: number;
  reason?: string;
};

type AccountRow = { id: string; timezone: string; settings: ChoiceReminderSettings };

type JobRow = {
  id: string;
  account_id: string;
  ref: string;
  scope: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  status: string;
};

/**
 * The sweep.
 *
 * `client` is injectable so the idempotency and stop-condition tests can drive
 * it against a fake PostgREST rather than a live database; production passes
 * nothing and gets the service-role client.
 */
export async function runChoiceReminderSweep(
  now: Date = new Date(),
  client?: SupabaseClient,
): Promise<ChoiceReminderRunSummary> {
  const admin = client ?? createAdminClient();
  const empty: ChoiceReminderRunSummary = { accounts: 0, due: 0, sent: 0, skipped: 0, failed: 0 };

  const accounts = await readEnabledAccounts(admin);
  if (accounts.length === 0) return { ...empty, reason: 'no accounts enabled' };

  // Whose hour is it? Each account resolves its own local date and time. Two
  // accounts an hour apart are looking at different calendar days in the same
  // run, which is the entire point of doing it per account rather than per cron.
  const dueAccounts: { account: AccountRow; today: string }[] = [];
  for (const account of accounts) {
    const { dateKey, time } = zonedNowParts(now, account.timezone);
    if (!isChoiceReminderHourNow(time, account.settings.hour)) continue;
    dueAccounts.push({ account, today: dateKey });
  }
  if (dueAccounts.length === 0) {
    return { ...empty, accounts: accounts.length, reason: 'no account is due this hour' };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let due = 0;

  for (const { account, today } of dueAccounts) {
    const choices = await readOpenChoices(admin, account.id);
    if (choices.length === 0) continue;

    // The job-level stop, applied before planning rather than after: a cancelled
    // or completed job should not even be considered, and filtering here means
    // no ledger row is ever claimed for one.
    const jobs = await readJobs(admin, account.id, [...new Set(choices.map((choice) => choice.jobId))]);
    const remindable = new Map(
      [...jobs.entries()].filter(([, job]) => isJobRemindable(job)),
    );

    // What the contractor has said about messaging each of these customers.
    // Read separately from readJobs so a pre-migration database — where the
    // column does not exist — cannot take the job query down with it; see
    // loadJobMessageChannels.
    const channels = await loadJobMessageChannels(admin, account.id, [...remindable.keys()]);

    const plan = planChoiceReminders({
      today,
      choices: choices.filter((choice) => remindable.has(choice.jobId)),
      offsets: account.settings.offsets,
      grouping: account.settings.grouping,
    });
    due += plan.length;

    for (const send of plan) {
      // Only real work counts against the budget. A skip is the cheap
      // already-claimed path — it makes no provider call — and counting it
      // would let a day's worth of replayed stages crowd out sends that have
      // not happened yet.
      if (sent + failed >= MAX_SENDS_PER_RUN) break;
      const job = remindable.get(send.jobId);
      if (!job) { skipped += 1; continue; }

      const outcome = await deliverChoiceReminder(admin, {
        accountId: account.id,
        job,
        send,
        settings: account.settings,
        channelPreference: channels.get(send.jobId) ?? 'auto',
        now,
      });
      if (outcome === 'sent') sent += 1;
      else if (outcome === 'failed') failed += 1;
      else skipped += 1;
    }
  }

  return { accounts: accounts.length, due, sent, skipped, failed };
}

// -- Reads --------------------------------------------------------------------

/**
 * Accounts with choice reminders on, and how each one wants them sent.
 *
 * Tolerant of a pre-migration database in both directions: if the settings
 * columns are missing the select is retried without them and every account gets
 * the defaults, which is exactly the behavior that shipped before.
 */
async function readEnabledAccounts(admin: SupabaseClient): Promise<AccountRow[]> {
  const columns =
    'id, timezone, selection_reminders_enabled, selection_reminder_offsets, selection_reminder_hour, selection_reminder_template, selection_reminder_grouping';

  let rows: Record<string, unknown>[] | null = null;
  const { data, error } = await admin.from('accounts').select(columns).eq('selection_reminders_enabled', true);
  if (error) {
    const fallback = await admin.from('accounts').select('id, timezone').eq('selection_reminders_enabled', true);
    if (fallback.error) return [];
    rows = (fallback.data ?? []) as Record<string, unknown>[];
  } else {
    rows = (data ?? []) as Record<string, unknown>[];
  }

  return rows.map((row) => ({
    id: row.id as string,
    timezone: (row.timezone as string) || 'America/New_York',
    settings: choiceReminderSettingsFromAccount(row),
  }));
}

/**
 * Every open choice on the account that has a needed-by date, with its option
 * count.
 *
 * Two queries rather than a join because PostgREST embedding of a count is
 * fiddly and this is two indexed reads. The option count is what stops "you
 * have a choice to make" going out about a choice with nothing to choose
 * between.
 */
async function readOpenChoices(admin: SupabaseClient, accountId: string): Promise<PlannableChoice[]> {
  const { data: rows, error } = await admin
    .from('job_selections')
    .select('id, job_id, title, status, decide_by')
    .eq('account_id', accountId)
    .eq('status', 'open')
    .not('decide_by', 'is', null)
    .limit(2000);
  if (error || !rows?.length) return [];

  const ids = rows.map((row) => row.id as string);
  const { data: optionRows } = await admin
    .from('selection_options')
    .select('selection_id')
    .eq('account_id', accountId)
    .in('selection_id', ids);

  const counts = new Map<string, number>();
  for (const option of optionRows ?? []) {
    const key = option.selection_id as string;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return rows.map((row) => ({
    id: row.id as string,
    jobId: row.job_id as string,
    title: (row.title as string) ?? '',
    status: 'open' as const,
    decideBy: (row.decide_by as string | null) ?? null,
    optionCount: counts.get(row.id as string) ?? 0,
  }));
}

async function readJobs(admin: SupabaseClient, accountId: string, jobIds: string[]): Promise<Map<string, JobRow>> {
  if (jobIds.length === 0) return new Map();
  const { data } = await admin
    .from('jobs')
    .select('id, account_id, ref, scope, client_name, client_phone, client_email, status')
    .eq('account_id', accountId)
    .in('id', jobIds);
  return new Map(((data ?? []) as JobRow[]).map((job) => [job.id, job]));
}

// -- One reminder -------------------------------------------------------------

type DeliverOutcome = 'sent' | 'failed' | 'skipped';

/**
 * Claim, send, record. In that order, and the order is the whole guarantee.
 *
 * CLAIM FIRST. The ledger's unique index is what makes this idempotent: two
 * overlapping cron invocations both try to insert the same (job, needed-by,
 * stage) row, exactly one wins, and the loser sends nothing. Claiming after the
 * send — the way the old code stamped chase_sent_at afterwards — leaves a window
 * in which a retry sends a second text, and that window is precisely as long as
 * the provider takes to answer.
 *
 * RECORD LAST, with the truth. A failed send leaves a row saying so, with the
 * provider's own words in failure_reason, rather than the silence that the old
 * "no timestamp" left behind — which was indistinguishable from never having
 * been due.
 */
async function deliverChoiceReminder(
  admin: SupabaseClient,
  input: {
    accountId: string;
    job: JobRow;
    send: ChoiceReminderSend;
    settings: ChoiceReminderSettings;
    /** The contractor's own setting for this customer. */
    channelPreference: ClientChannelPreference;
    now: Date;
  },
): Promise<DeliverOutcome> {
  const { accountId, job, send, now } = input;

  const claimed = await claimReminder(admin, accountId, send, now);
  if (claimed.length === 0) return 'skipped';

  const finish = async (patch: Record<string, unknown>) => {
    await admin
      .from('selection_reminders')
      .update({ ...patch, updated_at: now.toISOString() })
      .eq('account_id', accountId)
      .in('id', claimed);
  };

  // -- Channel. Consent is checked here rather than assumed. -------------------
  //
  // Two consents, and both are real. The CUSTOMER'S is the sms_consent row — an
  // explicit opt-out stops choice reminders for them, full stop, and is not a
  // nudge to email them instead: somebody who replied STOP has asked this
  // automation to leave them alone, and routing around that through a different
  // channel is the letter of consent against its spirit. Having NO consent row
  // is a different thing — they never opted in, so they were always going to be
  // emailed, and that fallback is untouched.
  //
  // The CONTRACTOR'S is jobs.message_channel: "don't text this one", "email
  // only", "leave her alone, I'll ring". It had nowhere to live until now, so
  // this sweep texted anybody with a number and an opt-in regardless of what the
  // owner had said on the quote form. resolveClientChannel weighs the two in one
  // place, the same one the job page renders from.
  const phone = normalizeUsPhone(String(job.client_phone ?? ''));
  const consent = phone ? await readConsent(admin, accountId, phone) : null;
  const email = job.client_email || null;

  const route = resolveClientChannel({
    // An opt-in is required to text, not merely the absence of an opt-out —
    // this sweep's own rule, preserved by withholding the number rather than
    // teaching the shared resolver about a consent ledger it cannot see.
    phone: consent === 'opted_in' ? phone : null,
    email,
    preference: input.channelPreference,
    optedOut: consent === 'opted_out',
    kind: 'automatic',
  });

  if (route.channel === 'none') {
    await finish({
      status: 'skipped',
      failure_reason: route.reason === 'opted_out'
        ? 'opted_out'
        : route.reason === 'preference_off'
          ? 'messages_off'
          : 'no_contact',
    });
    return 'skipped';
  }

  const canText = route.channel === 'sms';

  // -- The words. --------------------------------------------------------------
  const [{ data: account }, { data: site }] = await Promise.all([
    admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);
  const businessName = pickBusinessName(site, account);
  const jobName = (job.scope || '').trim() || job.ref;
  const clientName = job.client_name || 'there';

  let channel: 'sms' | 'email';
  try {
    // A fresh link each time — tokens are stored hashed and cannot be recovered,
    // and older ones keep working.
    const token = await createClientJobAccessToken(admin, accountId, job.id, {
      clientPhone: phone,
      clientEmail: email,
    });
    const url = `${APP_ORIGIN}/client/jobs/${token}`;

    if (canText && phone) {
      const message = choiceReminderText({
        businessName,
        clientName,
        jobName,
        titles: send.titles,
        daysPastNeededBy: send.daysPastNeededBy,
        url,
        template: input.settings.template,
      });
      // Returns null when the number is opted out — a second, cheaper guard than
      // the consent read above, and the one that catches a STOP that landed
      // between the two. Treated as a skip and not as a send, which the old code
      // did not do: it stamped the row regardless of what came back.
      const providerId = await sendSelectionRequestSms({ phone, accountId, message });
      if (providerId === null) {
        await finish({ status: 'skipped', failure_reason: 'opted_out' });
        return 'skipped';
      }
      channel = 'sms';
    } else {
      await sendSelectionRequestEmail({
        recipientEmail: email as string,
        businessName,
        clientName,
        count: send.titles.length,
        overdue: send.daysPastNeededBy > 0,
        url,
        accountId,
      });
      channel = 'email';
    }
  } catch (error) {
    await finish({
      status: 'failed',
      failure_reason: (error instanceof Error ? error.message : 'send failed').slice(0, 300),
    });
    return 'failed';
  }

  await finish({ status: 'sent', channel, sent_at: now.toISOString() });

  // The job's own history, alongside the copy of the text that
  // sendSelectionRequestSms already mirrored into the Messages inbox.
  await createJobFeedEvent(admin, accountId, job.id, {
    kind: 'selection_requested',
    title: channel === 'sms' ? 'Choice reminder texted' : 'Choice reminder emailed',
    body: `Reminded ${clientName} about ${send.titles.length} ${
      send.titles.length === 1 ? 'choice' : 'choices'
    }${
      send.daysPastNeededBy > 0
        ? ` (${send.daysPastNeededBy} day${send.daysPastNeededBy === 1 ? '' : 's'} past the date we needed them)`
        : ''
    }.`,
    visibility: 'internal',
    meta: {
      channel,
      count: send.titles.length,
      reminder: true,
      stages: send.claims.map((claim) => claim.stage),
      needed_by: send.claims.map((claim) => claim.neededBy),
      selection_ids: send.selectionIds,
    },
  }).catch(() => {});

  return 'sent';
}

/**
 * Take ownership of this send, or discover somebody already has.
 *
 * Returns the ledger row ids now owned by this run — empty means every stage in
 * the message was already claimed, and nothing should be sent.
 *
 * Rows are inserted ONE AT A TIME on purpose. A message can settle two stages
 * (see the coalescing note in planChoiceReminders), and a single multi-row
 * insert that hits the unique index fails as a whole — which would throw away a
 * genuinely new claim because of an old one beside it.
 */
async function claimReminder(
  admin: SupabaseClient,
  accountId: string,
  send: ChoiceReminderSend,
  now: Date,
): Promise<string[]> {
  const owned: string[] = [];

  for (const claim of send.claims) {
    const row = {
      account_id: accountId,
      job_id: send.jobId,
      selection_id: send.selectionId,
      needed_by: claim.neededBy,
      stage: claim.stage,
      due_on: claim.dueOn,
      status: 'pending',
      attempts: 1,
      selection_ids: send.selectionIds,
    };

    const { data, error } = await admin.from('selection_reminders').insert(row).select('id').maybeSingle();
    if (!error && data?.id) {
      owned.push(data.id as string);
      continue;
    }
    // 23505 is the unique violation: somebody has this stage already. Anything
    // else is a real database problem and this stage is left alone — a claim we
    // are not certain we hold must never lead to a send.
    if (error?.code !== '23505') continue;

    const retried = await reclaimStalled(admin, accountId, send, claim, now);
    if (retried) owned.push(retried);
  }

  return owned;
}

/**
 * How long a `pending` row may sit before it is assumed abandoned.
 *
 * A claim is held for as long as one send takes — a second or two. Anything
 * still pending half an hour later belongs to a run that died between claiming
 * and finishing: a deploy mid-sweep, a function timeout, a crash. Without this,
 * that stage is claimed forever and the reminder is never sent and never
 * retried — the one failure mode a claim-first design can introduce, and worse
 * than the duplicate it exists to prevent because it is silent.
 */
const STALLED_CLAIM_MINUTES = 30;

/**
 * Re-take a stage whose previous attempt failed, or whose claim was abandoned.
 *
 * The duplicate guard must never let a SENT reminder go twice — that is the
 * whole point of it. But a row left `failed` by a provider outage is a customer
 * who was never told, and refusing to retry it would turn a transient blip into
 * a permanently missed reminder. So: `failed` or long-stalled `pending`, and
 * only up to MAX_ATTEMPTS.
 *
 * WHAT BOUNDS THE RETRY is the plan, not a date comparison here. This function
 * is only ever reached for a stage the planner produced for TODAY, and
 * dueChoiceStage stops producing a stage once the grace window closes — so a
 * failure eventually stops being retried because it stops being asked about. An
 * earlier version compared the row's due_on against today, which was wrong in a
 * way that only bit late sends: a stage whose day was missed carries a due_on in
 * the past on its very FIRST attempt, so the check refused to retry a send that
 * had never been attempted at all.
 *
 * The re-take is a COMPARE-AND-SWAP. The update carries the status it expects to
 * find and asks for the row back; two runs racing to rescue the same stalled
 * claim means one of them updates nothing and gets an empty array, which reads
 * as "somebody else has it" exactly like the unique violation above.
 */
async function reclaimStalled(
  admin: SupabaseClient,
  accountId: string,
  send: ChoiceReminderSend,
  claim: { neededBy: string; stage: number },
  now: Date,
): Promise<string | null> {
  let query = admin
    .from('selection_reminders')
    .select('id, status, attempts, due_on, scheduled_at, updated_at')
    .eq('account_id', accountId)
    .eq('job_id', send.jobId)
    .eq('needed_by', claim.neededBy)
    .eq('stage', claim.stage);
  query = send.selectionId ? query.eq('selection_id', send.selectionId) : query.is('selection_id', null);

  const { data: existing } = await query.maybeSingle();
  if (!existing) return null;

  const status = String(existing.status);
  if (!RECLAIMABLE.has(status)) return null;
  const attempts = Number(existing.attempts ?? 0);
  if (attempts >= MAX_ATTEMPTS) return null;
  // A pending row is somebody's live claim until it has sat long enough to be
  // an abandoned one. `failed` and `cancelled` are nobody's.
  if (status === 'pending' && !isStalled(existing.updated_at ?? existing.scheduled_at, now)) return null;

  const { data: swapped, error } = await admin
    .from('selection_reminders')
    .update({
      status: 'pending',
      attempts: attempts + 1,
      failure_reason: null,
      selection_ids: send.selectionIds,
      updated_at: now.toISOString(),
    })
    .eq('account_id', accountId)
    .eq('id', existing.id as string)
    // THE COMPARE-AND-SWAP, and it has to be on `attempts`.
    //
    // Guarding on status alone is not a CAS when the status being written is the
    // status being compared. Rescuing a stalled `pending` row writes 'pending'
    // over 'pending', so under READ COMMITTED the second updater blocks, then
    // re-evaluates its WHERE against the row the first one just wrote — which
    // still says 'pending' — and succeeds too. Both runs would come away
    // believing they owned the claim, and the homeowner would get two texts.
    //
    // `attempts` always changes, so the second updater's re-check fails and it
    // gets an empty array back, which reads as "somebody else has it" exactly
    // like the unique violation above.
    .eq('status', status)
    .eq('attempts', attempts)
    .select('id');
  if (error || !swapped?.length) return null;
  return existing.id as string;
}

/**
 * States a stage may be taken back from.
 *
 * `sent` is absent and that is the whole duplicate guarantee. `cancelled` is
 * present because it is a decision, not a tombstone: resync cancels a pending
 * reminder when its needed-by date is cleared, and if that date is later put
 * back the stage is genuinely owed again. Leaving it out meant the unique index
 * kept returning 23505 against a row nothing could ever revive, so one
 * mind-changed date silently cost the customer that reminder for good.
 */
const RECLAIMABLE = new Set(['failed', 'pending', 'cancelled']);

function isStalled(since: unknown, now: Date): boolean {
  const at = Date.parse(String(since ?? ''));
  if (!Number.isFinite(at)) return true;
  return now.getTime() - at >= STALLED_CLAIM_MINUTES * 60_000;
}

/**
 * Texting consent for one number.
 *
 * Fails CLOSED on a read error, like isPhoneOptedOut does: if consent cannot be
 * established we do not text. The bug this replaces failed closed by accident —
 * it queried a column that does not exist, so every read errored and every
 * customer was treated as un-textable — which is why it went unnoticed.
 */
async function readConsent(
  admin: SupabaseClient,
  accountId: string,
  phone: string,
): Promise<'opted_in' | 'opted_out' | null> {
  const { data, error } = await admin
    .from('sms_consent')
    .select('status')
    .eq('account_id', accountId)
    .eq('phone_number', phone)
    .maybeSingle();
  if (error) return null;
  const status = data?.status as string | undefined;
  if (status === 'opted_in' || status === 'opted_out') return status;
  return null;
}

// Keeping pending reminders honest when a needed-by date moves is
// `resyncChoiceReminders`, and it lives in lib/selections-data beside the edit
// that triggers it — this module imports Twilio, Resend and the service-role
// client, none of which an edit on the job page should be dragging in.
