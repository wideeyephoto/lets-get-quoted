import { describe, it, expect } from 'vitest';
import {
  NOMINAL_ANNUAL_HOURS,
  costingRate,
  costingRateNote,
  normalizePayType,
  payBasisFromCrew,
  payBasisProblem,
  payRateLabel,
  periodPay,
  periodsPerYear,
  type CrewPayBasis,
} from '@/lib/pay-types';
import { summarizeCrewLabor, type LaborEntry } from '@/lib/labor';
import { buildPayRows } from '@/lib/crew-pay';

const basis = (over: Partial<CrewPayBasis> = {}): CrewPayBasis => ({
  payType: 'hourly',
  hourlyRate: 30,
  annualSalary: null,
  dayRate: null,
  ...over,
});

const entry = (over: Partial<LaborEntry> & { id: string }): LaborEntry => ({
  crew_id: 'c1',
  crew_name: 'Sam Ellis',
  crew_role_label: 'Foreman',
  job_id: 'j1',
  description: 'Framing',
  hours: 8,
  rate: 30,
  amount: 240,
  created_at: '2026-07-28T14:00:00Z',
  ...over,
});

describe('payBasisFromCrew', () => {
  it('defaults to hourly for anything it does not recognise', () => {
    expect(normalizePayType(undefined)).toBe('hourly');
    expect(normalizePayType('contractor')).toBe('hourly');
    expect(payBasisFromCrew(null).payType).toBe('hourly');
  });

  it('ignores an amount that belongs to a different pay type', () => {
    // A salary left behind on somebody switched back to hourly is invisible in
    // the UI, so reading it would pay them from a number nobody can see.
    const row = payBasisFromCrew({ pay_type: 'hourly', hourly_rate: 30, annual_salary: 72000, day_rate: 400 });
    expect(row.annualSalary).toBeNull();
    expect(row.dayRate).toBeNull();
  });
});

describe('costingRate', () => {
  it('derives an hourly figure so a salaried person still costs the jobs they work', () => {
    expect(costingRate(basis({ payType: 'salary', annualSalary: 72000 }))).toBe(34.62);
    expect(72000 / NOMINAL_ANNUAL_HOURS).toBeCloseTo(34.615, 3);
  });

  it('derives one from a day rate too', () => {
    expect(costingRate(basis({ payType: 'day_rate', dayRate: 320 }))).toBe(40);
  });

  it('leaves an hourly rate alone', () => {
    expect(costingRate(basis({ hourlyRate: 28 }))).toBe(28);
  });

  it('falls back to the stored rate when there is nothing to derive from', () => {
    expect(costingRate(basis({ payType: 'salary', annualSalary: null, hourlyRate: 25 }))).toBe(25);
  });

  it('says the arithmetic out loud, and only when something was derived', () => {
    expect(costingRateNote(basis({ payType: 'salary', annualSalary: 72000 }))).toContain('$34.62/h');
    expect(costingRateNote(basis())).toBeNull();
  });
});

describe('periodPay', () => {
  const input = { mode: 'weekly' as const, loggedAmount: 1200, workedDays: 5 };

  it('pays hourly staff what their entries came to', () => {
    const pay = periodPay(basis(), input);
    expect(pay.amount).toBe(1200);
    expect(pay.overtimePaid).toBe(true);
  });

  it('pays a salary regardless of what the timesheet says', () => {
    const pay = periodPay(basis({ payType: 'salary', annualSalary: 72000 }), input);
    expect(pay.amount).toBe(1384.62);
    expect(pay.basis).toBe('Salary $72,000.00/yr ÷ 52 weeks');
    expect(pay.overtimePaid).toBe(false);
  });

  it('pays a salary even when nothing was logged at all', () => {
    // The whole point: a salaried foreman who filed no timesheet is still owed.
    const pay = periodPay(basis({ payType: 'salary', annualSalary: 72000 }), { ...input, loggedAmount: 0, workedDays: 0 });
    expect(pay.amount).toBe(1384.62);
  });

  it('divides a salary by the cadence, not always by 52', () => {
    expect(periodPay(basis({ payType: 'salary', annualSalary: 72000 }), { ...input, mode: 'biweekly' }).amount).toBe(2769.23);
    expect(periodPay(basis({ payType: 'salary', annualSalary: 72000 }), { ...input, mode: 'monthly' }).amount).toBe(6000);
  });

  it('prorates a salary over a custom range, which has no cadence', () => {
    const pay = periodPay(basis({ payType: 'salary', annualSalary: 73000 }), {
      ...input,
      mode: 'custom',
      periodDays: 10,
    });
    expect(pay.amount).toBe(2000);
    expect(pay.basis).toContain('prorated over 10 days');
  });

  it('pays a day rate per day worked, not per hour', () => {
    const pay = periodPay(basis({ payType: 'day_rate', dayRate: 320 }), { ...input, workedDays: 4 });
    expect(pay.amount).toBe(1280);
    expect(pay.basis).toBe('Day rate $320.00 × 4 days');
    expect(pay.overtimePaid).toBe(false);
  });

  it('pays a day-rate worker the same for a 12-hour day as an 8-hour one', () => {
    const short = periodPay(basis({ payType: 'day_rate', dayRate: 320 }), { mode: 'weekly', loggedAmount: 300, workedDays: 1 });
    const long = periodPay(basis({ payType: 'day_rate', dayRate: 320 }), { mode: 'weekly', loggedAmount: 900, workedDays: 1 });
    expect(short.amount).toBe(long.amount);
  });

  it('totals nothing rather than guessing when the amount is missing', () => {
    expect(periodPay(basis({ payType: 'salary', annualSalary: null }), input).amount).toBe(0);
    expect(payBasisProblem(basis({ payType: 'salary', annualSalary: null }))).toContain('No salary recorded');
    expect(payBasisProblem(basis({ payType: 'day_rate', dayRate: null }))).toContain('No day rate recorded');
    expect(payBasisProblem(basis({ hourlyRate: 0 }))).toContain('No hourly rate set');
    expect(payBasisProblem(basis())).toBeNull();
  });
});

describe('periodsPerYear', () => {
  it('has no answer for a custom range', () => {
    expect(periodsPerYear('weekly')).toBe(52);
    expect(periodsPerYear('biweekly')).toBe(26);
    expect(periodsPerYear('monthly')).toBe(12);
    expect(periodsPerYear('custom')).toBeNull();
  });
});

describe('payRateLabel', () => {
  it('says what they actually agreed to, not the derived figure', () => {
    expect(payRateLabel(basis({ payType: 'salary', annualSalary: 72000 }))).toBe('$72,000.00/yr');
    expect(payRateLabel(basis({ payType: 'day_rate', dayRate: 320 }))).toBe('$320.00/day');
    expect(payRateLabel(basis({ hourlyRate: 28 }))).toBe('$28.00/h');
    expect(payRateLabel(basis({ hourlyRate: 0 }))).toBe('No rate set');
    expect(payRateLabel(basis({ payType: 'salary', annualSalary: null }))).toBe('No salary set');
  });
});

describe('summarizeCrewLabor with pay types', () => {
  const entries = [
    entry({ id: 'a', created_at: '2026-07-27T14:00:00Z' }),
    entry({ id: 'b', created_at: '2026-07-28T14:00:00Z' }),
    entry({ id: 'c', created_at: '2026-07-28T20:00:00Z', hours: 4, amount: 120 }),
  ];

  it('behaves exactly as before when no basis is given', () => {
    const summary = summarizeCrewLabor(entries);
    expect(summary.rows[0].estimatedPay).toBe(600);
    expect(summary.rows[0].payType).toBe('hourly');
    expect(summary.rows[0].overtimePaid).toBe(true);
  });

  it('replaces the timesheet total with the salary', () => {
    const summary = summarizeCrewLabor(entries, {
      payBasis: new Map([['c1', basis({ payType: 'salary', annualSalary: 72000 })]]),
      periodMode: 'weekly',
    });
    expect(summary.rows[0].estimatedPay).toBe(1384.62);
    // The hours are untouched — they still cost the jobs they were logged on.
    expect(summary.rows[0].hours).toBe(20);
    expect(summary.totalPay).toBe(1384.62);
  });

  it('counts DAYS for a day-rate worker, not entries', () => {
    // Three entries across two calendar days is two days of pay, not three.
    const summary = summarizeCrewLabor(entries, {
      payBasis: new Map([['c1', basis({ payType: 'day_rate', dayRate: 320 })]]),
      timeZone: 'America/New_York',
    });
    expect(summary.rows[0].workedDays).toBe(2);
    expect(summary.rows[0].estimatedPay).toBe(640);
  });

  it('counts a late shift as the day it was worked, not the next one in UTC', () => {
    // 8pm Monday Eastern is Tuesday 00:00 UTC. Counted in UTC this is two days
    // and the day-rate worker is overpaid by a full day.
    const lateShift = [
      entry({ id: 'x', created_at: '2026-07-27T18:00:00Z' }),
      entry({ id: 'y', created_at: '2026-07-28T00:00:00Z' }),
    ];
    const summary = summarizeCrewLabor(lateShift, {
      payBasis: new Map([['c1', basis({ payType: 'day_rate', dayRate: 320 })]]),
      timeZone: 'America/New_York',
    });
    expect(summary.rows[0].workedDays).toBe(1);
    expect(summary.rows[0].estimatedPay).toBe(320);
  });

  it('puts a salaried person on the table with no timesheet at all', () => {
    const summary = summarizeCrewLabor([], {
      payBasis: new Map([['c9', basis({ payType: 'salary', annualSalary: 52000 })]]),
      periodMode: 'weekly',
      seedCrew: [{ crewId: 'c9', name: 'Dana Reid', roleLabel: 'Office' }],
    });
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].name).toBe('Dana Reid');
    expect(summary.rows[0].hours).toBe(0);
    expect(summary.rows[0].estimatedPay).toBe(1000);
  });

  it('still reports hours past the threshold for salary, without calling them paid', () => {
    const long = Array.from({ length: 6 }, (_, index) =>
      entry({ id: `d${index}`, hours: 9, amount: 270, created_at: `2026-07-2${7 + (index % 2)}T1${index}:00:00Z` }),
    );
    const summary = summarizeCrewLabor(long, {
      overtimeThreshold: 40,
      payBasis: new Map([['c1', basis({ payType: 'salary', annualSalary: 72000 })]]),
      periodMode: 'weekly',
    });
    // 54 hours logged: the 14 over is a management fact, not a pay one.
    expect(summary.rows[0].hours).toBe(54);
    expect(summary.rows[0].overtimeHours).toBeGreaterThan(0);
    expect(summary.rows[0].overtimePaid).toBe(false);
    expect(summary.rows[0].estimatedPay).toBe(1384.62);
  });

  it('stops claiming a zero-rate entry makes a non-hourly total short', () => {
    // "Missing rate" is severity `block`, so this was refusing to let a
    // day-rate worker be approved over a rate their pay never depended on.
    const zeroRate = [entry({ id: 'z', rate: 0, amount: 0 })];
    const hourly = buildPayRows(summarizeCrewLabor(zeroRate).rows, []);
    expect(hourly[0].warnings).toContain('missing-rate');

    const dayRate = buildPayRows(
      summarizeCrewLabor(zeroRate, { payBasis: new Map([['c1', basis({ payType: 'day_rate', dayRate: 320 })]]) }).rows,
      [],
    );
    expect(dayRate[0].warnings).not.toContain('missing-rate');
    expect(dayRate[0].blockers).not.toContain('missing-rate');
  });

  it('stops calling hours past the threshold "overtime" for salaried staff', () => {
    const long = Array.from({ length: 6 }, (_, index) =>
      entry({ id: `o${index}`, hours: 9, amount: 270, created_at: `2026-07-2${7 + (index % 2)}T1${index}:00:00Z` }),
    );
    const salaried = buildPayRows(
      summarizeCrewLabor(long, {
        overtimeThreshold: 40,
        payBasis: new Map([['c1', basis({ payType: 'salary', annualSalary: 72000 })]]),
      }).rows,
      [],
    );
    expect(salaried[0].warnings).not.toContain('overtime');
    // The hours are still reported — only the claim about money goes away.
    expect(salaried[0].overtimeHours).toBeGreaterThan(0);
  });

  it('surfaces a pay type with no amount behind it instead of silently paying zero', () => {
    const summary = summarizeCrewLabor(entries, {
      payBasis: new Map([['c1', basis({ payType: 'salary', annualSalary: null })]]),
      periodMode: 'weekly',
    });
    expect(summary.rows[0].estimatedPay).toBe(0);
    expect(summary.rows[0].payProblem).toContain('No salary recorded');
  });
});
