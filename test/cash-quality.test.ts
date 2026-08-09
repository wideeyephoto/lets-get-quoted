import { describe, it, expect } from 'vitest';
import { buildForecast, type CashEvent } from '@/lib/cash-forecast';
import { cashFlags, cashConfidence } from '@/lib/cash-quality';

const TODAY = '2026-08-01';
const day = (offset: number) => new Date(Date.UTC(2026, 7, 1 + offset)).toISOString().slice(0, 10);

const entry = (label: string, amount: number, over: Partial<CashEvent> = {}): CashEvent => ({
  id: `${label}:${amount}:${over.dateKey ?? ''}`,
  dateKey: day(3),
  label,
  detail: 'monthly',
  amount,
  kind: amount > 0 ? 'other_in' : 'bill',
  confirmed: true,
  slips: false,
  repeating: true,
  href: null,
  ...over,
});

describe('cashFlags — asking rather than silently correcting', () => {
  it('catches the same name pointing both ways', () => {
    // The real one: a recurring +$4,000 and a recurring −$400 both called
    // "Phone & software". A $4,400 swing a month resting on a typo.
    const flags = cashFlags(
      [entry('Phone & software', 4_000), entry('Phone & software', -400, { dateKey: day(4) })],
      { base: '/dashboard', balanceAgeDays: 0 },
    );
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe('contradictory_pair');
    expect(flags[0].question).toContain('Phone & software');
    expect(flags[0].detail).toContain('$4,000');
    expect(flags[0].detail).toContain('$400');
  });

  it('matches on the name people actually typed, not on an exact string', () => {
    const flags = cashFlags(
      [entry('Phone  &  Software ', 4_000), entry('phone & software', -400, { dateKey: day(4) })],
      { base: '/dashboard', balanceAgeDays: 0 },
    );
    expect(flags).toHaveLength(1);
  });

  it('leaves a repeating series alone — the same name many times is the point', () => {
    const series = [0, 30, 60].map((offset) => entry('Shop rent', -2_200, { dateKey: day(offset) }));
    expect(cashFlags(series, { base: '/dashboard', balanceAgeDays: 0 })).toHaveLength(0);
  });

  it('does not flag two different names that happen to point different ways', () => {
    const flags = cashFlags([entry('Deposit', 4_000), entry('Shop rent', -2_200)], {
      base: '/dashboard',
      balanceAgeDays: 0,
    });
    expect(flags).toHaveLength(0);
  });

  it('asks about a balance old enough to be about a different month', () => {
    const flags = cashFlags([], { base: '/dashboard', balanceAgeDays: 12 });
    expect(flags.map((flag) => flag.kind)).toContain('stale_balance');
    expect(flags[0].question).toContain('12 days ago');
  });

  it('stays quiet about a balance entered today, and about one never entered', () => {
    expect(cashFlags([], { base: '/dashboard', balanceAgeDays: 0 })).toHaveLength(0);
    // Null age means no balance at all — the setup panel already says so, and
    // saying it twice is nagging.
    expect(cashFlags([], { base: '/dashboard', balanceAgeDays: null })).toHaveLength(0);
  });

  it('never edits anything — every flag is a question with somewhere to answer it', () => {
    const flags = cashFlags(
      [entry('Phone & software', 4_000), entry('Phone & software', -400, { dateKey: day(4) })],
      { base: '/demo', balanceAgeDays: 0 },
    );
    expect(flags[0].question.endsWith('?')).toBe(true);
    expect(flags[0].href).toBe('/demo/cash-flow#cash-bills');
  });
});

describe('cashConfidence — how much of the line is pinned down', () => {
  const forecastOf = (events: CashEvent[]) =>
    buildForecast(events, { todayKey: TODAY, days: 30, startingBalance: 10_000, buffer: 0, lateDays: 0 });

  it('measures money moving, not the number of rows', () => {
    // Fifty certain $40 subscriptions say nothing useful about a month whose
    // shape is one $30,000 payment that might not come.
    const events = [
      ...Array.from({ length: 50 }, (_, i) => entry(`Sub ${i}`, -40, { confirmed: true })),
      entry('Big job', 30_000, { confirmed: false }),
    ];
    const confidence = cashConfidence(forecastOf(events));
    expect(confidence.confirmedShare).toBeLessThan(0.1);
    expect(confidence.level).toBe('low');
  });

  it('calls a fully confirmed month high', () => {
    const confidence = cashConfidence(forecastOf([entry('Shop rent', -2_200, { confirmed: true })]));
    expect(confidence.confirmedShare).toBe(1);
    expect(confidence.level).toBe('high');
    expect(confidence.sentence).toContain('100%');
  });

  it('does not divide by zero on an empty month', () => {
    const confidence = cashConfidence(forecastOf([]));
    expect(confidence.confirmedShare).toBe(1);
    expect(Number.isFinite(confidence.confirmedShare)).toBe(true);
  });

  it('names the level in words as well as a percentage', () => {
    const mixed = cashConfidence(
      forecastOf([entry('Approved payroll', -5_000, { confirmed: true }), entry('Quoted job', 5_000, { confirmed: false })]),
    );
    expect(mixed.level).toBe('fair');
    expect(mixed.sentence).toContain('50%');
  });
});
