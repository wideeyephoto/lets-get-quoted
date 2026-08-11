// Choice reminders: when they go out, and what they say.
//
// Pure and dependency-free, so the settings panel can render the real cadence
// and the real message without pulling in Twilio, Resend or the admin client.
// The sweep in lib/selection-notify.ts sends from these same functions, which is
// what stops the panel and the cron from disagreeing. Same split as
// quote-followups.ts and appointment-reminders.ts.
//
// WHAT CHANGED AND WHY.
//
// The old rule was two booleans on the row — chase_sent_at and overdue_sent_at —
// and one function, chaseNeeded, that fired the first the moment a choice came
// within DECISION_CHASE_DAYS (seven) of its date and the second on any day after
// it. Three things followed from that:
//
//   1. The "first" reminder for a date three weeks out went a fortnight early,
//      and the needed-by date itself passed in silence. Nobody chose seven days;
//      it was a constant that existed to color a label on the board and got
//      reused as a send rule.
//   2. The "second" was whenever the next daily run happened to notice, which is
//      one day later, not two.
//   3. Neither was configuration, so the panel could not state the schedule
//      without asserting something the cron did not actually promise.
//
// The schedule is now DAY OFFSETS FROM THE NEEDED-BY DATE: [0, 2] means on the
// day, then two days after. Stage 0 is the deadline itself. Everything below is
// the arithmetic that decides which stage — if any — a given day owes.

/** The cadence a contractor gets before touching anything: the day, then +2. */
export const DEFAULT_CHOICE_REMINDER_OFFSETS: readonly number[] = [0, 2];

/** The most reminders anyone can schedule. Three is where chasing becomes nagging. */
export const MAX_CHOICE_REMINDERS = 3;

export const CHOICE_OFFSET_MIN = 0;
export const CHOICE_OFFSET_MAX = 30;

/** Offsets an owner may pick. Dense early, where the decision actually happens. */
export const CHOICE_OFFSET_CHOICES = [0, 1, 2, 3, 4, 5, 7, 10, 14] as const;

/** Hour of the day, in the ACCOUNT'S timezone, that reminders go out. */
export const DEFAULT_CHOICE_REMINDER_HOUR = 9;

/**
 * Hours an owner may pick.
 *
 * Bounded at 6am and 8pm for the same two reasons as appointment reminders and
 * quote follow-ups: these are texts to somebody's personal phone, and an hour
 * inside 06:00-20:00 is never the hour US clocks skip in spring or repeat in
 * autumn. A 2am send time would silently not happen one day a year.
 */
export const CHOICE_REMINDER_HOUR_CHOICES = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;

/**
 * How long after its hour an account will still send.
 *
 * The sweep runs hourly. A cron that is late, throttled or briefly failing would
 * otherwise mean a whole day's reminders are never sent — and with absolute day
 * offsets, "never" is the right word: tomorrow the day has moved on. Three hours
 * of catch-up turns a missed run into a late reminder. It cannot double-send:
 * the ledger row claimed by the first pass is what the second and third find.
 */
export const CHOICE_REMINDER_CATCHUP_HOURS = 3;

/**
 * Days past the last scheduled reminder that the sweep keeps looking at a job.
 *
 * A catch-up allowance, not a third reminder — it exists so a run missed on the
 * last day still goes out the next morning. Past it, a homeowner who has ignored
 * two texts is somebody to phone.
 */
export const CHOICE_REMINDER_GRACE_DAYS = 3;

/**
 * One message per job, or one per choice.
 *
 * 'job' is the default and what the settings panel writes. A kitchen with six
 * choices due the same day is one text; six reads as a malfunction and gets the
 * whole thread muted, at which point the genuinely urgent one is muted too.
 */
export const CHOICE_GROUPINGS = ['job', 'per_choice'] as const;
export type ChoiceGrouping = (typeof CHOICE_GROUPINGS)[number];

export const CHOICE_GROUPING_LABELS: Record<ChoiceGrouping, string> = {
  job: 'One combined reminder per job',
  per_choice: 'A separate reminder for every choice',
};

/** The schedule, the hour, the words and the grouping as one value. */
export type ChoiceReminderSettings = {
  enabled: boolean;
  offsets: number[];
  hour: number;
  /** Null means "the default text". Not the same as an empty string. */
  template: string | null;
  grouping: ChoiceGrouping;
};

// -- Normalisers --------------------------------------------------------------
//
// Every one of these runs on the READ as well as the write. A settings row
// edited straight through PostgREST, or written by an older build, must not be
// able to make the sweep send at 3am or fourteen times.

export function normalizeChoiceOffsets(value: unknown): number[] {
  const raw = Array.isArray(value)
    ? value
    : // Defensive: a Postgres integer[] read through a client that hands back
      // the literal '{0,2}' rather than parsing it. supabase-js parses it, but
      // this file is also the one the sweep trusts.
      typeof value === 'string' && value.trim()
      ? value.replace(/[{}]/g, '').split(',')
      : null;
  if (!raw) return [...DEFAULT_CHOICE_REMINDER_OFFSETS];

  const offsets = raw
    .map((entry) => Number(entry))
    .filter((offset) => Number.isFinite(offset))
    .map((offset) => Math.min(CHOICE_OFFSET_MAX, Math.max(CHOICE_OFFSET_MIN, Math.round(offset))));

  // Sorted and de-duplicated rather than rejected: two reminders on the same day
  // is one reminder, and an out-of-order array is a schedule somebody meant in
  // order. Empty falls back to the default — an enabled automation with no
  // schedule is one that looks on and does nothing.
  const unique = Array.from(new Set(offsets)).sort((a, b) => a - b).slice(0, MAX_CHOICE_REMINDERS);
  return unique.length > 0 ? unique : [...DEFAULT_CHOICE_REMINDER_OFFSETS];
}

export function normalizeChoiceReminderHour(value: unknown): number {
  // Zero is a legitimate hour (midnight) even though we do not offer it, so the
  // absent check has to come before Number() — Number(null) and Number('') are
  // both 0, and reading a missing column as "send at midnight" is exactly the
  // quiet wrong answer this file exists to avoid.
  if (value === null || value === undefined || value === '') return DEFAULT_CHOICE_REMINDER_HOUR;
  const hour = Number(value);
  if (!Number.isFinite(hour)) return DEFAULT_CHOICE_REMINDER_HOUR;
  const whole = Math.round(hour);
  if (whole < 0 || whole > 23) return DEFAULT_CHOICE_REMINDER_HOUR;
  return whole;
}

export function normalizeChoiceGrouping(value: unknown): ChoiceGrouping {
  return CHOICE_GROUPINGS.includes(value as ChoiceGrouping) ? (value as ChoiceGrouping) : 'job';
}

/** Every stored setting normalised in one pass, for the sweep and the panel alike. */
export function choiceReminderSettingsFromAccount(
  row:
    | {
        selection_reminders_enabled?: unknown;
        selection_reminder_offsets?: unknown;
        selection_reminder_hour?: unknown;
        selection_reminder_template?: unknown;
        selection_reminder_grouping?: unknown;
      }
    | null
    | undefined,
): ChoiceReminderSettings {
  return {
    // Defaults ON, and absent reads as on. A contractor who typed a needed-by
    // date has already said they want the homeowner chased, and a column that
    // has not been migrated yet must not read as "they switched it off".
    enabled: row?.selection_reminders_enabled !== false,
    offsets: normalizeChoiceOffsets(row?.selection_reminder_offsets),
    hour: normalizeChoiceReminderHour(row?.selection_reminder_hour),
    template: normalizeStoredTemplate(row?.selection_reminder_template),
    grouping: normalizeChoiceGrouping(row?.selection_reminder_grouping),
  };
}

function normalizeStoredTemplate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, CHOICE_TEMPLATE_MAX) : null;
}

// -- Saying the schedule out loud ---------------------------------------------

/** "the needed-by date", "2 days later" — one offset, in words. */
export function choiceOffsetLabel(offset: number, index = 0): string {
  const safe = Math.min(CHOICE_OFFSET_MAX, Math.max(CHOICE_OFFSET_MIN, Math.round(Number(offset) || 0)));
  if (safe === 0) return 'the needed-by date';
  const days = `${safe} day${safe === 1 ? '' : 's'}`;
  // The first reminder in a schedule has nothing to be "later" than.
  return index === 0 ? `${days} after the needed-by date` : `${days} later`;
}

/**
 * "On the needed-by date and 2 days later" — the schedule as the panel says it.
 *
 * Built from the same array the sweep reads, so the panel cannot describe a
 * cadence the cron does not run. That is the entire reason this is a function
 * and not a sentence typed into the JSX.
 */
export function choiceScheduleLabel(offsets: number[] = [...DEFAULT_CHOICE_REMINDER_OFFSETS]): string {
  const safe = normalizeChoiceOffsets(offsets);
  const labels = safe.map((offset, index) => choiceOffsetLabel(offset, index));
  const joined =
    labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  // "On the needed-by date…" reads as a sentence; "On 3 days after…" does not.
  return safe[0] === 0 ? `On ${joined}` : `${joined.charAt(0).toUpperCase()}${joined.slice(1)}`;
}

/** "9:00 AM" — the way an owner writes a time, not the way a database stores one. */
export function choiceReminderHourLabel(hour: number): string {
  const safe = normalizeChoiceReminderHour(hour);
  const suffix = safe < 12 ? 'AM' : 'PM';
  const twelve = safe % 12 === 0 ? 12 : safe % 12;
  return `${twelve}:00 ${suffix}`;
}

/**
 * "On the needed-by date and 2 days later, at 9:00 AM EDT".
 *
 * `zoneAbbreviation` is passed in rather than derived so this file stays pure
 * and free of Intl: it is DST-dependent, so it belongs to a moment, not an
 * account. lib/appointment-reminders exports timeZoneAbbreviation for it.
 */
export function choiceTimingLabel(offsets: number[], hour: number, zoneAbbreviation: string): string {
  return `${choiceScheduleLabel(offsets)}, at ${choiceReminderHourLabel(hour)} ${zoneAbbreviation}`;
}

/** What the panel says about eligibility. One sentence, one source. */
export const CHOICE_ELIGIBILITY_LABEL = 'Only choices with a needed-by date';

/** What the panel says about stopping. Must stay true of shouldStopChoiceReminders. */
export const CHOICE_STOP_LABEL = 'When all choices are submitted or the job is closed';

export function choiceGroupingLabel(grouping: ChoiceGrouping = 'job'): string {
  return CHOICE_GROUPING_LABELS[normalizeChoiceGrouping(grouping)];
}

// -- Dates --------------------------------------------------------------------

/**
 * Whole calendar days between two YYYY-MM-DD keys.
 *
 * Date-only arithmetic on purpose, and at UTC noon: the answer must be "how many
 * calendar days apart are these two local dates", which has nothing to do with
 * instants or with how long those days were. Subtracting timestamps would put a
 * DST day at 23 or 25 hours and round the wrong way twice a year.
 */
export function choiceDayDiff(fromDateKey: string, toDateKey: string): number {
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

/** The local date a stage is due: the needed-by date plus its offset. */
export function choiceReminderDueOn(neededBy: string, offset: number): string {
  const [year, month, day] = String(neededBy).split('-').map(Number);
  if (!year || !month || !day) return String(neededBy);
  // UTC arithmetic on a date-only value: no zone is involved, so no zone can be
  // got wrong. Noon avoids any chance of a DST-shifted midnight landing on the
  // previous day in engines that normalise differently.
  const at = new Date(Date.UTC(year, month - 1, day, 12));
  at.setUTCDate(at.getUTCDate() + Math.max(CHOICE_OFFSET_MIN, Math.round(Number(offset) || 0)));
  return at.toISOString().slice(0, 10);
}

/**
 * Whether an account should send during the hour this sweep is running.
 *
 * `localTime` is "HH:MM" in the account's own zone, as zonedNowParts returns it.
 * True from the configured hour until the catch-up window closes, and the window
 * never wraps past midnight — an 8pm send time with three hours of catch-up
 * stops at 23:59 rather than spilling into a day whose offsets have all moved.
 */
export function isChoiceReminderHourNow(
  localTime: string,
  hour: number,
  catchupHours = CHOICE_REMINDER_CATCHUP_HOURS,
): boolean {
  const localHour = Number(String(localTime).slice(0, 2));
  if (!Number.isFinite(localHour)) return false;
  const start = normalizeChoiceReminderHour(hour);
  return localHour >= start && localHour < Math.min(24, start + Math.max(1, catchupHours));
}

/** The last local day the sweep will look at a needed-by date at all. */
export function choiceReminderLastDay(
  neededBy: string,
  offsets: number[] = [...DEFAULT_CHOICE_REMINDER_OFFSETS],
): string {
  const safe = normalizeChoiceOffsets(offsets);
  return choiceReminderDueOn(neededBy, safe[safe.length - 1] + CHOICE_REMINDER_GRACE_DAYS);
}

/**
 * Which reminder — if any — a needed-by date owes on `today`.
 *
 * MISSED DAYS ARE SKIPPED, NOT REPLAYED. If the cron was down, or the
 * automation was only switched on this morning, this returns the LAST stage
 * whose day has passed and not the first. Sending "you have choices due today"
 * on the day, and again the next morning because yesterday's run never
 * happened, is a schedule the panel never promised — and the customer
 * experiences it as the system waking up and working through a backlog at them.
 *
 * Returns null when nothing is due: too early, or past the grace window.
 */
export function dueChoiceStage(input: { neededBy: string; today: string; offsets?: number[] }): number | null {
  const offsets = normalizeChoiceOffsets(input.offsets);
  const elapsed = choiceDayDiff(input.neededBy, input.today);

  // Past the tail. Without this a needed-by date from last March would keep
  // matching stage 1 forever, and switching the automation on would text every
  // homeowner who ever had a deadline.
  if (elapsed > offsets[offsets.length - 1] + CHOICE_REMINDER_GRACE_DAYS) return null;

  let due: number | null = null;
  for (let index = 0; index < offsets.length; index += 1) {
    if (offsets[index] <= elapsed) due = index;
  }
  return due;
}

// -- Eligibility --------------------------------------------------------------

/** The parts of a choice this file needs. Anything shaped like it can be judged. */
export type ChoiceForReminder = {
  id: string;
  title: string;
  status: 'open' | 'chosen' | 'cancelled';
  decideBy: string | null;
  /** A choice with nothing to choose between is not a choice yet. */
  optionCount: number;
};

/**
 * Is this choice one we would ever text about?
 *
 * Three conditions, and each is a stop condition read backwards:
 *
 *   - STILL OPEN. A submitted or cancelled choice is settled, and settled is the
 *     first of the automatic stops.
 *   - HAS A NEEDED-BY DATE. The date is the schedule; without one there is no
 *     day to send on. A contractor who left it blank said this one does not
 *     matter yet, and inventing a reason to text somebody is exactly what the
 *     blank field exists to prevent. Clearing the date later stops the reminders
 *     for the same reason it prevented them.
 *   - HAS OPTIONS. Pre-existing rule, kept: "you have a choice to make" with
 *     nothing to choose between wastes the one bit of attention the message buys.
 */
export function isChoiceEligible(choice: ChoiceForReminder): boolean {
  return choice.status === 'open' && Boolean(choice.decideBy) && choice.optionCount > 0;
}

/** The job fields that decide whether ANY reminder may go out for it. */
export type JobForReminder = { status: string };

/**
 * Closed, cancelled, or finished — the job-level stop.
 *
 * This product expresses both completion and cancellation as a job status:
 * `complete` is finished and `archived` is how a cancelled job is filed. Neither
 * needs a decision from the homeowner any more, and a text asking for one after
 * the job was called off is the single worst message this feature could send.
 */
export function isJobRemindable(job: JobForReminder): boolean {
  return job.status !== 'complete' && job.status !== 'archived';
}

/**
 * Every automatic stop in one predicate, in the order the panel states them.
 *
 * Kept as one function so CHOICE_STOP_LABEL has something to be true OF, and so
 * a stop can never be added to the sweep without appearing here.
 */
export function shouldStopChoiceReminders(input: {
  enabled: boolean;
  job: JobForReminder;
  choices: ChoiceForReminder[];
  optedOut: boolean;
}): { stop: boolean; reason?: 'disabled' | 'job_closed' | 'all_submitted' | 'no_needed_by' | 'opted_out' } {
  if (!input.enabled) return { stop: true, reason: 'disabled' };
  if (!isJobRemindable(input.job)) return { stop: true, reason: 'job_closed' };
  if (input.optedOut) return { stop: true, reason: 'opted_out' };

  const eligible = input.choices.filter(isChoiceEligible);
  if (eligible.length > 0) return { stop: false };

  // Nothing eligible. Which of the two reasons it is decides what the ledger
  // says, and "they picked everything" and "somebody cleared the dates" are
  // different enough answers to be worth telling apart at 2am.
  const open = input.choices.filter((choice) => choice.status === 'open');
  return { stop: true, reason: open.length > 0 ? 'no_needed_by' : 'all_submitted' };
}

// -- Planning -----------------------------------------------------------------
//
// The whole decision — who is owed what, today, and which choices go in which
// message — as one pure function over rows that have already been read. The
// sweep in lib/selection-notify.ts does the reading and the sending and nothing
// else, so every rule below is testable without a database, a clock or a mock.

/** One choice, as the planner needs it. */
export type PlannableChoice = ChoiceForReminder & { jobId: string };

/** One ledger row a message settles. The unique key the duplicate guard is on. */
export type ChoiceReminderClaim = {
  neededBy: string;
  stage: number;
  /** The date this stage was nominally due: neededBy + offsets[stage]. */
  dueOn: string;
};

/** One message to send, and everything needed to write it and record it. */
export type ChoiceReminderSend = {
  jobId: string;
  /** Set only under 'per_choice' grouping. Null means "the whole job". */
  selectionId: string | null;
  /** The local date this is going out — which is not always a claim's dueOn. */
  sendOn: string;
  /** The ledger rows this single message settles — see the coalescing note. */
  claims: ChoiceReminderClaim[];
  selectionIds: string[];
  titles: string[];
  /** Days past the MOST overdue needed-by date covered. Drives {due}. */
  daysPastNeededBy: number;
};

/**
 * What one job owes today.
 *
 * COALESCING, and why it is not optional. A kitchen can carry choices with
 * different needed-by dates — tile needed the 9th, faucet the 12th — and on the
 * 12th BOTH are owed a message: stage 1 for the tile, stage 0 for the faucet.
 * Grouping by needed-by date would send that homeowner two texts within a second
 * of each other, which is precisely the failure "one combined reminder per job"
 * exists to prevent.
 *
 * So under 'job' grouping the unit of SENDING is (job, TODAY) while the unit of
 * RECORDING stays (job, needed-by, stage): one message, two ledger rows, and the
 * duplicate guard still keyed on the thing it must be keyed on.
 *
 * TODAY, not the stage's own dueOn, and the difference is load-bearing. A stage
 * whose day was missed is sent late — dueChoiceStage skips rather than replays,
 * so on the 12th the tile's stage 1 still carries a dueOn of the 11th. Keying on
 * dueOn would put the two messages in different buckets and send both, which is
 * the bug this comment exists to stop somebody reintroducing.
 *
 * Choices are ordered as they were passed in — the board's own sort order — so
 * the bullet list reads in the order the contractor arranged it.
 */
export function planChoiceReminders(input: {
  /** The account's OWN local date. Not the server's. */
  today: string;
  choices: PlannableChoice[];
  offsets?: number[];
  grouping?: ChoiceGrouping;
}): ChoiceReminderSend[] {
  const offsets = normalizeChoiceOffsets(input.offsets);
  const grouping = normalizeChoiceGrouping(input.grouping);

  // Key is (job | selection) + the day it goes out. Insertion order is preserved
  // by Map, which is what keeps the output stable and the tests readable.
  const sends = new Map<string, ChoiceReminderSend>();

  for (const choice of input.choices) {
    if (!isChoiceEligible(choice)) continue;
    const neededBy = choice.decideBy as string;

    const stage = dueChoiceStage({ neededBy, today: input.today, offsets });
    if (stage === null) continue;

    const dueOn = choiceReminderDueOn(neededBy, offsets[stage]);
    const selectionId = grouping === 'per_choice' ? choice.id : null;
    const key = `${selectionId ?? choice.jobId}|${input.today}`;
    const daysPastNeededBy = choiceDayDiff(neededBy, input.today);

    const existing = sends.get(key);
    if (!existing) {
      sends.set(key, {
        jobId: choice.jobId,
        selectionId,
        sendOn: input.today,
        claims: [{ neededBy, stage, dueOn }],
        selectionIds: [choice.id],
        titles: [choice.title],
        daysPastNeededBy,
      });
      continue;
    }

    existing.selectionIds.push(choice.id);
    existing.titles.push(choice.title);
    // One claim per distinct (needed-by, stage): two choices sharing a date
    // share a ledger row, and that row is what stops the second run re-sending.
    if (!existing.claims.some((claim) => claim.neededBy === neededBy && claim.stage === stage)) {
      existing.claims.push({ neededBy, stage, dueOn });
    }
    // The most overdue date in the message is the one it should speak to.
    // "2 choices due today" understates a message that also covers one from
    // last week.
    existing.daysPastNeededBy = Math.max(existing.daysPastNeededBy, daysPastNeededBy);
  }

  return [...sends.values()];
}

// -- The message --------------------------------------------------------------

/** The longest a template may be. Three SMS segments, before substitution. */
export const CHOICE_TEMPLATE_MAX = 480;

/**
 * The placeholders a template may use, and what each becomes.
 *
 * Rendered beside the box in the panel, so the list a contractor reads is this
 * list and not a paragraph somebody typed once.
 */
export const CHOICE_TEMPLATE_TOKENS: { token: string; means: string }[] = [
  { token: '{client}', means: "the customer's first name" },
  { token: '{business}', means: 'your business name' },
  { token: '{job}', means: 'the job name' },
  { token: '{choice_count}', means: '“2 choices”, or “1 choice”' },
  { token: '{choices}', means: 'the list of what they still owe you' },
  { token: '{due}', means: '“due today”, or how overdue they are' },
  { token: '{link}', means: 'their private link to the choices' },
];

/**
 * The default words, and the ones the panel shows until somebody edits them.
 *
 * Opens with the customer's name and names the job, because a homeowner with one
 * contractor and three quotes out has no idea which "your choices" this is.
 */
export const DEFAULT_CHOICE_REMINDER_TEMPLATE = [
  'Hi {client}, you have {choice_count} {due} for your {job} project:',
  '{choices}',
  'Review choices: {link}',
].join('\n');

/**
 * The opt-out line, appended by the renderer and absent from the template.
 *
 * Assembled here where no caller and no edit can omit it — it is not decoration,
 * it is the reason this may be sent to a mobile at all. The same argument as
 * appointmentReminderText's closing line.
 */
export const CHOICE_OPT_OUT_LINE = 'Reply STOP to opt out.';

export type ChoiceTemplateProblem = 'empty' | 'too_long' | 'no_link';

/**
 * Is this a template we would send?
 *
 * Only three ways to get it wrong, and the third is the one that matters: a
 * reminder without {link} is a text telling somebody they owe a decision and
 * giving them no way to make it.
 */
export function validateChoiceTemplate(value: string): { ok: boolean; problem?: ChoiceTemplateProblem; message?: string } {
  const text = String(value ?? '').trim();
  if (!text) return { ok: false, problem: 'empty', message: 'The message cannot be empty.' };
  if (text.length > CHOICE_TEMPLATE_MAX) {
    return { ok: false, problem: 'too_long', message: `Keep it under ${CHOICE_TEMPLATE_MAX} characters.` };
  }
  if (!text.includes('{link}')) {
    return {
      ok: false,
      problem: 'no_link',
      message: 'Include {link} so they can actually get to their choices.',
    };
  }
  return { ok: true };
}

/** "2 choices", "1 choice". */
export function choiceCountLabel(count: number): string {
  const safe = Math.max(0, Math.round(Number(count) || 0));
  return `${safe} choice${safe === 1 ? '' : 's'}`;
}

/**
 * "due today", "now 2 days overdue" — how late they are, in the customer's terms.
 *
 * Stage 0 lands on the needed-by date itself, so it is "due today" and nothing
 * more pointed than that. Later stages have a real number of days behind them
 * and say it, because "still waiting" after a fortnight reads as indifference.
 */
export function choiceDueLabel(daysPastNeededBy: number): string {
  const late = Math.round(Number(daysPastNeededBy) || 0);
  if (late <= 0) return 'due today';
  if (late === 1) return 'due yesterday';
  return `now ${late} days overdue`;
}

/** The bullet list of what they still owe. One line per choice. */
export function choiceListText(titles: string[]): string {
  return titles
    .map((title) => `• ${String(title ?? '').trim() || 'Choice to make'}`)
    .join('\n');
}

export type ChoiceMessageInput = {
  businessName: string;
  clientName: string;
  jobName: string;
  titles: string[];
  /** Days between the needed-by date and the day this is being sent. */
  daysPastNeededBy: number;
  url: string;
  /** Null uses DEFAULT_CHOICE_REMINDER_TEMPLATE. */
  template?: string | null;
};

/**
 * The reminder itself.
 *
 * Shared with the settings preview and the SMS catalogue, like
 * appointmentReminderText and quoteFollowupText, so the contractor is never
 * shown a message that differs from the one their client receives.
 *
 * An unknown {placeholder} is left standing rather than blanked. A contractor
 * who typed {name} instead of {client} should see {name} in the preview and fix
 * it, not read a sentence with a hole where a word should be and wonder.
 */
export function choiceReminderText(input: ChoiceMessageInput): string {
  const values: Record<string, string> = {
    client: input.clientName.trim().split(/\s+/)[0] || 'there',
    business: input.businessName.trim() || 'your contractor',
    job: input.jobName.trim() || 'project',
    choice_count: choiceCountLabel(input.titles.length),
    choices: choiceListText(input.titles),
    due: choiceDueLabel(input.daysPastNeededBy),
    link: input.url,
  };

  const template = (input.template ?? '').trim() || DEFAULT_CHOICE_REMINDER_TEMPLATE;
  const body = template.replace(/\{([a-z_]+)\}/g, (whole, token: string) =>
    Object.prototype.hasOwnProperty.call(values, token) ? values[token] : whole,
  );

  return `${body.trimEnd()}\n${CHOICE_OPT_OUT_LINE}`;
}

/**
 * The message the settings panel previews.
 *
 * A fixed, recognizable example rather than the contractor's real data: the
 * panel is rendered on a settings page that knows nothing about any particular
 * job, and a preview built from "whichever job happens to be first" changes
 * under the reader for reasons that have nothing to do with the setting.
 */
export function choiceReminderPreview(input: { businessName: string; template?: string | null }): string {
  return choiceReminderText({
    businessName: input.businessName,
    clientName: 'Sarah',
    jobName: 'Lawn & Order',
    titles: ['Patio tile', 'Kitchen faucet'],
    daysPastNeededBy: 0,
    url: 'letsgetquoted.com/client/jobs/…',
    template: input.template ?? null,
  });
}
