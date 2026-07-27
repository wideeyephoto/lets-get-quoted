import { describe, it, expect } from 'vitest';
import {
  allocateInstallments,
  buildPlanSchedule,
  planBalanceCents,
  planSchedulePreview,
  advancePlanDate,
  DEFAULT_PLAN,
} from '@/lib/payment-plan-math';

// The Payment Plan only ALLOCATES the quote total — it must never charge a cent
// more or less than the total. All money is integer cents; the rounding
// remainder always lands on the final installment. These tests pin that
// invariant, since a drift here would over- or under-bill a real customer.

describe('allocateInstallments', () => {
  it('splits the default plan evenly (50% deposit + 4×12.5% of $1000)', () => {
    const { depositCents } = buildPlanSchedule(100_000, DEFAULT_PLAN.depositPercent, DEFAULT_PLAN.installmentCount);
    expect(depositCents).toBe(50_000);
    const parts = allocateInstallments(100_000, depositCents, 4);
    expect(parts).toEqual([12_500, 12_500, 12_500, 12_500]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(50_000);
  });

  it('puts the rounding remainder on the LAST installment', () => {
    // remaining = 10001c across 4 → 2500,2500,2500,2501
    const parts = allocateInstallments(20_002, 10_001, 4);
    expect(parts).toEqual([2500, 2500, 2500, 2501]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10_001);
  });

  it('never over- or under-charges: deposit + installments === total, always', () => {
    for (const total of [1, 99, 100, 333, 10_001, 99_999, 100_000, 123_457, 1_000_000]) {
      for (const pct of [0, 10, 25, 33, 50, 67, 100]) {
        for (const count of [1, 2, 3, 4, 6, 12, 24]) {
          const { depositCents, installments } = buildPlanSchedule(total, pct, count);
          const sum = depositCents + installments.reduce((a, b) => a + b, 0);
          expect(sum).toBe(total); // exact — no drift
          // Every installment is a whole number of cents.
          for (const cents of installments) expect(Number.isInteger(cents)).toBe(true);
        }
      }
    }
  });

  it('keeps the per-installment spread to at most (count-1) cents, only on the last', () => {
    const parts = allocateInstallments(100_003, 50_002, 4); // remaining 50001 → 12500×3, 12501
    const base = parts[0];
    for (let i = 0; i < parts.length - 1; i++) expect(parts[i]).toBe(base);
    expect(parts[parts.length - 1] - base).toBeLessThanOrEqual(parts.length - 1);
    expect(parts[parts.length - 1]).toBeGreaterThanOrEqual(base);
  });

  it('handles a single installment (Deposit + Remaining Balance shape)', () => {
    const { depositCents, installments } = buildPlanSchedule(100_000, 50, 1);
    expect(depositCents).toBe(50_000);
    expect(installments).toEqual([50_000]);
  });

  it('returns nothing for zero installments', () => {
    expect(allocateInstallments(100_000, 50_000, 0)).toEqual([]);
  });
});

describe('planBalanceCents', () => {
  it('is total minus everything paid', () => {
    expect(planBalanceCents(100_000, [50_000, 12_500])).toBe(37_500);
  });
  it('never goes negative (an over-payment floors at zero)', () => {
    expect(planBalanceCents(100_000, [50_000, 50_000, 12_500])).toBe(0);
  });
  it('equals the full total when nothing is paid', () => {
    expect(planBalanceCents(100_000, [])).toBe(100_000);
  });
});

describe('advancePlanDate', () => {
  it('adds a calendar month, clamping to the month end', () => {
    expect(advancePlanDate('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(advancePlanDate('2026-02-28', 'monthly')).toBe('2026-03-28');
    expect(advancePlanDate('2026-12-15', 'monthly')).toBe('2027-01-15');
  });
  it('adds exact days for weekly / biweekly', () => {
    expect(advancePlanDate('2026-03-01', 'weekly')).toBe('2026-03-08');
    expect(advancePlanDate('2026-03-01', 'biweekly')).toBe('2026-03-15');
  });
});

describe('planSchedulePreview', () => {
  it('produces one dated row per installment, amounts matching the allocation', () => {
    const schedule = planSchedulePreview({
      total_cents: 100_000,
      deposit_cents: 50_000,
      installment_count: 4,
      frequency: 'monthly',
      first_installment_date: '2026-02-01',
    });
    expect(schedule.map((s) => s.dueDate)).toEqual(['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01']);
    expect(schedule.map((s) => s.amountCents)).toEqual([12_500, 12_500, 12_500, 12_500]);
    expect(schedule.map((s) => s.seq)).toEqual([1, 2, 3, 4]);
  });

  it('the schedule total plus deposit equals the quote total', () => {
    const total = 123_457;
    const { depositCents } = buildPlanSchedule(total, 50, 4);
    const schedule = planSchedulePreview({
      total_cents: total,
      deposit_cents: depositCents,
      installment_count: 4,
      frequency: 'monthly',
      first_installment_date: '2026-01-15',
    });
    const scheduledCents = schedule.reduce((sum, s) => sum + s.amountCents, 0);
    expect(depositCents + scheduledCents).toBe(total);
  });
});
