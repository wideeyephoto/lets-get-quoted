import { describe, it, expect } from 'vitest';
import {
  buildPayConfirmation,
  buildPayCsv,
  buildPayRows,
  canTransition,
  formatKeyDay,
  formatKeyRange,
  hoursLabel,
  markPeriodBlockedReason,
  payBlockedReason,
  payPeriodKey,
  payPeriodState,
  paymentDateProblem,
  paymentDetailLine,
  periodPrimaryAction,
  periodProgress,
  summarizePayTotals,
  type PayRecord,
} from '@/lib/crew-pay';
import { resolvePayPeriod, summarizeCrewLabor, type LaborEntry } from '@/lib/labor';

// Wednesday, 29 July 2026, local noon.
const NOW = new Date(2026, 6, 29, 12, 0, 0);
const LOGGED = new Date(2026, 6, 27, 9, 0, 0).toISOString();

function entry(over: Partial<LaborEntry> = {}): LaborEntry {
  return {
    id: 'entry-1',
    crew_id: 'crew-1',
    crew_name: 'Mike Torres',
    crew_role_label: 'Lead plumber',
    job_id: 'job-1',
    description: 'Rough-in',
    hours: 8,
    rate: 42,
    amount: 336,
    created_at: LOGGED,
    ...over,
  };
}

function record(over: Partial<PayRecord> = {}): PayRecord {
  return {
    id: 'rec-1',
    crewId: 'crew-1',
    crewName: 'Mike Torres',
    status: 'approved',
    regularHours: 8,
    overtimeHours: 0,
    approvedAmount: 336,
    approvedAt: new Date(2026, 6, 28, 8, 0, 0).toISOString(),
    approvedBy: 'owner@example.com',
    sentAt: null,
    paidAmount: null,
    paidAt: null,
    paidBy: null,
    paymentDate: null,
    paymentMethod: null,
    paymentReference: null,
    paymentNote: null,
    locked: false,
    ...over,
  };
}

function rowsFor(entries: LaborEntry[], records: PayRecord[] = [], openShiftCrewIds: string[] = []) {
  return buildPayRows(summarizeCrewLabor(entries).rows, records, { openShiftCrewIds });
}

describe('the workflow', () => {
  it('never lets a paid entry slide quietly back to draft or needs review', () => {
    expect(canTransition('paid', 'draft')).toBe(false);
    expect(canTransition('paid', 'needs_review')).toBe(false);
    // The one way out of paid is the undo action, which lands on approved.
    expect(canTransition('paid', 'approved')).toBe(true);
  });

  it('will not record a payment against hours that were never approved', () => {
    expect(canTransition('draft', 'paid')).toBe(false);
    expect(canTransition('needs_review', 'paid')).toBe(false);
    expect(canTransition('approved', 'paid')).toBe(true);
    expect(canTransition('sent', 'paid')).toBe(true);
  });

  it('treats sent to payroll as a step after approval, not a shortcut to paid', () => {
    expect(canTransition('draft', 'sent')).toBe(false);
    expect(canTransition('approved', 'sent')).toBe(true);
  });
});

describe('derived status', () => {
  it('flags hours logged at a zero rate as needing review before anyone acts', () => {
    const [row] = rowsFor([entry({ rate: 0, amount: 0 })]);
    expect(row.status).toBe('needs_review');
    expect(row.blockers).toContain('missing-rate');
    expect(payBlockedReason(row)).toMatch(/zero rate/);
  });

  it('is a draft when the hours are simply not agreed yet', () => {
    const [row] = rowsFor([entry()]);
    expect(row.status).toBe('draft');
    expect(row.review).toBe('draft');
    expect(row.payment).toBe('unpaid');
  });

  it('lets a stored record win over the derived status', () => {
    const [row] = rowsFor([entry()], [record()]);
    expect(row.status).toBe('approved');
    expect(row.approvedAmount).toBe(336);
  });

  it('refuses to invent a payee for labor with nobody on it', () => {
    const [row] = rowsFor([entry({ crew_id: null, crew_name: null })]);
    expect(row.eligible).toBe(false);
    expect(row.ineligibleReason).toMatch(/nobody to pay/);
    expect(payBlockedReason(row)).toMatch(/nobody to pay/);
  });

  it('says a shift is still running rather than quietly totalling a moving number', () => {
    const [row] = rowsFor([entry()], [], ['crew-1']);
    expect(row.warnings).toContain('open-shift');
  });

  it('calls a 20-hour entry what it almost always is', () => {
    const [row] = rowsFor([entry({ hours: 20, amount: 840 })]);
    expect(row.warnings).toContain('long-shift');
  });
});

describe('hours that move after the fact', () => {
  it('shows the difference instead of rewriting what was approved', () => {
    // Approved at 336; another 2 hours landed since.
    const [row] = rowsFor([entry(), entry({ id: 'entry-2', hours: 2, amount: 84 })], [record()]);
    expect(row.approvedAmount).toBe(336);
    expect(row.estimatedPay).toBe(420);
    expect(row.adjustment).toBe(84);
    expect(row.warnings).toContain('changed-after-approval');
  });

  it('notices hours logged after the approval timestamp', () => {
    const later = new Date(2026, 6, 28, 17, 0, 0).toISOString();
    const [row] = rowsFor([entry({ created_at: later })], [record()]);
    expect(row.warnings).toContain('logged-after-approval');
  });

  it('keeps the paid amount as the baseline once money has gone out', () => {
    const paid = record({ status: 'paid', paidAmount: 336, paidAt: LOGGED, paymentDate: '2026-07-31' });
    const [row] = rowsFor([entry({ hours: 6, amount: 252 })], [paid]);
    expect(row.paidAmount).toBe(336);
    expect(row.adjustment).toBe(-84);
    expect(row.warnings).toContain('changed-after-paid');
    // The period total still reports what was PAID, not what the hours are
    // worth now — otherwise editing hours would restate money already out.
    expect(summarizePayTotals([row]).paidPay).toBe(336);
  });
});

describe('period state and the one thing to do next', () => {
  const period = resolvePayPeriod('weekly', -1, { now: NOW });

  it('asks for a review before anything else', () => {
    const rows = rowsFor([entry({ rate: 0, amount: 0 })]);
    const totals = summarizePayTotals(rows);
    expect(payPeriodState(rows, totals, period)).toBe('needs-review');
    expect(periodPrimaryAction(payPeriodState(rows, totals, period), totals)?.id).toBe('review');
  });

  it('offers approval once the entries are clean', () => {
    const rows = rowsFor([entry()]);
    const totals = summarizePayTotals(rows);
    expect(periodPrimaryAction(payPeriodState(rows, totals, period), totals)?.id).toBe('approve');
  });

  it('offers payment once everything is approved', () => {
    const rows = rowsFor([entry()], [record()]);
    const totals = summarizePayTotals(rows);
    expect(payPeriodState(rows, totals, period)).toBe('approved');
    expect(periodPrimaryAction(payPeriodState(rows, totals, period), totals)?.id).toBe('pay');
  });

  it('says partially paid when some of the crew is still owed', () => {
    const rows = rowsFor(
      [entry(), entry({ id: 'e2', crew_id: 'crew-2', crew_name: 'Sarah Johnson' })],
      [record({ status: 'paid', paidAmount: 336, paidAt: LOGGED, paymentDate: '2026-07-31' }), record({ id: 'rec-2', crewId: 'crew-2' })],
    );
    const totals = summarizePayTotals(rows);
    expect(payPeriodState(rows, totals, period)).toBe('partially-paid');
    expect(periodPrimaryAction(payPeriodState(rows, totals, period), totals)?.id).toBe('finish');
  });

  it('lets a fully re-paid period read as paid rather than staying reopened for ever', () => {
    const rows = rowsFor([entry()], [record({ status: 'paid', paidAmount: 336, paidAt: LOGGED, paymentDate: '2026-07-31' })]);
    const totals = summarizePayTotals(rows);
    expect(payPeriodState(rows, totals, period, { reopened: true })).toBe('paid');
  });

  it('has nothing to say about a period with no hours in it', () => {
    expect(payPeriodState([], summarizePayTotals([]), period)).toBe('empty');
    expect(periodPrimaryAction('empty', summarizePayTotals([]))).toBeNull();
  });
});

describe('confirmation before money is recorded', () => {
  it('names everyone it is leaving out and why', () => {
    const rows = rowsFor(
      [entry(), entry({ id: 'e2', crew_id: 'crew-2', crew_name: 'Sarah Johnson', rate: 0, amount: 0 })],
      [record()],
    );
    const confirmation = buildPayConfirmation(rows, ['crew-1', 'crew-2']);
    expect(confirmation.crewCount).toBe(1);
    expect(confirmation.amount).toBe(336);
    expect(confirmation.excluded).toHaveLength(1);
    expect(confirmation.excluded[0].name).toBe('Sarah Johnson');
  });

  it('makes a warning something you have to say yes to', () => {
    const rows = rowsFor([entry()], [record()], ['crew-1']);
    const confirmation = buildPayConfirmation(rows, ['crew-1']);
    expect(confirmation.requiresAcknowledgement).toBe(true);
    expect(confirmation.warnings[0].names).toEqual(['Mike Torres']);
  });

  it('does not make overtime alone a thing to acknowledge', () => {
    // Three ordinary days, not one implausible 45-hour shift.
    const rows = rowsFor(
      [
        entry({ id: 'a', hours: 15, amount: 630 }),
        entry({ id: 'b', hours: 15, amount: 630 }),
        entry({ id: 'c', hours: 15, amount: 630 }),
      ],
      [record({ approvedAmount: 1890 })],
    );
    expect(rows[0].warnings).toContain('overtime');
    expect(buildPayConfirmation(rows, ['crew-1']).requiresAcknowledgement).toBe(false);
  });

  it('blocks the whole period on unapproved hours and says whose', () => {
    const rows = rowsFor([entry(), entry({ id: 'e2', crew_id: 'crew-2', crew_name: 'Sarah Johnson' })], [record()]);
    const reason = markPeriodBlockedReason(rows);
    expect(reason).toMatch(/Sarah Johnson/);
    expect(reason).toMatch(/aren’t approved/);
  });

  it('has nothing left to do once everyone is paid', () => {
    const rows = rowsFor([entry()], [record({ status: 'paid', paidAmount: 336, paidAt: LOGGED, paymentDate: '2026-07-31' })]);
    expect(markPeriodBlockedReason(rows)).toMatch(/nobody left to pay/);
  });
});

describe('payment date', () => {
  it('refuses a payment dated in the future', () => {
    expect(paymentDateProblem('2026-08-05', NOW)).toMatch(/future/);
    expect(paymentDateProblem('2026-07-29', NOW)).toBeNull();
    expect(paymentDateProblem('2026-07-01', NOW)).toBeNull();
  });

  it('questions a date more than two years back', () => {
    expect(paymentDateProblem('2023-01-01', NOW)).toMatch(/two years/);
  });

  it('rejects anything that isn’t a date', () => {
    expect(paymentDateProblem('', NOW)).toMatch(/Enter the date/);
    expect(paymentDateProblem('soon', NOW)).toMatch(/Enter the date/);
  });
});

describe('period identity', () => {
  it('gives the same week the same key however it is reached', () => {
    const a = payPeriodKey(resolvePayPeriod('weekly', -1, { now: NOW }));
    const b = payPeriodKey(resolvePayPeriod('weekly', 0, { now: new Date(2026, 6, 22, 9, 0, 0) }));
    expect(a).toBe(b);
    expect(a).toBe('weekly:2026-07-19');
  });

  it('keeps a custom range distinct from the week it starts in', () => {
    const custom = payPeriodKey(resolvePayPeriod('custom', 0, { from: '2026-07-19', to: '2026-07-22', now: NOW }));
    expect(custom).toBe('custom:2026-07-19:2026-07-22');
  });
});

describe('the small print', () => {
  it('reads hours the way a contractor says them', () => {
    expect(hoursLabel(18.53)).toBe('18h 32m');
    expect(hoursLabel(0)).toBe('0h 00m');
    // 7.999 is 8 hours, not 7h 60m.
    expect(hoursLabel(7.999)).toBe('8h 00m');
  });

  it('counts the days of a period without counting today twice', () => {
    const period = resolvePayPeriod('weekly', 0, { now: NOW });
    const progress = periodProgress(period, NOW);
    expect(progress.daysTotal).toBe(7);
    expect(progress.daysDone).toBe(4); // Sun–Wed
    expect(progress.daysLeft).toBe(3);
  });

  it('writes a payment line only when there is something to say', () => {
    expect(paymentDetailLine({ paymentMethod: 'check', paymentReference: '#1042' })).toBe('Check · #1042');
    expect(paymentDetailLine({ paymentMethod: 'direct_deposit', paymentReference: null })).toBe('Direct deposit');
    expect(paymentDetailLine({ paymentMethod: null, paymentReference: null })).toBeNull();
  });

  it('formats a range from two date keys', () => {
    expect(formatKeyRange('2026-07-26', '2026-08-01')).toBe('Jul 26 – Aug 1');
    // A bare date key read as UTC midnight shows the day before west of
    // Greenwich, which on a payment record is the wrong day entirely.
    expect(formatKeyDay('2026-07-31')).toBe('Jul 31');
  });

  it('keeps hours logged and hours approved as separate numbers', () => {
    const rows = rowsFor(
      [entry(), entry({ id: 'e2', crew_id: 'crew-2', crew_name: 'Sarah Johnson', hours: 5, amount: 190 })],
      [record()],
    );
    const totals = summarizePayTotals(rows);
    expect(totals.hours).toBe(13); // everything logged
    expect(totals.approvedHours).toBe(8); // only what was agreed
  });
});

describe('export', () => {
  it('carries approval and payment status so nobody pays from it twice', () => {
    const rows = rowsFor([entry()], [record({ status: 'paid', paidAmount: 336, paidAt: LOGGED, paymentDate: '2026-07-31', paymentMethod: 'check', paymentReference: '#1042' })]);
    const [header, line] = buildPayCsv(rows, 'Jul 26 – Aug 1').split('\n');
    expect(header).toContain('Approval status');
    expect(header).toContain('Payment status');
    expect(line).toContain('Approved');
    expect(line).toContain('Paid');
    expect(line).toContain('2026-07-31');
    expect(line).toContain('#1042');
  });

  it('escapes a name that would otherwise break the columns', () => {
    const rows = rowsFor([entry({ crew_name: 'Torres, Mike "Big Mike"' })]);
    expect(buildPayCsv(rows, 'Jul 26 – Aug 1').split('\n')[1]).toContain('"Torres, Mike ""Big Mike"""');
  });
});
