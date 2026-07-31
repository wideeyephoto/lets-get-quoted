import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PAY_DAY,
  addDays,
  daysBetween,
  daysWaiting,
  payDayFor,
  payDaySentence,
  payDaySettingsFromAccount,
  payDayView,
  waitingLabel,
  type PayDaySettings,
} from '@/lib/pay-day';

const plain = (over: Partial<PayDaySettings> = {}): PayDaySettings => ({ ...DEFAULT_PAY_DAY, ...over });

describe('payDayFor', () => {
  it('adds the delay when no weekday is pinned', () => {
    // Sat 1 Aug 2026 + 5 = Thu 6 Aug.
    expect(payDayFor('2026-08-01', plain({ delayDays: 5 }))).toBe('2026-08-06');
  });

  it('lands on the pinned weekday after the delay, not before it', () => {
    // + 5 days is Thu 6 Aug; the next Friday is the 7th.
    expect(payDayFor('2026-08-01', plain({ delayDays: 5, weekday: 5 }))).toBe('2026-08-07');
  });

  it('counts the day itself when the delay already lands on the weekday', () => {
    // Sat 1 Aug + 6 = Fri 7 Aug, which IS a Friday — it must not skip a week.
    expect(payDayFor('2026-08-01', plain({ delayDays: 6, weekday: 5 }))).toBe('2026-08-07');
  });

  it('handles a zero delay', () => {
    expect(payDayFor('2026-08-01', plain({ delayDays: 0 }))).toBe('2026-08-01');
  });

  it('crosses a month and a year boundary', () => {
    expect(payDayFor('2026-12-28', plain({ delayDays: 5 }))).toBe('2027-01-02');
  });

  it('does not drift a day for anyone west of Greenwich', () => {
    // A bare date key parsed as local time would come back as the day before.
    expect(payDayFor('2026-03-01', plain({ delayDays: 1 }))).toBe('2026-03-02');
    expect(addDays('2026-01-01', 0)).toBe('2026-01-01');
  });
});

describe('payDayView', () => {
  const base = { periodEndKey: '2026-08-01', settings: plain({ delayDays: 5 }), hasHours: true, allPaid: false };

  it('stays quiet when nobody has logged anything', () => {
    const view = payDayView({ ...base, todayKey: '2026-07-30', hasHours: false });
    expect(view.state).toBe('no_hours');
    expect(view.tone).toBe('muted');
  });

  it('is settled once everyone is paid, however late the date', () => {
    // Well past the pay day, but it was met — that is not lateness.
    const view = payDayView({ ...base, todayKey: '2026-09-01', allPaid: true });
    expect(view.state).toBe('settled');
    expect(view.tone).toBe('ok');
  });

  it('counts down, then warns, then shouts', () => {
    expect(payDayView({ ...base, todayKey: '2026-08-02' }).state).toBe('upcoming');
    expect(payDayView({ ...base, todayKey: '2026-08-02' }).tone).toBe('ok');
    // Two days out it stops being trivia.
    expect(payDayView({ ...base, todayKey: '2026-08-04' }).tone).toBe('warn');
    expect(payDayView({ ...base, todayKey: '2026-08-05' }).state).toBe('tomorrow');
    expect(payDayView({ ...base, todayKey: '2026-08-06' }).state).toBe('today');
    expect(payDayView({ ...base, todayKey: '2026-08-06' }).tone).toBe('alert');
  });

  it('says how late it is once it has passed', () => {
    const view = payDayView({ ...base, todayKey: '2026-08-10' });
    expect(view.state).toBe('overdue');
    expect(view.days).toBe(-4);
    expect(view.label).toContain('4 days ago');
    expect(view.tone).toBe('alert');
  });
});

describe('payDaySettingsFromAccount', () => {
  it('falls back to a stated default rather than to nothing', () => {
    expect(payDaySettingsFromAccount(null)).toEqual({ delayDays: 5, weekday: null, chosen: false });
  });

  it('knows a chosen pay day from an assumed one', () => {
    expect(payDaySettingsFromAccount({ pay_delay_days: 3, pay_weekday: 5, pay_day_set_at: '2026-07-31T00:00:00Z' })).toEqual({
      delayDays: 3,
      weekday: 5,
      chosen: true,
    });
  });

  it('refuses nonsense out of the database', () => {
    const settings = payDaySettingsFromAccount({ pay_delay_days: 999, pay_weekday: 12, pay_day_set_at: null });
    expect(settings.delayDays).toBe(5);
    expect(settings.weekday).toBeNull();
  });
});

describe('payDaySentence', () => {
  it('reads like a sentence', () => {
    expect(payDaySentence(plain({ delayDays: 5 }))).toBe('5 days after each period ends');
    expect(payDaySentence(plain({ delayDays: 5, weekday: 5 }))).toBe('5 days after each period ends, on the following Friday');
    expect(payDaySentence(plain({ delayDays: 0 }))).toBe('The day each period ends');
    expect(payDaySentence(plain({ delayDays: 1 }))).toBe('1 day after each period ends');
  });
});

describe('daysWaiting', () => {
  it('counts from the end of the period, not from today minus the entry', () => {
    expect(daysWaiting('2026-08-01', '2026-08-13')).toBe(12);
  });

  it('is zero while the period is still running', () => {
    // Money is not owed for a week that has not finished.
    expect(daysWaiting('2026-08-01', '2026-07-29')).toBe(0);
  });

  it('reads in weeks once days stop being useful', () => {
    expect(waitingLabel(0)).toBeNull();
    expect(waitingLabel(1)).toBe('Unpaid 1 day');
    expect(waitingLabel(9)).toBe('Unpaid 9 days');
    expect(waitingLabel(21)).toBe('Unpaid 3 weeks');
  });
});

describe('daysBetween', () => {
  it('is signed', () => {
    expect(daysBetween('2026-08-01', '2026-08-05')).toBe(4);
    expect(daysBetween('2026-08-05', '2026-08-01')).toBe(-4);
    expect(daysBetween('2026-08-01', '2026-08-01')).toBe(0);
  });
});

describe('payDaySettingsFromAccount — the null weekday trap', () => {
  it('reads a null weekday as unpinned, not as Sunday', () => {
    // Number(null) is 0, which is a valid weekday. Coercing before the nullish
    // check silently pinned every account with no weekday set to Sundays.
    expect(payDaySettingsFromAccount({ pay_delay_days: 5, pay_weekday: null, pay_day_set_at: null }).weekday).toBeNull();
    expect(payDaySettingsFromAccount({ pay_delay_days: 5, pay_day_set_at: null }).weekday).toBeNull();
  });

  it('still honours a deliberately chosen Sunday', () => {
    expect(payDaySettingsFromAccount({ pay_delay_days: 5, pay_weekday: 0, pay_day_set_at: null }).weekday).toBe(0);
  });

  it('so an unpinned pay day is just the delay', () => {
    const settings = payDaySettingsFromAccount({ pay_delay_days: 5, pay_weekday: null, pay_day_set_at: null });
    expect(payDayFor('2026-08-01', settings)).toBe('2026-08-06');
  });
});
