// The Reviews Command Center's rules, with no database and no clock in them.
//
// PURE, and clock-free in the same way src/lib/cash-outlook.ts is: `now` always
// arrives as an argument. Every number the page prints is computed here so it
// can be tested against a fixture instead of against a screenshot.
//
// THE DENOMINATOR BUG THIS FILE EXISTS TO END
// -------------------------------------------
// The old screen computed the rating breakdown as
//
//     pct = starCount / totalInvites
//
// which divides ratings received by requests SENT. One 5-star reply to four
// requests rendered "5★ — 1 · 25%", and 25% is not a fact about anybody's work;
// it is the response rate wearing the distribution's clothes. The other three
// people had not rated anything, so they cannot be in the denominator of "what
// did the people who rated say".
//
// Both figures are real and they are different questions:
//
//     distribution  =  ratings at N stars  /  ratings RECEIVED
//     response rate =  requests answered   /  requests SENT
//
// `ratingDistribution` cannot be called without a `rated` count, and
// `responseRate` cannot be called without a `sent` count, so neither can quietly
// take the other's denominator again.

import { isReviewRating, type ReviewRating, type ReviewInviteRow } from '@/lib/review-routing';

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What happened to one request, as a single value.
 *
 * Only states we can actually observe. There is deliberately no "Viewed" and no
 * "Delivered": nothing stamps a row when somebody opens the feedback page, and
 * Google never tells us whether a review was posted. Inventing either would put
 * a column on screen that is always empty or always wrong.
 */
export const REQUEST_STATUSES = ['awaiting', 'rated', 'public', 'private', 'both'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  awaiting: 'Awaiting response',
  rated: 'Rated, no route taken',
  public: 'Opened Google page',
  private: 'Left private feedback',
  both: 'Public and private',
};

/** Drives the badge colour. 'warn' is not "bad news", it is "needs you". */
export const REQUEST_STATUS_TONE: Record<RequestStatus, 'neutral' | 'good' | 'warn'> = {
  awaiting: 'neutral',
  rated: 'neutral',
  public: 'good',
  private: 'warn',
  both: 'good',
};

/** True when the customer took the public route. Reads the legacy column too. */
export function wentPublic(row: ReviewInviteRow): boolean {
  return Boolean(row.google_clicked_at) || row.routed_to === 'google';
}

/** True when they wrote to the contractor directly. */
export function wentPrivate(row: ReviewInviteRow): boolean {
  return Boolean(row.feedback_at) || (row.routed_to === 'private' && Boolean(row.feedback));
}

/**
 * One status per row, most-specific first. `both` outranks the two singles
 * because a person who did each thing did not do only one of them — the old
 * `routed_to` column could not express this at all, which is half of why it is
 * only read as a fallback now.
 */
export function requestStatus(row: ReviewInviteRow): RequestStatus {
  const pub = wentPublic(row);
  const priv = wentPrivate(row);
  if (pub && priv) return 'both';
  if (pub) return 'public';
  if (priv) return 'private';
  if (isReviewRating(row.rating)) return 'rated';
  return 'awaiting';
}

/** Anything other than silence. Matches summariseReviewInvites' `responded`. */
export function hasResponded(row: ReviewInviteRow): boolean {
  return requestStatus(row) !== 'awaiting';
}

/* -------------------------------------------------------------------------- */
/* The corrected arithmetic                                                   */
/* -------------------------------------------------------------------------- */

export type DistributionBar = {
  rating: ReviewRating;
  count: number;
  /** Share of ratings RECEIVED, 0-100. Read the file header before changing. */
  pct: number;
};

/**
 * The star breakdown.
 *
 * @param starCounts how many ratings came in at each star value
 * @param rated      how many ratings were received IN TOTAL — never how many
 *                   requests were sent. Passing the wrong one here is the whole
 *                   bug, which is why it is a required argument rather than
 *                   something this function could helpfully derive.
 */
export function ratingDistribution(
  starCounts: Record<ReviewRating, number>,
  rated: number,
): DistributionBar[] {
  return ([5, 4, 3, 2, 1] as const).map((rating) => ({
    rating,
    count: starCounts[rating],
    // Not `|| 1`. With nothing rated the honest answer is 0%, and a 1 in the
    // denominator to dodge a division by zero silently turns "no data" into a
    // real-looking number.
    pct: rated > 0 ? Math.round((starCounts[rating] / rated) * 100) : 0,
  }));
}

/**
 * Requests answered over requests SENT.
 *
 * Returns null rather than 0 when nothing has been sent: 0% reads as "nobody
 * replied", and "we have not asked anybody" is a different sentence.
 */
export function responseRate(responded: number, sent: number): number | null {
  return sent > 0 ? Math.round((responded / sent) * 100) : null;
}

/* -------------------------------------------------------------------------- */
/* Date windows and period comparison                                         */
/* -------------------------------------------------------------------------- */

export const DATE_RANGES = ['30d', '90d', '12m', 'all'] as const;
export type DateRange = (typeof DATE_RANGES)[number];

export const DATE_RANGE_LABEL: Record<DateRange, string> = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '12m': 'Last 12 months',
  all: 'All time',
};

const RANGE_DAYS: Record<Exclude<DateRange, 'all'>, number> = { '30d': 30, '90d': 90, '12m': 365 };

export function normalizeDateRange(value: string | null | undefined): DateRange {
  return (DATE_RANGES as readonly string[]).includes(value ?? '') ? (value as DateRange) : '30d';
}

export type Window = { from: string | null; to: string; days: number | null };

/**
 * The current window and the one immediately before it, for "vs previous
 * period". `all` has no previous period — there is no earlier data by
 * definition — so it returns null and the KPI cards drop the comparison rather
 * than comparing against zero and reporting a triumphant +100%.
 */
export function windowsFor(range: DateRange, nowIso: string): { current: Window; previous: Window | null } {
  const now = new Date(nowIso);
  if (range === 'all') {
    return { current: { from: null, to: nowIso, days: null }, previous: null };
  }
  const days = RANGE_DAYS[range];
  const ms = days * 24 * 60 * 60 * 1000;
  const start = new Date(now.getTime() - ms);
  const prevStart = new Date(now.getTime() - ms * 2);
  return {
    current: { from: start.toISOString(), to: nowIso, days },
    previous: { from: prevStart.toISOString(), to: start.toISOString(), days },
  };
}

export function inWindow(iso: string | null | undefined, window: Window): boolean {
  if (!iso) return false;
  if (window.from !== null && iso < window.from) return false;
  return iso <= window.to;
}

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

export type ReviewChannel = 'sms' | 'email' | 'unknown';

export const CHANNEL_LABEL: Record<ReviewChannel, string> = {
  sms: 'Text',
  email: 'Email',
  unknown: 'Not recorded',
};

/** One row of the activity list: the invite, plus what we could join to it. */
export type ActivityRow = {
  id: string;
  jobId: string | null;
  jobRef: string | null;
  clientId: string | null;
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  rating: ReviewRating | null;
  feedback: string | null;
  status: RequestStatus;
  channel: ReviewChannel;
  sentAt: string;
  respondedAt: string | null;
  googleClickedAt: string | null;
  feedbackAt: string | null;
  remindersSent: number;
  lastRemindedAt: string | null;
  remindersStoppedAt: string | null;
  resolvedAt: string | null;
};

export type ActivityFilters = {
  range: DateRange;
  search: string;
  status: RequestStatus | 'any';
  rating: ReviewRating | 'any';
  channel: ReviewChannel | 'any';
};

export const EMPTY_FILTERS: ActivityFilters = {
  range: '30d',
  search: '',
  status: 'any',
  rating: 'any',
  channel: 'any',
};

export function readFilters(params: Record<string, string | string[] | undefined>): ActivityFilters {
  const one = (key: string): string => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? '';
  };
  const status = one('status');
  const rating = Number(one('rating'));
  const channel = one('channel');
  return {
    range: normalizeDateRange(one('range')),
    search: one('q').trim().slice(0, 80),
    status: (REQUEST_STATUSES as readonly string[]).includes(status) ? (status as RequestStatus) : 'any',
    rating: isReviewRating(rating) ? rating : 'any',
    channel: (['sms', 'email', 'unknown'] as const).includes(channel as ReviewChannel)
      ? (channel as ReviewChannel)
      : 'any',
  };
}

/** True when any filter is narrowing the list — drives the "Clear" affordance. */
export function filtersActive(filters: ActivityFilters): boolean {
  return (
    filters.search !== '' ||
    filters.status !== 'any' ||
    filters.rating !== 'any' ||
    filters.channel !== 'any' ||
    filters.range !== EMPTY_FILTERS.range
  );
}

/**
 * Search matches the customer or the job, which is what the brief asked for and
 * also all a contractor ever has to hand: they remember "the Kowalski job" or
 * the job number, never the invite id.
 */
function matchesSearch(row: ActivityRow, needle: string): boolean {
  if (!needle) return true;
  const hay = [row.clientName, row.jobRef, row.clientPhone, row.clientEmail]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(needle.toLowerCase());
}

export function applyFilters(rows: ActivityRow[], filters: ActivityFilters, window: Window): ActivityRow[] {
  return rows.filter((row) => {
    if (!inWindow(row.sentAt, window)) return false;
    if (filters.status !== 'any' && row.status !== filters.status) return false;
    if (filters.rating !== 'any' && row.rating !== filters.rating) return false;
    if (filters.channel !== 'any' && row.channel !== filters.channel) return false;
    return matchesSearch(row, filters.search);
  });
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

export const ACTIVITY_TABS = ['all', 'public', 'private'] as const;
export type ActivityTab = (typeof ACTIVITY_TABS)[number];

export const ACTIVITY_TAB_LABEL: Record<ActivityTab, string> = {
  all: 'All requests',
  public: 'Public path',
  private: 'Private feedback',
};

export function normalizeTab(value: string | null | undefined): ActivityTab {
  return (ACTIVITY_TABS as readonly string[]).includes(value ?? '') ? (value as ActivityTab) : 'all';
}

export function applyTab(rows: ActivityRow[], tab: ActivityTab): ActivityRow[] {
  if (tab === 'public') return rows.filter((row) => row.status === 'public' || row.status === 'both');
  if (tab === 'private') return rows.filter((row) => row.status === 'private' || row.status === 'both');
  return rows;
}

/**
 * Private feedback, worst first, then oldest first.
 *
 * NOT a gate and not a hidden queue: every one of these customers was offered
 * the public review link at the same moment they were offered this box, and
 * this ordering changes nothing about what they saw. It is triage of what has
 * already happened — a 1★ note from nine days ago is the one to open first.
 */
export function prioritisePrivate(rows: ActivityRow[]): ActivityRow[] {
  return [...rows].sort((a, b) => {
    // Unresolved before resolved: a handled complaint is not the next thing to do.
    if (Boolean(a.resolvedAt) !== Boolean(b.resolvedAt)) return a.resolvedAt ? 1 : -1;
    const ar = a.rating ?? 6;
    const br = b.rating ?? 6;
    if (ar !== br) return ar - br;
    return (a.feedbackAt ?? a.sentAt).localeCompare(b.feedbackAt ?? b.sentAt);
  });
}

/* -------------------------------------------------------------------------- */
/* KPIs                                                                       */
/* -------------------------------------------------------------------------- */

export type Kpi = {
  /** null when there is nothing to average or no requests to divide by. */
  value: number | null;
  /** Same measure over the preceding window. null when there is no comparison. */
  previous: number | null;
  /** value - previous, or null when either side is missing. */
  delta: number | null;
};

function kpi(value: number | null, previous: number | null): Kpi {
  return {
    value,
    previous,
    delta: value !== null && previous !== null ? Math.round((value - previous) * 10) / 10 : null,
  };
}

export type ReviewKpis = {
  sent: number;
  responded: number;
  rated: number;
  averageRating: Kpi;
  responseRate: Kpi;
  googleVisits: Kpi;
  privateFeedback: Kpi;
  unresolvedPrivate: number;
  starCounts: Record<ReviewRating, number>;
  distribution: DistributionBar[];
};

function measure(rows: ActivityRow[]) {
  const starCounts: Record<ReviewRating, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  let rated = 0;
  let responded = 0;
  let google = 0;
  let priv = 0;
  let unresolved = 0;

  for (const row of rows) {
    if (row.rating !== null) {
      starCounts[row.rating] += 1;
      sum += row.rating;
      rated += 1;
    }
    if (row.status !== 'awaiting') responded += 1;
    if (row.status === 'public' || row.status === 'both') google += 1;
    if (row.status === 'private' || row.status === 'both') {
      priv += 1;
      if (!row.resolvedAt) unresolved += 1;
    }
  }

  return {
    sent: rows.length,
    responded,
    rated,
    google,
    priv,
    unresolved,
    starCounts,
    average: rated > 0 ? Math.round((sum / rated) * 10) / 10 : null,
  };
}

/**
 * The four cards, each against the preceding window of the same length.
 *
 * `current` and `previous` are already-filtered row sets, so a comparison always
 * measures the same question over two windows rather than "this filter" against
 * "everything".
 */
export function computeKpis(current: ActivityRow[], previous: ActivityRow[] | null): ReviewKpis {
  const now = measure(current);
  const before = previous ? measure(previous) : null;

  return {
    sent: now.sent,
    responded: now.responded,
    rated: now.rated,
    averageRating: kpi(now.average, before?.average ?? null),
    responseRate: kpi(responseRate(now.responded, now.sent), before ? responseRate(before.responded, before.sent) : null),
    googleVisits: kpi(now.google, before?.google ?? null),
    privateFeedback: kpi(now.priv, before?.priv ?? null),
    unresolvedPrivate: now.unresolved,
    starCounts: now.starCounts,
    distribution: ratingDistribution(now.starCounts, now.rated),
  };
}

/* -------------------------------------------------------------------------- */
/* Trend                                                                      */
/* -------------------------------------------------------------------------- */

export type TrendBucket = { label: string; sent: number; responded: number };

/**
 * Sent vs responded, bucketed.
 *
 * Returns [] when there is nothing in the window, so the caller renders an
 * empty state instead of a flat line along the axis — a chart of zeroes looks
 * like a measurement, and "we have not asked anybody yet" is not one.
 */
export function responseTrend(rows: ActivityRow[], window: Window, buckets = 6): TrendBucket[] {
  if (rows.length === 0) return [];
  const to = new Date(window.to).getTime();
  const from = window.from
    ? new Date(window.from).getTime()
    : Math.min(...rows.map((row) => new Date(row.sentAt).getTime()));
  const span = Math.max(1, to - from);
  const step = span / buckets;

  const out: TrendBucket[] = Array.from({ length: buckets }, (_, index) => ({
    label: new Date(from + step * index).toISOString().slice(0, 10),
    sent: 0,
    responded: 0,
  }));

  for (const row of rows) {
    const at = new Date(row.sentAt).getTime();
    const index = Math.min(buckets - 1, Math.max(0, Math.floor((at - from) / step)));
    out[index].sent += 1;
    if (row.status !== 'awaiting') out[index].responded += 1;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* The whole view, assembled once                                             */
/* -------------------------------------------------------------------------- */

export type ActivityView = {
  filters: ActivityFilters;
  tab: ActivityTab;
  window: Window;
  /** Rows in the window, before the tab narrows them. Drives the tab counts. */
  inRange: ActivityRow[];
  /** What the table actually renders: window + filters + tab. */
  visible: ActivityRow[];
  /** Private feedback in the window, worst and oldest first. */
  privateRows: ActivityRow[];
  kpis: ReviewKpis;
  trend: TrendBucket[];
  counts: Record<ActivityTab, number>;
  /** Requests ever sent, ignoring every filter — for the honest empty state. */
  totalEver: number;
};

/**
 * Everything the page renders, from the rows and the URL.
 *
 * PURE, so the signed-in page and the logged-out demo compute their numbers the
 * same way rather than being two implementations that agree until one of them
 * is edited. The demo passes an empty params object and gets the defaults.
 *
 * The KPI comparison is measured over the *filtered* previous window: if an
 * owner is looking at 5★ requests over 90 days, "vs previous period" means the
 * 90 days before that, also 5★. Comparing a filtered present against an
 * unfiltered past is the classic way for a dashboard to invent a trend.
 */
export function buildActivityView(
  rows: ActivityRow[],
  params: Record<string, string | string[] | undefined>,
  nowIso: string,
): ActivityView {
  const filters = readFilters(params);
  const tabParam = params.tab;
  const tab = normalizeTab(Array.isArray(tabParam) ? tabParam[0] : tabParam);
  const { current, previous } = windowsFor(filters.range, nowIso);

  const inRange = applyFilters(rows, filters, current);
  const priorRows = previous ? applyFilters(rows, filters, previous) : null;

  return {
    filters,
    tab,
    window: current,
    inRange,
    visible: applyTab(inRange, tab),
    privateRows: prioritisePrivate(applyTab(inRange, 'private')),
    kpis: computeKpis(inRange, priorRows),
    trend: responseTrend(inRange, current),
    counts: {
      all: inRange.length,
      public: applyTab(inRange, 'public').length,
      private: applyTab(inRange, 'private').length,
    },
    totalEver: rows.length,
  };
}

/* -------------------------------------------------------------------------- */
/* What the buttons are allowed to do                                         */
/* -------------------------------------------------------------------------- */

/**
 * Three reminders, and then it stops being a reminder.
 *
 * A cap rather than a warning: this is an unsolicited message to somebody whose
 * job is finished and who has already ignored the ask more than once. The FTC
 * rule this product's review flow is built around is about not manufacturing
 * reviews, and a fourth chase is the same instinct.
 */
export const MAX_REMINDERS = 3;

export type ReminderBlock =
  | null
  | 'already_responded'
  | 'stopped'
  | 'limit_reached'
  | 'too_soon'
  | 'no_contact';

/** Hours before the same person can be chased again. */
export const REMINDER_COOLDOWN_HOURS = 72;

/**
 * Why the resend button is disabled, or null when it is live.
 *
 * Returned as a reason rather than a boolean so the UI can say WHICH rule is
 * stopping it. A disabled control with no explanation reads as broken.
 */
export function reminderBlock(row: ActivityRow, nowIso: string): ReminderBlock {
  if (row.status !== 'awaiting') return 'already_responded';
  if (row.remindersStoppedAt) return 'stopped';
  if (row.remindersSent >= MAX_REMINDERS) return 'limit_reached';
  if (!row.clientPhone && !row.clientEmail) return 'no_contact';
  const last = row.lastRemindedAt ?? row.sentAt;
  const hours = (new Date(nowIso).getTime() - new Date(last).getTime()) / 3_600_000;
  if (hours < REMINDER_COOLDOWN_HOURS) return 'too_soon';
  return null;
}

/**
 * What every action on this page hands back to the browser.
 *
 * Here rather than in actions.ts because a `'use server'` module may only
 * export async functions — an exported object literal fails the build, and the
 * error names the file rather than the rule, so it is worth stating once.
 */
export type ReviewActionState = { status: 'idle' | 'ok' | 'error'; message: string };
export const REVIEW_ACTION_IDLE: ReviewActionState = { status: 'idle', message: '' };

export function reminderBlockMessage(block: ReminderBlock, row: ActivityRow): string {
  switch (block) {
    case 'already_responded':
      return 'They already responded — there is nothing left to remind them about.';
    case 'stopped':
      return 'You stopped reminders for this request.';
    case 'limit_reached':
      return `Reminded ${row.remindersSent} times already. That is the limit.`;
    case 'too_soon':
      return `Asked recently. You can send another reminder ${REMINDER_COOLDOWN_HOURS} hours after the last one.`;
    case 'no_contact':
      return 'No mobile or email on file for this customer.';
    default:
      return '';
  }
}
