// Single source of truth for the Extra Stop feature: the request lifecycle (its
// status vocabulary + allowed transitions) and the owner-configurable settings
// (pure data + normalize guards + an `...FromAccount` builder). Mirrors the
// shape of src/lib/booking-availability.ts. Money is handled in CENTS here; the
// dollars⇄cents conversion for the actual Stripe charge happens at the payments
// boundary. Kept dependency-free so it's safe to import from server actions,
// the public booking path, and the webhook alike.
import { normalizeBookingWeekdays } from './booking-availability';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export type ExtraStopStatus =
  | 'requested'
  | 'awaiting_contractor'
  | 'more_information_requested'
  | 'contractor_declined'
  | 'contractor_offer_sent'
  | 'awaiting_customer_payment'
  | 'offer_expired'
  | 'customer_declined'
  | 'confirmed'
  | 'en_route'
  | 'arrived'
  | 'completed'
  | 'customer_canceled'
  | 'contractor_canceled'
  | 'no_show_reported'
  | 'no_show_confirmed'
  | 'refunded'
  | 'disputed';

export const EXTRA_STOP_STATUSES: ExtraStopStatus[] = [
  'requested',
  'awaiting_contractor',
  'more_information_requested',
  'contractor_declined',
  'contractor_offer_sent',
  'awaiting_customer_payment',
  'offer_expired',
  'customer_declined',
  'confirmed',
  'en_route',
  'arrived',
  'completed',
  'customer_canceled',
  'contractor_canceled',
  'no_show_reported',
  'no_show_confirmed',
  'refunded',
  'disputed',
];

// Statuses where the request is still "live" (occupies a daily slot / a calendar
// hold / an active offer). Used for the daily-limit count and duplicate guard.
export const EXTRA_STOP_ACTIVE_STATUSES: ExtraStopStatus[] = [
  'requested',
  'awaiting_contractor',
  'more_information_requested',
  'contractor_offer_sent',
  'awaiting_customer_payment',
  'confirmed',
  'en_route',
  'arrived',
];

// Terminal statuses — no further transitions.
export const EXTRA_STOP_TERMINAL_STATUSES: ExtraStopStatus[] = [
  'contractor_declined',
  'offer_expired',
  'customer_declined',
  'completed',
  'customer_canceled',
  'contractor_canceled',
  'no_show_confirmed',
  'refunded',
];

// Allowed forward transitions. Kept explicit so server actions can reject an
// out-of-order move (e.g. paying an already-expired offer) instead of trusting
// client state. Disputes are reachable from any post-payment state.
export const EXTRA_STOP_TRANSITIONS: Record<ExtraStopStatus, ExtraStopStatus[]> = {
  requested: ['awaiting_contractor', 'contractor_declined'],
  awaiting_contractor: ['contractor_offer_sent', 'more_information_requested', 'contractor_declined'],
  more_information_requested: ['awaiting_contractor', 'contractor_offer_sent', 'contractor_declined'],
  contractor_declined: [],
  contractor_offer_sent: ['awaiting_customer_payment', 'offer_expired', 'customer_declined'],
  awaiting_customer_payment: ['confirmed', 'offer_expired', 'customer_declined'],
  offer_expired: [],
  customer_declined: [],
  confirmed: ['en_route', 'arrived', 'customer_canceled', 'contractor_canceled', 'no_show_reported', 'disputed'],
  en_route: ['arrived', 'customer_canceled', 'contractor_canceled', 'no_show_reported', 'disputed'],
  arrived: ['completed', 'disputed'],
  completed: ['disputed'],
  customer_canceled: ['refunded', 'disputed'],
  contractor_canceled: ['refunded', 'disputed'],
  no_show_reported: ['no_show_confirmed', 'completed', 'disputed'],
  no_show_confirmed: ['refunded', 'disputed'],
  refunded: ['disputed'],
  disputed: ['refunded', 'completed'],
};

export function canTransition(from: ExtraStopStatus, to: ExtraStopStatus): boolean {
  return EXTRA_STOP_TRANSITIONS[from]?.includes(to) ?? false;
}

// Short human labels + a tone key for badges in the dashboard.
export const EXTRA_STOP_STATUS_LABEL: Record<ExtraStopStatus, string> = {
  requested: 'Requested',
  awaiting_contractor: 'Needs your response',
  more_information_requested: 'More info requested',
  contractor_declined: 'You declined',
  contractor_offer_sent: 'Offer sent',
  awaiting_customer_payment: 'Awaiting payment',
  offer_expired: 'Offer expired',
  customer_declined: 'Customer declined',
  confirmed: 'Confirmed',
  en_route: 'En route',
  arrived: 'Arrived',
  completed: 'Completed',
  customer_canceled: 'Customer canceled',
  contractor_canceled: 'You canceled',
  no_show_reported: 'No-show reported',
  no_show_confirmed: 'No-show confirmed',
  refunded: 'Refunded',
  disputed: 'Disputed',
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const DEFAULT_EXTRA_STOP_WEEKDAYS = [1, 2, 3, 4, 5];
export const DEFAULT_EXTRA_STOP_EARLIEST = '08:00';
export const DEFAULT_EXTRA_STOP_LATEST_END = '20:00';
export const DEFAULT_EXTRA_STOP_MAX_PER_DAY = 2;
export const DEFAULT_EXTRA_STOP_MAX_VISIT_MINUTES = 60;
export const DEFAULT_EXTRA_STOP_MAX_DETOUR_MILES = 10;
export const DEFAULT_EXTRA_STOP_MAX_DETOUR_MINUTES = 20;
export const DEFAULT_EXTRA_STOP_MIN_FEE_CENTS = 5000; // $50
export const DEFAULT_EXTRA_STOP_MAX_FEE_CENTS = 25000; // $250
export const DEFAULT_EXTRA_STOP_RESPONSE_DEADLINE_MINS = 30;
export const DEFAULT_EXTRA_STOP_PAYMENT_DEADLINE_MINS = 15;
export const DEFAULT_EXTRA_STOP_REQUIRED_PHOTOS = 1;
// Days BEYOND today a request may reach. 0 is same-day-only — the original
// behaviour, and a real choice rather than a disabled state.
export const DEFAULT_EXTRA_STOP_DAYS_AHEAD = 1;

export type ExtraStopSettings = {
  enabled: boolean;
  weekdays: number[]; // 0 (Sun) … 6 (Sat)
  earliestTime: string; // HH:MM, 24h
  latestEnd: string; // HH:MM, 24h
  maxPerDay: number;
  maxVisitMinutes: number;
  maxDetourMiles: number;
  maxDetourMinutes: number;
  minFeeCents: number;
  maxFeeCents: number;
  allowAfterCapacity: boolean;
  responseDeadlineMins: number;
  paymentDeadlineMins: number;
  categories: string[]; // lowercased tags; empty = all allowed
  requiredPhotos: number;
  /** Days beyond today a customer may ask for. 0 = today only. */
  daysAhead: number;
  requireAiApproval: boolean;
  // Staff/auto lock (no-show escalation). lockedUntil is an ISO end time; locked
  // is whether that's still in the future; available is the real gate the /book
  // path should use — enabled AND not locked.
  lockedUntil: string | null;
  locked: boolean;
  available: boolean;
};

// Round to a clamped integer with a default fallback.
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

// Validate an "HH:MM" 24h time string, normalizing to zero-padded form.
export function normalizeHHMM(value: unknown, fallback: string): string {
  const s = String(value ?? '').trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return fallback;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// Free-form category tags: CSV or array → deduped, trimmed, lowercased list.
export function normalizeCategories(value: unknown): string[] {
  let raw: unknown[];
  if (Array.isArray(value)) raw = value;
  else if (typeof value === 'string') raw = value.split(',');
  else return [];
  const tags = raw
    .map((t) => String(t).trim().toLowerCase())
    .filter((t) => t !== '');
  return Array.from(new Set(tags));
}

export function dollarsToCents(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function centsToDollars(cents: unknown): number {
  const n = Number(cents);
  return Number.isFinite(n) ? Math.round(n) / 100 : 0;
}

// Clamp a contractor-entered fee (in cents) into the account's [min,max] band.
export function clampFeeCents(cents: number, settings: ExtraStopSettings): number {
  const floor = Math.min(settings.minFeeCents, settings.maxFeeCents);
  const ceil = Math.max(settings.minFeeCents, settings.maxFeeCents);
  return Math.min(ceil, Math.max(floor, Math.round(cents)));
}

type AccountExtraStopRow =
  | {
      extra_stop_enabled?: unknown;
      extra_stop_weekdays?: unknown;
      extra_stop_earliest_time?: unknown;
      extra_stop_latest_end?: unknown;
      extra_stop_max_per_day?: unknown;
      extra_stop_max_visit_minutes?: unknown;
      extra_stop_max_detour_miles?: unknown;
      extra_stop_max_detour_minutes?: unknown;
      extra_stop_min_fee_cents?: unknown;
      extra_stop_max_fee_cents?: unknown;
      extra_stop_allow_after_capacity?: unknown;
      extra_stop_response_deadline_mins?: unknown;
      extra_stop_payment_deadline_mins?: unknown;
      extra_stop_categories?: unknown;
      extra_stop_required_photos?: unknown;
      extra_stop_require_ai_approval?: unknown;
      extra_stop_locked_until?: unknown;
      extra_stop_days_ahead?: unknown;
    }
  | null
  | undefined;

// Defensive: build a normalized ExtraStopSettings from raw account columns,
// degrading to safe defaults for any missing/invalid field (so a pre-migration
// row — every column absent — still yields a coherent, feature-off config).
export function extraStopSettingsFromAccount(row: AccountExtraStopRow): ExtraStopSettings {
  const enabled = row?.extra_stop_enabled === true;
  const lockedUntil = typeof row?.extra_stop_locked_until === 'string' ? row.extra_stop_locked_until : null;
  const locked = lockedUntil ? new Date(lockedUntil).getTime() > Date.now() : false;
  return {
    enabled,
    lockedUntil,
    locked,
    available: enabled && !locked,
    weekdays: normalizeBookingWeekdays(row?.extra_stop_weekdays),
    earliestTime: normalizeHHMM(row?.extra_stop_earliest_time, DEFAULT_EXTRA_STOP_EARLIEST),
    latestEnd: normalizeHHMM(row?.extra_stop_latest_end, DEFAULT_EXTRA_STOP_LATEST_END),
    maxPerDay: clampInt(row?.extra_stop_max_per_day, 1, 50, DEFAULT_EXTRA_STOP_MAX_PER_DAY),
    maxVisitMinutes: clampInt(row?.extra_stop_max_visit_minutes, 5, 600, DEFAULT_EXTRA_STOP_MAX_VISIT_MINUTES),
    maxDetourMiles: clampNumber(row?.extra_stop_max_detour_miles, 0, 500, DEFAULT_EXTRA_STOP_MAX_DETOUR_MILES),
    maxDetourMinutes: clampInt(row?.extra_stop_max_detour_minutes, 0, 600, DEFAULT_EXTRA_STOP_MAX_DETOUR_MINUTES),
    minFeeCents: clampInt(row?.extra_stop_min_fee_cents, 0, 100_000_00, DEFAULT_EXTRA_STOP_MIN_FEE_CENTS),
    maxFeeCents: clampInt(row?.extra_stop_max_fee_cents, 0, 100_000_00, DEFAULT_EXTRA_STOP_MAX_FEE_CENTS),
    allowAfterCapacity: row?.extra_stop_allow_after_capacity !== false,
    responseDeadlineMins: clampInt(row?.extra_stop_response_deadline_mins, 1, 720, DEFAULT_EXTRA_STOP_RESPONSE_DEADLINE_MINS),
    paymentDeadlineMins: clampInt(row?.extra_stop_payment_deadline_mins, 1, 720, DEFAULT_EXTRA_STOP_PAYMENT_DEADLINE_MINS),
    categories: normalizeCategories(row?.extra_stop_categories),
    requiredPhotos: clampInt(row?.extra_stop_required_photos, 0, 6, DEFAULT_EXTRA_STOP_REQUIRED_PHOTOS),
    daysAhead: clampInt(row?.extra_stop_days_ahead, 0, 7, DEFAULT_EXTRA_STOP_DAYS_AHEAD),
    requireAiApproval: row?.extra_stop_require_ai_approval !== false,
  };
}

// -- Which days a customer may ask for ---------------------------------------

export type ExtraStopDayOption = {
  dateKey: string;
  /** "Today" / "Tomorrow" / "Wed, Aug 6" — the customer reads this, not a date. */
  label: string;
  isToday: boolean;
};

const DAY_MS = 86_400_000;

function keyToUtc(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

function utcToKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** Wall-clock "YYYY-MM-DD" and "HH:MM" in the contractor's zone. */
export function zonedNowParts(now: Date, timeZone: string): { dateKey: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  // Intl renders midnight as 24 in some engines.
  const hour = String(Number(get('hour')) % 24).padStart(2, '0');
  return { dateKey: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}:${get('minute')}` };
}

/**
 * The days a customer can actually ask for.
 *
 * Three gates, and all three have bitten something before:
 *   1. The owner's working weekdays. Offering Sunday to somebody who doesn't
 *      work Sundays wastes their time and the contractor's.
 *   2. `daysAhead` — 0 is same-day only, which is where this feature started.
 *   3. TODAY DROPS OFF once the day's last arrival time has passed. At 9pm,
 *      "today" is not a thing you can be squeezed into, and offering it is the
 *      difference between a request the contractor can answer and one they have
 *      to apologise for.
 *
 * Pure: `now` is injectable, and every boundary is computed in the contractor's
 * zone rather than the server's or the visitor's.
 */
export function extraStopDayOptions(
  settings: Pick<ExtraStopSettings, 'weekdays' | 'daysAhead' | 'latestEnd'>,
  opts: { now?: Date; timeZone: string },
): ExtraStopDayOption[] {
  const now = opts.now ?? new Date();
  const { dateKey: todayKey, time } = zonedNowParts(now, opts.timeZone);
  const horizon = Math.max(0, Math.min(7, Math.round(settings.daysAhead)));

  const out: ExtraStopDayOption[] = [];
  for (let offset = 0; offset <= horizon; offset++) {
    const dateKey = utcToKey(new Date(keyToUtc(todayKey).getTime() + offset * DAY_MS));
    if (!settings.weekdays.includes(keyToUtc(dateKey).getUTCDay())) continue;
    if (offset === 0 && time >= settings.latestEnd) continue;
    out.push({
      dateKey,
      label:
        offset === 0
          ? 'Today'
          : offset === 1
            ? 'Tomorrow'
            : keyToUtc(dateKey).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
      isToday: offset === 0,
    });
  }
  return out;
}

/** Is this a day the customer was allowed to pick? Re-checked server-side. */
export function isAllowedExtraStopDay(
  dateKey: string,
  settings: Pick<ExtraStopSettings, 'weekdays' | 'daysAhead' | 'latestEnd'>,
  opts: { now?: Date; timeZone: string },
): boolean {
  return extraStopDayOptions(settings, opts).some((option) => option.dateKey === dateKey);
}

// The column set to select when loading settings — kept next to the builder so
// callers stay in sync with the table.
export const EXTRA_STOP_SETTINGS_COLUMNS =
  'extra_stop_enabled, extra_stop_weekdays, extra_stop_earliest_time, extra_stop_latest_end, ' +
  'extra_stop_max_per_day, extra_stop_max_visit_minutes, extra_stop_max_detour_miles, ' +
  'extra_stop_max_detour_minutes, extra_stop_min_fee_cents, extra_stop_max_fee_cents, ' +
  'extra_stop_allow_after_capacity, extra_stop_response_deadline_mins, extra_stop_payment_deadline_mins, ' +
  'extra_stop_categories, extra_stop_required_photos, extra_stop_require_ai_approval, extra_stop_locked_until, ' +
  'extra_stop_days_ahead';

// No-show escalation ladder. Given the account's PRIOR verified no-show dates,
// decide how long to lock Extra Stop after a fresh one:
//   1st (or none recently) → 10 days · 2nd within 90 days → 30 days ·
//   3rd within 180 days → effectively indefinite ("disabled pending staff review").
// Returns the lock end (ISO), a human reason, and the tier for logging.
export type NoShowLockTier = 1 | 2 | 3;
export function extraStopNoShowLock(priorNoShowDates: Date[], now: Date = new Date()): { untilIso: string; reason: string; tier: NoShowLockTier } {
  const nowMs = now.getTime();
  const within = (days: number) => priorNoShowDates.filter((d) => nowMs - d.getTime() <= days * 86_400_000).length;
  const endIn = (days: number) => new Date(nowMs + days * 86_400_000).toISOString();
  if (within(180) >= 2) return { untilIso: endIn(3650), reason: 'Third no-show within 180 days — Extra Stop disabled pending staff review.', tier: 3 };
  if (within(90) >= 1) return { untilIso: endIn(30), reason: 'Second no-show within 90 days — Extra Stop locked for 30 days.', tier: 2 };
  return { untilIso: endIn(10), reason: 'No-show reported — Extra Stop locked for 10 days.', tier: 1 };
}
