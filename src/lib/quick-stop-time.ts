import type { SupabaseClient } from '@supabase/supabase-js';

// Matches the account and booking defaults. A failed account lookup must not
// silently adopt this zone: only an existing account with no zone gets it.
export const DEFAULT_QUICK_STOP_TIME_ZONE = 'America/New_York';
export const QUICK_STOP_NO_SHOW_GRACE_MS = 2 * 60 * 60 * 1000;

function wallClockFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}

export async function loadQuickStopTimeZone(admin: SupabaseClient, accountId: string): Promise<string | null> {
  try {
    const { data, error } = await admin.from('accounts').select('timezone').eq('id', accountId).maybeSingle();
    if (error || !data) return null;
    const timeZone = data.timezone == null || data.timezone === '' ? DEFAULT_QUICK_STOP_TIME_ZONE : data.timezone;
    if (typeof timeZone !== 'string') return null;
    // An unknown zone must fail closed instead of treating an appointment as
    // expired in the server's zone and potentially sanctioning its contractor.
    wallClockFormatter(timeZone);
    return timeZone;
  } catch {
    return null;
  }
}

function utcPartsMs(year: number, month: number, day: number, hour: number, minute: number, second: number): number {
  // Date.UTC maps years 0..99 to 1900..1999. Explicit setters preserve the year.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getTime();
}

function formattedWallClockMs(formatter: Intl.DateTimeFormat, instantMs: number): number {
  const parts = formatter.formatToParts(instantMs);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  return utcPartsMs(part('year'), part('month'), part('day'), part('hour'), part('minute'), part('second'));
}

/**
 * Convert a stored account-local date and time without using the host zone.
 * Round-trip every candidate through Intl's IANA rules: a spring-forward gap
 * has no candidate and is rejected. For a repeated fall-back time, choose its
 * later occurrence so an arrival window cannot expire before both occurrences.
 */
export function quickStopZonedInstant(
  day: string | null | undefined,
  time: string | null | undefined,
  timeZone: string | null | undefined,
): Date | null {
  if (!day || !time || !timeZone) return null;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!dateMatch || !timeMatch) return null;
  const [, yearText, monthText, dayText] = dateMatch;
  const [, hourText, minuteText, secondText] = timeMatch;
  const [year, month, date, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText ?? '0'].map(Number);
  if (year < 1 || month < 1 || month > 12 || date < 1 || date > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const wallMs = utcPartsMs(year, month, date, hour, minute, second);
  const wall = new Date(wallMs);
  if (wall.getUTCFullYear() !== year || wall.getUTCMonth() !== month - 1 || wall.getUTCDate() !== date) return null;

  try {
    const formatter = wallClockFormatter(timeZone);
    const offsets = new Set<number>();
    // Sampling both sides of the local day includes the offsets before and
    // after DST transitions, including half-hour changes and date-line shifts.
    for (let hours = -36; hours <= 36; hours += 12) {
      const probeMs = wallMs + hours * 60 * 60 * 1000;
      offsets.add(formattedWallClockMs(formatter, probeMs) - probeMs);
    }
    const candidates = [...offsets]
      .map((offset) => wallMs - offset)
      .filter((candidate) => formattedWallClockMs(formatter, candidate) === wallMs);
    return candidates.length ? new Date(Math.max(...candidates)) : null;
  } catch {
    return null;
  }
}

type QuickStopArrivalWindow = {
  arrival_date?: string | null;
  arrival_start?: string | null;
  arrival_end?: string | null;
};

export function quickStopWindowEndMs(window: QuickStopArrivalWindow, timeZone: string | null | undefined): number | null {
  return quickStopZonedInstant(window.arrival_date, window.arrival_end, timeZone)?.getTime() ?? null;
}

type QuickStopNoShowRequest = QuickStopArrivalWindow & {
  status?: string | null;
  payment_id?: string | null;
  job_id?: string | null;
  paid_at?: string | null;
  arrived_at?: string | null;
  completed_at?: string | null;
};

export type QuickStopNoShowEligibility = 'eligible' | 'state' | 'early' | 'late';

/** The public page, reporting action and resolver share this eligibility rule. */
export function quickStopNoShowEligibility(
  request: QuickStopNoShowRequest,
  timeZone: string | null | undefined,
  now: number = Date.now(),
): QuickStopNoShowEligibility {
  const paidMs = request.paid_at ? Date.parse(request.paid_at) : NaN;
  if (
    !['confirmed', 'en_route'].includes(request.status ?? '') ||
    request.arrived_at || request.completed_at ||
    !request.payment_id || !request.job_id || !Number.isFinite(paidMs) ||
    !Number.isFinite(now) || paidMs > now
  ) return 'state';
  const startMs = quickStopZonedInstant(request.arrival_date, request.arrival_start, timeZone)?.getTime() ?? null;
  const endMs = quickStopWindowEndMs(request, timeZone);
  if (startMs == null || endMs == null || endMs <= startMs) return 'state';
  if (now < endMs) return 'early';
  if (now > endMs + QUICK_STOP_NO_SHOW_GRACE_MS) return 'late';
  return 'eligible';
}
