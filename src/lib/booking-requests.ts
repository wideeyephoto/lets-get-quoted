// Self-serve bookings waiting on the contractor.
//
// A booking made on the public page creates a job with scheduled_for NULL and
// the customer's chosen window on booking_requested_date / _time. It is not on
// any calendar and does not count against any day's capacity. This module is
// how that queue is read, described, and turned into a real appointment.
//
// The pure half is separated from the fetching half on purpose: what the SMS
// says and whether a request is stale are the parts worth pinning with tests,
// and neither needs a database.

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatJobTime, isMissingColumnError } from './jobs';

export type PendingBookingRow = {
  id: string;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  address: string | null;
  scope: string | null;
  booking_requested_date: string;
  booking_requested_time: string | null;
  booking_requested_end_time: string | null;
  /**
   * The second window the homeowner said they could also do. Optional on the
   * row as well as in the database: a request taken before second choices
   * existed has none, and so does a request from a page where the customer
   * skipped the field.
   */
  booking_alt_date?: string | null;
  booking_alt_time?: string | null;
  booking_alt_end_time?: string | null;
  booking_note: string | null;
  created_at: string;
};

export type PendingBooking = {
  id: string;
  clientName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  scope: string | null;
  dateKey: string;
  time: string | null;
  endTime: string | null;
  /** What the homeowner asked us to know before turning up. */
  note: string | null;
  /** "Thu, Aug 6, 8:00 AM – 12:00 PM" — one string, used in the panel and the SMS alike. */
  whenLabel: string;
  /** The same, for the second choice. Null when they only named one window. */
  altWhenLabel: string | null;
  altDateKey: string | null;
  altTime: string | null;
  /**
   * The second choice is in the past too. Tracked separately from isPast
   * because a request for tomorrow with a backup from last week is still worth
   * confirming — just not on the backup.
   */
  altIsPast: boolean;
  /** How long they have been waiting, in words. */
  waitedLabel: string;
  /** The requested day has already passed. Confirming it would book the past. */
  isPast: boolean;
};

/**
 * "Thu, Aug 6, 8:00 AM – 12:00 PM". The one place a requested slot becomes words.
 *
 * The end time is optional because requests taken before windows existed only
 * ever stored a start. Those still read as "Thu, Aug 6 at 9:00 AM" rather than
 * having an end invented for them — the customer was told a time, so that's what
 * the contractor should see.
 */
export function requestedWhenLabel(dateKey: string, time: string | null, endTime?: string | null): string {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  const day = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeLabel = formatJobTime(time);
  if (!timeLabel) return day;
  const endLabel = formatJobTime(endTime ?? null);
  return endLabel ? `${day}, ${timeLabel} – ${endLabel}` : `${day} at ${timeLabel}`;
}

/**
 * How long a request has been sitting, in words.
 *
 * Deliberately blunt past a day. A booking request that has been waiting three
 * days is a customer who has heard nothing since they picked a time, and "3 days
 * ago" should read as uncomfortable rather than as a neutral timestamp.
 */
export function waitedLabel(createdAtIso: string, nowMs: number): string {
  const then = Date.parse(createdAtIso);
  if (!Number.isFinite(then)) return 'just now';
  const minutes = Math.max(0, Math.floor((nowMs - then) / 60_000));
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * The text the customer gets when the contractor says yes.
 *
 * The business name is the point: this arrives on a phone that has had no
 * contact since the booking page, so it has to say who is confirming before it
 * says anything else. Kept to one segment (160 chars) where the inputs allow —
 * a two-segment text bills twice for the same message.
 */
export function confirmedSmsBody(businessName: string, whenLabel: string): string {
  return `Your appointment has been confirmed by ${businessName} for ${whenLabel}. See you then — reply to this text if anything changes.`;
}

/**
 * The text when the contractor cannot take it. Never leaves them guessing.
 *
 * When two windows were offered it says "either" and does NOT read both back.
 * Two windows spelled out is another forty-odd characters on a message that is
 * already close to the 160-character segment — and the customer knows what
 * they asked for. What this text has to tell them is that BOTH are gone, not
 * which two they picked.
 */
export function declinedSmsBody(businessName: string, whenLabel: string, altWhenLabel?: string | null): string {
  if (altWhenLabel) {
    return `${businessName} can't make either time you asked for, so both are released. Reply to this text and they'll find you another slot.`;
  }
  return `${businessName} can't make ${whenLabel} after all, so that time has been released. Reply to this text and they'll help you find another slot.`;
}

/** Rows → what the panel renders. Pure, so the labels are testable. */
export function toPendingBookings(rows: PendingBookingRow[], nowMs: number, todayKey: string): PendingBooking[] {
  return rows.map((row) => {
    const altDateKey = row.booking_alt_date ?? null;
    return {
      id: row.id,
      clientName: row.client_name,
      phone: row.client_phone,
      email: row.client_email,
      address: row.address,
      scope: row.scope,
      dateKey: row.booking_requested_date,
      time: row.booking_requested_time,
      endTime: row.booking_requested_end_time,
      note: row.booking_note,
      whenLabel: requestedWhenLabel(row.booking_requested_date, row.booking_requested_time, row.booking_requested_end_time),
      altDateKey,
      altTime: row.booking_alt_time ?? null,
      altWhenLabel: altDateKey
        ? requestedWhenLabel(altDateKey, row.booking_alt_time ?? null, row.booking_alt_end_time ?? null)
        : null,
      altIsPast: altDateKey ? altDateKey < todayKey : false,
      waitedLabel: waitedLabel(row.created_at, nowMs),
      isPast: row.booking_requested_date < todayKey,
    };
  });
}

/**
 * Every booking still waiting on an answer, oldest first.
 *
 * Oldest first because this is a queue of people who have been left waiting, and
 * the one at the top has been waiting longest. Sorting by requested date instead
 * would bury a week-old request behind tomorrow's.
 */
const PENDING_COLUMNS =
  'id, client_name, client_phone, client_email, address, scope, booking_requested_date, booking_requested_time, booking_requested_end_time, booking_note, created_at';
/** Everything above plus the second choice, which arrives with its own migration. */
const PENDING_COLUMNS_WITH_ALT = `${PENDING_COLUMNS}, booking_alt_date, booking_alt_time, booking_alt_end_time`;

export async function listPendingBookings(
  supabase: SupabaseClient,
  accountId: string,
): Promise<PendingBookingRow[]> {
  const query = (columns: string) =>
    supabase
      .from('jobs')
      .select(columns)
      .eq('account_id', accountId)
      .not('booking_requested_date', 'is', null)
      .is('booking_confirmed_at', null)
      .is('booking_declined_at', null)
      .neq('status', 'archived')
      .order('created_at', { ascending: true })
      .limit(50);

  // Asking for a column the database hasn't been given yet fails the whole
  // select, and this select is the only thing standing between a waiting
  // customer and a contractor who knows about them. A pending second-choice
  // migration costs the backup window, never the queue.
  const withAlt = await query(PENDING_COLUMNS_WITH_ALT);
  const { data, error } = isMissingColumnError(withAlt.error) ? await query(PENDING_COLUMNS) : withAlt;

  if (error) {
    console.error('Pending booking list failed:', error.message);
    return [];
  }
  // The column list is chosen at runtime (see the fallback above), so PostgREST
  // can't infer the row shape.
  return (data ?? []) as unknown as PendingBookingRow[];
}
