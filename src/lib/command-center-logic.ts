import type { StaffRole } from '@/lib/auth';

// Pure logic for the admin Command Center — date math, trend math, severity
// classification, and role card ordering. Kept apart from
// admin-command-center.ts (which fetches) the same way cash-warning.ts is kept
// apart from cash-forecast-data.ts: no SupabaseClient in this file, so none of
// it needs a database to test.

const DAY_MS = 24 * 60 * 60 * 1000;

export type DateRange = '7d' | '30d' | '90d';
const RANGE_DAYS: Record<DateRange, number> = { '7d': 7, '30d': 30, '90d': 90 };

export function isDateRange(value: string | undefined | null): value is DateRange {
  return value === '7d' || value === '30d' || value === '90d';
}

export type RangeWindow = { currentStart: string; currentEnd: string; previousStart: string; previousEnd: string };

// This period vs. the immediately-preceding period of equal length, e.g. "30d"
// compares the last 30 days against the 30 days before that. Always a rolling
// window off `now`, never a fixed calendar boundary — a fixed boundary would
// make the comparison window's length inconsistent depending on the day of
// the month you load the page.
export function rangeWindow(range: DateRange, now: Date): RangeWindow {
  const spanMs = RANGE_DAYS[range] * DAY_MS;
  const currentEnd = now.getTime();
  const currentStart = currentEnd - spanMs;
  const previousStart = currentStart - spanMs;
  return {
    currentStart: new Date(currentStart).toISOString(),
    currentEnd: new Date(currentEnd).toISOString(),
    previousStart: new Date(previousStart).toISOString(),
    previousEnd: new Date(currentStart).toISOString(),
  };
}

export type Trend = { value: number; previousValue: number; deltaPct: number | null; direction: 'up' | 'down' | 'flat' };

// deltaPct is null when there is no prior-period baseline — "+Infinity%" off
// a zero base is not a number worth showing.
export function computeTrend(value: number, previousValue: number): Trend {
  const direction: Trend['direction'] = value > previousValue ? 'up' : value < previousValue ? 'down' : 'flat';
  const deltaPct = previousValue === 0 ? null : ((value - previousValue) / previousValue) * 100;
  return { value, previousValue, deltaPct, direction };
}

export type AlertSeverity = 'bad' | 'warn' | 'good' | 'neutral';

// A deadline that has passed is worse the longer it's been passed — respond-by
// dates that lapsed hours ago are routine, ones that lapsed days ago are not.
// `graceMs` is how long past due is still just a "warn" before escalating.
export function severityForDeadline(deadlineIso: string | null, now: Date, graceMs = 0): AlertSeverity {
  if (!deadlineIso) return 'neutral';
  const deadlineMs = new Date(deadlineIso).getTime();
  if (!Number.isFinite(deadlineMs)) return 'neutral';
  const overdueMs = now.getTime() - deadlineMs;
  if (overdueMs <= 0) return 'warn';
  return overdueMs > graceMs ? 'bad' : 'warn';
}

export function severityForDunningState(state: string | null): AlertSeverity {
  if (state === 'exhausted') return 'bad';
  if (state === 'needs_card') return 'warn';
  return 'neutral';
}

export function severityForIncident(severity: string): AlertSeverity {
  if (severity === 'critical') return 'bad';
  if (severity === 'warning') return 'warn';
  return 'neutral';
}

const NOT_ONBOARDED_WARN_AFTER_DAYS = 7;

// A brand-new signup not yet connected is routine; one still not connected a
// week later is worth a nudge.
export function severityForOnboardingAge(createdIso: string, now: Date): AlertSeverity {
  const days = (now.getTime() - new Date(createdIso).getTime()) / DAY_MS;
  return days >= NOT_ONBOARDED_WARN_AFTER_DAYS ? 'warn' : 'neutral';
}

// Compact relative time for a Command Center row ("3h ago", "2d ago"). Only
// ever fed a past timestamp in practice, but handles a future one (clock
// skew, scheduled item) rather than printing a negative duration.
export function relativeAge(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '—';
  const abs = Math.abs(ms);
  const suffix = ms >= 0 ? 'ago' : 'from now';
  const minute = 60 * 1000;
  const hour = 60 * minute;
  if (abs < minute) return 'just now';
  if (abs < hour) return `${Math.round(abs / minute)}m ${suffix}`;
  if (abs < DAY_MS) return `${Math.round(abs / hour)}h ${suffix}`;
  const days = Math.round(abs / DAY_MS);
  if (days < 30) return `${days}d ${suffix}`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ${suffix}`;
  return `${Math.round(months / 12)}y ${suffix}`;
}

// One card per Command Center signal. Order here is the 'admin' default;
// support/finance defaults below reorder the same set rather than hiding any
// of it — every role can still see everything, just prioritized differently.
export const CARD_KEYS = [
  'incidents',
  'myCases',
  'casesNearSla',
  'disputes',
  'suspendedAccounts',
  'overdueQuickStops',
  'notOnboarded',
  'dunning',
  'pausedPayouts',
  'failedSms',
  'failedEmails',
  'webhookFailures',
] as const;
export type CardKey = typeof CARD_KEYS[number];

const ROLE_DEFAULT_ORDER: Record<StaffRole, CardKey[]> = {
  admin: ['incidents', 'myCases', 'disputes', 'suspendedAccounts', 'overdueQuickStops', 'casesNearSla', 'notOnboarded', 'dunning', 'pausedPayouts', 'failedSms', 'failedEmails', 'webhookFailures'],
  support: ['myCases', 'casesNearSla', 'overdueQuickStops', 'suspendedAccounts', 'disputes', 'notOnboarded', 'incidents', 'failedSms', 'failedEmails', 'dunning', 'pausedPayouts', 'webhookFailures'],
  finance: ['disputes', 'dunning', 'pausedPayouts', 'suspendedAccounts', 'notOnboarded', 'incidents', 'myCases', 'casesNearSla', 'overdueQuickStops', 'failedSms', 'failedEmails', 'webhookFailures'],
};

// Falls back to the admin order for an unrecognized role rather than throwing
// — same fail-open posture as staffRoleFor itself.
export function defaultCardOrder(role: StaffRole): CardKey[] {
  return ROLE_DEFAULT_ORDER[role] ?? ROLE_DEFAULT_ORDER.admin;
}
