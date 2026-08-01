import { describe, it, expect } from 'vitest';
import { cashWarningFrom, shouldForecastCash, CASH_WARN_DAYS, STALE_BALANCE_DAYS } from '@/lib/cash-warning';

const NOW = new Date('2026-08-01T12:00:00.000Z');
const TODAY = '2026-08-01';

const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const point = (dateKey: string, balance: number) => ({ dateKey, index: 0, balance });

describe('shouldForecastCash — the cheap gate before doing any work', () => {
  it('runs for a balance checked today', () => {
    expect(shouldForecastCash(25000, ago(0), NOW)).toBe(true);
  });

  it('runs right up to the staleness limit, and stops after it', () => {
    expect(shouldForecastCash(25000, ago(STALE_BALANCE_DAYS), NOW)).toBe(true);
    expect(shouldForecastCash(25000, ago(STALE_BALANCE_DAYS + 1), NOW)).toBe(false);
  });

  it('will not forecast from a balance nobody gave', () => {
    expect(shouldForecastCash(null, ago(1), NOW)).toBe(false);
    expect(shouldForecastCash(undefined, ago(1), NOW)).toBe(false);
  });

  it('will not forecast from a balance with no date on it', () => {
    // Without a date there is no way to know whether it is this month's number.
    expect(shouldForecastCash(25000, null, NOW)).toBe(false);
    expect(shouldForecastCash(25000, 'not a date', NOW)).toBe(false);
  });

  it('treats a future timestamp as a clock problem, not a fresh number', () => {
    expect(shouldForecastCash(25000, ago(-3), NOW)).toBe(false);
  });

  it('accepts a zero balance — that is a real and rather urgent answer', () => {
    expect(shouldForecastCash(0, ago(1), NOW)).toBe(true);
  });
});

describe('cashWarningFrom — what actually reaches the inbox', () => {
  it('stays silent when the money never runs low', () => {
    expect(cashWarningFrom({ overdraft: null, firstBelowBuffer: null }, { todayKey: TODAY, buffer: 10000 })).toBeNull();
  });

  it('warns about a dip into the buffer', () => {
    const warning = cashWarningFrom(
      { overdraft: null, firstBelowBuffer: point('2026-08-05', 8200) },
      { todayKey: TODAY, buffer: 10000 },
    )!;
    expect(warning.daysAway).toBe(4);
    expect(warning.amount).toBe(8200);
    expect(warning.overdraft).toBe(false);
    expect(warning.label).toBe('Wed, Aug 5');
  });

  it('leads with overdrawn when both are true — same event, louder depth', () => {
    const warning = cashWarningFrom(
      { overdraft: point('2026-08-06', -900), firstBelowBuffer: point('2026-08-03', 4000) },
      { todayKey: TODAY, buffer: 10000 },
    )!;
    expect(warning.overdraft).toBe(true);
    expect(warning.amount).toBe(-900);
    expect(warning.label).toBe('Thu, Aug 6');
  });

  it('goes quiet once the dip is further out than a week', () => {
    // A shortfall 26 days away repeated every morning teaches people to skip the
    // email, and then the one that matters gets skipped too.
    const near = cashWarningFrom(
      { overdraft: null, firstBelowBuffer: point('2026-08-08', 900) },
      { todayKey: TODAY, buffer: 10000 },
    );
    const far = cashWarningFrom(
      { overdraft: null, firstBelowBuffer: point('2026-08-09', 900) },
      { todayKey: TODAY, buffer: 10000 },
    );
    expect(near?.daysAway).toBe(CASH_WARN_DAYS);
    expect(far).toBeNull();
  });

  it('warns on the day itself', () => {
    const warning = cashWarningFrom(
      { overdraft: point(TODAY, -50), firstBelowBuffer: point(TODAY, -50) },
      { todayKey: TODAY, buffer: 0 },
    )!;
    expect(warning.daysAway).toBe(0);
  });

  it('ignores a dip dated in the past rather than reporting a negative countdown', () => {
    expect(
      cashWarningFrom({ overdraft: null, firstBelowBuffer: point('2026-07-28', 100) }, { todayKey: TODAY, buffer: 10000 }),
    ).toBeNull();
  });

  it('carries the buffer through, so the email can say what was missed', () => {
    const warning = cashWarningFrom(
      { overdraft: null, firstBelowBuffer: point('2026-08-04', 3000) },
      { todayKey: TODAY, buffer: 7500 },
    )!;
    expect(warning.buffer).toBe(7500);
  });
});
