import { describe, it, expect } from 'vitest';
import {
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_LEAD_DAYS,
  REMINDER_HOUR_CHOICES,
  REMINDER_LEAD_DAY_CHOICES,
  appointmentReminderText,
  isReminderHourNow,
  normalizeReminderHour,
  normalizeReminderLeadDays,
  reminderHourLabel,
  reminderLeadLabel,
  reminderTargetDateKey,
  reminderTimingLabel,
  reminderWindow,
  timeZoneAbbreviation,
} from '@/lib/appointment-reminders';
import { zonedNowParts } from '@/lib/quick-stop';

// These decide when a real text lands on a customer's phone. The old behaviour
// was "whenever 22:00 UTC happens to be where you are"; everything below is the
// arithmetic that replaced it.

describe('normalizeReminderHour', () => {
  it('keeps a chosen hour, including the edges of what we offer', () => {
    expect(normalizeReminderHour(6)).toBe(6);
    expect(normalizeReminderHour(20)).toBe(20);
    expect(normalizeReminderHour('9')).toBe(9);
  });

  it('treats an absent column as the default, not as midnight', () => {
    // Number(null) and Number('') are both 0, and 0 is a real hour. Reading a
    // missing column as "send at midnight" would be a silent, plausible-looking
    // wrong answer — the worst kind.
    expect(normalizeReminderHour(null)).toBe(DEFAULT_REMINDER_HOUR);
    expect(normalizeReminderHour(undefined)).toBe(DEFAULT_REMINDER_HOUR);
    expect(normalizeReminderHour('')).toBe(DEFAULT_REMINDER_HOUR);
  });

  it('still accepts an explicit midnight', () => {
    expect(normalizeReminderHour(0)).toBe(0);
    expect(normalizeReminderHour('0')).toBe(0);
  });

  it('refuses an hour that is not one', () => {
    expect(normalizeReminderHour(24)).toBe(DEFAULT_REMINDER_HOUR);
    expect(normalizeReminderHour(-1)).toBe(DEFAULT_REMINDER_HOUR);
    expect(normalizeReminderHour('morning')).toBe(DEFAULT_REMINDER_HOUR);
  });
});

describe('normalizeReminderLeadDays', () => {
  it('keeps a real lead time', () => {
    expect(normalizeReminderLeadDays(1)).toBe(1);
    expect(normalizeReminderLeadDays('7')).toBe(7);
  });

  it('refuses zero — a reminder on the day itself is not a reminder', () => {
    expect(normalizeReminderLeadDays(0)).toBe(DEFAULT_REMINDER_LEAD_DAYS);
  });

  it('refuses absent and absurd values alike', () => {
    expect(normalizeReminderLeadDays(null)).toBe(DEFAULT_REMINDER_LEAD_DAYS);
    expect(normalizeReminderLeadDays(400)).toBe(DEFAULT_REMINDER_LEAD_DAYS);
    expect(normalizeReminderLeadDays(-3)).toBe(DEFAULT_REMINDER_LEAD_DAYS);
  });
});

describe('the choices offered', () => {
  it('every choice survives its own normaliser', () => {
    for (const hour of REMINDER_HOUR_CHOICES) expect(normalizeReminderHour(String(hour))).toBe(hour);
    for (const days of REMINDER_LEAD_DAY_CHOICES) expect(normalizeReminderLeadDays(String(days))).toBe(days);
  });

  it('offers the defaults, so an untouched account sees its own value', () => {
    expect(REMINDER_HOUR_CHOICES).toContain(DEFAULT_REMINDER_HOUR);
    expect(REMINDER_LEAD_DAY_CHOICES).toContain(DEFAULT_REMINDER_LEAD_DAYS);
  });

  it('never offers an hour inside the DST switchover', () => {
    // US clocks change at 02:00. An account set to send at 2am would simply not
    // send on the spring-forward day, and would sit in a repeated hour in
    // autumn. Keeping the range at 06:00-20:00 sidesteps both, and this test is
    // here so nobody widens it back without meeting that argument.
    for (const hour of REMINDER_HOUR_CHOICES) {
      expect(hour).toBeGreaterThanOrEqual(6);
      expect(hour).toBeLessThanOrEqual(20);
    }
  });
});

describe('reminderTargetDateKey', () => {
  it('counts calendar days, not 24-hour blocks', () => {
    expect(reminderTargetDateKey('2026-08-06', 1)).toBe('2026-08-07');
    expect(reminderTargetDateKey('2026-08-06', 3)).toBe('2026-08-09');
    expect(reminderTargetDateKey('2026-08-06', 7)).toBe('2026-08-13');
  });

  it('crosses a month and a year end', () => {
    expect(reminderTargetDateKey('2026-08-31', 1)).toBe('2026-09-01');
    expect(reminderTargetDateKey('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('crosses a leap day', () => {
    expect(reminderTargetDateKey('2028-02-28', 1)).toBe('2028-02-29');
    expect(reminderTargetDateKey('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('is unmoved by the DST days, because a calendar day is a calendar day', () => {
    // 2026-03-08 is spring forward and 2026-11-01 is fall back in the US. A
    // 23-hour or 25-hour day must still be exactly one day of lead time — this
    // is why the arithmetic is date-only rather than instant-based.
    expect(reminderTargetDateKey('2026-03-07', 1)).toBe('2026-03-08');
    expect(reminderTargetDateKey('2026-03-08', 1)).toBe('2026-03-09');
    expect(reminderTargetDateKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(reminderTargetDateKey('2026-11-01', 1)).toBe('2026-11-02');
  });
});

describe('isReminderHourNow', () => {
  it('fires at the chosen hour', () => {
    expect(isReminderHourNow('09:00', 9)).toBe(true);
    expect(isReminderHourNow('09:59', 9)).toBe(true);
  });

  it('does not fire before it', () => {
    expect(isReminderHourNow('08:59', 9)).toBe(false);
    expect(isReminderHourNow('00:00', 9)).toBe(false);
  });

  it('catches up for a few hours if a run was missed', () => {
    // A cron that is late or briefly failing would otherwise mean the whole
    // day's reminders are never sent and the appointment simply arrives.
    expect(isReminderHourNow('10:00', 9)).toBe(true);
    expect(isReminderHourNow('11:30', 9)).toBe(true);
    expect(isReminderHourNow('12:00', 9)).toBe(false);
  });

  it('never wraps past midnight into the wrong day', () => {
    // Wrapping would have the sweep reminding about yesterday's target date,
    // because the local date it derives its target from has already rolled.
    // A 20:00 send time covers 20, 21 and 22 — three hours, all same-day.
    expect(isReminderHourNow('22:00', 20)).toBe(true);
    expect(isReminderHourNow('23:00', 20)).toBe(false);
    expect(isReminderHourNow('00:30', 20)).toBe(false);

    // And the window is clamped at midnight rather than running over it: 22:00
    // gets 22 and 23, not 22 through 00.
    expect(isReminderHourNow('23:00', 22)).toBe(true);
    expect(isReminderHourNow('00:00', 22)).toBe(false);
    expect(isReminderHourNow('01:00', 22)).toBe(false);
  });

  it('reads the "HH:MM" that zonedNowParts actually produces', () => {
    // Guards the seam between the two: this consumes zonedNowParts' output
    // directly, so a change to that format has to fail here rather than in
    // production at 9am.
    const at = new Date('2026-08-06T13:30:00Z');
    const { time } = zonedNowParts(at, 'America/New_York');
    expect(time).toBe('09:30');
    expect(isReminderHourNow(time, 9)).toBe(true);
  });
});

describe('the sweep hour across US zones', () => {
  // The bug this whole change exists to remove: one UTC hour meant five
  // different local send times. Each account should now fire on its own clock.
  const ZONES = [
    { zone: 'America/New_York', firesAtUtcHour: 13 },
    { zone: 'America/Chicago', firesAtUtcHour: 14 },
    { zone: 'America/Denver', firesAtUtcHour: 15 },
    { zone: 'America/Los_Angeles', firesAtUtcHour: 16 },
    { zone: 'Pacific/Honolulu', firesAtUtcHour: 19 },
  ];

  it('each zone reaches 9am local at its own UTC hour, in August', () => {
    for (const { zone, firesAtUtcHour } of ZONES) {
      const at = new Date(Date.UTC(2026, 7, 6, firesAtUtcHour, 0));
      const { time } = zonedNowParts(at, zone);
      expect(`${zone} ${time}`).toBe(`${zone} 09:00`);
      expect(isReminderHourNow(time, 9)).toBe(true);
    }
  });

  it('an account is not due at somebody else\'s hour', () => {
    // 13:00 UTC is 9am in New York and 6am in Los Angeles.
    const at = new Date(Date.UTC(2026, 7, 6, 13, 0));
    expect(isReminderHourNow(zonedNowParts(at, 'America/New_York').time, 9)).toBe(true);
    expect(isReminderHourNow(zonedNowParts(at, 'America/Los_Angeles').time, 9)).toBe(false);
  });
});

describe('labels', () => {
  it('says the lead time the way an owner would', () => {
    expect(reminderLeadLabel(1)).toBe('1 day before');
    expect(reminderLeadLabel(3)).toBe('3 days before');
    expect(reminderLeadLabel(7)).toBe('1 week before');
  });

  it('says the hour as a clock time, not a number', () => {
    expect(reminderHourLabel(9)).toBe('9:00 AM');
    expect(reminderHourLabel(12)).toBe('12:00 PM');
    expect(reminderHourLabel(13)).toBe('1:00 PM');
    expect(reminderHourLabel(0)).toBe('12:00 AM');
  });

  it('names the zone for the moment, since it changes with DST', () => {
    const summer = new Date('2026-08-06T12:00:00Z');
    const winter = new Date('2026-01-06T12:00:00Z');
    expect(timeZoneAbbreviation('America/New_York', summer)).toBe('EDT');
    expect(timeZoneAbbreviation('America/New_York', winter)).toBe('EST');
  });

  it('falls back to the IANA name rather than throwing on a bad zone', () => {
    expect(timeZoneAbbreviation('Not/AZone', new Date())).toBe('Not/AZone');
  });

  it('puts the whole schedule in one line', () => {
    expect(reminderTimingLabel(1, 9, 'America/New_York', new Date('2026-08-06T12:00:00Z')))
      .toBe('1 day before at 9:00 AM EDT');
  });
});

describe('reminderWindow — the gap that let a booking get no reminder at all', () => {
  it('is a single day at the default lead, so nothing about the default changes', () => {
    // The old query matched scheduled_for exactly against today + 1. With a lead
    // of one day the window has to collapse back to that same single date, or
    // this "fix" is a behaviour change for every account that never touched the
    // setting.
    expect(reminderWindow('2026-08-06', 1)).toEqual({ from: '2026-08-07', to: '2026-08-07' });
  });

  it('reaches back to tomorrow at longer leads, which is the whole bug', () => {
    // A three-day lead used to look ONLY at the 9th. A job booked on the 7th for
    // the 8th had already missed its one chance on the 5th, so it was never
    // reminded — not late, never.
    expect(reminderWindow('2026-08-06', 3)).toEqual({ from: '2026-08-07', to: '2026-08-09' });
    expect(reminderWindow('2026-08-06', 7)).toEqual({ from: '2026-08-07', to: '2026-08-13' });
  });

  it('never includes today', () => {
    // The sweep runs at a fixed hour, so a "reminder" for an 8am appointment
    // sent at 9am is a message about something that already happened.
    for (const lead of [1, 2, 3, 7]) {
      expect(reminderWindow('2026-08-06', lead).from, String(lead)).toBe('2026-08-07');
    }
  });

  it('crosses months and years like the calendar does', () => {
    expect(reminderWindow('2026-08-30', 7)).toEqual({ from: '2026-08-31', to: '2026-09-06' });
    expect(reminderWindow('2026-12-30', 7)).toEqual({ from: '2026-12-31', to: '2027-01-06' });
    // 2028 is a leap year: Feb 29 exists and the window must step through it.
    expect(reminderWindow('2028-02-27', 3)).toEqual({ from: '2028-02-28', to: '2028-03-01' });
  });

  it('takes the same liberties with a junk lead that the target-date maths does', () => {
    // normalizeReminderLeadDays is the one place that decides what an
    // out-of-range lead means; the window must not invent a second answer.
    expect(reminderWindow('2026-08-06', 0)).toEqual(reminderWindow('2026-08-06', DEFAULT_REMINDER_LEAD_DAYS));
    expect(reminderWindow('2026-08-06', 999)).toEqual(reminderWindow('2026-08-06', DEFAULT_REMINDER_LEAD_DAYS));
  });

  it('is never inverted, whatever it is given', () => {
    // `from > to` would silently match nothing, which looks exactly like a quiet
    // day and would hide the feature being broken all over again.
    for (const lead of [0, 1, 2, 3, 7, 30, 999, -5, Number.NaN]) {
      const window = reminderWindow('2026-08-06', lead);
      expect(window.from <= window.to, String(lead)).toBe(true);
    }
  });
});

describe('appointmentReminderText', () => {
  it('opens with the contractor, never with us, and always carries the opt-out', () => {
    const text = appointmentReminderText({
      businessName: 'Lawn & Order Landscapers',
      clientName: 'Sarah',
      whenLabel: 'tomorrow at 10:00 AM',
    });
    // The homeowner hired the landscaper, not the software. Two brands in the
    // first four words is how a real reminder gets read as spam.
    expect(text.startsWith('Lawn & Order Landscapers')).toBe(true);
    expect(text).not.toContain("Let's Get Quoted");
    // The opt-out is why this may be sent to a mobile at all.
    expect(text).toContain('Reply STOP to opt out.');
    expect(text).toContain('Reply C to confirm.');
  });

  it('includes the address only when there is one', () => {
    const base = { businessName: 'Acme', clientName: 'Sarah', whenLabel: 'tomorrow at 10:00 AM' };
    expect(appointmentReminderText({ ...base, address: '12 Elm St' })).toContain('at 12 Elm St');
    expect(appointmentReminderText({ ...base, address: null })).not.toContain(' at null');
    expect(appointmentReminderText(base)).not.toContain('undefined');
  });
});
