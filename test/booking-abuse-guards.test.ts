import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkRateLimit, checkRateLimitStrict, clientIpFrom } from '@/lib/rate-limit';

/**
 * WHAT AN ANONYMOUS REQUEST TO /book IS ALLOWED TO COST.
 *
 * The booking page is public on purpose — a contractor pastes that link into a
 * text message — so "who can reach it" is settled and not what these guard.
 * What they guard is the bill. Two things on that route spend real money on
 * behalf of somebody who has proved nothing: the Google geocode/drive-time
 * lookups behind an eligible estimate, and a confirmation email sent to an
 * address typed into the form.
 *
 * Both used to be reachable without a limiter of any kind.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * Comments are stripped first, and that is load-bearing rather than tidy: the
 * WHY comments on both files quote the very calls being asserted ("the per-IP
 * limit on submitBookingAction", "geocodeAddress and driveDistances are paid"),
 * so a bare toContain would pass against the explanation of the fix.
 */
const ACTIONS = stripJs(read('src', 'app', 'book', '[subdomain]', 'actions.ts'));
const BOOKING = stripJs(read('src', 'lib', 'booking.ts'));

/** A named function's body, sliced to wherever the next declaration starts. */
function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start, `${name} is not declared`).toBeGreaterThan(-1);
  const rest = source.slice(start + 1);
  const next = [...rest.matchAll(/\n(?:export )?(?:async )?function /g)].map((m) => m.index ?? -1).find((i) => i >= 0);
  return next === undefined ? rest : rest.slice(0, next);
}

/** Which named function an offset falls inside. Top-level declarations only. */
function enclosingFunction(source: string, index: number): string {
  let name = '';
  for (const decl of source.matchAll(/(?:export )?(?:async )?function (\w+)\(/g)) {
    if ((decl.index ?? 0) > index) break;
    name = decl[1];
  }
  expect(name, `nothing encloses offset ${index}`).not.toBe('');
  return name;
}

/* ===========================================================================
   1. The limiter primitive both fixes stand on
   ---------------------------------------------------------------------------
   Everything below is wiring. If these two disagree about which way they fail,
   the wiring protects nothing — so they are checked behaviourally, against a
   stub client, rather than by reading the source.
   ======================================================================== */
describe('the two limiters fail in opposite directions, deliberately', () => {
  const client = (rpc: () => Promise<{ data: unknown; error: unknown }>) =>
    ({ rpc } as unknown as SupabaseClient);

  const ok = () => Promise.resolve({ data: true, error: null });
  const over = () => Promise.resolve({ data: false, error: null });
  const broken = () => Promise.resolve({ data: null, error: { message: 'connection reset' } });
  const thrown = () => Promise.reject(new Error('network'));

  it('both allow while under the limit, and block on the limit itself', async () => {
    expect(await checkRateLimit(client(ok), 'b', 1, 60)).toBe(true);
    expect(await checkRateLimitStrict(client(ok), 'b', 1, 60)).toBe(true);
    expect(await checkRateLimit(client(over), 'b', 1, 60)).toBe(false);
    expect(await checkRateLimitStrict(client(over), 'b', 1, 60)).toBe(false);
  });

  /**
   * The ordinary one fails OPEN, which is the right default for a lead form —
   * a limiter outage must not start rejecting real customers on the one page
   * the business earns from. It is also why it can never be the only thing
   * standing in front of something that costs money.
   */
  it('the ordinary limiter lets traffic through when it cannot tell', async () => {
    expect(await checkRateLimit(client(broken), 'b', 1, 60)).toBe(true);
    expect(await checkRateLimit(client(thrown), 'b', 1, 60)).toBe(true);
  });

  it('the strict one blocks when it cannot tell', async () => {
    expect(await checkRateLimitStrict(client(broken), 'b', 1, 60)).toBe(false);
    expect(await checkRateLimitStrict(client(thrown), 'b', 1, 60)).toBe(false);
  });

  it('passes the bucket, limit and window through unchanged', async () => {
    const seen: unknown[] = [];
    const spy = client((...args: unknown[]) => {
      seen.push(args);
      return ok();
    });
    await checkRateLimit(spy, 'bookgeo:ip:1.2.3.4', 12, 60);
    expect(seen[0]).toEqual(['check_rate_limit', { p_bucket: 'bookgeo:ip:1.2.3.4', p_limit: 12, p_window_seconds: 60 }]);
  });
});

describe('the identity every one of these limits is keyed on', () => {
  const headers = (map: Record<string, string>) => ({ get: (name: string) => map[name] ?? null });

  it('takes the first hop, which is the client rather than our own proxy', () => {
    expect(clientIpFrom(headers({ 'x-forwarded-for': '203.0.113.9, 70.0.0.1, 10.0.0.1' }))).toBe('203.0.113.9');
  });

  it('trims, so " 203.0.113.9" and "203.0.113.9" are one bucket and not two', () => {
    expect(clientIpFrom(headers({ 'x-forwarded-for': ' 203.0.113.9 , 70.0.0.1' }))).toBe('203.0.113.9');
  });

  it('falls back to x-real-ip, then to one shared bucket', () => {
    expect(clientIpFrom(headers({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
    // Not "no limit" — everyone missing a header shares a single allowance,
    // which still caps total volume.
    expect(clientIpFrom(headers({}))).toBe('unknown');
  });
});

/* ===========================================================================
   2. Nothing public reaches the database unmetered
   ======================================================================== */
describe('every public entry point on the booking route is limited first', () => {
  const PUBLIC_ACTIONS = [
    'evaluateBookingAction',
    'submitBookingAction',
    'submitQuickStopRequestAction',
    'submitCallbackAction',
  ];

  it('finds all four, so this list cannot silently go stale', () => {
    const exported = [...ACTIONS.matchAll(/export async function (\w+Action)\(/g)].map((m) => m[1]);
    expect(exported.sort()).toEqual([...PUBLIC_ACTIONS].sort());
  });

  for (const name of PUBLIC_ACTIONS) {
    it(`${name} checks a limit before it looks the site up`, () => {
      const body = bodyOf(ACTIONS, name);
      const limit = body.search(/checkRateLimit(Strict)?\(/);
      const lookup = body.indexOf('getPublicSiteBySubdomain(');
      expect(limit, 'no limiter at all').toBeGreaterThan(-1);
      expect(lookup).toBeGreaterThan(-1);
      expect(limit, 'the limit is spent after the work has already started').toBeLessThan(lookup);
    });
  }

  it('and each one gets its own bucket, so a flood of one cannot lock the others', () => {
    const buckets = [...ACTIONS.matchAll(/`(\w[\w]*):ip:\$\{(?:opts\.)?ip\}`/g)].map((m) => m[1]);
    expect(new Set(buckets).size).toBe(buckets.length);
  });
});

/* ===========================================================================
   3. The billed calls
   ======================================================================== */
describe('the paid Google lookups sit behind a strict budget', () => {
  const rank = bodyOf(ACTIONS, 'rankNearby');

  /**
   * Written against every billed call in the file rather than against the one
   * this fix was about, because "is rankNearby metered" is a question that
   * stops being the right one the moment somebody adds a sixth paid call
   * somewhere else. Quick Stop geocodes too, and was found by this test.
   */
  it('every paid call in this file is inside a function that limits first', () => {
    const paid = [...ACTIONS.matchAll(/(geocodeAddress|driveDistances)\(/g)];
    expect(paid.length, 'the paid calls have moved or been renamed').toBeGreaterThanOrEqual(3);
    for (const call of paid) {
      const fn = enclosingFunction(ACTIONS, call.index ?? 0);
      const body = bodyOf(ACTIONS, fn);
      const limit = body.search(/checkRateLimit(Strict)?\(/);
      expect(limit, `${call[1]} runs unmetered inside ${fn}`).toBeGreaterThan(-1);
      expect(limit, `${call[1]} spends before ${fn} checks`).toBeLessThan(body.indexOf(`${call[1]}(`));
    }
  });

  it('and the proximity ranking is where the drive-time bill lives', () => {
    expect(rank).toContain('geocodeAddress(');
    expect(rank).toContain('driveDistances(');
    expect(ACTIONS.match(/driveDistances\(/g) ?? []).toHaveLength(1);
  });

  it('checks the budget before either call, not after', () => {
    const budget = rank.indexOf('checkRateLimitStrict(admin, `bookgeo:ip:${opts.ip}`');
    expect(budget, 'the geocode budget is gone').toBeGreaterThan(-1);
    expect(budget).toBeLessThan(rank.indexOf('geocodeAddress('));
    expect(budget).toBeLessThan(rank.indexOf('driveDistances('));
  });

  /**
   * The reason the strict (fail-closed) limiter is affordable on a revenue
   * path at all: running out costs a badge, not a booking. If this ever became
   * a `return []` or a throw, a Supabase blip would take the booking page down
   * — and it would do it quietly, because the limiter fails closed.
   */
  it('running out degrades to plain availability instead of failing the visitor', () => {
    // To the first paid call: everything between the budget and it IS the
    // over-budget branch. Slicing to the next '}' finds the one closing
    // ${opts.ip} and tests nothing.
    const branch = rank.slice(rank.indexOf('bookgeo:ip:'), rank.indexOf('geocodeAddress('));
    expect(branch).toContain('days.map((day) => ({ ...day, nearby: false }))');
    expect(branch).not.toContain('return []');
    expect(branch).not.toContain('throw');
    // Which is exactly what an address that will not geocode already does.
    expect(rank).toContain('if (!leadCoord) return days.map((day) => ({ ...day, nearby: false }));');
  });

  it('is spent per request rather than once per visitor session', () => {
    // The budget is keyed on the caller, not on the site — one busy contractor
    // must not be able to exhaust another contractor's lookups.
    expect(rank).toContain('bookgeo:ip:${opts.ip}');
    expect(rank).not.toContain('bookgeo:account');
  });
});

/* ===========================================================================
   4. Mail to an address nobody verified
   ======================================================================== */
describe('the customer confirmation is capped per recipient', () => {
  const created = bodyOf(BOOKING, 'createBooking');

  it('will not send without asking the strict limiter first', () => {
    const cap = created.indexOf('checkRateLimitStrict(admin, `bookconfirm:email:${input.email}`');
    expect(cap, 'the per-recipient cap is gone').toBeGreaterThan(-1);
    expect(cap).toBeLessThan(created.indexOf('sendBookingConfirmationEmail({'));
  });

  it('keys the cap on the recipient, not on the sender or the account', () => {
    // Per-IP is already applied upstream and is fail-open; the whole point of
    // this one is that it survives a limiter outage and follows the victim
    // rather than the attacker.
    const [, bucket] = /`(bookconfirm:[^`]*)`/.exec(created) ?? [];
    expect(bucket).toBe('bookconfirm:email:${input.email}');
  });

  /**
   * Victim@x.com and victim@x.com are one inbox and must be one allowance.
   * The normalisation happens up in readContact, which is why it is asserted
   * from here — this cap is the thing that depends on it.
   */
  it('and the address it keys on is already normalised', () => {
    expect(ACTIONS).toContain("email: (formData.get('email') ?? '').toString().trim().toLowerCase() || null");
  });

  /**
   * The owner is not the attacker's target and must never be rate limited out
   * of hearing about a real booking — a suppressed lead notification is a lost
   * job. So the cap comes strictly after it.
   */
  it('never suppresses the owner notification, only the stranger-addressed one', () => {
    expect(created.indexOf('sendLeadNotificationEmail(')).toBeLessThan(created.indexOf('checkRateLimitStrict('));
    expect(created.match(/checkRateLimitStrict\(/g) ?? []).toHaveLength(1);
  });

  it('and a suppressed confirmation still leaves the booking written', () => {
    // The cap sits inside the best-effort block, after the lead and the job.
    expect(created.indexOf('const lead = await createLead(')).toBeLessThan(created.indexOf('checkRateLimitStrict('));
    expect(created.indexOf('checkRateLimitStrict(')).toBeLessThan(created.lastIndexOf('return lead;'));
  });
});
