import { describe, it, expect } from 'vitest';
import {
  confirmedSmsBody,
  declinedSmsBody,
  requestedWhenLabel,
  toPendingBookings,
  waitedLabel,
  type PendingBookingRow,
} from '@/lib/booking-requests';

// Online bookings now wait for the contractor instead of writing themselves onto
// the calendar. These are the pure parts: what the customer is told, and how a
// waiting request is described to the owner.

const row = (over: Partial<PendingBookingRow> = {}): PendingBookingRow => ({
  id: 'job-1',
  client_name: 'Dana Whitfield',
  client_phone: '2485550112',
  client_email: 'dana@example.com',
  address: '12 Elm St',
  scope: 'Water heater swap',
  booking_requested_date: '2026-08-06',
  booking_requested_time: '09:00',
  // Both required and both nullable. The row gained them when booking requests
  // grew an end time and a customer note; the fixture did not follow, so every
  // row() call was a type error.
  booking_requested_end_time: null,
  booking_note: null,
  created_at: '2026-08-02T10:00:00.000Z',
  ...over,
});

describe('requestedWhenLabel', () => {
  it('names the weekday, because "Aug 6" alone does not tell you if you are free', () => {
    expect(requestedWhenLabel('2026-08-06', '09:00')).toBe('Thu, Aug 6 at 9:00 AM');
  });

  it('drops the time cleanly when the slot has none', () => {
    expect(requestedWhenLabel('2026-08-06', null)).toBe('Thu, Aug 6');
  });

  it('reads the date in LOCAL time, not UTC', () => {
    // A bare 'YYYY-MM-DD' parsed as UTC midnight shows the day before for
    // anyone west of Greenwich — which would text a customer the wrong day.
    expect(requestedWhenLabel('2026-08-06', '09:00')).toContain('Aug 6');
    expect(requestedWhenLabel('2026-01-01', '08:00')).toContain('Jan 1');
  });

  it('gives back an unparseable date rather than inventing one', () => {
    expect(requestedWhenLabel('not-a-date', '09:00')).toBe('not-a-date');
  });

  it('handles noon and midnight, where 12-hour clocks usually break', () => {
    expect(requestedWhenLabel('2026-08-06', '12:00')).toContain('12:00 PM');
    expect(requestedWhenLabel('2026-08-06', '00:30')).toContain('12:30 AM');
  });
});

describe('waitedLabel', () => {
  const base = Date.parse('2026-08-02T12:00:00.000Z');
  const ago = (ms: number) => new Date(base - ms).toISOString();

  it('says "just now" for the first couple of minutes', () => {
    expect(waitedLabel(ago(0), base)).toBe('just now');
    expect(waitedLabel(ago(90_000), base)).toBe('just now');
  });

  it('counts up through minutes, hours and days', () => {
    expect(waitedLabel(ago(5 * 60_000), base)).toBe('5 min ago');
    expect(waitedLabel(ago(3 * 3_600_000), base)).toBe('3 hours ago');
    expect(waitedLabel(ago(26 * 3_600_000), base)).toBe('1 day ago');
    expect(waitedLabel(ago(3 * 86_400_000), base)).toBe('3 days ago');
  });

  it('singularises one hour and one day', () => {
    expect(waitedLabel(ago(3_600_000), base)).toBe('1 hour ago');
    expect(waitedLabel(ago(86_400_000), base)).toBe('1 day ago');
  });

  it('never reports a negative wait for a clock that ran backwards', () => {
    // A row created "in the future" by a clock skew should read as new, not as
    // "-4 min ago", which looks like a bug to the person reading it.
    expect(waitedLabel(new Date(base + 240_000).toISOString(), base)).toBe('just now');
  });

  it('falls back rather than printing NaN', () => {
    expect(waitedLabel('nonsense', base)).toBe('just now');
  });
});

describe('confirmedSmsBody', () => {
  it('leads with the confirmation and names who confirmed it', () => {
    const body = confirmedSmsBody('BrokePipes', 'Thu, Aug 6 at 9:00 AM');
    expect(body).toContain('confirmed by BrokePipes');
    expect(body).toContain('Thu, Aug 6 at 9:00 AM');
    // This lands on a phone that has heard nothing since the booking page, so
    // the business name has to appear before anything else can make sense.
    expect(body.indexOf('BrokePipes')).toBeLessThan(body.indexOf('Aug 6'));
  });

  it('stays inside one SMS segment for a normal business name', () => {
    // A second segment bills twice for the same message. 160 is the GSM-7 limit;
    // the sender appends " Reply STOP to opt out." so leave room for it.
    const body = confirmedSmsBody('BrokePipes', 'Thu, Aug 6 at 9:00 AM');
    expect(body.length + ' Reply STOP to opt out.'.length).toBeLessThanOrEqual(160);
  });
});

describe('declinedSmsBody', () => {
  it('says the slot is released and offers a way forward', () => {
    const body = declinedSmsBody('BrokePipes', 'Thu, Aug 6 at 9:00 AM');
    expect(body).toContain('BrokePipes');
    expect(body).toContain('Thu, Aug 6 at 9:00 AM');
    // Never a dead end: a customer told "no" with no next step just leaves.
    expect(body.toLowerCase()).toContain('reply');
  });

  it('does not say the word "confirmed" anywhere', () => {
    // The two texts differ by one decision and are built the same way. If a
    // future edit leaks "confirmed" into the decline, somebody turns up.
    expect(declinedSmsBody('BrokePipes', 'Thu, Aug 6 at 9:00 AM').toLowerCase()).not.toContain('confirmed');
  });
});

describe('toPendingBookings', () => {
  const now = Date.parse('2026-08-02T12:00:00.000Z');

  it('carries the customer through with a readable slot', () => {
    const [booking] = toPendingBookings([row()], now, '2026-08-02');
    expect(booking).toMatchObject({
      id: 'job-1',
      clientName: 'Dana Whitfield',
      whenLabel: 'Thu, Aug 6 at 9:00 AM',
      isPast: false,
    });
  });

  it('flags a request whose day has already gone', () => {
    // Confirming this would book the past. The panel has to be able to say so.
    const [booking] = toPendingBookings([row({ booking_requested_date: '2026-07-30' })], now, '2026-08-02');
    expect(booking.isPast).toBe(true);
  });

  it('does NOT call today past', () => {
    // The boundary that matters: a booking for this morning is still live work,
    // not a missed one.
    const [booking] = toPendingBookings([row({ booking_requested_date: '2026-08-02' })], now, '2026-08-02');
    expect(booking.isPast).toBe(false);
  });

  it('keeps a request with no phone — it still needs answering', () => {
    const [booking] = toPendingBookings([row({ client_phone: null })], now, '2026-08-02');
    expect(booking.phone).toBeNull();
    expect(booking.id).toBe('job-1');
  });

  it('preserves the order it was given, oldest first', () => {
    const bookings = toPendingBookings(
      [row({ id: 'old', created_at: '2026-07-28T09:00:00.000Z' }), row({ id: 'new' })],
      now,
      '2026-08-02',
    );
    expect(bookings.map((b) => b.id)).toEqual(['old', 'new']);
    expect(bookings[0].waitedLabel).toBe('5 days ago');
  });
});
