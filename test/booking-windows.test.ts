import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WINDOW_MINUTES,
  bookingAvailabilityFromAccount,
  bookingWindowPresets,
  formatWindowRange,
  labelForWindowTime,
  normalizeWindowMinutes,
  overlappingWindowTimes,
  windowEndTime,
  windowPartName,
  windowsForTimes,
} from '@/lib/booking-availability';
import { outsideWorkdayWindowTimes } from '@/lib/booking-availability';
import { computeBookingDays } from '@/lib/booking';
import { readFileSync } from 'node:fs';
import { requestedWhenLabel } from '@/lib/booking-requests';

describe('windowEndTime', () => {
  it('adds the window length to the start', () => {
    expect(windowEndTime('08:00', 240)).toBe('12:00');
    expect(windowEndTime('13:00', 180)).toBe('16:00');
    expect(windowEndTime('09:30', 90)).toBe('11:00');
  });

  it('clamps at 23:59 instead of rolling onto a day the customer never picked', () => {
    expect(windowEndTime('22:00', 360)).toBe('23:59');
    expect(windowEndTime('23:30', 240)).toBe('23:59');
  });

  it('normalizes a junk length rather than producing NaN:NaN', () => {
    expect(windowEndTime('08:00', Number.NaN)).toBe('12:00');
    expect(windowEndTime('08:00', -50)).toBe('08:30'); // clamped to the 30-min floor
    expect(windowEndTime('08:00', 99999)).toBe('18:00'); // clamped to the 600-min ceiling
  });
});

describe('normalizeWindowMinutes', () => {
  it('falls back to the default for anything unusable', () => {
    expect(normalizeWindowMinutes(undefined)).toBe(DEFAULT_WINDOW_MINUTES);
    expect(normalizeWindowMinutes(null)).toBe(DEFAULT_WINDOW_MINUTES);
    expect(normalizeWindowMinutes('nonsense')).toBe(DEFAULT_WINDOW_MINUTES);
  });

  it('clamps to a range a contractor could actually work to', () => {
    expect(normalizeWindowMinutes(5)).toBe(30);
    expect(normalizeWindowMinutes(5000)).toBe(600);
    expect(normalizeWindowMinutes('180')).toBe(180);
  });
});

describe('labels', () => {
  it('shows a span, never a single time', () => {
    expect(formatWindowRange('08:00', 240)).toBe('8:00 AM – 12:00 PM');
    const label = labelForWindowTime('08:00', 240);
    expect(label).toBe('Morning · 8:00 AM – 12:00 PM');
    // The regression this whole change exists to prevent: a label that names one
    // clock time is a promise no trade can keep.
    expect(label).not.toBe('Morning · 8:00 AM');
  });

  it('names the part of the day for custom times too', () => {
    expect(windowPartName('07:00')).toBe('Morning');
    expect(windowPartName('12:30')).toBe('Midday');
    expect(windowPartName('18:30')).toBe('Evening');
    expect(labelForWindowTime('06:45', 120)).toBe('Morning · 6:45 AM – 8:45 AM');
  });

  it('crosses noon and midnight without breaking the clock', () => {
    expect(formatWindowRange('11:00', 120)).toBe('11:00 AM – 1:00 PM');
    expect(formatWindowRange('00:00', 60)).toBe('12:00 AM – 1:00 AM');
  });

  it('carries the end time on every offered window', () => {
    const windows = windowsForTimes(['08:00', '13:00'], 240);
    expect(windows).toEqual([
      { time: '08:00', endTime: '12:00', label: 'Morning · 8:00 AM – 12:00 PM' },
      { time: '13:00', endTime: '17:00', label: 'Afternoon · 1:00 PM – 5:00 PM' },
    ]);
  });

  it('offers the presets at whatever length the owner set', () => {
    expect(bookingWindowPresets(120).map((w) => w.label)).toEqual([
      'Morning · 8:00 AM – 10:00 AM',
      'Late morning · 10:00 AM – 12:00 PM',
      'Afternoon · 1:00 PM – 3:00 PM',
      'Late afternoon · 3:00 PM – 5:00 PM',
      'Evening · 5:00 PM – 7:00 PM',
    ]);
  });
});

describe('overlappingWindowTimes', () => {
  it('is quiet when windows sit end to end', () => {
    expect(overlappingWindowTimes(['08:00', '12:00', '16:00'], 240)).toEqual([]);
    expect(overlappingWindowTimes(['08:00', '13:00'], 240)).toEqual([]);
  });

  it('flags the window that swallows the next one', () => {
    expect(overlappingWindowTimes(['08:00', '10:00'], 240)).toEqual(['08:00']);
    // 10:00 + 4h reaches 2 PM, which runs over the 1 PM window — so both clash.
    expect(overlappingWindowTimes(['08:00', '10:00', '13:00'], 240)).toEqual(['08:00', '10:00']);
    expect(overlappingWindowTimes(['08:00', '10:00', '13:00'], 120)).toEqual([]);
  });

  it('flags each clash in a run, not just the first', () => {
    expect(overlappingWindowTimes(['08:00', '10:00', '11:00'], 240)).toEqual(['08:00', '10:00']);
  });

  it('sorts before comparing, so entry order cannot create a false alarm', () => {
    expect(overlappingWindowTimes(['13:00', '08:00'], 240)).toEqual([]);
  });

  it('says nothing about a single window', () => {
    expect(overlappingWindowTimes(['08:00'], 600)).toEqual([]);
    expect(overlappingWindowTimes([], 240)).toEqual([]);
  });
});

describe('bookingAvailabilityFromAccount', () => {
  it('reads the configured length', () => {
    expect(bookingAvailabilityFromAccount({ booking_window_minutes: 120 }).windowMinutes).toBe(120);
  });

  it('degrades to the default on a pre-migration row', () => {
    expect(bookingAvailabilityFromAccount({}).windowMinutes).toBe(DEFAULT_WINDOW_MINUTES);
    expect(bookingAvailabilityFromAccount(null).windowMinutes).toBe(DEFAULT_WINDOW_MINUTES);
  });
});

describe('requestedWhenLabel', () => {
  it('reads back the window the customer was shown', () => {
    expect(requestedWhenLabel('2026-08-06', '08:00', '12:00')).toBe('Thu, Aug 6, 8:00 AM – 12:00 PM');
  });

  it('does NOT invent an end for a request taken before windows existed', () => {
    // Those customers were told a time. Showing the contractor a window they
    // never offered would put a different promise on the screen than the one in
    // the customer's inbox.
    expect(requestedWhenLabel('2026-08-06', '09:00')).toBe('Thu, Aug 6 at 9:00 AM');
    expect(requestedWhenLabel('2026-08-06', '09:00', null)).toBe('Thu, Aug 6 at 9:00 AM');
  });

  it('degrades to the day alone when there is no time at all', () => {
    expect(requestedWhenLabel('2026-08-06', null)).toBe('Thu, Aug 6');
    expect(requestedWhenLabel('2026-08-06', null, '12:00')).toBe('Thu, Aug 6');
  });

  it('returns the raw key rather than "Invalid Date" for junk', () => {
    expect(requestedWhenLabel('not-a-date', '08:00', '12:00')).toBe('not-a-date');
  });
});

/**
 * THE WINDOW THAT FINISHED AFTER WORK DID — AND THE ONE THAT STARTED BEFORE IT.
 *
 * Working hours ended at 6:00 PM and the live booking page offered
 * "3:00 – 7:00 PM". computeBookingDays checked that a window STARTED inside the
 * working day and never that it finished inside one, so a four-hour window
 * beginning at three o'clock passed the filter — and a homeowner was promised
 * an arrival window an hour after the contractor stops.
 *
 * The warning that followed made the mirror-image mistake: it took the end of
 * the day alone, so a 7:00 AM window against an 8:00 AM start read as
 * configured and offered on the setup screen while no customer was ever shown
 * it. One function, both ends, both callers.
 */
describe('outsideWorkdayWindowTimes', () => {
  it('catches the case that shipped', () => {
    expect(outsideWorkdayWindowTimes(['08:00', '12:00', '15:00'], 240, '08:00', '18:00')).toEqual(['15:00']);
  });

  it('catches the window that starts before the working day', () => {
    expect(outsideWorkdayWindowTimes(['07:00', '08:00'], 60, '08:00', '18:00')).toEqual(['07:00']);
  });

  it('lets a window that ends exactly on the bell through', () => {
    // 2:00 PM + 4 hours is 6:00 PM, and a day that ends at 6:00 PM includes it.
    // Anything stricter refuses to use the last window of the owner's own day.
    expect(outsideWorkdayWindowTimes(['14:00'], 240, '08:00', '18:00')).toEqual([]);
  });

  it('lets a window that starts exactly on the bell through', () => {
    expect(outsideWorkdayWindowTimes(['08:00'], 60, '08:00', '18:00')).toEqual([]);
  });

  it('drops a window that starts once the day is already over', () => {
    expect(outsideWorkdayWindowTimes(['18:00'], 30, '08:00', '18:00')).toEqual(['18:00']);
  });

  it('moves with the window length, not just the start', () => {
    // The same 3:00 PM start is fine at two hours and not at four.
    expect(outsideWorkdayWindowTimes(['15:00'], 120, '08:00', '18:00')).toEqual([]);
    expect(outsideWorkdayWindowTimes(['15:00'], 240, '08:00', '18:00')).toEqual(['15:00']);
  });

  it('reports every offender, in the order they were given', () => {
    expect(outsideWorkdayWindowTimes(['07:00', '13:00', '16:00', '17:00'], 240, '08:00', '18:00')).toEqual([
      '07:00',
      '16:00',
      '17:00',
    ]);
  });

  it('says nothing when the working day is unreadable', () => {
    // Better to offer the owner's configured windows than to close booking on
    // a value we could not parse.
    expect(outsideWorkdayWindowTimes(['15:00'], 240, '08:00', 'not-a-time')).toEqual([]);
    expect(outsideWorkdayWindowTimes(['15:00'], 240, 'not-a-time', '18:00')).toEqual([]);
  });
});

describe('computeBookingDays respects both ends of the working day', () => {
  const availability = (over: Partial<Parameters<typeof computeBookingDays>[0]['availability']> = {}) =>
    ({
      enabled: true,
      weekdays: [1, 2, 3, 4, 5],
      windowTimes: ['08:00', '12:00', '15:00'],
      windowMinutes: 240,
      workdayStart: '08:00',
      workdayEnd: '18:00',
      maxPerDay: 10,
      capacityHours: 100,
      leadDays: 0,
      timezone: 'America/Detroit',
      ...over,
    }) as Parameters<typeof computeBookingDays>[0]['availability'];

  const offer = (over = {}) =>
    computeBookingDays({
      availability: availability(over),
      countByDate: new Map(),
      takenByDate: new Map(),
      now: new Date('2026-08-10T15:00:00Z'), // a Monday
    });

  it('no longer offers 3:00 – 7:00 PM against a 6:00 PM finish', () => {
    const times = offer()[0]?.slots.map((s) => s.time) ?? [];
    expect(times).toContain('08:00');
    expect(times).toContain('12:00');
    expect(times).not.toContain('15:00');
  });

  it('offers it again once the day is long enough to hold it', () => {
    const times = offer({ workdayEnd: '19:00' })[0]?.slots.map((s) => s.time) ?? [];
    expect(times).toContain('15:00');
  });

  it('and once the window is short enough to fit', () => {
    const times = offer({ windowMinutes: 120 })[0]?.slots.map((s) => s.time) ?? [];
    expect(times).toContain('15:00');
  });

  it('still refuses a window that starts after the day ends', () => {
    // The rule this replaces was not wrong, only incomplete.
    const times = offer({ windowTimes: ['19:00'], windowMinutes: 60 })[0]?.slots.map((s) => s.time) ?? [];
    expect(times).not.toContain('19:00');
  });

  it('and one that starts before it begins', () => {
    const times = offer({ windowTimes: ['07:00', '08:00'], windowMinutes: 60 })[0]?.slots.map((s) => s.time) ?? [];
    expect(times).not.toContain('07:00');
    expect(times).toContain('08:00');
  });
});

/** The warning and the filter have to be the same rule, or a window vanishes
 *  from the public page with nothing on the setup screen explaining it. */
describe('booking setup names the windows it will not offer', () => {
  const SETUP = readFileSync('src/app/dashboard/schedule/booking/BookingSetup.tsx', 'utf8');

  it('uses the same function the offer filter does', () => {
    expect(SETUP).toContain('outsideWorkdayWindowTimes(windowTimes, windowMinutes, workdayStart, workdayEnd)');
  });

  it('says which window, and what to change, at each end of the day', () => {
    expect(SETUP).toContain('after your working day ends at');
    expect(SETUP).toContain('before your working day begins at');
    expect(SETUP).toMatch(/Shorten the window length, move the start earlier, or extend your working hours/);
    expect(SETUP).toMatch(/Move the start later, or start your working day earlier/);
  });

  /**
   * THREE CASES, NOT TWO.
   *
   * `outside` also catches a window that OPENS after the day is already over —
   * an 18:00 window against an 08:00–17:00 day. Folding that into "finishes
   * after your working day ends" told the owner to shorten it, which cannot
   * bring back a window that starts after closing however short it is.
   */
  it('does not tell a window that starts after closing to get shorter', () => {
    expect(SETUP).toContain('timeToMinutes(t) >= timeToMinutes(workdayEnd)');
    expect(SETUP).toMatch(/shortening the window\s*\n?\s*won&rsquo;t help/);
    // And endsLate is now the windows that genuinely overrun, rather than
    // "everything left over after startsEarly" — which also silently swallowed
    // a window falling off BOTH ends.
    expect(SETUP).toContain('!startsAfterClose.includes(t) && timeToMinutes(windowEndTime(t, windowMinutes)) > timeToMinutes(workdayEnd)');
  });

  /**
   * A window the warning calls "not offered" cannot also appear in the phone
   * preview with a green check, or in the read-back sentence as something a
   * customer can choose. One derived list drives all three.
   *
   * The preview goes one further than `offeredTimes`. The day strip beside it
   * is server truth, so the time list has to be too: `offeredTimes` knows the
   * working day but not that Monday's 08:00 is already taken, so the engine
   * would offer Monday with Afternoon only while the list led with Morning and
   * put the green check on it. Local windows are the fallback while there are
   * unsaved edits, when the saved answer is the stale one.
   */
  it('previews and reads back what is offered, not what is ticked', () => {
    expect(SETUP).toContain('const offeredTimes = useMemo(() => windowTimes.filter((t) => !outside.includes(t))');
    expect(SETUP).toContain('{previewTimes.map((time, i) => (');
    expect(SETUP).toContain('dirty ? offeredTimes : previewDays[0]?.times ?? offeredTimes');
    expect(SETUP).toContain('[...new Set(offeredTimes.map(windowPartName))]');
  });

  /**
   * The master switch commits locally before its round trip lands, and the
   * offer counts beside it were measured while booking was still off — where
   * computeBookingDays short-circuits and returns nothing. Reading that as
   * "Nothing bookable · blocked, at their booking limit, or already taken" is a
   * precise diagnosis of something nobody measured, one second after the most
   * important click on the page.
   */
  it('does not diagnose an empty offer it measured with booking switched off', () => {
    expect(SETUP).toContain('const countsPredateSwitch = enabled !== availability.enabled;');
    expect(SETUP).toContain("countsPredateSwitch ? 'Checking…' : configured ? 'Nothing bookable'");
  });

  /** "Live" used to come from the config alone, so the header claimed customers
   *  could request a window directly above a card reading "0 open windows
   *  across 0 days". The real count decides, and the state between the two
   *  extremes is named. */
  it('will not call the page live with nothing on offer', () => {
    expect(SETUP).toContain('const live = configured && openWindowCount > 0;');
    expect(SETUP).toContain('Nothing bookable');
  });
});

/**
 * ONE MISSING COLUMN, EVERY CONSUMER WRONG.
 *
 * booking_window_minutes was absent from both selects feeding booking setup and
 * the public offer engine, so bookingAvailabilityFromAccount saw undefined and
 * normalized it to the 240-minute default. The length radio always showed four
 * hours; Late afternoon and Evening could never clear a 5:00 PM close; saving
 * "2 hours" left the unsaved-changes bar up forever, because the refresh handed
 * 240 straight back; and the next save wrote 240 over whatever was stored.
 *
 * None of that coupling is visible to the typechecker — a column left out of a
 * PostgREST select is just an absent key on the row — which is exactly why it
 * broke. So the column lists are pinned.
 */
describe('the account selects behind booking ask for every column the config reads', () => {
  const REQUIRED_COLUMNS = [
    'timezone',
    'booking_enabled',
    'booking_weekdays',
    'booking_windows',
    'booking_window_minutes',
    'booking_max_per_day',
    'booking_lead_days',
    'workday_start',
    'workday_end',
    'schedule_day_hours',
    'job_buffer_minutes',
  ];

  // The single-quoted column list of the first .select() after `marker`.
  function selectColumns(source: string, marker: string): string[] {
    const at = source.indexOf(marker);
    expect(at).toBeGreaterThan(-1);
    const open = source.indexOf('.select(', at);
    const quote = source.indexOf("'", open);
    const close = source.indexOf("'", quote + 1);
    return source.slice(quote + 1, close).split(',').map((column) => column.trim());
  }

  it('booking setup reads the window length it renders a radio for', () => {
    const source = readFileSync('src/app/dashboard/schedule/booking/page.tsx', 'utf8');
    expect(selectColumns(source, "from('accounts')")).toEqual(expect.arrayContaining(REQUIRED_COLUMNS));
  });

  it('the offer engine reads the window length it offers windows at', () => {
    const source = readFileSync('src/lib/booking.ts', 'utf8');
    expect(selectColumns(source, 'export async function getAvailableBookingDays')).toEqual(
      expect.arrayContaining(REQUIRED_COLUMNS),
    );
  });
});
