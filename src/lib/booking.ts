import type { SupabaseClient } from '@supabase/supabase-js';
import { createJob, expandScheduledJobs } from '@/lib/jobs';
import { createLead, type Lead } from '@/lib/leads';
import { getAccountOwnerEmail, sendLeadNotificationEmail, sendBookingConfirmationEmail } from '@/lib/email';
import { bookingAvailabilityFromAccount, windowsForTimes, type BookingAvailability } from '@/lib/booking-availability';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

const LOOKAHEAD_DAYS = 21;
const MAX_OFFERED_DAYS = 8;
const DAY_MS = 86_400_000;

export type BookingSlot = { time: string; label: string };
export type BookingDay = { dateKey: string; dayLabel: string; slots: BookingSlot[] };

// Today's calendar date IN the given IANA timezone. The old code used the server's
// local clock, so on a UTC host a US-Eastern owner was offered the wrong day after
// ~7pm; anchoring day math to the owner's timezone fixes that.
function todayInTz(now: Date, timeZone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

function utcDateKey(dt: Date): string {
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// PURE: turn the owner's availability config + the days/windows already taken by
// scheduled jobs into the offerable booking days. Kept side-effect-free (takes
// `now`) so it is directly unit-testable across timezones/DST. Days are computed
// off UTC-noon of "today in the owner's tz" plus whole-day offsets, which is
// stable across DST boundaries.
export function computeBookingDays(opts: {
  availability: BookingAvailability;
  countByDate: Map<string, number>;
  takenByDate: Map<string, Set<string>>;
  now: Date;
  lookaheadDays?: number;
  maxOfferedDays?: number;
}): BookingDay[] {
  const { availability, countByDate, takenByDate, now } = opts;
  const lookahead = opts.lookaheadDays ?? LOOKAHEAD_DAYS;
  const maxOffered = opts.maxOfferedDays ?? MAX_OFFERED_DAYS;
  const windows = windowsForTimes(availability.windowTimes);
  const weekdaySet = new Set(availability.weekdays);
  if (windows.length === 0 || weekdaySet.size === 0) return []; // booking closed

  const today = todayInTz(now, availability.timezone);
  const base = Date.UTC(today.y, today.m - 1, today.d, 12, 0, 0); // noon avoids DST edges
  const startOffset = Math.max(0, availability.leadDays);

  const days: BookingDay[] = [];
  for (let offset = startOffset; offset <= lookahead && days.length < maxOffered; offset++) {
    const dt = new Date(base + offset * DAY_MS);
    if (!weekdaySet.has(dt.getUTCDay())) continue;
    const key = utcDateKey(dt);
    if ((countByDate.get(key) ?? 0) >= availability.maxPerDay) continue;
    const taken = takenByDate.get(key) ?? new Set<string>();
    const slots = windows.filter((w) => !taken.has(w.time));
    if (slots.length === 0) continue;
    days.push({
      dateKey: key,
      dayLabel: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' }).format(dt),
      slots,
    });
  }
  return days;
}

// Open arrival windows over the next few weeks, derived from the owner's booking
// availability config plus the same schedule data the calendar uses: bookable
// weekdays that aren't at capacity, minus any window already taken by a scheduled
// job that day. Reads the account's config itself so callers just pass the id.
export async function getAvailableBookingDays(admin: SupabaseClient, accountId: string): Promise<BookingDay[]> {
  const { data: account } = await admin
    .from('accounts')
    .select('schedule_day_hours, timezone, booking_weekdays, booking_windows, booking_max_per_day, booking_lead_days')
    .eq('id', accountId)
    .maybeSingle();
  const scheduleDayHours = Number(account?.schedule_day_hours) || 8;
  const availability = bookingAvailabilityFromAccount(account);

  const { data: jobs } = await admin
    .from('jobs')
    .select('scheduled_for, scheduled_time, status, estimated_hours')
    .eq('account_id', accountId)
    .not('scheduled_for', 'is', null)
    .neq('status', 'archived');

  const occurrences = expandScheduledJobs(jobs ?? [], scheduleDayHours);
  const countByDate = new Map<string, number>();
  const takenByDate = new Map<string, Set<string>>();
  for (const occurrence of occurrences) {
    const key = occurrence.scheduled_for;
    countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
    const time = (occurrence as { scheduled_time?: string | null }).scheduled_time;
    if (time) {
      const set = takenByDate.get(key) ?? new Set<string>();
      set.add(time.slice(0, 5));
      takenByDate.set(key, set);
    }
  }

  return computeBookingDays({ availability, countByDate, takenByDate, now: new Date() });
}

// Re-validate a client-submitted slot against freshly-derived availability. The
// booking submit must NEVER trust the posted `dateKey|time` string — only a day +
// window that is actually on offer right now is bookable. This rejects tampered or
// arbitrary dates/times (past days, weekends, full days, off-template times) and
// returns the authoritative day/slot carrying the server's OWN labels, so we never
// echo an attacker-supplied value back into the booking record. Returns null when
// the chosen slot isn't offered.
export function findOfferedSlot(days: BookingDay[], dateKey: string, time: string): { day: BookingDay; slot: BookingSlot } | null {
  const day = days.find((candidate) => candidate.dateKey === dateKey);
  if (!day) return null;
  const slot = day.slots.find((candidate) => candidate.time === time);
  return slot ? { day, slot } : null;
}

export type BookingInput = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  description: string | null;
  serviceName: string | null;
  dateKey: string;
  dateLabel: string;
  time: string;
  timeLabel: string;
};

// A self-serve booking becomes a warm, pre-scheduled lead the owner confirms —
// carrying the requested window (and the chosen service, if any) so it lands
// ready to put on the calendar. The owner is emailed like any website lead, and
// the customer gets a confirmation. Best-effort on both emails.
export async function createBooking(admin: SupabaseClient, accountId: string, input: BookingInput): Promise<Lead> {
  const requested = `${input.dateLabel} — ${input.timeLabel}`;
  const serviceLine = input.serviceName ? `Service: ${input.serviceName}.\n` : '';
  const message = `📅 Online booking request for ${requested}.\n${serviceLine}${input.description ? `\n${input.description}` : ''}`.trimEnd();

  const lead = await createLead(admin, accountId, {
    source: 'website_form',
    name: input.name,
    phone: input.phone,
    email: input.email,
    address: input.address,
    projectType: input.serviceName || 'Online booking',
    message,
    sourcePage: '/book',
    triage: { score: 'warm', flags: [], timeline: requested, contactPreference: 'any' },
  });

  // Auto-calendar the requested window as a job — the self-serve promise. Abuse
  // guard: skip if this contact already has a job on that date (blocks repeat/
  // spam bookings of the same day). Best-effort: a failure leaves the lead as a
  // plain request rather than failing the booking. createJob links the same
  // client profile the lead just got (deduped by phone/email).
  try {
    let alreadyBooked = false;
    if (input.phone) {
      const { data: dupe } = await admin
        .from('jobs')
        .select('id')
        .eq('account_id', accountId)
        .eq('client_phone', input.phone)
        .eq('scheduled_for', input.dateKey)
        .limit(1)
        .maybeSingle();
      alreadyBooked = Boolean(dupe);
    }
    if (!alreadyBooked) {
      const jobScope = [input.serviceName, input.description].filter(Boolean).join(' — ') || `Online booking — ${requested}`;
      const job = await createJob(admin, accountId, {
        clientName: input.name,
        clientPhone: input.phone,
        clientEmail: input.email,
        address: input.address,
        scope: jobScope,
        status: 'new_lead',
        scheduledFor: input.dateKey,
        scheduledTime: input.time,
        quotedAmount: 0,
      });
      await admin.from('leads').update({ converted_job: job.id }).eq('id', lead.id);
    }
  } catch (error) {
    console.error(`Booking job creation failed for account ${accountId}:`, error instanceof Error ? error.message : error);
  }

  const { data: account } = await admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle();
  const businessName = account?.business_name || "Let's Get Quoted contractor";

  // Owner: notified like any website lead.
  try {
    const ownerEmail = await getAccountOwnerEmail(admin, accountId);
    if (ownerEmail) {
      await sendLeadNotificationEmail({
        recipientEmail: ownerEmail,
        businessName,
        lead,
        dashboardUrl: `${APP_ORIGIN}/dashboard/leads/${lead.id}`,
      });
    }
  } catch (error) {
    console.error(`Booking owner notification failed for account ${accountId}:`, error instanceof Error ? error.message : error);
  }

  // Customer: a confirmation that closes the loop (transactional). Best-effort.
  if (input.email) {
    try {
      await sendBookingConfirmationEmail({
        recipientEmail: input.email,
        businessName,
        clientName: input.name,
        whenLabel: requested,
        serviceName: input.serviceName,
        address: input.address,
      });
    } catch (error) {
      console.error(`Booking confirmation email failed for account ${accountId}:`, error instanceof Error ? error.message : error);
    }
  }

  return lead;
}
