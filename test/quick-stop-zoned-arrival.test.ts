/**
 * ARRIVAL WINDOWS ARE WALL CLOCK IN THE CONTRACTOR'S ZONE.
 *
 * `extra_stop_requests.arrival_date` is a bare `date` and `arrival_end` a bare
 * `time`. Three places compared them against "now" by writing
 * `new Date(`${arrival_date}T${arrival_end}`)`, which resolves in the SERVER's
 * zone — UTC in production. For a 3 PM window that put the end of the window at
 * 15:00Z instead of 19:00Z (New York) or 22:00Z (Los Angeles), so everything keyed
 * off it fired 4–7 hours early:
 *
 *   - the customer's no-show report window closed before the visit window ended,
 *     which is the homeowner's only remedy and the first thing to shut;
 *   - the sweep auto-completed the visit, from `confirmed`, before the tech was
 *     due;
 *   - the contractorMissedWindow tier paid a 100% refund while the contractor
 *     still had hours of window left.
 *
 * lib/arrival already had zonedInstant for exactly this, with a docstring naming
 * the bug ("how an 8 AM appointment becomes a 3 AM text message on a UTC host").
 * These tests hold the three sites to it, and the last one stops the pattern
 * coming back anywhere in the feature.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { computeCustomerRefundPercent } from '@/lib/quick-stop-refunds';
import { sweepQuickStopOffers } from '@/lib/quick-stop-sweep';
import { zonedInstant } from '@/lib/arrival';
import type { QuickStopRequest } from '@/lib/quick-stop-requests';
import { makeFakeAdmin } from './helpers/fake-supabase';

vi.mock('@/lib/quick-stop-requests', () => ({ logQuickStopEvent: vi.fn() }));
vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: vi.fn().mockResolvedValue(null),
  sendContractorAlertEmail: vi.fn(),
}));

const DAY = '2026-07-29';
const END = '15:00'; // 3 PM, in the contractor's own zone

function req(partial: Partial<QuickStopRequest>): QuickStopRequest {
  return {
    paid_at: new Date('2026-07-29T12:00:00Z').toISOString(),
    en_route_at: null,
    arrived_at: null,
    arrival_date: DAY,
    arrival_end: END,
    ...partial,
  } as QuickStopRequest;
}

describe('the missed-window refund tier respects the contractor’s zone', () => {
  // 18:00Z is 14:00 in New York and 11:00 in Los Angeles: mid-window in both, and
  // the exact moment the old code called the window over, because 18:00 > 15:00
  // once the wall-clock end was misread as UTC.
  const MID_WINDOW = new Date('2026-07-29T18:00:00Z').getTime();

  it.each([
    ['America/New_York', 4],
    ['America/Chicago', 5],
    ['America/Denver', 6],
    ['America/Los_Angeles', 7],
  ])('does not pay contractorMissedWindow mid-window in %s (was %ih early)', (tz) => {
    // Still inside the window, so this is an ordinary customer cancellation.
    expect(computeCustomerRefundPercent(req({}), tz, MID_WINDOW)).toBe(75);
    expect(computeCustomerRefundPercent(req({ en_route_at: new Date(MID_WINDOW).toISOString() }), tz, MID_WINDOW)).toBe(25);
  });

  it('still pays contractorMissedWindow once the zoned window really has passed', () => {
    const tz = 'America/New_York';
    const justAfter = zonedInstant(DAY, END, tz)!.getTime() + 60_000;
    expect(computeCustomerRefundPercent(req({}), tz, justAfter)).toBe(100);
  });

  it('an arrival beats the window — a tech who showed up is never at fault', () => {
    const tz = 'America/New_York';
    const justAfter = zonedInstant(DAY, END, tz)!.getTime() + 60_000;
    expect(computeCustomerRefundPercent(req({ arrived_at: new Date(justAfter).toISOString() }), tz, justAfter)).toBe(0);
  });
});

describe('auto-complete waits for the zoned window, not the server’s', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const requestRow = {
    id: 'req1',
    account_id: 'acct-la',
    job_id: 'job1',
    status: 'confirmed',
    arrival_date: DAY,
    arrival_end: END,
    no_show_reported_at: null,
    payment_id: 'pay1',
    updated_at: '2026-07-29T10:00:00.000Z',
  };
  // 3 PM Los Angeles is 22:00Z; +2h grace means nothing may complete before 00:00Z.
  const accounts = [{ id: 'acct-la', timezone: 'America/Los_Angeles' }];

  it('leaves the visit alone while the window is still open in its own zone', async () => {
    // 18:00Z = 11:00 Pacific. The old code read the window as ending at 15:00Z and
    // auto-completed here, three hours before the tech was even due.
    vi.setSystemTime(new Date('2026-07-29T18:00:00Z'));
    const admin = makeFakeAdmin({ extra_stop_requests: [requestRow], accounts, jobs: [{ id: 'job1', account_id: 'acct-la', status: 'in_progress' }] });
    const summary = await sweepQuickStopOffers(admin as never);
    expect(summary.autoCompleted).toBe(0);
    expect(admin.tables.extra_stop_requests[0].status).toBe('confirmed');
    expect(admin.tables.jobs[0].status).toBe('in_progress');
  });

  it('does not complete during the 2-hour no-show grace either', async () => {
    vi.setSystemTime(new Date('2026-07-29T23:00:00Z')); // window closed, grace running
    const admin = makeFakeAdmin({ extra_stop_requests: [requestRow], accounts, jobs: [] });
    expect((await sweepQuickStopOffers(admin as never)).autoCompleted).toBe(0);
  });

  it('completes once the zoned window plus grace has really elapsed', async () => {
    vi.setSystemTime(new Date('2026-07-30T00:30:00Z'));
    const admin = makeFakeAdmin({ extra_stop_requests: [requestRow], accounts, jobs: [{ id: 'job1', account_id: 'acct-la', status: 'in_progress' }] });
    const summary = await sweepQuickStopOffers(admin as never);
    expect(summary.autoCompleted).toBe(1);
    expect(admin.tables.extra_stop_requests[0].status).toBe('completed');
    expect(admin.tables.jobs[0].status).toBe('complete');
  });

  it('never steals a visit whose no-show is already being reported', async () => {
    vi.setSystemTime(new Date('2026-07-30T00:30:00Z'));
    const admin = makeFakeAdmin({
      extra_stop_requests: [{ ...requestRow, no_show_reported_at: '2026-07-30T00:00:00.000Z' }],
      accounts,
      jobs: [],
    });
    expect((await sweepQuickStopOffers(admin as never)).autoCompleted).toBe(0);
  });
});

describe('the pattern itself is gone from the feature', () => {
  /**
   * A drift guard, not a style rule. Every one of the three bugs above was the
   * same four-token expression, and each was written by somebody who had no reason
   * to think about zones at that moment. Naming the shape is the only thing that
   * stops a fourth.
   */
  const SOURCES = ['src/lib', 'src/app/quick-stop/[id]', 'src/app/dashboard/quick-stops', 'src/app/api/cron/quick-stop-sweep'];

  const quickStopFiles = (): string[] => {
    const out: string[] = [];
    for (const rel of SOURCES) {
      const abs = join(process.cwd(), rel);
      if (!statSync(abs).isDirectory()) {
        out.push(abs);
        continue;
      }
      for (const name of readdirSync(abs)) {
        if (!/\.(ts|tsx)$/.test(name)) continue;
        if (rel === 'src/lib' && !/^quick-stop/.test(name)) continue;
        out.push(join(abs, name));
      }
    }
    return out;
  };

  it('never resolves a bare date + bare time with new Date(...)', () => {
    // `new Date(`${anything}T${anything}`)` — the template form that silently
    // means "in the server's zone". Comments are stripped first: the fixed sites
    // quote the old expression to explain what went wrong.
    const pattern = /new Date\(\s*`\$\{[^`]*\}T\$\{[^`]*\}`/;
    const offenders: string[] = [];
    for (const file of quickStopFiles()) {
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      if (pattern.test(source)) offenders.push(file.replace(process.cwd(), '').replace(/\\/g, '/'));
    }
    expect(offenders).toEqual([]);
  });
});
