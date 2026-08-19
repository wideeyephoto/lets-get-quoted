/**
 * What is scheduled, what it does, and how late is too late.
 *
 * vercel.json is the thing that actually causes a job to fire, so it stays the
 * schedule's source of truth. This file is the console's reading of it: the
 * same job names and expressions, plus the two things vercel.json cannot carry
 * — what the job is FOR, in the words somebody would use at 2am, and how badly
 * it matters if it stops.
 *
 * Keeping a second copy is a real risk, so test/cron-jobs.test.ts reads
 * vercel.json and asserts the two agree on both the set of jobs and every
 * expression. A registry that silently drifts from the schedule would report a
 * job healthy because it is grading it against a cadence it no longer runs at.
 *
 * Pure: no database, no request. The health page fetches; this decides.
 */

/** How much it matters that this one stopped. */
export type CronImportance = 'money' | 'customer' | 'housekeeping';

export type CronJobSpec = {
  /** Route segment under /api/cron, and the value written to cron_runs.job. */
  job: string;
  label: string;
  /** The vercel.json expression, verbatim. */
  schedule: string;
  importance: CronImportance;
  /** What stops happening if this job stops. Rendered on the health page. */
  consequence: string;
};

export const CRON_JOBS: CronJobSpec[] = [
  {
    job: 'legacy-quick-stop-late-refunds',
    label: 'Legacy Quick Stop late refunds',
    schedule: '*/5 * * * *',
    importance: 'money',
    consequence: 'Expired Quick Stops paid after their hold lapsed stop receiving the required full destination-charge refund.',
  },
  {
    job: 'connected-payment-projection',
    label: 'Connected payment projection',
    schedule: '*/5 * * * *',
    importance: 'money',
    consequence: 'Signed connected-account Checkout success events stop marking direct payments paid and reconciled.',
  },
  {
    job: 'top-up-projection',
    label: 'Top-up projection',
    schedule: '*/5 * * * *',
    importance: 'money',
    consequence: 'Paid top-up purchases stop becoming usage credit, so a workspace is charged and receives nothing.',
  },
  {
    job: 'direct-payment-settlement',
    label: 'Direct payment settlement',
    schedule: '*/5 * * * *',
    importance: 'money',
    consequence: 'Successful direct payments stop receiving their idempotent job-feed entry and currently-consented receipt text.',
  },
  {
    job: 'billing-subscription-projection',
    label: 'Billing subscription projection',
    schedule: '*/5 * * * *',
    importance: 'money',
    consequence: 'Signed Stripe Billing events stop updating paid plans, invoices, and monthly allowance anchors.',
  },
  {
    job: 'billing-allowance-resets',
    label: 'Paid-plan allowance resets',
    schedule: '*/15 * * * *',
    importance: 'money',
    consequence: 'Paid contractors stop receiving their anchored monthly usage allowances after renewal.',
  },
  {
    job: 'dunning',
    label: 'Dunning retries',
    schedule: '0 15 * * *',
    importance: 'money',
    consequence: 'Failed saved-card charges stop being retried, so recoverable revenue is silently written off.',
  },
  {
    job: 'recurring',
    label: 'Recurring plans',
    schedule: '0 13 * * *',
    importance: 'money',
    consequence: 'Recurring charges stop being collected. Nothing else in the product notices.',
  },
  {
    job: 'plan-installments',
    label: 'Payment plan installments',
    schedule: '0 14 * * *',
    importance: 'money',
    consequence: 'Due installments are never charged, so payment plans quietly stall mid-schedule.',
  },
  {
    job: 'quick-stop-sweep',
    label: 'Quick Stop sweep',
    schedule: '*/15 * * * *',
    importance: 'money',
    consequence: 'Lapsed payment holds are not released and unanswered requests stay open, holding customer funds.',
  },
  {
    job: 'quickbooks-sync',
    label: 'QuickBooks sync',
    schedule: '0 6 * * *',
    importance: 'money',
    consequence: 'Connected accounts stop receiving their books, and the gap is only found at reconciliation.',
  },
  {
    job: 'appointment-reminders',
    label: 'Appointment reminders',
    schedule: '0 * * * *',
    importance: 'customer',
    consequence: 'Customers stop being reminded of appointments, which shows up as no-shows rather than as an outage.',
  },
  {
    job: 'arrival-late',
    label: 'Late arrival alerts',
    schedule: '*/15 * * * *',
    importance: 'customer',
    consequence: 'Customers are not told their crew is running late.',
  },
  {
    job: 'arrival-confirm',
    label: 'Morning confirmations',
    schedule: '0 11 * * *',
    importance: 'customer',
    consequence: 'The day-of confirmation never goes out.',
  },
  {
    job: 'quote-followups',
    label: 'Quote follow-ups',
    schedule: '0 * * * *',
    importance: 'customer',
    consequence: 'Stalled quotes stop being chased, so they age out as losses instead of closing.',
  },
  {
    job: 'selection-chase',
    label: 'Choice reminders',
    // Hourly because each account sends in its own timezone at its own chosen
    // hour, so every hour has to be offered for any of them to be pickable.
    schedule: '0 * * * *',
    importance: 'customer',
    consequence: 'Customers are not reminded about outstanding choices, which blocks the jobs waiting on them.',
  },
  {
    job: 'service-reminders',
    label: 'Service reminders',
    schedule: '0 13 * * 1',
    importance: 'customer',
    consequence: 'Repeat-service customers are never invited back.',
  },
  {
    job: 'daily-digest',
    label: 'Daily digest',
    schedule: '0 12 * * *',
    importance: 'customer',
    consequence: 'Owners lose their morning summary — usually reported by them before anyone here notices.',
  },
  {
    job: 'blog',
    label: 'Blog drafting',
    schedule: '0 9 * * *',
    importance: 'housekeeping',
    consequence: 'Scheduled posts stop being drafted and published.',
  },
  {
    job: 'geocode-backfill',
    label: 'Geocode backfill',
    schedule: '0 7 * * *',
    importance: 'housekeeping',
    consequence: 'Addresses without coordinates stay unmapped, degrading routing and drive times over time.',
  },
  {
    job: 'capacity-lifecycle',
    label: 'Purchased capacity lifecycle',
    schedule: '37 * * * *',
    // Money, not housekeeping, the moment a capacity SKU is sellable: this is
    // the only thing that stops a cancelled subscription from granting seats and
    // storage for ever. While every capacity SKU is withheld it has no rows to
    // sweep, and the importance is stated for the world it is being built for.
    importance: 'money',
    consequence: 'Cancelled capacity subscriptions keep granting seats and storage, and lapsed ones are never marked past due.',
  },
  {
    job: 'storage-usage-sweep',
    label: 'Storage usage sweep',
    schedule: '17 * * * *',
    // Housekeeping rather than money while the storage SKU is withheld and
    // enforcement is dark. It becomes money the day either goes live: a stalled
    // sweep freezes every workspace's measurement, so uploads are then admitted
    // or refused against a number that stopped moving.
    importance: 'housekeeping',
    consequence: 'Workspace storage measurements freeze, so Plan & usage shows a stale figure and the upload cap is enforced against it.',
  },
  {
    job: 'usage-reservation-expiry',
    label: 'Usage reservation expiry',
    schedule: '*/15 * * * *',
    // Money, and the quiet kind. Credits held by a reservation that died
    // mid-request are subtracted from a workspace's balance and never given
    // back, because available = granted - consumed - reserved - revoked. Nothing
    // errors; the balance is simply wrong and stays wrong.
    importance: 'money',
    consequence: 'Credits held by requests that died mid-flight are never released, so a workspace permanently loses balance it paid for.',
  },
];

export function cronJob(job: string): CronJobSpec | undefined {
  return CRON_JOBS.find((j) => j.job === job);
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How often the expression fires, in milliseconds.
 *
 * Handles the four shapes this schedule actually uses and returns null for
 * anything else, rather than guessing. A general cron parser would be a lot of
 * code to support expressions nobody has written, and — worse — a subtly wrong
 * one produces a confident "overdue" badge on a healthy job, which is the fastest
 * way to teach staff to ignore this page.
 *
 *   asterisk-slash-N * * * *   every N minutes
 *   0 * * * *                  hourly
 *   0 H * * *                  daily
 *   0 H * * D                  weekly
 */
export function expectedIntervalMs(schedule: string): number | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dom, month, dow] = parts;
  if (dom !== '*' || month !== '*') return null;

  const everyNMinutes = /^\*\/(\d+)$/.exec(minute);
  if (everyNMinutes && hour === '*' && dow === '*') {
    const n = Number(everyNMinutes[1]);
    return n > 0 && n < 60 ? n * MINUTE : null;
  }
  // Everything below pins the minute to a literal.
  if (!/^\d+$/.test(minute)) return null;
  if (hour === '*') return dow === '*' ? HOUR : null;
  if (!/^\d+$/.test(hour)) return null;
  if (dow === '*') return DAY;
  if (/^\d+$/.test(dow)) return 7 * DAY;
  return null;
}

/**
 * The health verdict for one job.
 *
 * `stale` is deliberately separate from `failing`: a job whose last run threw
 * is a different problem from one that has not been seen at all, and the second
 * is the one nobody would otherwise notice. `unknown` means the job has never
 * reported — which, right after this ships, is every job, and must not be
 * painted as a fault.
 */
export type CronHealth = 'ok' | 'failing' | 'stale' | 'running' | 'unknown';

/**
 * Grace beyond one full interval before a job counts as overdue.
 *
 * A whole extra interval is too lax for the daily money jobs (a full day late
 * is not "a bit late") and too strict for nothing. One interval or one hour,
 * whichever is smaller: the 15-minute sweeps get 15 minutes of slack, and
 * everything slower gets an hour — enough to absorb a scheduler running late or
 * a long execution, not enough to hide a missed day.
 */
export function graceMs(intervalMs: number): number {
  return Math.min(intervalMs, HOUR);
}

/** A wrapper may finish while its own summary reports failed work. */
export function cronSummaryHasFailures(summary: Record<string, unknown> | null | undefined): boolean {
  if (!summary) return false;
  return Object.entries(summary).some(([key, value]) => {
    if (!/(^|_)(failed|failures|errors|error_count)$/i.test(key)) return false;
    if (typeof value === 'number') return Number.isFinite(value) && value > 0;
    if (typeof value === 'boolean') return value;
    return typeof value === 'string' && value.trim() !== '' && value.trim() !== '0';
  });
}

export function cronHealth(
  spec: CronJobSpec,
  last: { started_at: string; finished_at: string | null; ok: boolean | null; summary?: Record<string, unknown> | null } | null,
  lastSuccessAt: string | null,
  now: Date,
): CronHealth {
  if (!last) return 'unknown';

  const interval = expectedIntervalMs(spec.schedule);
  const startedMs = new Date(last.started_at).getTime();

  // Started and never finished. Below one interval that is simply a run in
  // flight; beyond it the process died without writing its own ending, and no
  // success-only timestamp could tell you that.
  if (!last.finished_at) {
    if (!Number.isFinite(startedMs)) return 'unknown';
    const age = now.getTime() - startedMs;
    if (interval !== null && age > interval + graceMs(interval)) return 'failing';
    return 'running';
  }

  if (last.ok === false || cronSummaryHasFailures(last.summary)) return 'failing';

  // Ran, and succeeded. The remaining question is whether it has run RECENTLY
  // enough — a job that succeeded once and then stopped firing altogether looks
  // perfectly healthy by its last row.
  if (interval === null) return 'ok';
  const successMs = lastSuccessAt ? new Date(lastSuccessAt).getTime() : NaN;
  if (!Number.isFinite(successMs)) return 'failing';
  return now.getTime() - successMs > interval + graceMs(interval) ? 'stale' : 'ok';
}

export const CRON_HEALTH_LABEL: Record<CronHealth, string> = {
  ok: 'Healthy',
  failing: 'Failing',
  stale: 'Overdue',
  running: 'Running',
  unknown: 'Never seen',
};

/** The expression in words, because five fields are not readable at a glance. */
export function scheduleInWords(schedule: string): string {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return schedule;
  const [minute, hour, , , dow] = parts;
  const everyN = /^\*\/(\d+)$/.exec(minute);
  if (everyN && hour === '*') return `Every ${everyN[1]} minutes`;
  // Everything below reads the minute as a single literal, so anything else —
  // a list like "15,45", a range — has to fall through to the raw expression.
  // Calling "15,45 * * * *" hourly would understate it by half.
  if (!/^\d+$/.test(minute)) return schedule;
  if (hour === '*') return 'Hourly';
  const h = Number(hour);
  if (!Number.isFinite(h)) return schedule;
  // UTC is stated because Vercel schedules in UTC and the reader is not in it.
  const at = `${String(h).padStart(2, '0')}:${minute.padStart(2, '0')} UTC`;
  if (dow === '*') return `Daily at ${at}`;
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const d = Number(dow);
  return Number.isFinite(d) && DAYS[d] ? `${DAYS[d]}s at ${at}` : `Weekly at ${at}`;
}
