// When an appointment reminder goes out, and what it says.
//
// Pure, and separate from lib/reminders.ts (which talks to the database) so the
// settings card can render the REAL message and the REAL timing sentence without
// pulling in Twilio, Resend or the admin client. This is the same split
// quote-followups.ts already uses for quoteFollowupText.
//
// WHAT CHANGED AND WHY. The send moment used to be "whenever 22:00 UTC happens
// to be for you" — 6pm in New York, 3pm in Los Angeles, noon in Honolulu — and
// the lead time was hardcoded to one UTC day. Neither was visible anywhere, so
// the card could only ever say "the day before" and leave the rest unsaid. Both
// are account settings now, and the card states them exactly.

/** Days between the reminder and the appointment. 1 = the day before. */
export const DEFAULT_REMINDER_LEAD_DAYS = 1;
/** Hour of the day, in the ACCOUNT'S timezone, that reminders go out. */
export const DEFAULT_REMINDER_HOUR = 9;

export const REMINDER_LEAD_DAY_CHOICES = [1, 2, 3, 7] as const;

/**
 * Hours an owner may pick, and the range is doing real work.
 *
 * Bounded at 6am and 8pm because these are texts to somebody's personal phone,
 * and nothing good comes of a reminder at 3am. The lower bound also keeps the
 * whole feature clear of the DST switchover: US clocks change at 2am, so an
 * hour inside 06:00–20:00 is never the hour that gets skipped in spring or
 * repeated in autumn. A 2am send time would silently not happen one day a year.
 */
export const REMINDER_HOUR_CHOICES = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;

/**
 * How long after its hour an account will still send.
 *
 * The sweep runs hourly, and a cron that is late, throttled or briefly failing
 * would otherwise mean the whole day's reminders are simply never sent — the
 * appointment arrives and nobody was told. Three hours of catch-up turns a
 * missed run into a late reminder, which is strictly better. It cannot cause a
 * double send: the feed check in sendJobAppointmentReminder is per
 * (job, scheduled_for), so the second and third passes skip everything the
 * first one did.
 */
export const REMINDER_CATCHUP_HOURS = 3;

export function normalizeReminderLeadDays(value: unknown): number {
  if (value === null || value === undefined || value === '') return DEFAULT_REMINDER_LEAD_DAYS;
  const days = Number(value);
  if (!Number.isFinite(days)) return DEFAULT_REMINDER_LEAD_DAYS;
  const whole = Math.round(days);
  if (whole < 1 || whole > 30) return DEFAULT_REMINDER_LEAD_DAYS;
  return whole;
}

export function normalizeReminderHour(value: unknown): number {
  // Zero is a legitimate hour (midnight) even though we do not offer it, so the
  // absent check has to come before Number() — Number(null) and Number('') are
  // both 0, and treating a missing column as "send at midnight" is exactly the
  // kind of quiet wrong answer this file exists to avoid.
  if (value === null || value === undefined || value === '') return DEFAULT_REMINDER_HOUR;
  const hour = Number(value);
  if (!Number.isFinite(hour)) return DEFAULT_REMINDER_HOUR;
  const whole = Math.round(hour);
  if (whole < 0 || whole > 23) return DEFAULT_REMINDER_HOUR;
  return whole;
}

/** "9:00 AM" — the way an owner writes a time, not the way a database stores one. */
export function reminderHourLabel(hour: number): string {
  const safe = normalizeReminderHour(hour);
  const suffix = safe < 12 ? 'AM' : 'PM';
  const twelve = safe % 12 === 0 ? 12 : safe % 12;
  return `${twelve}:00 ${suffix}`;
}

/** "1 day before", "3 days before", "1 week before". */
export function reminderLeadLabel(days: number): string {
  const safe = normalizeReminderLeadDays(days);
  if (safe === 7) return '1 week before';
  return `${safe} day${safe === 1 ? '' : 's'} before`;
}

/**
 * "EDT" — the short zone name for a moment, which is the part that makes a time
 * unambiguous.
 *
 * Derived rather than stored, because it is not a property of the account: the
 * same account is EST in January and EDT in July, and a stored abbreviation
 * would be wrong for half the year. Falls back to the IANA name, which is ugly
 * but never wrong.
 */
export function timeZoneAbbreviation(timeZone: string, at: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(at);
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

/** "1 day before at 9:00 AM EDT" — the whole schedule in one readable line. */
export function reminderTimingLabel(
  leadDays: number,
  hour: number,
  timeZone: string,
  at: Date,
): string {
  return `${reminderLeadLabel(leadDays)} at ${reminderHourLabel(hour)} ${timeZoneAbbreviation(timeZone, at)}`;
}

/**
 * Which appointment date a run happening on `localDateKey` should be reminding
 * about.
 *
 * Date-only arithmetic on purpose. Adding days to a Date and reading it back in
 * a timezone re-introduces exactly the offset bug this whole change exists to
 * remove — the answer must be "three calendar days after this local day",
 * which has nothing to do with instants or with how long those days were.
 */
export function reminderTargetDateKey(localDateKey: string, leadDays: number): string {
  const [year, month, day] = localDateKey.split('-').map(Number);
  if (!year || !month || !day) return localDateKey;
  // UTC arithmetic on a date-only value: no zone is involved, so no zone can be
  // got wrong. Noon avoids any chance of a DST-shifted midnight landing on the
  // previous day in engines that normalise differently.
  const at = new Date(Date.UTC(year, month - 1, day, 12));
  at.setUTCDate(at.getUTCDate() + normalizeReminderLeadDays(leadDays));
  return at.toISOString().slice(0, 10);
}

/**
 * Whether an account should send during the hour this sweep is running.
 *
 * `localTime` is "HH:MM" in the account's own zone, as zonedNowParts returns it.
 * True from the configured hour until the catch-up window closes, and the
 * window never wraps past midnight — a 20:00 send time with three hours of
 * catch-up stops at 23:59 rather than spilling into the next day, where it
 * would be reminding about the wrong date entirely.
 */
export function isReminderHourNow(localTime: string, hour: number, catchupHours = REMINDER_CATCHUP_HOURS): boolean {
  const localHour = Number(String(localTime).slice(0, 2));
  if (!Number.isFinite(localHour)) return false;
  const start = normalizeReminderHour(hour);
  return localHour >= start && localHour < Math.min(24, start + Math.max(1, catchupHours));
}

/**
 * The reminder text, verbatim.
 *
 * Extracted from sendAppointmentReminderSms, which built it inline — the one
 * message in its family that never got a builder. The settings preview was
 * therefore hand-written beside it and had already drifted: it omitted the
 * "Let's Get Quoted:" prefix that every one of our texts actually carries, and
 * the address clause. A preview that is not the sender's own output is a
 * screenshot of an intention.
 *
 * The prefix and the STOP line are not decoration. The first identifies the
 * sender, the second is the opt-out; both are why this can be sent to a mobile
 * at all, so neither is assembled anywhere a caller could omit it.
 */
export function appointmentReminderText(input: {
  businessName: string;
  clientName: string;
  whenLabel: string;
  address?: string | null;
}): string {
  const addressNote = input.address ? ` at ${input.address}` : '';
  return `Let's Get Quoted: ${input.businessName} reminder — ${input.clientName}, your appointment is coming up ${input.whenLabel}${addressNote}. Reply C to confirm. Reply STOP to opt out.`;
}
