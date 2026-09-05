import { describe, it, expect } from 'vitest';
import {
  entryIssue,
  exportBlockedReason,
  buildPeriodHref,
  normalizeOffset,
  normalizePeriodMode,
  resolvePayPeriod,
  splitOvertime,
  summarizeCrewLabor,
  summarizeJobLabor,
  type LaborEntry,
} from '@/lib/labor';
import { DEFAULT_LABOR_SETTINGS, normalizeLaborSettings, roundHours } from '@/lib/labor-settings';

// Wednesday, 29 July 2026, local noon — a mid-week anchor so week boundaries
// are visible in both directions.
const NOW = new Date(2026, 6, 29, 12, 0, 0);

function entry(over: Partial<LaborEntry> = {}): LaborEntry {
  return {
    id: over.id ?? 'e1',
    crew_id: 'crew-1',
    crew_name: 'Mike Torres',
    crew_role_label: 'Laborer',
    job_id: 'job-1',
    description: 'Framing',
    hours: 8,
    rate: 30,
    amount: 240,
    created_at: new Date(2026, 6, 27, 9).toISOString(), // Monday of NOW's week
    ...over,
  };
}

describe('pay periods', () => {
  it('cuts a week Sunday to Sunday', () => {
    const period = resolvePayPeriod('weekly', 0, { now: NOW });
    expect(new Date(period.startIso).getDay()).toBe(0);
    // End is exclusive, so a 7-day week ends on the NEXT Sunday.
    expect(new Date(period.endIso).getDay()).toBe(0);
    expect(new Date(period.endIso).getTime() - new Date(period.startIso).getTime()).toBe(7 * 24 * 3600 * 1000);
    expect(period.open).toBe(true);
  });

  it('walks whole periods with the offset', () => {
    const current = resolvePayPeriod('weekly', 0, { now: NOW });
    const previous = resolvePayPeriod('weekly', -1, { now: NOW });
    expect(previous.endIso).toBe(current.startIso);
    expect(previous.open).toBe(false);
    expect(previous.label).toBe('Last week');
  });

  it('anchors biweekly to a fixed fortnight, not to today', () => {
    // Every day inside one fortnight has to resolve to the SAME period, or the
    // totals move depending on when the page was opened.
    const monday = resolvePayPeriod('biweekly', 0, { now: new Date(2026, 6, 27, 8) });
    const friday = resolvePayPeriod('biweekly', 0, { now: new Date(2026, 6, 31, 17) });
    expect(friday.startIso).toBe(monday.startIso);
    expect(friday.endIso).toBe(monday.endIso);
    expect(new Date(monday.endIso).getTime() - new Date(monday.startIso).getTime()).toBe(14 * 24 * 3600 * 1000);
  });

  it('covers a month end to end', () => {
    const period = resolvePayPeriod('monthly', 0, { now: NOW });
    expect(new Date(period.startIso).getDate()).toBe(1);
    expect(new Date(period.startIso).getMonth()).toBe(6);
    expect(new Date(period.endIso).getMonth()).toBe(7);
  });

  it('includes the last day of a custom range', () => {
    // "to 31 July" has to include everything logged ON the 31st — an exclusive
    // end set to the 31st would silently drop that day's hours.
    const period = resolvePayPeriod('custom', 0, { from: '2026-07-01', to: '2026-07-31', now: NOW });
    expect(new Date(period.endIso).getDate()).toBe(1);
    expect(new Date(period.endIso).getMonth()).toBe(7);
  });

  it('survives a hand-edited URL', () => {
    expect(normalizePeriodMode('fortnightly')).toBe('weekly');
    expect(normalizePeriodMode('biweekly')).toBe('biweekly');
    expect(normalizeOffset('abc')).toBe(0);
    expect(normalizeOffset('-3')).toBe(-3);
    expect(normalizeOffset('99999')).toBe(0);
    expect(normalizeOffset('5')).toBe(0);
  });
});


describe('overtime', () => {
  it('measures each week on its own', () => {
    // 45 + 35 across two weeks is five hours of overtime. A period total of 80
    // would report none at all.
    const weeks = new Map([['2026-07-19', 45], ['2026-07-26', 35]]);
    expect(splitOvertime(weeks, 40)).toEqual({ regular: 75, overtime: 5 });
  });

  it('reports nothing under the threshold', () => {
    expect(splitOvertime(new Map([['2026-07-26', 38]]), 40)).toEqual({ regular: 38, overtime: 0 });
  });
});

describe('entry health', () => {
  it('ranks no-hours above no-rate above no-crew', () => {
    expect(entryIssue({ hours: 0, rate: 30, crew_id: 'c' })).toBe('incomplete-time');
    expect(entryIssue({ hours: 8, rate: 0, crew_id: 'c' })).toBe('missing-rate');
    expect(entryIssue({ hours: 8, rate: 30, crew_id: null })).toBe('unassigned');
    expect(entryIssue({ hours: 8, rate: 30, crew_id: 'c' })).toBeNull();
  });
});

describe('crew rollup', () => {
  it('sums hours and pay per person and counts distinct jobs', () => {
    const { rows, totalHours, totalPay } = summarizeCrewLabor([
      entry({ id: 'a' }),
      entry({ id: 'b', job_id: 'job-2', hours: 4, amount: 120 }),
      entry({ id: 'c', crew_id: 'crew-2', crew_name: 'Dana Fox', hours: 6, rate: 25, amount: 150 }),
    ]);
    expect(rows).toHaveLength(2);
    const mike = rows.find((row) => row.crewId === 'crew-1')!;
    expect(mike.hours).toBe(12);
    expect(mike.estimatedPay).toBe(360);
    expect(mike.jobIds).toHaveLength(2);
    expect(mike.rate).toBe(30);
    expect(totalHours).toBe(18);
    expect(totalPay).toBe(510);
  });

  it('says the rate varies rather than picking one', () => {
    const { rows } = summarizeCrewLabor([entry({ id: 'a' }), entry({ id: 'b', rate: 45, amount: 360 })]);
    expect(rows[0].rateVaries).toBe(true);
    expect(rows[0].rate).toBeNull();
  });

  it('folds unassigned labor into its own row', () => {
    const { rows } = summarizeCrewLabor([entry({ id: 'a', crew_id: null, crew_name: null })]);
    expect(rows[0].name).toBe('Unassigned labor');
    expect(rows[0].issues).toContain('unassigned');
  });

  it('recomputes pay when hours are rounded, so the row adds up', () => {
    // 8.1 hours at $30 stored as $243. Rounded to the quarter it's 8.0 hours,
    // and showing 8.0 next to $243 would be arithmetic nobody can follow.
    const { rows } = summarizeCrewLabor([entry({ hours: 8.1, rate: 30, amount: 243 })], {
      roundHours: (h) => roundHours(h, 'quarter'),
    });
    expect(rows[0].hours).toBe(8);
    expect(rows[0].estimatedPay).toBe(240);
  });

  it('leaves the stored amount alone with no rounding rule', () => {
    const { rows } = summarizeCrewLabor([entry({ hours: 8.1, rate: 30, amount: 243 })]);
    expect(rows[0].estimatedPay).toBe(243);
  });

  it('counts entries needing review', () => {
    const { needsReview } = summarizeCrewLabor([entry({ id: 'a' }), entry({ id: 'b', rate: 0, amount: 0 })]);
    expect(needsReview).toBe(1);
  });
});

describe('labor by job', () => {
  const jobs = [
    { id: 'job-1', ref: 'J-1001', client_name: 'Ana Diaz', status: 'in_progress', estimated_hours: 10, quoted_amount: 2000 },
    { id: 'job-2', ref: 'J-1002', client_name: 'Ben Cole', status: 'complete', estimated_hours: 20, quoted_amount: 4000 },
    { id: 'job-3', ref: 'J-1003', client_name: 'Cara Lin', status: 'in_progress', estimated_hours: null, quoted_amount: 0 },
  ];

  it('flags a job past the hours it was quoted for', () => {
    const rows = summarizeJobLabor([entry({ id: 'a', job_id: 'job-1', hours: 14, amount: 420 })], jobs);
    expect(rows[0].overBudget).toBe(true);
    expect(rows[0].varianceHours).toBe(4);
    expect(rows[0].laborShare).toBe(21);
  });

  it('leaves an unquoted job out of the comparison instead of guessing', () => {
    const rows = summarizeJobLabor([entry({ id: 'a', job_id: 'job-3', hours: 9, amount: 270 })], jobs);
    expect(rows[0].quotedHours).toBeNull();
    expect(rows[0].varianceHours).toBeNull();
    expect(rows[0].overBudget).toBe(false);
    expect(rows[0].laborShare).toBeNull();
  });

  it('skips jobs with no labor logged against them', () => {
    const rows = summarizeJobLabor([entry({ id: 'a', job_id: 'job-1' })], jobs);
    expect(rows.map((row) => row.jobId)).toEqual(['job-1']);
  });

  it('puts the worst overrun first', () => {
    const rows = summarizeJobLabor(
      [
        entry({ id: 'a', job_id: 'job-1', hours: 11, amount: 330 }),
        entry({ id: 'b', job_id: 'job-2', hours: 30, amount: 900, crew_id: 'crew-2', crew_name: 'Dana Fox' }),
      ],
      jobs,
    );
    expect(rows[0].jobId).toBe('job-2'); // 10 hours over beats 1 hour over
  });
});

// Period state now lives in crew-pay.ts, where it also has to account for what
// has been approved and paid — see test/crew-pay.test.ts.
describe('export gating', () => {
  it('explains why export is off instead of only dimming it', () => {
    const { rows } = summarizeCrewLabor([entry({ rate: 0, amount: 0 })]);
    const reason = exportBlockedReason(rows);
    expect(reason).toMatch(/Mike Torres/);
    expect(reason).toMatch(/zero rate/);
    expect(exportBlockedReason([])).toMatch(/no hours/i);
  });

  it('allows export when everything is complete', () => {
    const { rows } = summarizeCrewLabor([entry()]);
    expect(exportBlockedReason(rows)).toBeNull();
  });
});

describe('labor settings', () => {
  it('falls back to defaults on a broken cookie', () => {
    expect(normalizeLaborSettings('not json')).toEqual(DEFAULT_LABOR_SETTINGS);
    expect(normalizeLaborSettings(undefined)).toEqual(DEFAULT_LABOR_SETTINGS);
  });

  it('refuses an overtime threshold that would mark every hour as overtime', () => {
    expect(normalizeLaborSettings(JSON.stringify({ overtimeThreshold: 0 })).overtimeThreshold).toBe(40);
    expect(normalizeLaborSettings(JSON.stringify({ overtimeThreshold: 500 })).overtimeThreshold).toBe(40);
    expect(normalizeLaborSettings(JSON.stringify({ overtimeThreshold: 44 })).overtimeThreshold).toBe(44);
  });

  it('never opens the tab on a custom range with no dates', () => {
    expect(normalizeLaborSettings(JSON.stringify({ periodMode: 'custom' })).periodMode).toBe('weekly');
    expect(normalizeLaborSettings(JSON.stringify({ periodMode: 'biweekly' })).periodMode).toBe('biweekly');
  });

  it('rounds to the configured increment', () => {
    expect(roundHours(8.1, 'quarter')).toBe(8);
    expect(roundHours(8.2, 'quarter')).toBe(8.25);
    expect(roundHours(8.13, 'tenth')).toBeCloseTo(8.1, 5);
    expect(roundHours(8.13, 'none')).toBe(8.13);
  });
});

describe('buildPeriodHref', () => {
  it('canonicalizes tab=hours to tab=timecards', () => {
    const period = resolvePayPeriod('weekly', 0, { now: NOW });
    const href = buildPeriodHref({ tab: 'hours', period });
    expect(href).toContain('tab=timecards');
  });

  it('refuses to step offset on custom range', () => {
    const period = resolvePayPeriod('custom', 0, { from: '2026-07-01', to: '2026-07-15', now: NOW });
    const href = buildPeriodHref({ period, patch: { offset: -1 } });
    expect(href).not.toContain('offset=');
    expect(href).toContain('from=2026-07-01');
    expect(href).toContain('to=2026-07-15');
    expect(href).toContain('period=custom');
  });

  it('caps future offsets at 0', () => {
    const period = resolvePayPeriod('weekly', 0, { now: NOW });
    const href = buildPeriodHref({ period, patch: { offset: 10 } });
    expect(href).not.toContain('offset=10');
  });
});

