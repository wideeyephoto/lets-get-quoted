// What payroll is going to cost, and on which day it leaves the account.
//
// Pulled out of cash-forecast-data.ts for the same reason the netting was: this
// decides an AMOUNT, and the amount is assembled from three sources that can
// each be missing. A mistake here doesn't look like a mistake — it looks like a
// slightly different payroll figure on a chart nobody can check by eye.
//
// PURE. The caller fetches the labor rows and the pay entries; this reads them.
//
// Three tiers, most certain first:
//   1. An approved or sent pay entry — a number somebody agreed to. Confirmed.
//   2. Logged hours nobody has approved yet, priced from the labor costs on
//      them. An estimate, and said to be one.
//   3. A future period with nothing logged against it — the average of recent
//      periods that did have payroll. Also an estimate, and the only way a
//      payroll that hasn't been worked yet can appear at all.
//
// A period contributes at most ONE event, on its pay day. Two markers on one day
// for the same payroll reads as paying twice.

import type { CashEvent } from '@/lib/cash-forecast';

/** A pay period, already resolved in the contractor's own timezone. */
export type PayrollPeriod = {
  key: string;
  /** ISO bounds; endIso is exclusive, matching resolvePayPeriod. */
  period: { startIso: string; endIso: string; rangeLabel: string; open: boolean };
  startKey: string;
  endKey: string;
  payDayKey: string;
};

export type LaborRow = { crew_id: string | null; amount: unknown; created_at: string };
export type PayEntry = { status: string; approved: number };

export type PeriodPayroll = {
  amount: number;
  /** True only when every unpaid person in the period has an agreed figure. */
  confirmed: boolean;
  approvedCount: number;
  crewCount: number;
};

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** What one period still owes, and how much of it is a number somebody approved. */
export function periodPayroll(
  entry: Pick<PayrollPeriod, 'period'>,
  labor: LaborRow[],
  entries: Map<string, PayEntry> | undefined,
): PeriodPayroll {
  const inPeriod = labor.filter(
    (row) => row.crew_id && row.created_at >= entry.period.startIso && row.created_at < entry.period.endIso,
  );

  const loggedByCrew = new Map<string, number>();
  for (const row of inPeriod) {
    const crewId = row.crew_id as string;
    loggedByCrew.set(crewId, (loggedByCrew.get(crewId) ?? 0) + num(row.amount));
  }

  // Somebody can be owed for a period they logged no hours in — a salaried crew
  // member's approved entry is the only record of it.
  const crewIds = new Set<string>([...loggedByCrew.keys(), ...(entries?.keys() ?? [])]);

  let amount = 0;
  let approvedCount = 0;
  let unapproved = 0;
  for (const crewId of crewIds) {
    const record = entries?.get(crewId);
    if (record?.status === 'paid') continue; // Already out the door.
    if (record && (record.status === 'approved' || record.status === 'sent')) {
      // A zero approved_amount on a real entry means the figure wasn't frozen;
      // the logged hours are the only evidence left of what it was.
      amount += record.approved > 0 ? record.approved : (loggedByCrew.get(crewId) ?? 0);
      approvedCount += 1;
      continue;
    }
    // No entry, or one still in review: the logged hours are the best we have.
    const logged = loggedByCrew.get(crewId) ?? 0;
    if (logged <= 0) continue;
    amount += logged;
    unapproved += 1;
  }

  return {
    amount: Math.round(amount * 100) / 100,
    confirmed: amount > 0 && unapproved === 0,
    approvedCount,
    crewCount: approvedCount + unapproved,
  };
}

/**
 * The typical recent payroll, for periods nobody has worked yet.
 *
 * Only CLOSED periods count. A half-finished week has half a week's hours in it
 * and would drag the average down every single time this runs — which would
 * quietly under-forecast payroll, the one bill you cannot be short for.
 */
export function averageRecentPayroll(
  periods: PayrollPeriod[],
  labor: LaborRow[],
  entriesByPeriod: Map<string, Map<string, PayEntry>>,
  todayKey: string,
): number {
  const history: number[] = [];
  for (const entry of periods) {
    if (entry.period.open || entry.endKey >= todayKey) continue;
    const total = periodPayroll(entry, labor, entriesByPeriod.get(entry.key));
    if (total.amount > 0) history.push(total.amount);
  }
  if (history.length === 0) return 0;
  return history.reduce((sum, value) => sum + value, 0) / history.length;
}

export function buildPayrollEvents(input: {
  /** Every period considered, including closed ones — they feed the average. */
  periods: PayrollPeriod[];
  /** The subset whose pay day lands inside the forecast window. */
  relevant: PayrollPeriod[];
  labor: LaborRow[];
  entriesByPeriod: Map<string, Map<string, PayEntry>>;
  todayKey: string;
}): CashEvent[] {
  const { periods, relevant, labor, entriesByPeriod, todayKey } = input;
  if (relevant.length === 0) return [];

  const average = averageRecentPayroll(periods, labor, entriesByPeriod, todayKey);
  const events: CashEvent[] = [];

  for (const entry of relevant) {
    const { amount, confirmed, approvedCount, crewCount } = periodPayroll(entry, labor, entriesByPeriod.get(entry.key));

    if (amount > 0) {
      events.push({
        id: `payroll:${entry.key}`,
        dateKey: entry.payDayKey,
        label: 'Crew payroll',
        detail: confirmed
          ? `Approved · ${entry.period.rangeLabel}`
          : approvedCount > 0
            ? `${approvedCount} of ${crewCount} approved · ${entry.period.rangeLabel}`
            : `From logged hours · ${entry.period.rangeLabel}`,
        amount: -Math.round(amount * 100) / 100,
        kind: 'payroll',
        confirmed,
        // Payroll doesn't arrive late; it bounces.
        slips: false,
        repeating: true,
        href: '/dashboard/crew?tab=hours',
      });
      continue;
    }

    // Nothing logged yet, but the period is entirely ahead and this account does
    // run payroll — so a payroll is coming, even though no hours exist for it.
    // Deliberately NOT applied to the current period: it is part-worked, and
    // adding an average on top of the hours already in it would double it.
    if (average > 0 && entry.startKey > todayKey) {
      events.push({
        id: `payroll:${entry.key}:projected`,
        dateKey: entry.payDayKey,
        label: 'Crew payroll',
        detail: `Projected from recent periods · ${entry.period.rangeLabel}`,
        amount: -Math.round(average * 100) / 100,
        kind: 'payroll',
        confirmed: false,
        slips: false,
        repeating: true,
        href: '/dashboard/crew?tab=hours',
      });
    }
  }

  return events;
}
