import type { SupabaseClient } from '@supabase/supabase-js';
import { createJob, expandScheduledJobs, addDaysToDateKey } from '@/lib/jobs';
import { createLead, type Lead } from '@/lib/leads';
import { getAccountOwnerEmail, sendLeadNotificationEmail, sendBookingConfirmationEmail } from '@/lib/email';
import { bookingAvailabilityFromAccount, windowsForTimes, timeToMinutes, type BookingAvailability } from '@/lib/booking-availability';

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
  hoursByDate?: Map<string, number>;
  takenByDate: Map<string, Set<string>>;
  blockedDates?: Set<string>;
  now: Date;
  lookaheadDays?: number;
  maxOfferedDays?: number;
}): BookingDay[] {
  const { availability, countByDate, hoursByDate, takenByDate, blockedDates, now } = opts;
  const lookahead = opts.lookaheadDays ?? LOOKAHEAD_DAYS;
  const maxOffered = opts.maxOfferedDays ?? MAX_OFFERED_DAYS;
  // Only offer windows that start within the working-hours span.
  const dayStart = timeToMinutes(availability.workdayStart);
  const dayEnd = timeToMinutes(availability.workdayEnd);
  const windows = windowsForTimes(availability.windowTimes).filter((w) => {
    const t = timeToMinutes(w.time);
    return t >= dayStart && t < dayEnd;
  });
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
    if (blockedDates?.has(key)) continue; // owner blocked this day off
    if ((countByDate.get(key) ?? 0) >= availability.maxPerDay) continue; // count cap
    if ((hoursByDate?.get(key) ?? 0) >= availability.capacityHours) continue; // hours cap — auto-block when the day's booked
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
    .select('schedule_day_hours, timezone, booking_weekdays, booking_windows, booking_max_per_day, booking_lead_days, workday_start, workday_end, job_buffer_minutes')
    .eq('id', accountId)
    .maybeSingle();
  const availability = bookingAvailabilityFromAccount(account);
  const scheduleDayHours = availability.capacityHours;

  const [{ data: jobs }, { data: blocks }] = await Promise.all([
    admin
      .from('jobs')
      .select('scheduled_for, scheduled_time, status, estimated_hours')
      .eq('account_id', accountId)
      .not('scheduled_for', 'is', null)
      .neq('status', 'archived'),
    admin
      .from('availability_blocks')
      .select('start_date, end_date')
      .eq('account_id', accountId)
      .gte('end_date', utcDateKey(new Date())),
  ]);

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

  // Per-day scheduled hours (est + buffer), spread across a multi-day job's span.
  const hoursByDate = computeHoursByDate(jobs ?? [], availability.capacityHours, availability.bufferMinutes);
  const blockedDates = expandBlockedDates(blocks ?? [], LOOKAHEAD_DAYS + 1);

  return computeBookingDays({ availability, countByDate, hoursByDate, takenByDate, blockedDates, now: new Date() });
}

// Distribute each scheduled job's effective hours (estimated + buffer) across the
// days it spans, capped at the daily capacity — the input to the hours-based
// auto-block. A job with no hours contributes nothing here (the count cap covers it).
export function computeHoursByDate(
  jobs: Array<{ scheduled_for: string | null; estimated_hours?: number | string | null }>,
  capacityHours: number,
  bufferMinutes: number,
): Map<string, number> {
  const cap = capacityHours > 0 ? capacityHours : 8;
  const bufferHours = (Number(bufferMinutes) || 0) / 60;
  const hoursByDate = new Map<string, number>();
  for (const job of jobs) {
    if (!job.scheduled_for) continue;
    let remaining = (Number(job.estimated_hours) || 0) + bufferHours;
    if (remaining <= 0) continue;
    for (let offset = 0; remaining > 0 && offset < 60; offset++) {
      const key = addDaysToDateKey(job.scheduled_for, offset);
      hoursByDate.set(key, (hoursByDate.get(key) ?? 0) + Math.min(remaining, cap));
      remaining -= cap;
    }
  }
  return hoursByDate;
}

// Expand block date-ranges into the set of blocked date keys within the horizon.
export function expandBlockedDates(
  blocks: Array<{ start_date: string; end_date: string }>,
  horizonDays: number,
  fromKey?: string,
): Set<string> {
  const start = fromKey ?? utcDateKey(new Date());
  const horizon = new Set<string>();
  for (let i = 0; i <= horizonDays; i++) horizon.add(addDaysToDateKey(start, i));
  const blocked = new Set<string>();
  for (const b of blocks) {
    if (!b.start_date || !b.end_date) continue;
    for (let i = 0; i <= horizonDays; i++) {
      const key = addDaysToDateKey(b.start_date, i);
      if (key > b.end_date) break;
      if (horizon.has(key)) blocked.add(key);
    }
  }
  return blocked;
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

// Claim a short-lived exclusive hold on a slot to close the race where two
// DIFFERENT visitors both pass the availability re-check and both create a job
// for the same window. Returns false when a live hold already exists (unique-
// index 23505) — the caller then bounces to ?error=slot_taken. The hold self-
// expires; once the winner's job exists the window is unavailable regardless.
export async function claimBookingHold(
  admin: SupabaseClient,
  accountId: string,
  dateKey: string,
  time: string,
  ttlMs = 60_000,
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  // Clear an expired hold on THIS exact slot so a genuinely-free slot can be
  // re-claimed (the unique index would otherwise block on the stale row).
  await admin
    .from('booking_holds')
    .delete()
    .eq('account_id', accountId)
    .eq('scheduled_for', dateKey)
    .eq('scheduled_time', time)
    .lt('expires_at', nowIso);
  const { error } = await admin.from('booking_holds').insert({
    account_id: accountId,
    scheduled_for: dateKey,
    scheduled_time: time,
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
  });
  return !error;
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

// A "request a callback" — the visitor wasn't eligible for a self-serve slot
// (too small / out of area / booked / work-not-taken), so we still capture a warm
// lead for the owner to schedule by hand rather than turning them away. No job is
// auto-calendared; it lands on the leads board like any website request.
export async function createBookingRequestLead(
  admin: SupabaseClient,
  accountId: string,
  input: { name: string; phone: string | null; email: string | null; address: string | null; description: string | null },
): Promise<Lead> {
  const message = `📋 Booking request — needs scheduling.${input.description ? `\n${input.description}` : ''}`;
  const lead = await createLead(admin, accountId, {
    source: 'website_form',
    name: input.name,
    phone: input.phone,
    email: input.email,
    address: input.address,
    projectType: 'Booking request',
    message,
    sourcePage: '/book',
    triage: { score: 'warm', flags: [], contactPreference: 'any' },
  });

  try {
    const ownerEmail = await getAccountOwnerEmail(admin, accountId);
    if (ownerEmail) {
      const { data: account } = await admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle();
      await sendLeadNotificationEmail({
        recipientEmail: ownerEmail,
        businessName: account?.business_name || "Let's Get Quoted contractor",
        lead,
        dashboardUrl: `${APP_ORIGIN}/dashboard/leads/${lead.id}`,
      });
    }
  } catch (error) {
    console.error(`Booking request owner notification failed for account ${accountId}:`, error instanceof Error ? error.message : error);
  }

  return lead;
}
