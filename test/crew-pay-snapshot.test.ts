import { describe, it, expect } from 'vitest';
import { snapshotOf, reopenGuard, type PayPeriodRow } from '@/lib/crew-pay-data';
import type { CrewPayRow } from '@/lib/crew-pay';

// snapshotOf is the last step before money becomes a record. Its `amount`
// becomes crew_pay_entries.approved_amount — what a person is actually paid,
// and the frozen figure anyone appeals to months later. Nothing tested it.

const entry = (over: Partial<CrewPayRow['entries'][number]> = {}) => ({
  id: 'cost-1',
  jobId: 'job-1',
  description: 'Tuesday — repipe',
  loggedAt: '2026-07-28T15:00:00.000Z',
  hours: 4,
  rate: 45,
  amount: 180,
  ...over,
});

const row = (over: Partial<CrewPayRow> = {}): CrewPayRow =>
  ({
    crewId: 'crew-1',
    name: 'Dana Whitfield',
    regularHours: 38,
    overtimeHours: 2,
    estimatedPay: 1810,
    entries: [entry()],
    payType: 'hourly',
    payBasis: '40 h at $45',
    ...over,
  }) as unknown as CrewPayRow;

describe('snapshotOf — the figure that becomes what somebody is paid', () => {
  it('takes the amount from the server-side rollup, never from anywhere else', () => {
    // The whole reason this function exists: a client submits WHO to pay, and
    // the amount is derived here. estimatedPay is that derivation.
    expect(snapshotOf(row({ estimatedPay: 1810 })).amount).toBe(1810);
  });

  it('carries the hours split through, so overtime is visible on the record', () => {
    const snap = snapshotOf(row({ regularHours: 38, overtimeHours: 2 }));
    expect(snap.regularHours).toBe(38);
    expect(snap.overtimeHours).toBe(2);
  });

  it('freezes the name as it is now, so a later rename cannot rewrite history', () => {
    expect(snapshotOf(row({ name: 'Dana Whitfield' })).crewName).toBe('Dana Whitfield');
  });

  it('freezes every line the amount was built from', () => {
    const snap = snapshotOf(
      row({
        entries: [
          entry({ id: 'c1', amount: 180, hours: 4 }),
          entry({ id: 'c2', amount: 225, hours: 5, description: 'Wednesday — callout' }),
        ],
      }),
    );
    expect(snap.lines).toHaveLength(2);
    expect(snap.lines!.map((line) => line.costId)).toEqual(['c1', 'c2']);
    // Without these, an adjustment can say "$60 more than agreed" and never say
    // which shift moved.
    expect(snap.lines![1]).toMatchObject({ jobId: 'job-1', hours: 5, rate: 45, amount: 225 });
  });

  it('keeps every field of a line — a partial line is not evidence', () => {
    const line = snapshotOf(row()).lines![0];
    expect(Object.keys(line).sort()).toEqual(
      ['amount', 'costId', 'description', 'hours', 'jobId', 'loggedAt', 'rate'].sort(),
    );
  });

  it('records HOW the amount was reached, not just the number', () => {
    // For a salaried person the lines deliberately do not add up to the amount.
    // Without the basis, "why is this $1,384.62" has no answer six months on —
    // the salary may have changed since.
    const salaried = snapshotOf(
      row({ payType: 'salary', payBasis: '$72,000/yr over 52 weeks', estimatedPay: 1384.62, entries: [entry({ amount: 180 })] }),
    );
    expect(salaried.payType).toBe('salary');
    expect(salaried.payBasis).toBe('$72,000/yr over 52 weeks');
    // The mismatch is the point, and it is preserved rather than reconciled.
    expect(salaried.amount).not.toBe(salaried.lines!.reduce((sum, line) => sum + line.amount, 0));
  });

  it('survives a row with no lines at all — a salaried week with no shifts logged', () => {
    const snap = snapshotOf(row({ entries: [], estimatedPay: 1384.62 }));
    expect(snap.lines).toEqual([]);
    expect(snap.amount).toBe(1384.62);
  });

  it('leaves a zero amount as zero rather than quietly dropping it', () => {
    expect(snapshotOf(row({ estimatedPay: 0, entries: [] })).amount).toBe(0);
  });

  it('does not round — the rollup already decided the cents', () => {
    // Rounding here would silently disagree with the figure shown on screen.
    expect(snapshotOf(row({ estimatedPay: 1384.615 })).amount).toBe(1384.615);
  });
});

describe('reopenGuard', () => {
  const period = (closedAt: string | null) => ({ closedAt } as unknown as PayPeriodRow);

  it('allows reopening a period that was closed', () => {
    expect(reopenGuard(period('2026-08-01T12:00:00.000Z'))).toBeNull();
  });

  it('refuses one that was never closed, and says why', () => {
    expect(reopenGuard(period(null))).toContain('isn’t closed');
  });
});
