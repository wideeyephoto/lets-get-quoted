import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { declinedSmsBody, toPendingBookings, type PendingBookingRow } from '@/lib/booking-requests';
import { isMissingColumnError } from '@/lib/jobs';

/**
 * A HOMEOWNER MAY NAME TWO WINDOWS.
 *
 * A booking request used to be a yes/no question with one answer on the table,
 * and the answer was often "not that morning, but I could do you Thursday" —
 * which cost a decline, a text, and a phone call this page exists to remove.
 *
 * The property that has to survive every future edit is the one in the
 * migration: the SECOND choice is a preference, not a hold. Counting it as
 * taken would let one request eat two windows of a contractor's day, so it is
 * never held — and both sides of the product have to say so rather than imply
 * otherwise.
 */

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');

// WHY comments quote the strings these tests assert on — a rule described in a
// comment would otherwise pass as a rule implemented in code.
const stripJs = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const stripCss = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');

const ACTIONS = stripJs(read('src', 'app', 'book', '[subdomain]', 'actions.ts'));
const BOOKING_LIB = stripJs(read('src', 'lib', 'booking.ts'));
const REQUESTS_LIB = stripJs(read('src', 'lib', 'booking-requests.ts'));
const REQUEST_FLOW = stripJs(read('src', 'app', 'book', '[subdomain]', 'RequestVisitFlow.tsx'));
const INSTANT_FLOW = stripJs(read('src', 'app', 'book', '[subdomain]', 'InstantBookFlow.tsx'));
const BOOK_PAGE = stripJs(read('src', 'app', 'book', '[subdomain]', 'page.tsx'));
const PANEL = stripJs(read('src', 'app', 'dashboard', 'schedule', 'BookingRequests.tsx'));
const SCHEDULE_ACTIONS = stripJs(read('src', 'app', 'dashboard', 'schedule', 'actions.ts'));
const MIGRATION = read('migrations', '2026-08-10-booking-second-choice.sql');
const CSS = stripCss(read('src', 'app', 'globals.css'));

const row = (over: Partial<PendingBookingRow> = {}): PendingBookingRow => ({
  id: 'job-1',
  client_name: 'Dana Whitfield',
  client_phone: '2485550112',
  client_email: 'dana@example.com',
  address: '12 Elm St',
  scope: 'Water heater swap',
  booking_requested_date: '2026-08-06',
  booking_requested_time: '09:00',
  booking_requested_end_time: '13:00',
  booking_note: null,
  created_at: '2026-08-02T10:00:00.000Z',
  ...over,
});

describe('the second choice on a pending request', () => {
  const now = Date.parse('2026-08-02T12:00:00.000Z');

  it('reads the backup window back in the same words as the first', () => {
    const [booking] = toPendingBookings(
      [row({ booking_alt_date: '2026-08-07', booking_alt_time: '13:00', booking_alt_end_time: '17:00' })],
      now,
      '2026-08-02',
    );
    expect(booking.whenLabel).toBe('Thu, Aug 6, 9:00 AM – 1:00 PM');
    expect(booking.altWhenLabel).toBe('Fri, Aug 7, 1:00 PM – 5:00 PM');
    // The panel confirms by (date, time), not by label.
    expect(booking.altDateKey).toBe('2026-08-07');
    expect(booking.altTime).toBe('13:00');
  });

  it('says there is no backup rather than inventing one', () => {
    const [booking] = toPendingBookings([row()], now, '2026-08-02');
    expect(booking.altWhenLabel).toBeNull();
    expect(booking.altDateKey).toBeNull();
    expect(booking.altIsPast).toBe(false);
  });

  it('survives a row from before the columns existed', () => {
    // listPendingBookings falls back to the old column list when the migration
    // has not run, so the fields are absent rather than null. Absent must read
    // as "no backup", not as undefined leaking into the panel.
    const legacy = row();
    delete (legacy as Partial<PendingBookingRow>).booking_alt_date;
    const [booking] = toPendingBookings([legacy], now, '2026-08-02');
    expect(booking.altWhenLabel).toBeNull();
    expect(booking.altTime).toBeNull();
  });

  it('ages the two windows separately', () => {
    // Tomorrow with a backup from last week is still worth confirming — just
    // not on the backup. One isPast flag for both would hide that.
    const [booking] = toPendingBookings(
      [row({ booking_requested_date: '2026-08-06', booking_alt_date: '2026-07-30', booking_alt_time: '09:00' })],
      now,
      '2026-08-02',
    );
    expect(booking.isPast).toBe(false);
    expect(booking.altIsPast).toBe(true);
  });
});

describe('the decline text when two windows were offered', () => {
  it('says both are gone without reading either back', () => {
    const body = declinedSmsBody('BrokePipes', 'Thu, Aug 6 at 9:00 AM', 'Fri, Aug 7 at 1:00 PM');
    expect(body).toContain('either time');
    expect(body).not.toContain('Aug 6');
    expect(body).not.toContain('Aug 7');
    // Never a dead end.
    expect(body.toLowerCase()).toContain('reply');
  });

  it('stays inside one SMS segment', () => {
    // Spelling out two windows is what would break this. A second segment
    // bills twice for the same message; the sender appends the opt-out line.
    const body = declinedSmsBody('BrokePipes', 'Thu, Aug 6 at 9:00 AM', 'Fri, Aug 7 at 1:00 PM');
    expect(body.length + ' Reply STOP to opt out.'.length).toBeLessThanOrEqual(160);
  });

  it('is unchanged for a request with one window', () => {
    const body = declinedSmsBody('BrokePipes', 'Thu, Aug 6 at 9:00 AM');
    expect(body).toContain('Thu, Aug 6 at 9:00 AM');
    expect(body).not.toContain('either time');
  });

  it('never says "confirmed", with a backup or without', () => {
    expect(declinedSmsBody('X', 'a', 'b').toLowerCase()).not.toContain('confirmed');
    expect(declinedSmsBody('X', 'a').toLowerCase()).not.toContain('confirmed');
  });
});

describe('a backup is a preference, not a hold', () => {
  it('is written to columns the availability engine does not read', () => {
    // getAvailableBookingDays folds pending booking_requested_* into the taken
    // set. If booking_alt_* ever joined it, one request would consume two
    // windows of a contractor's day and the page would read as fully booked.
    const availability = stripJs(read('src', 'lib', 'booking.ts'));
    const engine = availability.slice(
      availability.indexOf('export async function getAvailableBookingDays'),
      availability.indexOf('export function computeHoursByDate'),
    );
    expect(engine).toContain('booking_requested_date');
    expect(engine).not.toContain('booking_alt_');
  });

  it('claims a hold on the first choice only', () => {
    expect((ACTIONS.match(/claimBookingHold\(/g) ?? []).length).toBe(1);
    expect(ACTIONS).toContain('claimBookingHold(admin, site.account_id, dateKey, time)');
  });

  it('says so on the public page, in both flows', () => {
    for (const flow of [REQUEST_FLOW, INSTANT_FLOW]) {
      expect(flow).toContain('Your first choice is held while they');
      expect(flow).toContain('someone else may take it first');
    }
  });

  it('says so in the migration, where the decision lives', () => {
    expect(MIGRATION).toContain('WHY THE BACKUP IS NOT HELD');
    expect(MIGRATION).toContain('booking_alt_date');
    expect(MIGRATION).toContain('booking_alt_time');
    expect(MIGRATION).toContain('booking_alt_end_time');
  });
});

describe('submitBookingAction and the posted alternate', () => {
  it('re-derives it against the offered days, exactly like the first choice', () => {
    // A public endpoint. The alternate reaches a job record and a customer's
    // confirmation email, so it can no more be trusted than the first slot.
    expect(ACTIONS).toContain("const altSlot = (formData.get('altSlot') ?? '').toString();");
    expect(ACTIONS).toContain('findOfferedSlot(availableDays, altDateKey, altTime)');
  });

  it('refuses the same window twice', () => {
    expect(ACTIONS).toContain("altSlot !== slot");
  });

  it('drops an unavailable alternate rather than failing the booking', () => {
    // The optional half of the form must never cost somebody the window they
    // actually wanted. Nothing between reading altSlot and building the alt
    // may redirect.
    const start = ACTIONS.indexOf('const altSlot =');
    const end = ACTIONS.indexOf('const held = await claimBookingHold');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(ACTIONS.slice(start, end)).not.toContain('redirect(');
  });

  it('writes the server’s own labels, never the client’s', () => {
    expect(ACTIONS).toContain('dateLabel: altOffered.day.dayLabel');
    expect(ACTIONS).toContain('timeLabel: altOffered.slot.label');
    expect(ACTIONS).toContain('endTime: altOffered.slot.endTime');
  });
});

describe('a pending migration costs the backup and nothing else', () => {
  it('writes the alt columns in an update of their own', () => {
    // Folded into the write above it, an unknown column would reject the whole
    // statement — and the request would lose booking_requested_date, the field
    // that makes it a booking at all.
    const start = BOOKING_LIB.indexOf('booking_requested_end_time: input.endTime');
    const alt = BOOKING_LIB.indexOf('booking_alt_date: input.alt.dateKey');
    expect(alt).toBeGreaterThan(start);
    expect(BOOKING_LIB.slice(start, alt)).toContain('.eq(\'id\', job.id);');
    expect(BOOKING_LIB).toContain('Booking second choice not saved for account');
  });

  it('asks for the queue twice — with the alt columns and without', () => {
    expect(REQUESTS_LIB).toContain('isMissingColumnError(withAlt.error) ? await query(PENDING_COLUMNS) : withAlt');
    expect(REQUESTS_LIB).toContain('booking_alt_date, booking_alt_time, booking_alt_end_time');
  });

  it('does the same for the confirm and decline reads', () => {
    expect(SCHEDULE_ACTIONS).toContain('isMissingColumnError(withAlt.error) ? await get(DECISION_COLUMNS) : withAlt');
    // One reader, both decisions — the fallback cannot drift between them.
    expect((SCHEDULE_ACTIONS.match(/readBookingDecisionRow\(supabase, accountId, jobId\)/g) ?? []).length).toBe(2);
  });

  it('recognises both codes PostgREST reports a missing column with', () => {
    expect(isMissingColumnError({ code: '42703' })).toBe(true);
    expect(isMissingColumnError({ code: 'PGRST204' })).toBe(true);
    expect(isMissingColumnError({ code: '23505' })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });
});

describe('the homeowner picking a backup', () => {
  it('posts it through a hidden input mounted for the whole flow', () => {
    // Same rule as every other value on this stepped form: what posts is the
    // state, always, whatever step is on screen.
    expect(REQUEST_FLOW).toContain('<input type="hidden" name="altSlot" value={altSlot} />');
    expect(REQUEST_FLOW).toContain("name=\"ui-alt\"");
  });

  it('offers it only once there is a first choice to back up', () => {
    expect(REQUEST_FLOW).toContain('{slot && slotCount > 1 ? (');
  });

  it('cannot offer the window already chosen as the first', () => {
    expect(REQUEST_FLOW).toContain("day.slots.filter((s) => `${day.dateKey}|${s.time}` !== slot)");
    // …and re-picking the backup as the first choice drops it rather than
    // posting one window as both.
    expect(REQUEST_FLOW).toContain("setAltSlot((prev) => (prev === value ? '' : prev))");
  });

  it('can be taken back', () => {
    expect(REQUEST_FLOW).toContain('Clear my second choice');
  });

  it('is reviewed before it is sent, and editable from the review', () => {
    expect(REQUEST_FLOW).toContain('<ReviewRow label="Second choice" onEdit={() => goTo(1)}>');
    // "Window" only reads as ambiguous once there are two of them.
    expect(REQUEST_FLOW).toContain("label={altLabel ? 'First choice' : 'Window'}");
  });

  it('works with no JavaScript on the estimate-first flow', () => {
    // Uncontrolled radios inside <details>: no state, no hydration needed, and
    // every window stays in the markup for find-in-page.
    expect(INSTANT_FLOW).toContain('<details className="book-backup-disclose">');
    expect(INSTANT_FLOW).toContain('<input type="radio" name="altSlot" value="" defaultChecked />');
    expect(INSTANT_FLOW).toContain('No backup — just my first choice');
  });

  it('is not offered when there is only one window to choose from', () => {
    for (const flow of [REQUEST_FLOW, INSTANT_FLOW]) {
      expect(flow).toContain('slotCount > 1');
    }
  });
});

describe('what the homeowner is told afterwards', () => {
  it('reads both windows back on the confirmation screen', () => {
    expect(BOOK_PAGE).toContain("requestedWindow.alt ? 'You asked for either' : 'You asked for'");
    expect(BOOK_PAGE).toContain('timelineAlt');
  });

  it('promises one of the two, not both', () => {
    expect(BOOK_PAGE).toContain('They’ll confirm one of the two');
    expect(REQUEST_FLOW).toContain('confirms one of your two times before anything is booked');
  });

  it('labels the first window "first choice" only when there is a second', () => {
    const email = stripJs(read('src', 'lib', 'email.ts'));
    expect(email).toContain(
      "input.altWhenLabel ? `First choice: ${input.whenLabel}` : `Requested time: ${input.whenLabel}`",
    );
    expect(email).toContain('Second choice: ${input.altWhenLabel}');
  });
});

describe('the contractor answering it', () => {
  it('gets a button for each window, bound to which one it books', () => {
    expect(PANEL).toContain("confirmBookingRequestAction.bind(null, request.id, 'first')");
    expect(PANEL).toContain("confirmBookingRequestAction.bind(null, request.id, 'alt')");
    expect(PANEL).toContain('Confirm 1st choice');
    expect(PANEL).toContain('Confirm 2nd choice');
  });

  it('keeps the single-window wording when there is no backup', () => {
    expect(PANEL).toContain("backup ? 'Confirm 1st choice' : request.phone ? 'Confirm & text customer' : 'Confirm booking'");
  });

  it('does not offer a backup whose day has already gone', () => {
    expect(PANEL).toContain('request.altWhenLabel && !request.altIsPast ? request.altWhenLabel : null');
  });

  it('texts the window it actually booked', () => {
    // A customer who offered two times and is confirmed into the one they did
    // not expect turns up on the wrong day unless the text names it.
    expect(SCHEDULE_ACTIONS).toContain('confirmedSmsBody(businessName, requestedWhenLabel(dateKey, time, endTime))');
    expect(SCHEDULE_ACTIONS).toContain("const useAlt = choice === 'alt' && Boolean(job.booking_alt_date);");
  });

  it('falls back to the first choice when the record has no backup', () => {
    // A stale button — a second tab, or a panel rendered before the migration
    // — books the time the customer definitely asked for rather than nothing.
    expect(SCHEDULE_ACTIONS).toContain("export async function confirmBookingRequestAction(jobId: string, choice: 'first' | 'alt' = 'first')");
  });

  it('only claims a backup is gone when it has a real list to check against', () => {
    // Booking switched off returns no days at all; saying "no longer open"
    // there would tell every contractor every backup had been taken.
    expect(PANEL).toContain('openSlots && openSlots.length > 0 ? new Set(openSlots) : null');
    const page = stripJs(read('src', 'app', 'dashboard', 'schedule', 'page.tsx'));
    expect(page).toContain('bookingDays.length > 0');
  });
});

describe('the two windows do not read as one range', () => {
  it('stacks and numbers them instead of running them together', () => {
    expect(CSS).toMatch(/\.booking-request-choices\s*\{\s*display:\s*grid;/);
    expect(CSS).toMatch(/\.booking-request-who:has\(\.booking-request-choices\)\s*\{\s*display:\s*grid;/);
    expect(PANEL).toContain('<em>1st</em>');
    expect(PANEL).toContain('<em>2nd</em>');
  });

  it('flags a taken backup as taken, not as a past date', () => {
    // .booking-request-past is red and means "confirming this books the past".
    // A backup somebody else took is neither of those things.
    expect(PANEL).toContain('className="booking-request-gone"');
    const at = CSS.indexOf('.booking-request-gone {');
    expect(at).toBeGreaterThan(-1);
    expect(CSS.slice(at, CSS.indexOf('}', at))).toContain('var(--ink-amber-1)');
  });

  it('gives the disclosure a real tap target', () => {
    const at = CSS.search(/\.book-backup-disclose\s*>\s*summary\s*\{/);
    expect(at).toBeGreaterThan(-1);
    const rule = CSS.slice(at, CSS.indexOf('}', at));
    expect(rule).toContain('min-height: 44px');
    // …and a focus ring, since summary is in the tab order.
    expect(CSS).toMatch(/\.book-backup-disclose\s*>\s*summary:focus-visible/);
  });

  it('does not animate the chevron for somebody who asked it not to', () => {
    const at = CSS.lastIndexOf('@media (prefers-reduced-motion: reduce)', CSS.indexOf('.book-done-when-or'));
    expect(CSS.slice(at, CSS.indexOf('}', CSS.indexOf('}', at) + 1))).toMatch(/\.book-backup-disclose\s*>\s*summary::after/);
  });
});
