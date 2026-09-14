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
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
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
    expect(computeCustomerRefundPercent(req({}), MID_WINDOW, undefined, tz)).toBe(75);
    expect(computeCustomerRefundPercent(req({ en_route_at: new Date(MID_WINDOW).toISOString() }), MID_WINDOW, undefined, tz)).toBe(25);
  });

  it('still pays contractorMissedWindow once the zoned window really has passed', () => {
    const tz = 'America/New_York';
    const justAfter = zonedInstant(DAY, END, tz)!.getTime() + 60_000;
    expect(computeCustomerRefundPercent(req({}), justAfter, undefined, tz)).toBe(100);
  });

  it('an arrival beats the window — a tech who showed up is never at fault', () => {
    const tz = 'America/New_York';
    const justAfter = zonedInstant(DAY, END, tz)!.getTime() + 60_000;
    expect(computeCustomerRefundPercent(req({ arrived_at: new Date(justAfter).toISOString() }), justAfter, undefined, tz)).toBe(0);
  });
});

// Completion now runs inside PostgreSQL. Exercise the actual migration instead
// of a query-builder fake that cannot execute or validate its predicates.
describe('auto-complete waits for the account-local window in SQL', () => {
  let db: PGlite;
  const account = '10000000-0000-4000-8000-000000000001';
  const request = '20000000-0000-4000-8000-000000000001';
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table accounts(id uuid primary key, timezone text);
      create table jobs(id uuid primary key, account_id uuid, status text);
      create table payments(id uuid primary key, account_id uuid, status text, paid_at timestamptz, failed_at timestamptz);
      create table extra_stop_requests(id uuid primary key, account_id uuid, client_name text,
        status text, payment_id uuid, job_id uuid, paid_at timestamptz,
        arrival_date date, arrival_start time, arrival_end time,
        response_deadline_at timestamptz, payment_deadline_at timestamptz,
        hold_expires_at timestamptz, no_show_reported_at timestamptz,
        completed_at timestamptz, arrived_at timestamptz, updated_at timestamptz);
      create table extra_stop_events(account_id uuid, request_id uuid, actor text, from_status text, to_status text, meta jsonb);
    `);
    await db.exec(readFileSync(join(process.cwd(), 'migrations/20260914132825_quick_stop_atomic_sweep.sql'), 'utf8'));
    await db.query('insert into accounts values($1,$2)', [account, 'America/Los_Angeles']);
  }, 30_000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec('truncate extra_stop_requests, jobs, payments, extra_stop_events');
  });
  async function seed(hoursAfterEnd: number, reported = false) {
    await db.query("insert into jobs values($1,$2,'in_progress')", [request, account]);
    await db.query("insert into payments values($1,$2,'paid',now()-interval '3 days',null)", [request, account]);
    // Set the fixture relative to the database clock; JavaScript fake timers do
    // not control PostgreSQL. The arrival fields are still account-local values.
    await db.query(`insert into extra_stop_requests(id,account_id,client_name,status,payment_id,job_id,paid_at,
        arrival_date,arrival_start,arrival_end,no_show_reported_at)
      select $1,$2,'Customer','confirmed',$1,$1,now()-interval '3 days',
        wall::date,'00:00',wall::time,case when $4 then now() end
      from (select (now()-make_interval(hours=>$3)) at time zone 'America/Los_Angeles' as wall) w`,
      [request, account, hoursAfterEnd, reported]);
  }
  const sweep = () => db.query('select * from sweep_quick_stop_requests($1,25)', [account]);
  async function expectStatus(status: string, jobStatus: string) {
    expect((await db.query('select status from extra_stop_requests')).rows).toEqual([{ status }]);
    expect((await db.query('select status from jobs')).rows).toEqual([{ status: jobStatus }]);
  }
  it('leaves a paid visit alone before its account-local window ends', async () => {
    await seed(-1);
    expect((await sweep()).rows).toEqual([]);
    await expectStatus('confirmed', 'in_progress');
  });
  it('does not complete during the two-hour no-show grace period', async () => {
    await seed(1);
    expect((await sweep()).rows).toEqual([]);
    await expectStatus('confirmed', 'in_progress');
  });
  it('completes the visit and job once the window and grace have elapsed', async () => {
    await seed(3);
    expect((await sweep()).rows).toEqual([expect.objectContaining({ kind: 'auto_completed', request_id: request })]);
    await expectStatus('completed', 'complete');
    expect((await sweep()).rows).toEqual([]);
    expect((await db.query('select from_status,to_status from extra_stop_events')).rows).toEqual([{ from_status: 'confirmed', to_status: 'completed' }]);
  });
  it('does not complete a visit with a no-show report in progress', async () => {
    await seed(3, true);
    expect((await sweep()).rows).toEqual([]);
    await expectStatus('confirmed', 'in_progress');
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
