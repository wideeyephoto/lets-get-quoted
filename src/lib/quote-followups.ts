// Quote follow-ups: when they go out, and what they say.
//
// Pure and dependency-free, so the Automations card can render the real cadence
// and the real message without pulling in Twilio, Resend or the admin client.
// The sweep in lib/followups.ts sends from these same functions, which is what
// stops the card and the cron from disagreeing.
//
// WHAT CHANGED AND WHY.
//
// This file used to hold four hardcoded numbers — first nudge at day 2, three
// days between nudges, two nudges, stop at 21 days — and the card recited them.
// They were not settings, so every contractor got the same cadence whether they
// sell $200 drain clears or $40k roofs, and the honest answer to "can I chase
// three times instead of twice?" was no.
//
// The schedule is now ABSOLUTE DAY OFFSETS from the day the quote was shared:
// [2, 5] means day 2 and day 5, full stop. It used to be relative gaps measured
// from the last thing that happened — nudge when it has been 2 days since the
// share, then 3 days since the last nudge — which is a different thing that
// agreed with the label only when every run was on time. A quote first swept 9
// days after it went out got "day 2's" message on day 9 and "day 5's" on day 12,
// while the card said day 2 and day 5. See dueFollowupIndex for how a missed day
// is now skipped rather than replayed late.

/** The cadence a contractor gets before touching anything: day 2, then day 5. */
export const DEFAULT_FOLLOWUP_DAYS: readonly number[] = [2, 5];

/** The most nudges anyone can schedule. Three is where chasing becomes nagging. */
export const MAX_FOLLOWUPS = 3;

export const FOLLOWUP_DAY_MIN = 1;
export const FOLLOWUP_DAY_MAX = 30;

/** Day offsets an owner may pick. Dense early, where the decision actually happens. */
export const FOLLOWUP_DAY_CHOICES = [1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30] as const;

/** Hour of the day, in the ACCOUNT'S timezone, that follow-ups go out. */
export const DEFAULT_FOLLOWUP_HOUR = 10;

/**
 * Hours an owner may pick.
 *
 * Bounded at 6am and 8pm for the same two reasons as appointment reminders:
 * these are texts to somebody's personal phone, and an hour inside 06:00–20:00
 * is never the hour US clocks skip in spring or repeat in autumn. A 2am send
 * time would silently not happen one day a year.
 */
export const FOLLOWUP_HOUR_CHOICES = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;

/**
 * How long after its hour an account will still send.
 *
 * The sweep runs hourly. A cron that is late, throttled or briefly failing would
 * otherwise mean a whole day's nudges are never sent — and with absolute day
 * offsets, "never" is the right word: tomorrow the day has moved on. Three hours
 * of catch-up turns a missed run into a late nudge. It cannot double-send: the
 * schedule below only ever admits one index per quote per day.
 */
export const FOLLOWUP_CATCHUP_HOURS = 3;

/**
 * Days past the last scheduled nudge that the sweep keeps looking at a quote.
 *
 * Only a catch-up allowance, not a fourth nudge — it exists so a run missed on
 * the last day still goes out the next morning. Past it the quote is somebody
 * to phone, not somebody to text.
 */
export const FOLLOWUP_GRACE_DAYS = 3;

/**
 * How a follow-up picks its channel.
 *
 * There is deliberately no "text only". Texting requires a mobile on file AND a
 * recorded opt-in, so a text-only setting would silently send nothing at all to
 * every customer who never opted in — an automation that looks on and does
 * nothing is worse than one that is off.
 */
export const FOLLOWUP_CHANNELS = ['auto', 'email'] as const;
export type FollowupChannel = (typeof FOLLOWUP_CHANNELS)[number];

export const FOLLOWUP_CHANNEL_LABELS: Record<FollowupChannel, string> = {
  auto: 'Text, or email if they cannot be texted',
  email: 'Email only',
};

/** The schedule, the hour, the channel and the weekend rule as one value. */
export type FollowupSettings = {
  days: number[];
  hour: number;
  channel: FollowupChannel;
  skipWeekends: boolean;
};

export function normalizeFollowupDays(value: unknown): number[] {
  const raw = Array.isArray(value)
    ? value
    : // Defensive: a Postgres integer[] read through a client that hands back the
      // literal '{2,5}' rather than parsing it. supabase-js parses it, but this
      // file is also the one the sweep trusts.
      typeof value === 'string' && value.trim()
      ? value.replace(/[{}]/g, '').split(',')
      : null;
  if (!raw) return [...DEFAULT_FOLLOWUP_DAYS];

  const days = raw
    .map((entry) => Number(entry))
    .filter((day) => Number.isFinite(day))
    .map((day) => Math.min(FOLLOWUP_DAY_MAX, Math.max(FOLLOWUP_DAY_MIN, Math.round(day))));

  // Sorted and de-duplicated rather than rejected: two nudges on the same day is
  // one nudge, and an out-of-order array is a schedule somebody meant in order.
  // This runs on the read as well as the write, so a row edited straight through
  // PostgREST can't make the sweep send out of sequence.
  const unique = Array.from(new Set(days)).sort((a, b) => a - b).slice(0, MAX_FOLLOWUPS);
  return unique.length > 0 ? unique : [...DEFAULT_FOLLOWUP_DAYS];
}

export function normalizeFollowupHour(value: unknown): number {
  // Zero is a legitimate hour (midnight) even though we do not offer it, so the
  // absent check has to come before Number() — Number(null) and Number('') are
  // both 0, and reading a missing column as "send at midnight" is exactly the
  // quiet wrong answer this file exists to avoid.
  if (value === null || value === undefined || value === '') return DEFAULT_FOLLOWUP_HOUR;
  const hour = Number(value);
  if (!Number.isFinite(hour)) return DEFAULT_FOLLOWUP_HOUR;
  const whole = Math.round(hour);
  if (whole < 0 || whole > 23) return DEFAULT_FOLLOWUP_HOUR;
  return whole;
}

export function normalizeFollowupChannel(value: unknown): FollowupChannel {
  return FOLLOWUP_CHANNELS.includes(value as FollowupChannel) ? (value as FollowupChannel) : 'auto';
}

/** Every stored setting normalised in one pass, for the sweep and the card alike. */
export function followupSettingsFromAccount(row: {
  quote_followup_days?: unknown;
  quote_followup_hour?: unknown;
  quote_followup_channel?: unknown;
  quote_followup_skip_weekends?: unknown;
} | null | undefined): FollowupSettings {
  return {
    days: normalizeFollowupDays(row?.quote_followup_days),
    hour: normalizeFollowupHour(row?.quote_followup_hour),
    channel: normalizeFollowupChannel(row?.quote_followup_channel),
    skipWeekends: Boolean(row?.quote_followup_skip_weekends),
  };
}

/** "day 2 and day 5" — the schedule as the card says it out loud. */
export function followupScheduleLabel(days: number[] = [...DEFAULT_FOLLOWUP_DAYS]): string {
  const labels = normalizeFollowupDays(days).map((day) => `day ${day}`);
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** "10:00 AM" — the way an owner writes a time, not the way a database stores one. */
export function followupHourLabel(hour: number): string {
  const safe = normalizeFollowupHour(hour);
  const suffix = safe < 12 ? 'AM' : 'PM';
  const twelve = safe % 12 === 0 ? 12 : safe % 12;
  return `${twelve}:00 ${suffix}`;
}

/**
 * "day 2 and day 5, at 10:00 AM EDT" — the whole schedule in one readable line.
 *
 * `zoneAbbreviation` is passed in rather than derived so this file stays pure and
 * free of Intl: it is DST-dependent, so it belongs to a moment, not an account.
 */
export function followupTimingLabel(days: number[], hour: number, zoneAbbreviation: string): string {
  return `${followupScheduleLabel(days)}, at ${followupHourLabel(hour)} ${zoneAbbreviation}`;
}

/** The last day the sweep will look at a quote at all. */
export function followupMaxAgeDays(days: number[] = [...DEFAULT_FOLLOWUP_DAYS]): number {
  const safe = normalizeFollowupDays(days);
  return safe[safe.length - 1] + FOLLOWUP_GRACE_DAYS;
}

export type FollowupStep = { key: string; label: string; detail: string };

/**
 * The sequence as a strip: Quote sent → Day 2 → Day 5 → Stop.
 *
 * The card used to describe the cadence in a sentence, which is fine for two
 * nudges and unreadable for three. A row of steps answers "what happens, and
 * then what" without the owner having to hold the arithmetic in their head.
 */
export function followupSequence(days: number[] = [...DEFAULT_FOLLOWUP_DAYS]): FollowupStep[] {
  const safe = normalizeFollowupDays(days);
  return [
    { key: 'sent', label: 'Quote sent', detail: 'Day 0' },
    ...safe.map((day, index) => ({
      key: `followup-${index}`,
      label: `Day ${day}`,
      detail: safe.length === 1 ? 'Reminder' : `Reminder ${index + 1}`,
    })),
    { key: 'stop', label: 'Stop', detail: `Day ${followupMaxAgeDays(safe)}` },
  ];
}

/**
 * Whole calendar days between two YYYY-MM-DD keys.
 *
 * Date-only arithmetic on purpose, and at UTC noon: the answer must be "how many
 * calendar days apart are these two local dates", which has nothing to do with
 * instants or with how long those days were. Subtracting timestamps would put a
 * DST day at 23 or 25 hours and round the wrong way twice a year.
 */
export function dayKeyDiff(fromDateKey: string, toDateKey: string): number {
  const parse = (key: string): number | null => {
    const [year, month, day] = String(key).split('-').map(Number);
    if (!year || !month || !day) return null;
    return Date.UTC(year, month - 1, day, 12);
  };
  const from = parse(fromDateKey);
  const to = parse(toDateKey);
  if (from === null || to === null) return 0;
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

/** Saturday or Sunday, in whatever zone produced the key. */
export function isWeekendDateKey(dateKey: string): boolean {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  if (!year || !month || !day) return false;
  const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/**
 * Whether an account should send during the hour this sweep is running.
 *
 * `localTime` is "HH:MM" in the account's own zone, as zonedNowParts returns it.
 * True from the configured hour until the catch-up window closes, and the window
 * never wraps past midnight — a 20:00 send time with three hours of catch-up
 * stops at 23:59 rather than spilling into a day whose offsets have all moved.
 */
export function isFollowupHourNow(localTime: string, hour: number, catchupHours = FOLLOWUP_CATCHUP_HOURS): boolean {
  const localHour = Number(String(localTime).slice(0, 2));
  if (!Number.isFinite(localHour)) return false;
  const start = normalizeFollowupHour(hour);
  return localHour >= start && localHour < Math.min(24, start + Math.max(1, catchupHours));
}

/** Whether the sweep should still be looking at a quote this old. */
export function isFollowupWindowOpen(daysSinceShare: number, days: number[]): boolean {
  return daysSinceShare <= followupMaxAgeDays(days);
}

/**
 * Which nudge — if any — is due for a quote today.
 *
 * `sentCount` is how many have already gone out, taken from the highest
 * followup_number recorded on the job feed rather than from a row count, because
 * the two stop agreeing the moment anything is skipped.
 *
 * MISSED DAYS ARE SKIPPED, NOT REPLAYED. If a quote is 9 days old on a [2, 5]
 * schedule and nothing has gone out — the automation was switched on today, or
 * the cron was down — this returns the LAST index whose day has passed, not the
 * first. Sending "just checking in" on day 9 and again on day 12 is a schedule
 * the card never promised, and the customer experiences it as the system waking
 * up and working through a backlog at them.
 *
 * Returns null when nothing is due: too early, already caught up, or finished.
 */
export function dueFollowupIndex(input: { daysSinceShare: number; sentCount: number; days: number[] }): number | null {
  const days = normalizeFollowupDays(input.days);
  const sentCount = Math.max(0, Math.floor(input.sentCount));
  if (sentCount >= days.length) return null;

  let due: number | null = null;
  for (let index = 0; index < days.length; index += 1) {
    if (days[index] <= input.daysSinceShare) due = index;
  }
  if (due === null || due < sentCount) return null;
  return due;
}

/**
 * The nudge itself.
 *
 * Shared with the settings preview, like missedCallTextBack and
 * reviewRequestText, so the contractor is never shown a message that differs
 * from the one their client receives.
 *
 * Opens with the customer's name and names the contractor in the first line.
 * It used to open "Let's Get Quoted:" — our name, on a text about somebody
 * else's quote.
 */
export function quoteFollowupText(input: { businessName: string; clientName: string; url: string }): string {
  const business = input.businessName.trim() || 'your contractor';
  const who = input.clientName.trim() || 'there';
  return `Hi ${who}, just checking in on your quote from ${business}. Ready to move forward? Review and approve it here: ${input.url}. Reply STOP to opt out.`;
}

/** Subject and body of the email version, so the card can preview that too. */
export function quoteFollowupEmailPreview(input: { businessName: string; clientName: string }): {
  subject: string;
  heading: string;
  body: string;
  cta: string;
} {
  return {
    subject: `Still thinking it over? Your quote from ${input.businessName}`,
    heading: `${input.clientName}, ready to move forward?`,
    body: `Just checking in on your quote from ${input.businessName}. When you are ready, you can review and approve it online — no login needed.`,
    cta: 'View & approve your quote',
  };
}
