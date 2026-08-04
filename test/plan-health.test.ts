import { describe, expect, it } from 'vitest';
import { nextChargeLabel, planHealth } from '../src/lib/recurring-display';
import { formatDuration } from '../src/lib/recurring-context';

const healthy = {
  active: true,
  autoCharge: true,
  hasCard: true,
  amount: 100,
  daysUntilNext: 5,
  nextVisitAssigned: true,
};

describe('planHealth', () => {
  it('says nothing when everything is in place', () => {
    const result = planHealth(healthy);
    expect(result.level).toBe('healthy');
    expect(result.reasons).toEqual([]);
  });

  it('treats a paused plan as healthy — pausing is a decision, not a fault', () => {
    const result = planHealth({ ...healthy, active: false, hasCard: false, daysUntilNext: -30 });
    expect(result.level).toBe('healthy');
  });

  it('flags a missing card as attention on its own', () => {
    const result = planHealth({ ...healthy, hasCard: false });
    expect(result.level).toBe('attention');
    expect(result.reasons).toContain('No payment method on file');
  });

  it('escalates to at-risk only when late work ALSO cannot be billed', () => {
    // Late but billable — bad, not urgent.
    expect(planHealth({ ...healthy, daysUntilNext: -3 }).level).toBe('attention');
    // Unbillable but not yet due — bad, not urgent.
    expect(planHealth({ ...healthy, hasCard: false }).level).toBe('attention');
    // Both: work is about to happen that cannot be charged for.
    const urgent = planHealth({ ...healthy, hasCard: false, daysUntilNext: -3 });
    expect(urgent.level).toBe('at-risk');
    expect(urgent.reasons).toHaveLength(2);
  });

  it('does NOT flag unassigned when no visit job exists yet', () => {
    // null means "there is nothing to assign anyone to", which is the normal
    // state of a plan whose next visit is still a week out.
    expect(planHealth({ ...healthy, nextVisitAssigned: null }).level).toBe('healthy');
    expect(planHealth({ ...healthy, nextVisitAssigned: false }).reasons).toContain(
      'Nobody assigned to the next visit',
    );
  });

  it('flags a plan with no price', () => {
    expect(planHealth({ ...healthy, amount: 0 }).reasons).toContain('No price set');
  });

  it('ignores the card entirely when the plan bills manually', () => {
    const manual = planHealth({ ...healthy, autoCharge: false, hasCard: false });
    expect(manual.level).toBe('healthy');
  });
});

describe('nextChargeLabel', () => {
  const money = (n: number) => `$${n}`;

  it('says it will be charged when there is a card to charge', () => {
    expect(
      nextChargeLabel({ amount: 100, nextRunDate: '2026-08-15', autoCharge: true, hasCard: true, formatMoney: money }),
    ).toBe('$100 charged after the Aug 15 visit');
  });

  it('says the card is missing rather than promising a charge', () => {
    expect(
      nextChargeLabel({ amount: 55, nextRunDate: '2026-09-01', autoCharge: true, hasCard: false, formatMoney: money }),
    ).toBe('$55 due Sep 1 — no card on file yet');
  });

  it('says somebody has to invoice it when billing is manual', () => {
    expect(
      nextChargeLabel({ amount: 55, nextRunDate: '2026-09-01', autoCharge: false, hasCard: false, formatMoney: money }),
    ).toBe('$55 to invoice on Sep 1');
  });

  it('says nothing at all when there is no price', () => {
    expect(
      nextChargeLabel({ amount: 0, nextRunDate: '2026-09-01', autoCharge: true, hasCard: true, formatMoney: money }),
    ).toBeNull();
  });
});

describe('formatDuration', () => {
  it('never renders a decimal hour', () => {
    expect(formatDuration(1.5)).toBe('1 hr 30 min');
    expect(formatDuration(0.75)).toBe('45 min');
    expect(formatDuration(2)).toBe('2 hrs');
    expect(formatDuration(1)).toBe('1 hr');
  });

  it('returns null rather than "0 min" for a missing estimate', () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(0)).toBeNull();
  });
});
