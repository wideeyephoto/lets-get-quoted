// How a crew member is actually paid.
//
// Everything in this product computes money as hours × rate, which is one way
// of being paid and was treated as the only one. A salaried foreman had to be
// entered as fake hours to get paid, and the overtime threshold was then
// applied to a number that was never hours — so the totals were not merely
// incomplete, they were wrong.
//
// TWO FACTS THAT USED TO BE ONE. What a job pays for, and what a person is
// owed, are the same number only for hourly staff:
//
//   job costing  -> crew.hourly_rate, on every costs row. Unchanged. For a
//                   non-hourly person it is DERIVED (salary ÷ 2080, day rate
//                   ÷ 8) so their time still lands on the jobs they worked.
//   payroll      -> pay_type + annual_salary / day_rate, computed per period.
//
// Keeping hourly_rate populated for everyone is what makes this a small change:
// createCost, the field app, job margin and Labor by job never learn that pay
// types exist.
//
// Pure and client-safe.

import type { PeriodMode } from './labor';

export type PayType = 'hourly' | 'salary' | 'day_rate';

export const PAY_TYPES: PayType[] = ['hourly', 'salary', 'day_rate'];

export const PAY_TYPE_LABEL: Record<PayType, string> = {
  hourly: 'Hourly',
  salary: 'Salary',
  day_rate: 'Day rate',
};

export const PAY_TYPE_HELP: Record<PayType, string> = {
  hourly: 'Paid for the hours they log. Overtime applies.',
  salary: 'Paid the same every period, whatever the hours. Overtime does not apply.',
  day_rate: 'Paid a flat amount for each day they work, however long that day runs.',
};

/**
 * Hours in a nominal working year, and in a nominal day.
 *
 * These exist for ONE purpose: costing a non-hourly person's time to a job.
 * They are never used to decide what somebody is paid — that comes from their
 * salary or day rate directly. 2,080 is 40 × 52; both are stated in the UI
 * wherever a derived rate is shown, because a derived number that looks like
 * an entered one is worse than no number.
 */
export const NOMINAL_ANNUAL_HOURS = 2080;
export const NOMINAL_DAY_HOURS = 8;

export type CrewPayBasis = {
  payType: PayType;
  /** What an hour of this person costs a job. Derived for non-hourly types. */
  hourlyRate: number;
  annualSalary: number | null;
  dayRate: number | null;
};

export function normalizePayType(value: unknown): PayType {
  return PAY_TYPES.includes(value as PayType) ? (value as PayType) : 'hourly';
}

export function payBasisFromCrew(row: {
  pay_type?: unknown;
  hourly_rate?: unknown;
  annual_salary?: unknown;
  day_rate?: unknown;
} | null): CrewPayBasis {
  const payType = normalizePayType(row?.pay_type);
  const annual = num(row?.annual_salary);
  const daily = num(row?.day_rate);
  return {
    payType,
    hourlyRate: num(row?.hourly_rate) ?? 0,
    // Only meaningful for their own type. Reading a stale salary off an hourly
    // person — left behind when their type changed — would show a figure the
    // owner did not intend and cannot see.
    annualSalary: payType === 'salary' ? annual : null,
    dayRate: payType === 'day_rate' ? daily : null,
  };
}

/**
 * What an hour of this person's time costs a job.
 *
 * Derived rather than asked for, so changing somebody from hourly to salary
 * doesn't silently leave every job they touch costed at their old rate. Falls
 * back to the stored hourly_rate when there's nothing to derive from, which is
 * the pre-migration and half-filled-in case.
 */
export function costingRate(basis: CrewPayBasis): number {
  if (basis.payType === 'salary' && basis.annualSalary) return round2(basis.annualSalary / NOMINAL_ANNUAL_HOURS);
  if (basis.payType === 'day_rate' && basis.dayRate) return round2(basis.dayRate / NOMINAL_DAY_HOURS);
  return basis.hourlyRate;
}

/** How many pay periods in a year, or null for a custom range that has no cadence. */
export function periodsPerYear(mode: PeriodMode): number | null {
  if (mode === 'weekly') return 52;
  if (mode === 'biweekly') return 26;
  if (mode === 'monthly') return 12;
  return null;
}

export type PeriodPay = {
  amount: number;
  /** Why it is that number, in words. Frozen onto the approval. */
  basis: string;
  /** False for salary and day rate: hours past the threshold aren't paid extra. */
  overtimePaid: boolean;
};

/**
 * What this person is owed for one period.
 *
 * `loggedAmount` is the hours × rate total the labor entries come to, and is
 * the answer for hourly staff and nobody else. The others deliberately ignore
 * it: a salaried person is owed their salary whether they logged forty hours or
 * none, and paying them from their timesheet is exactly the bug this fixes.
 */
export function periodPay(
  basis: CrewPayBasis,
  input: {
    mode: PeriodMode;
    /** Hours × rate from the labor entries. Used only for hourly. */
    loggedAmount: number;
    /** Distinct days this person logged anything, in the account's zone. */
    workedDays: number;
    /** Length of a custom range in days, for prorating a salary. */
    periodDays?: number;
  },
): PeriodPay {
  if (basis.payType === 'salary') {
    const annual = basis.annualSalary ?? 0;
    const per = periodsPerYear(input.mode);
    if (per) {
      return {
        amount: round2(annual / per),
        basis: `Salary ${money(annual)}/yr ÷ ${per} ${modeNoun(input.mode)}`,
        overtimePaid: false,
      };
    }
    // A custom range has no cadence to divide by, so it prorates by days. 365
    // rather than 365.25: a pay period is a calendar thing, and nobody wants a
    // leap-year fraction in a paycheque.
    const days = Math.max(0, input.periodDays ?? 0);
    return {
      amount: round2((annual * days) / 365),
      basis: `Salary ${money(annual)}/yr prorated over ${days} ${days === 1 ? 'day' : 'days'}`,
      overtimePaid: false,
    };
  }

  if (basis.payType === 'day_rate') {
    const rate = basis.dayRate ?? 0;
    return {
      amount: round2(rate * input.workedDays),
      basis: `Day rate ${money(rate)} × ${input.workedDays} ${input.workedDays === 1 ? 'day' : 'days'}`,
      overtimePaid: false,
    };
  }

  return { amount: round2(input.loggedAmount), basis: 'Hours logged × rate', overtimePaid: true };
}

/** "Salary $72,000.00/yr" — what to show beside their name. */
export function payRateLabel(basis: CrewPayBasis): string {
  if (basis.payType === 'salary') return basis.annualSalary ? `${money(basis.annualSalary)}/yr` : 'No salary set';
  if (basis.payType === 'day_rate') return basis.dayRate ? `${money(basis.dayRate)}/day` : 'No day rate set';
  return basis.hourlyRate > 0 ? `${money(basis.hourlyRate)}/h` : 'No rate set';
}

/**
 * The derived costing rate, said out loud — or null for hourly staff, where
 * there is nothing derived and saying so would be noise.
 */
export function costingRateNote(basis: CrewPayBasis): string | null {
  if (basis.payType === 'salary' && basis.annualSalary) {
    return `Their time costs jobs ${money(costingRate(basis))}/h (${money(basis.annualSalary)} ÷ ${NOMINAL_ANNUAL_HOURS} h)`;
  }
  if (basis.payType === 'day_rate' && basis.dayRate) {
    return `Their time costs jobs ${money(costingRate(basis))}/h (${money(basis.dayRate)} ÷ ${NOMINAL_DAY_HOURS} h)`;
  }
  return null;
}

/** Why this person's pay can't be worked out, or null when it can. */
export function payBasisProblem(basis: CrewPayBasis): string | null {
  if (basis.payType === 'salary' && !basis.annualSalary) return 'No salary recorded, so this period totals nothing.';
  if (basis.payType === 'day_rate' && !basis.dayRate) return 'No day rate recorded, so this period totals nothing.';
  if (basis.payType === 'hourly' && basis.hourlyRate <= 0) return 'No hourly rate set, so their hours total nothing.';
  return null;
}

export function overtimeIsPaid(payType: PayType): boolean {
  return payType === 'hourly';
}

function modeNoun(mode: PeriodMode): string {
  if (mode === 'weekly') return 'weeks';
  if (mode === 'biweekly') return 'fortnights';
  if (mode === 'monthly') return 'months';
  return 'periods';
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(amount: number): string {
  return `$${(Math.round((Number(amount) || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}
