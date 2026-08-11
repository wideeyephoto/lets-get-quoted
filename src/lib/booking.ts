import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createJob,
  expandScheduledJobs,
  addDaysToDateKey,
  daysBetweenInclusive,
  weekdayOfDateKey,
  isMissingEndDateColumn,
  SPAN_COLUMNS,
  SPAN_COLUMNS_BEFORE_END_DATE,
  type SchedulableJob,
} from '@/lib/jobs';
import { loadBusinessName } from '@/lib/business-name';
import { createLead, type Lead } from '@/lib/leads';
import { getAccountOwnerEmail, sendLeadNotificationEmail, sendBookingConfirmationEmail } from '@/lib/email';
import { checkRateLimitStrict } from '@/lib/rate-limit';
import { bookingAvailabilityFromAccount, windowsForTimes, timeToMinutes, type BookingAvailability } from '@/lib/booking-availability';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

const LOOKAHEAD_DAYS = 21;
const MAX_OFFERED_DAYS = 8;
const DAY_MS = 86_400_000;

// endTime is carried through from the availability engine so a booking records
// the window the customer was actually shown, rather than one re-derived later
// from settings that may have changed since.
export type BookingSlot = { time: string; endTime: string; label: string };
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
  // Master switch off ⇒ offer nothing, whatever the weekday setup underneath says.
  if (!availability.enabled) return [];
  const lookahead = opts.lookaheadDays ?? LOOKAHEAD_DAYS;
  const maxOffered = opts.maxOfferedDays ?? MAX_OFFERED_DAYS;
  // Only offer windows that start within the working-hours span.
  const dayStart = timeToMinutes(availability.workdayStart);
  const dayEnd = timeToMinutes(availability.workdayEnd);
  const windows = windowsForTimes(availability.windowTimes, availability.windowMinutes).filter((w) => {
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
    .select('schedule_day_hours, timezone, booking_enabled, booking_weekdays, booking_windows, booking_max_per_day, booking_lead_days, workday_start, workday_end, job_buffer_minutes')
    .eq('id', accountId)
    .maybeSingle();
  const availability = bookingAvailabilityFromAccount(account);
  const scheduleDayHours = availability.capacityHours;

  const scheduledJobs = (columns: string) =>
    admin
      .from('jobs')
      .select(columns)
      .eq('account_id', accountId)
      .not('scheduled_for', 'is', null)
      .neq('status', 'archived');

  // A booking waiting on the contractor still HOLDS ITS SLOT.
  //
  // Without this the confirmation step would manufacture the exact problem it
  // exists to prevent: two customers request Thursday 9am, neither is on the
  // calendar so neither blocks the other, and confirming both double-books the
  // day. A requested window is provisionally taken until it is confirmed (when
  // it becomes a real scheduled job) or declined (when it frees).
  const pendingRequests = admin
    .from('jobs')
    .select('booking_requested_date, booking_requested_time')
    .eq('account_id', accountId)
    .not('booking_requested_date', 'is', null)
    .is('booking_confirmed_at', null)
    .is('booking_declined_at', null)
    .neq('status', 'archived');

  const [withEndDate, { data: blocks }, { data: pending, error: pendingError }] = await Promise.all([
    scheduledJobs(`${SPAN_COLUMNS}, scheduled_time`),
    admin
      .from('availability_blocks')
      .select('start_date, end_date')
      .eq('account_id', accountId)
      .gte('end_date', utcDateKey(new Date())),
    pendingRequests,
  ]);

  // Before the end-date migration, asking for scheduled_until fails the select
  // and the data comes back null — which would tell the booking page that
  // nothing is scheduled and offer every slot on a fully booked day.
  const jobs = isMissingEndDateColumn(withEndDate.error)
    ? (await scheduledJobs(`${SPAN_COLUMNS_BEFORE_END_DATE}, scheduled_time`)).data
    : withEndDate.data;

  // The column list is built at runtime (see the fallback above), so PostgREST
  // can't infer the row shape — assert the one we asked for.
  const jobRows = (jobs ?? []) as unknown as Array<SchedulableJob & { scheduled_time: string | null }>;

  const occurrences = expandScheduledJobs(jobRows, scheduleDayHours, availability.weekdays);
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

  // Fold the pending requests in beside the real bookings. If the columns are
  // missing (migration not run yet) PostgREST errors rather than returning rows,
  // and the right behavior is to carry on offering slots as before rather than
  // to take the whole booking page down.
  if (pendingError) {
    console.error(`Pending booking lookup failed for account ${accountId}:`, pendingError.message);
  }
  for (const row of (pending ?? []) as Array<{ booking_requested_date: string | null; booking_requested_time: string | null }>) {
    const key = row.booking_requested_date;
    if (!key) continue;
    countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
    if (row.booking_requested_time) {
      const set = takenByDate.get(key) ?? new Set<string>();
      set.add(row.booking_requested_time.slice(0, 5));
      takenByDate.set(key, set);
    }
  }

  // Per-day scheduled hours (est + buffer), spread across a multi-day job's span.
  const hoursByDate = computeHoursByDate(jobRows, availability.capacityHours, availability.bufferMinutes, availability.weekdays);
  const blockedDates = expandBlockedDates(blocks ?? [], LOOKAHEAD_DAYS + 1);

  return computeBookingDays({ availability, countByDate, hoursByDate, takenByDate, blockedDates, now: new Date() });
}

// Distribute each scheduled job's effective hours (estimated + buffer) across the
// days it spans, capped at the daily capacity — the input to the hours-based
// auto-block. A job with no hours contributes nothing here (the count cap covers it).
export function computeHoursByDate(
  jobs: Array<{ scheduled_for: string | null; scheduled_until?: string | null; estimated_hours?: number | string | null }>,
  capacityHours: number,
  bufferMinutes: number,
  workingWeekdays?: number[],
): Map<string, number> {
  const cap = capacityHours > 0 ? capacityHours : 8;
  const bufferHours = (Number(bufferMinutes) || 0) / 60;
  const hoursByDate = new Map<string, number>();
  // Same rule as expandScheduledJobs: only a GUESSED span routes around the
  // working week. An empty list means "not configured", not "never works".
  const working = workingWeekdays && workingWeekdays.length > 0 ? new Set(workingWeekdays) : null;
  for (const job of jobs) {
    if (!job.scheduled_for) continue;
    const total = (Number(job.estimated_hours) || 0) + bufferHours;
    if (total <= 0) continue;

    // An entered range says which days the work occupies, so spread the hours
    // evenly across exactly those days. Packing full capacity into the first
    // ones (below) would leave the back end of a booked-out week looking free.
    // Even, not capped-per-day: six hours over three days is genuinely two a
    // day, and should still leave room to book alongside it.
    const entered = daysBetweenInclusive(job.scheduled_for, job.scheduled_until);
    if (entered && entered > 1) {
      const perDay = Math.min(cap, total / entered);
      for (let offset = 0; offset < entered; offset++) {
        const key = addDaysToDateKey(job.scheduled_for, offset);
        hoursByDate.set(key, (hoursByDate.get(key) ?? 0) + perDay);
      }
      continue;
    }

    // No range entered: fall back to filling day after day at capacity, which
    // is what every job did before the end date existed — except that the
    // overflow now lands on the next WORKING day. Friday's spillover is
    // Monday's problem, not Saturday's.
    let remaining = total;
    for (let offset = 0; remaining > 0 && offset < 366; offset++) {
      const key = addDaysToDateKey(job.scheduled_for, offset);
      // Day one is always the scheduled day, even if it's a Sunday.
      if (offset > 0 && working && !working.has(weekdayOfDateKey(key))) continue;
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

/** A window the customer chose, carrying the server's own labels for it. */
export type BookingWindow = {
  dateKey: string;
  dateLabel: string;
  time: string;
  /** The window's close. Snapshotted so a later settings change can't rewrite it. */
  endTime: string | null;
  timeLabel: string;
};

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
  /** The window's close. Snapshotted so a later settings change can't rewrite it. */
  endTime: string | null;
  timeLabel: string;
  /**
   * The second window they said they could also do, when they named one.
   *
   * A PREFERENCE, not a second hold — see the migration. It is written to the
   * job so the contractor can confirm it instead of the first choice, but it is
   * never counted against availability, so somebody else may take it first.
   */
  alt?: BookingWindow | null;
  /** "Gate code is 1234, dog in the back" — for the person at the door, not for sales. */
  note: string | null;
};

// A self-serve booking becomes a warm, pre-scheduled lead the owner confirms —
// carrying the requested window (and the chosen service, if any) so it lands
// ready to put on the calendar. The owner is emailed like any website lead, and
// the customer gets a confirmation. Best-effort on both emails.
export async function createBooking(admin: SupabaseClient, accountId: string, input: BookingInput): Promise<Lead> {
  const requested = `${input.dateLabel} — ${input.timeLabel}`;
  const requestedAlt = input.alt ? `${input.alt.dateLabel} — ${input.alt.timeLabel}` : null;
  const serviceLine = input.serviceName ? `Service: ${input.serviceName}.\n` : '';
  // Second line, not a footnote. Whoever reads the notification email is
  // deciding yes or no on the first window, and the whole point of a backup is
  // that it is available at the moment of that decision.
  const altLine = requestedAlt ? `They could also do ${requestedAlt}.\n` : '';
  // The homeowner's note goes in the lead message too. It's the kind of thing
  // ("there's a dog", "use the side gate") that changes how the first visit
  // goes, and burying it only on the job record means whoever reads the lead
  // email never sees it.
  const noteLine = input.note ? `\n\nThey added: ${input.note}` : '';
  const message = `📅 Online booking request for ${requested}.\n${altLine}${serviceLine}${input.description ? `\n${input.description}` : ''}${noteLine}`.trimEnd();

  const lead = await createLead(admin, accountId, {
    source: 'website_form',
    name: input.name,
    phone: input.phone,
    email: input.email,
    address: input.address,
    projectType: input.serviceName || 'Online booking',
    message,
    sourcePage: '/book',
    triage: {
      score: 'warm',
      flags: [],
      timeline: requested,
      ...(requestedAlt ? { timelineAlt: requestedAlt } : {}),
      contactPreference: 'any',
    },
  });

  // Record the requested window as a job that is NOT on the calendar.
  //
  // This used to write scheduled_for straight away, which meant a stranger could
  // put work on a contractor's calendar with nobody agreeing to it. The customer
  // email has always said "this time isn't locked in until they confirm"; the
  // behavior was the part that disagreed.
  //
  // scheduled_for stays NULL and the chosen slot is parked on booking_requested_*
  // instead. That is deliberate and load-bearing: every calendar, capacity count,
  // Plan my day, reminder and digest query already filters on scheduled_for, so
  // an unconfirmed booking cannot leak into any of them through a query somebody
  // forgot to update. confirmBookingAction is the one place that promotes it.
  //
  // Abuse guard: skip if this contact already has a job on that date — including
  // one still awaiting confirmation, or the same person could queue up a dozen
  // requests for the same day. Best-effort: a failure leaves the lead as a plain
  // request rather than failing the booking.
  try {
    let alreadyBooked = false;
    if (input.phone) {
      const { data: dupe } = await admin
        .from('jobs')
        .select('id')
        .eq('account_id', accountId)
        .eq('client_phone', input.phone)
        .or(`scheduled_for.eq.${input.dateKey},booking_requested_date.eq.${input.dateKey}`)
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
        scheduledFor: null,
        scheduledTime: null,
        quotedAmount: 0,
      });
      await admin
        .from('jobs')
        .update({
          booking_requested_date: input.dateKey,
          booking_requested_time: input.time,
          booking_requested_end_time: input.endTime,
          booking_note: input.note,
        })
        .eq('id', job.id);
      // The backup goes in an update OF ITS OWN, and that is the whole reason
      // it is a second round-trip. Folded into the write above, a database that
      // has not had the second-choice migration run against it would reject the
      // entire statement for the unknown columns — and the request would lose
      // its requested date, which is the field that makes it a booking at all.
      // Alone, a missing column costs the backup and nothing else.
      if (input.alt) {
        const { error: altError } = await admin
          .from('jobs')
          .update({
            booking_alt_date: input.alt.dateKey,
            booking_alt_time: input.alt.time,
            booking_alt_end_time: input.alt.endTime,
          })
          .eq('id', job.id);
        if (altError) {
          console.error(`Booking second choice not saved for account ${accountId}:`, altError.message);
        }
      }
      await admin.from('leads').update({ converted_job: job.id }).eq('id', lead.id);
    }
  } catch (error) {
    console.error(`Booking job creation failed for account ${accountId}:`, error instanceof Error ? error.message : error);
  }

  const businessName = await loadBusinessName(admin, accountId);

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

  /**
   * Customer: a confirmation that closes the loop (transactional). Best-effort,
   * and CAPPED PER RECIPIENT.
   *
   * This address arrived on a public form and nobody proved they own it, which
   * makes /book a way to have our sending domain deliver mail to an inbox of a
   * stranger's choosing. app/login/actions.ts names the same exposure on the
   * sign-in link and answers it the same way — a per-IP limit AND a per-address
   * one. The per-IP limit on submitBookingAction cannot carry this alone: it is
   * fail-open by design, so it disappears in exactly the incident where it is
   * needed, and rented addresses are cheap enough that per-IP is a speed bump.
   *
   * Three an hour sits far above what a real customer produces (one) and far
   * below the volume that costs a sending domain its reputation — which is the
   * actual asset at risk here, not the victim's attention.
   *
   * Fail CLOSED: a dropped confirmation is recoverable and visible, because the
   * booking is already written and the owner is emailed either way.
   *
   * NOT solved here, and said out loud so nobody reads this as airtight:
   * plus-addressing gives one inbox unlimited distinct buckets. Stripping it
   * is provider-specific — on plenty of domains user+tag is a different person
   * — so the per-IP limit stays the backstop for that case.
   */
  if (input.email) {
    try {
      // Already lower-cased and trimmed by readContact, which is what stops
      // Victim@x.com and victim@x.com being two separate allowances.
      const withinCap = await checkRateLimitStrict(admin, `bookconfirm:email:${input.email}`, 3, 3600);
      if (withinCap) {
        await sendBookingConfirmationEmail({
          recipientEmail: input.email,
          businessName,
          clientName: input.name,
          whenLabel: requested,
          altWhenLabel: requestedAlt,
          serviceName: input.serviceName,
          address: input.address,
          accountId,
        });
      }
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
  input: { name: string; phone: string | null; email: string | null; address: string | null; description: string | null; note?: string | null },
): Promise<Lead> {
  const message = `📋 Booking request — needs scheduling.${input.description ? `\n${input.description}` : ''}${
    input.note ? `\n\nThey added: ${input.note}` : ''
  }`;
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
      await sendLeadNotificationEmail({
        recipientEmail: ownerEmail,
        businessName: await loadBusinessName(admin, accountId),
        lead,
        dashboardUrl: `${APP_ORIGIN}/dashboard/leads/${lead.id}`,
      });
    }
  } catch (error) {
    console.error(`Booking request owner notification failed for account ${accountId}:`, error instanceof Error ? error.message : error);
  }

  return lead;
}
