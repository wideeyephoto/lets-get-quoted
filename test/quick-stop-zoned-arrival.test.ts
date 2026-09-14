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
 *
 * Two of the three sites have since moved into SQL, where the window is resolved
 * with quick_stop_window_instant against the account's own zone, so the guard for
 * those reads the migration rather than driving a fake client past a decision the
 * database now makes. The refund tier is still computed in TypeScript and is
 * still tested as such. The last block stops the pattern coming back anywhere in
 * the feature.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { computeCustomerRefundPercent } from '@/lib/quick-stop-refunds';
import { zonedInstant } from '@/lib/arrival';
import type { QuickStopRequest } from '@/lib/quick-stop-requests';

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
  /**
   * THIS MOVED INTO SQL, so the guard did too.
   *
   * The auto-complete used to run in TypeScript, which is where the bug lived and
   * where the first version of this block drove it through a fake client. It is
   * now one step of sweep_quick_stop_requests, chosen and committed under the
   * row lock; sweepQuickStopOffers is a coordinator that counts what came back
   * (test/lib-quick-stop-sweep.test.ts covers that part). Driving a fake `rpc`
   * from here would assert nothing about the code that actually decides.
   *
   * So this reads the migration. Crude, but it pins the two properties the bug
   * was about, at the layer that now holds them: the window is resolved in the
   * ACCOUNT'S zone, and the 2-hour no-show grace has to elapse on top of it.
   * quick_stop_window_instant itself is exercised against a real PostgreSQL in
   * the database-backed suite.
   */
  const sweepSql = readFileSync(join(process.cwd(), 'migrations/20260914132825_quick_stop_atomic_sweep.sql'), 'utf8');

  it('resolves the arrival window in the account’s zone, never the server’s', () => {
    // Both ends, and both from the account row rather than a server default.
    expect(sweepSql).toMatch(/quick_stop_window_instant\(\s*\w+\.arrival_date\s*,\s*\w+\.arrival_start\s*,[^)]*timezone/);
    expect(sweepSql).toMatch(/quick_stop_window_instant\(\s*\w+\.arrival_date\s*,\s*\w+\.arrival_end\s*,[^)]*timezone/);
    // An account with no zone falls back to the documented default, not to UTC.
    expect(sweepSql).toMatch(/coalesce\(nullif\(a\.timezone,''\),'America\/New_York'\)/);
  });

  it('will not complete a visit until the zoned window plus the no-show grace has elapsed', () => {
    // `end_at + 2 hours < now` in the candidate scan, and again under the lock.
    const guards = sweepSql.match(/end_at \+ interval '2 hours'|v_end \+ interval '2 hours'/g) ?? [];
    expect(guards.length, 'the grace is checked when selecting AND when committing').toBeGreaterThanOrEqual(2);
  });

  it('never steals a visit whose no-show is already being reported', () => {
    expect(sweepSql).toMatch(/no_show_reported_at is null/);
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
