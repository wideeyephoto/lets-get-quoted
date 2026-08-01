import { describe, it, expect } from 'vitest';
import { accuracySentence, compareForecast, type CashSnapshot } from '@/lib/cash-accuracy';

const TODAY = '2026-08-15';

const snapshot = (over: Partial<CashSnapshot> = {}): CashSnapshot => ({
  takenOn: '2026-08-01',
  balance: 25000,
  buffer: 10000,
  horizonDays: 30,
  projected: [
    { d: '2026-08-01', p: 25000 },
    { d: '2026-08-15', p: 19400 },
    { d: '2026-08-30', p: 23800 },
  ],
  ...over,
});

const compare = (snap: CashSnapshot | null, actualBalance: number, todayKey = TODAY) =>
  compareForecast(snap, { todayKey, actualBalance });

describe('compareForecast', () => {
  it('reports the gap against what the curve said for today', () => {
    const result = compare(snapshot(), 17850)!;
    expect(result.predicted).toBe(19400);
    expect(result.actual).toBe(17850);
    expect(result.delta).toBe(-1550);
    expect(result.direction).toBe('behind');
    expect(result.daysAgo).toBe(14);
    expect(result.pct).toBe(8);
  });

  it('says ahead when the money turned up better than forecast', () => {
    expect(compare(snapshot(), 21000)!.direction).toBe('ahead');
    expect(compare(snapshot(), 21000)!.delta).toBe(1600);
  });

  it('treats a small miss as on target — that is the change in somebody pocket', () => {
    expect(compare(snapshot(), 19430)!.direction).toBe('on');
    expect(compare(snapshot(), 19370)!.direction).toBe('on');
    // …but not once it is real money.
    expect(compare(snapshot(), 19340)!.direction).toBe('behind');
  });

  it('has nothing to say without a snapshot', () => {
    expect(compare(null, 17850)).toBeNull();
  });

  it('refuses to compare a snapshot taken today with today', () => {
    // That is comparing a number to itself and calling it accuracy.
    expect(compare(snapshot({ takenOn: TODAY }), 17850, TODAY)).toBeNull();
  });

  it('refuses when the old curve never reached today', () => {
    // A 30-day forecast from six weeks ago has no opinion about now, and
    // extrapolating one would be inventing the answer.
    expect(compare(snapshot({ projected: [{ d: '2026-07-01', p: 100 }] }), 17850)).toBeNull();
  });

  it('refuses a snapshot from the future rather than reporting a negative age', () => {
    expect(compare(snapshot({ takenOn: '2026-09-01' }), 17850)).toBeNull();
  });

  it('survives a curve carrying rubbish for today', () => {
    expect(compare(snapshot({ projected: [{ d: TODAY, p: Number.NaN }] }), 17850)).toBeNull();
  });

  it('reports no percentage rather than dividing by zero', () => {
    const result = compare(snapshot({ projected: [{ d: TODAY, p: 0 }] }), 500)!;
    expect(result.pct).toBeNull();
    expect(result.delta).toBe(500);
  });

  it('keeps the balance the forecast started from, so the story has a beginning', () => {
    expect(compare(snapshot({ balance: 25000 }), 17850)!.startedAt).toBe(25000);
  });
});

describe('accuracySentence', () => {
  it('names the gap and which way it went', () => {
    expect(accuracySentence(compare(snapshot(), 17850)!)).toBe(
      "14 days ago this said you'd be at $19,400 today. You're at $17,850 — $1,550 short.",
    );
  });

  it('says better off when it went the other way', () => {
    expect(accuracySentence(compare(snapshot(), 21000)!)).toContain('$1,600 better off');
  });

  it('does not make a fuss about being right', () => {
    expect(accuracySentence(compare(snapshot(), 19410)!)).toContain('near enough');
  });

  it('says yesterday rather than "1 days ago"', () => {
    const yesterday = compare(snapshot({ takenOn: '2026-08-14', projected: [{ d: TODAY, p: 100 }] }), 90)!;
    expect(accuracySentence(yesterday)).toMatch(/^Yesterday/);
  });
});
