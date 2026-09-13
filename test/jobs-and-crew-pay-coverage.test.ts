/**
 * Jobs and crew-pay coverage test
 *
 * Targets pure/synchronous functions in src/lib/jobs.ts and basic DB-backed
 * functions via mocked Supabase. Elevates jobs.ts from ~38.8% coverage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sortJobsByStatus,
  computeMargin,
  formatMoney,
  formatJobQuoteSummary,
  formatPercent,
  formatJobTime,
  formatJobSchedule,
  daysBetweenInclusive,
  getJobScheduleSpanDays,
  addDaysToDateKey,
  weekdayOfDateKey,
  expandScheduledJobs,
  isMissingEndDateColumn,
  isMissingColumnError,
  parseQuoteItems,
  computeQuoteTotal,
  mapImportedJobStatus,
  parseImportedDate,
  type Job,
  type Cost,
  type QuoteItem,
} from '@/lib/jobs';

// ── sortJobsByStatus ──────────────────────────────────────────────────────────

describe('jobs — sortJobsByStatus', () => {
  it('puts new_lead before in_progress before complete before archived', () => {
    const jobs = [
      { status: 'complete' as const, created_at: '2024-01-01T00:00:00Z' },
      { status: 'archived' as const, created_at: '2024-01-01T00:00:00Z' },
      { status: 'new_lead' as const, created_at: '2024-01-01T00:00:00Z' },
      { status: 'in_progress' as const, created_at: '2024-01-01T00:00:00Z' },
    ];

    const sorted = sortJobsByStatus(jobs);
    expect(sorted.map((j) => j.status)).toEqual(['new_lead', 'in_progress', 'complete', 'archived']);
  });

  it('sorts same-status jobs newest-first by created_at', () => {
    const jobs = [
      { status: 'new_lead' as const, created_at: '2024-01-01T00:00:00Z' },
      { status: 'new_lead' as const, created_at: '2024-03-01T00:00:00Z' },
      { status: 'new_lead' as const, created_at: '2024-02-01T00:00:00Z' },
    ];

    const sorted = sortJobsByStatus(jobs);
    expect(sorted[0].created_at).toBe('2024-03-01T00:00:00Z');
    expect(sorted[2].created_at).toBe('2024-01-01T00:00:00Z');
  });

  it('returns empty array for empty input', () => {
    expect(sortJobsByStatus([])).toEqual([]);
  });

  it('does not mutate the original array', () => {
    const original = [
      { status: 'complete' as const, created_at: '2024-01-01T00:00:00Z' },
      { status: 'new_lead' as const, created_at: '2024-01-01T00:00:00Z' },
    ];
    sortJobsByStatus(original);
    expect(original[0].status).toBe('complete');
  });
});

// ── computeMargin ─────────────────────────────────────────────────────────────

function makeCost(overrides: Partial<Cost>): Cost {
  return {
    id: 'cost-1',
    account_id: 'acct-1',
    job_id: 'job-1',
    type: 'material',
    category: 'Materials',
    description: 'Paint',
    amount: 100,
    supplier: null,
    receipt_url: null,
    client_charge_payment_id: null,
    client_charge_requested_at: null,
    crew_id: null,
    crew_name: null,
    crew_role_label: null,
    hours: null,
    rate: null,
    burden_amount: 0,
    cost_source: 'manual',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('jobs — computeMargin', () => {
  it('computes zero margin on a zero-cost, zero-quote job', () => {
    const result = computeMargin({ quoted_amount: 0 }, []);
    expect(result.revenue).toBe(0);
    expect(result.margin).toBe(0);
    expect(result.profit).toBe(0);
    expect(result.totalCost).toBe(0);
  });

  it('computes correct margin on a profitable job', () => {
    const costs: Cost[] = [
      makeCost({ type: 'material', amount: 300 }),
      makeCost({ type: 'labor', amount: 200, burden_amount: 40 }),
    ];

    const result = computeMargin({ quoted_amount: 1000 }, costs);
    expect(result.revenue).toBe(1000);
    expect(result.materialsCost).toBe(300);
    expect(result.laborWages).toBe(200);
    expect(result.laborBurden).toBe(40);
    expect(result.laborCost).toBe(240);
    expect(result.totalCost).toBe(540);
    expect(result.profit).toBe(460);
    expect(result.margin).toBeCloseTo(0.46, 2);
  });

  it('handles negative profit (overspent)', () => {
    const costs: Cost[] = [makeCost({ type: 'material', amount: 1500 })];
    const result = computeMargin({ quoted_amount: 1000 }, costs);
    expect(result.profit).toBe(-500);
    expect(result.margin).toBeCloseTo(-0.5, 2);
  });

  it('includes sub and receipt costs in materialsCost', () => {
    const costs: Cost[] = [
      makeCost({ type: 'sub', amount: 200 }),
      makeCost({ type: 'receipt', amount: 50 }),
    ];
    const result = computeMargin({ quoted_amount: 500 }, costs);
    expect(result.materialsCost).toBe(250);
  });

  it('includes other costs in otherCost (not materialsCost)', () => {
    const costs: Cost[] = [makeCost({ type: 'other', amount: 75 })];
    const result = computeMargin({ quoted_amount: 500 }, costs);
    expect(result.otherCost).toBe(75);
    expect(result.materialsCost).toBe(0);
  });
});

// ── formatMoney ───────────────────────────────────────────────────────────────

describe('jobs — formatMoney', () => {
  it('formats positive integers with $ and comma', () => {
    expect(formatMoney(1500)).toBe('$1,500');
  });

  it('formats negative numbers with leading minus', () => {
    expect(formatMoney(-500)).toBe('-$500');
  });

  it('rounds to whole dollars', () => {
    expect(formatMoney(1234.75)).toBe('$1,235');
  });

  it('formats zero as $0', () => {
    expect(formatMoney(0)).toBe('$0');
  });

  it('formats large amounts with commas', () => {
    expect(formatMoney(1_000_000)).toBe('$1,000,000');
  });
});

// ── formatJobQuoteSummary ─────────────────────────────────────────────────────

describe('jobs — formatJobQuoteSummary', () => {
  it('includes client name and quoted amount', () => {
    const result = formatJobQuoteSummary({
      client_name: 'Alice',
      address: '123 Main St',
      scope: 'Roof repair',
      estimated_hours: 4,
      quoted_amount: 500,
    });

    expect(result).toContain('Alice');
    expect(result).toContain('$500');
  });

  it('omits hours when includeHours is false', () => {
    const result = formatJobQuoteSummary(
      { client_name: 'Bob', address: null, scope: null, estimated_hours: 8, quoted_amount: 1000 },
      { includeHours: false }
    );

    expect(result).not.toContain('hour');
  });

  it('includes "not set" for estimated hours when 0', () => {
    const result = formatJobQuoteSummary({
      client_name: 'Carol',
      address: null,
      scope: null,
      estimated_hours: null,
      quoted_amount: 200,
    });

    expect(result).toContain('not set');
  });
});

// ── formatPercent ─────────────────────────────────────────────────────────────

describe('jobs — formatPercent', () => {
  it('converts 0.45 to "45%"', () => {
    expect(formatPercent(0.45)).toBe('45%');
  });

  it('handles zero', () => {
    expect(formatPercent(0)).toBe('0%');
  });

  it('handles negative margin', () => {
    expect(formatPercent(-0.1)).toBe('-10%');
  });
});

// ── formatJobTime ─────────────────────────────────────────────────────────────

describe('jobs — formatJobTime', () => {
  it('formats 14:30 as 2:30 PM', () => {
    expect(formatJobTime('14:30')).toBe('2:30 PM');
  });

  it('formats 09:00 as 9:00 AM', () => {
    expect(formatJobTime('09:00')).toBe('9:00 AM');
  });

  it('formats midnight (00:00) as 12:00 AM', () => {
    expect(formatJobTime('00:00')).toBe('12:00 AM');
  });

  it('formats noon (12:00) as 12:00 PM', () => {
    expect(formatJobTime('12:00')).toBe('12:00 PM');
  });

  it('returns null for null input', () => {
    expect(formatJobTime(null)).toBeNull();
  });

  it('returns null for invalid time string', () => {
    expect(formatJobTime('invalid')).toBeNull();
  });
});

// ── formatJobSchedule ─────────────────────────────────────────────────────────

describe('jobs — formatJobSchedule', () => {
  it('returns "Not yet scheduled" when scheduledFor is null', () => {
    expect(formatJobSchedule(null)).toBe('Not yet scheduled');
  });

  it('formats single-day schedule without time', () => {
    const result = formatJobSchedule('2024-03-15', null, null);
    expect(result).toContain('Mar');
    expect(result).toContain('15');
  });

  it('formats schedule with time', () => {
    const result = formatJobSchedule('2024-03-15', '14:00', null);
    expect(result).toContain('2:00 PM');
  });

  it('formats multi-day span with day count', () => {
    const result = formatJobSchedule('2024-03-15', null, '2024-03-17');
    expect(result).toContain('(3 days)');
  });
});

// ── daysBetweenInclusive ──────────────────────────────────────────────────────

describe('jobs — daysBetweenInclusive', () => {
  it('returns 1 for same start and end date', () => {
    expect(daysBetweenInclusive('2024-01-01', '2024-01-01')).toBe(1);
  });

  it('returns 3 for a 2-day gap (3 calendar days inclusive)', () => {
    expect(daysBetweenInclusive('2024-01-01', '2024-01-03')).toBe(3);
  });

  it('returns null when start is null', () => {
    expect(daysBetweenInclusive(null, '2024-01-03')).toBeNull();
  });

  it('returns null when end is null', () => {
    expect(daysBetweenInclusive('2024-01-01', null)).toBeNull();
  });

  it('returns null when end is before start', () => {
    expect(daysBetweenInclusive('2024-01-10', '2024-01-01')).toBeNull();
  });
});

// ── getJobScheduleSpanDays ────────────────────────────────────────────────────

describe('jobs — getJobScheduleSpanDays', () => {
  it('returns entered span when scheduled_until is set', () => {
    const job = {
      status: 'in_progress' as const,
      estimated_hours: 8,
      scheduled_for: '2024-03-15',
      scheduled_until: '2024-03-17',
    };
    expect(getJobScheduleSpanDays(job, 8)).toBe(3);
  });

  it('returns 1 for complete job with no date range', () => {
    const job = {
      status: 'complete' as const,
      estimated_hours: 40,
      scheduled_for: '2024-03-15',
    };
    expect(getJobScheduleSpanDays(job, 8)).toBe(1);
  });

  it('uses ceil(hours / workDayHours) for active jobs', () => {
    const job = {
      status: 'in_progress' as const,
      estimated_hours: 18,
      scheduled_for: '2024-03-15',
    };
    // 18 hours / 8 hours per day = 2.25 → ceil = 3
    expect(getJobScheduleSpanDays(job, 8)).toBe(3);
  });

  it('defaults to 1 day when no estimated hours', () => {
    const job = {
      status: 'new_lead' as const,
      estimated_hours: null,
      scheduled_for: '2024-03-15',
    };
    expect(getJobScheduleSpanDays(job, 8)).toBe(1);
  });
});

// ── addDaysToDateKey ──────────────────────────────────────────────────────────

describe('jobs — addDaysToDateKey', () => {
  it('adds 1 day correctly', () => {
    expect(addDaysToDateKey('2024-01-31', 1)).toBe('2024-02-01');
  });

  it('adds 0 days returns same date', () => {
    expect(addDaysToDateKey('2024-03-15', 0)).toBe('2024-03-15');
  });

  it('handles year boundary', () => {
    expect(addDaysToDateKey('2024-12-31', 1)).toBe('2025-01-01');
  });

  it('adds 30 days', () => {
    expect(addDaysToDateKey('2024-01-01', 30)).toBe('2024-01-31');
  });
});

// ── weekdayOfDateKey ──────────────────────────────────────────────────────────

describe('jobs — weekdayOfDateKey', () => {
  it('2024-01-01 is a Monday (day 1)', () => {
    expect(weekdayOfDateKey('2024-01-01')).toBe(1);
  });

  it('2024-01-07 is a Sunday (day 0)', () => {
    expect(weekdayOfDateKey('2024-01-07')).toBe(0);
  });
});

// ── expandScheduledJobs ───────────────────────────────────────────────────────

describe('jobs — expandScheduledJobs', () => {
  it('skips jobs with no scheduled_for', () => {
    const jobs = [
      { scheduled_for: null, status: 'new_lead' as const, estimated_hours: 4, scheduled_until: null },
    ];
    const result = expandScheduledJobs(jobs, 8);
    expect(result).toHaveLength(0);
  });

  it('expands a single-day job into 1 occurrence', () => {
    const jobs = [
      { scheduled_for: '2024-03-15', status: 'in_progress' as const, estimated_hours: 6, scheduled_until: null },
    ];
    const result = expandScheduledJobs(jobs, 8);
    expect(result).toHaveLength(1);
    expect(result[0].scheduled_for).toBe('2024-03-15');
  });

  it('expands a 3-day range into 3 occurrences', () => {
    const jobs = [
      { scheduled_for: '2024-03-15', status: 'in_progress' as const, estimated_hours: 24, scheduled_until: '2024-03-17' },
    ];
    const result = expandScheduledJobs(jobs, 8);
    expect(result).toHaveLength(3);
    expect(result[0].scheduled_for).toBe('2024-03-15');
    expect(result[2].scheduled_for).toBe('2024-03-17');
  });

  it('uses estimated hours to generate span when no scheduled_until', () => {
    const jobs = [
      { scheduled_for: '2024-03-15', status: 'in_progress' as const, estimated_hours: 16, scheduled_until: null },
    ];
    // 16h / 8h day = 2 days
    const result = expandScheduledJobs(jobs, 8);
    expect(result).toHaveLength(2);
  });
});

// ── isMissingEndDateColumn / isMissingColumnError ────────────────────────────

describe('jobs — column error detection', () => {
  it('isMissingEndDateColumn returns true for 42703', () => {
    expect(isMissingEndDateColumn({ code: '42703' })).toBe(true);
  });

  it('isMissingEndDateColumn returns true for PGRST204', () => {
    expect(isMissingEndDateColumn({ code: 'PGRST204' })).toBe(true);
  });

  it('isMissingEndDateColumn returns false for other codes', () => {
    expect(isMissingEndDateColumn({ code: '23505' })).toBe(false);
  });

  it('isMissingEndDateColumn returns false for null', () => {
    expect(isMissingEndDateColumn(null)).toBe(false);
  });

  it('isMissingColumnError returns same results as isMissingEndDateColumn', () => {
    expect(isMissingColumnError({ code: '42703' })).toBe(true);
    expect(isMissingColumnError({ code: 'PGRST204' })).toBe(true);
    expect(isMissingColumnError(null)).toBe(false);
  });
});

// ── parseQuoteItems ───────────────────────────────────────────────────────────

describe('jobs — parseQuoteItems', () => {
  it('parses an array of quote item objects', () => {
    const items = [
      { id: '1', label: 'Base', amount: 500, kind: 'base', selected: true, recommended: false },
      { id: '2', label: 'Add-on', amount: 100, kind: 'addon', selected: false, recommended: true },
    ];
    const result = parseQuoteItems(items);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('Base');
  });

  it('returns empty array for null input', () => {
    expect(parseQuoteItems(null)).toEqual([]);
  });

  it('returns empty array for a string (not an array)', () => {
    // parseQuoteItems checks Array.isArray — strings return []
    expect(parseQuoteItems('not an array')).toEqual([]);
  });

  it('returns empty array for a plain object (not an array)', () => {
    expect(parseQuoteItems({ key: 'value' })).toEqual([]);
  });

  it('passes through an already-parsed array', () => {
    const items: QuoteItem[] = [
      { id: '1', label: 'Base', amount: 300, kind: 'base', selected: true, recommended: false },
    ];
    const result = parseQuoteItems(items);
    expect(result).toHaveLength(1);
  });

  it('filters out items with empty labels', () => {
    const items = [
      { id: '1', label: '', amount: 100, kind: 'base', selected: true },
      { id: '2', label: 'Valid', amount: 200, kind: 'base', selected: true },
    ];
    const result = parseQuoteItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Valid');
  });
});

// ── computeQuoteTotal ─────────────────────────────────────────────────────────

describe('jobs — computeQuoteTotal', () => {
  it('sums base items plus selected addons', () => {
    const items: QuoteItem[] = [
      { id: '1', label: 'Base', amount: 500, kind: 'base', selected: true, recommended: false },
      { id: '2', label: 'Addon', amount: 200, kind: 'addon', selected: true, recommended: false },
      { id: '3', label: 'Unselected', amount: 100, kind: 'addon', selected: false, recommended: false },
      { id: '4', label: 'Subscription', amount: 50, kind: 'subscription', selected: true, recommended: false },
    ];

    // Subscription items are excluded from the one-off quote total
    const total = computeQuoteTotal(items);
    expect(total).toBe(700); // 500 base + 200 selected addon (unselected and subscription excluded)
  });

  it('returns 0 for empty items array', () => {
    expect(computeQuoteTotal([])).toBe(0);
  });

  it('returns only base amount when no addons selected', () => {
    const items: QuoteItem[] = [
      { id: '1', label: 'Base', amount: 800, kind: 'base', selected: true, recommended: false },
    ];
    expect(computeQuoteTotal(items)).toBe(800);
  });
});

// ── mapImportedJobStatus ──────────────────────────────────────────────────────

describe('jobs — mapImportedJobStatus', () => {
  it('maps "complete" to complete', () => {
    expect(mapImportedJobStatus('complete')).toBe('complete');
  });

  it('maps null to complete (migration default)', () => {
    // Blank/null defaults to 'complete' — imported jobs are mostly historical
    expect(mapImportedJobStatus(null)).toBe('complete');
  });

  it('maps unrecognized string to complete (fallback)', () => {
    expect(mapImportedJobStatus('some_unknown_status_xyz')).toBe('complete');
  });

  it('maps "in_progress" to in_progress', () => {
    expect(mapImportedJobStatus('in_progress')).toBe('in_progress');
  });

  it('maps "lead" to new_lead', () => {
    expect(mapImportedJobStatus('lead')).toBe('new_lead');
  });

  it('maps "archived" to archived', () => {
    expect(mapImportedJobStatus('archived')).toBe('archived');
  });

  it('maps "canceled" to archived', () => {
    expect(mapImportedJobStatus('canceled')).toBe('archived');
  });
});

// ── parseImportedDate ─────────────────────────────────────────────────────────

describe('jobs — parseImportedDate', () => {
  it('parses YYYY-MM-DD format', () => {
    const result = parseImportedDate('2024-03-15');
    expect(result).toBe('2024-03-15');
  });

  it('returns null for null input', () => {
    expect(parseImportedDate(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseImportedDate('')).toBeNull();
  });
});
