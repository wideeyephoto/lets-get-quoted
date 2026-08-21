import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { NO_PURCHASED_SEATS, describeSeatLimit } from '@/lib/billing/seat-limits';

/**
 * A purchased seat worked and was invisible.
 *
 * `crew_user` went on sale on 2026-08-20 at $5 a month. The database honours it:
 * `create_crew_member_with_seat_entitlement` adds
 * `workspace_purchased_capacity_units` to the plan allowance before counting, so
 * the fourth crew member really can be added. The Account page did not know --
 * it read `feature_limits.crew_users`, which is the PLAN allowance and nothing
 * else -- so a contractor could pay, have it work, and still be told
 * "Crew users: 2" on the only screen that states what they are entitled to.
 */

describe('the seat line states the sum when there is a sum to state', () => {
  it('shows the plan number alone when nothing was bought', () => {
    // The common case, and it must not become arithmetic. "2 (2 included + 0
    // purchased)" on every row is completeness that makes a page harder to read.
    expect(describeSeatLimit(2, 0)).toBe('2');
    expect(describeSeatLimit(50, 0)).toBe('50');
  });

  it('breaks the total down once a seat has been bought', () => {
    // The number that matters is first, because that is the question being
    // asked -- how many can I have -- and the breakdown answers the next one.
    expect(describeSeatLimit(2, 1)).toBe('3 (2 included + 1 purchased)');
    expect(describeSeatLimit(10, 3)).toBe('13 (10 included + 3 purchased)');
  });

  it('keeps thousands separators on a Scale-sized allowance', () => {
    expect(describeSeatLimit(50, 1_200)).toBe('1,250 (50 included + 1,200 purchased)');
  });

  it('treats a negative purchased count as none', () => {
    // The ledger cannot produce one: units is positive and the RPC sums only
    // active rows. But this function is what stands between a bad number and a
    // sentence about somebody's entitlement, and "2 (2 included + -1 purchased)"
    // is worse than "2".
    expect(describeSeatLimit(2, -1)).toBe('2');
  });

  it('does not print NaN at somebody', () => {
    expect(describeSeatLimit(2, Number.NaN)).toBe('2');
    expect(describeSeatLimit(Number.NaN, 1)).toBe('—');
  });

  it('has a zero default that reads as the old behavior', () => {
    // The loader fails to zero rather than null on purpose: zero degrades to
    // exactly what shipped before it existed -- the plan allowance, stated
    // plainly -- rather than forcing the page to choose between hiding a limit
    // it knows and showing a total it does not.
    expect(NO_PURCHASED_SEATS.crewUsers).toBe(0);
    expect(NO_PURCHASED_SEATS.officeUsers).toBe(0);
    expect(describeSeatLimit(2, NO_PURCHASED_SEATS.crewUsers)).toBe('2');
  });
});

describe('the panel and the page are actually wired to it', () => {
  const PANEL = readFileSync(
    join(process.cwd(), 'src/app/dashboard/settings/PlanUsageSection.tsx'), 'utf8');
  const PAGE = readFileSync(
    join(process.cwd(), 'src/app/dashboard/settings/page.tsx'), 'utf8');

  it('renders both seat rows through the describer', () => {
    // Crew is the one on sale; office is withheld today and will not be
    // forever, and a row that silently keeps reading the plan alone is how this
    // bug comes back.
    expect(PANEL).toContain('describeSeatLimit(limits.crewUsers');
    expect(PANEL).toContain('describeSeatLimit(limits.officeUsers');
  });

  it('no longer prints the raw plan allowance for a seat', () => {
    expect(PANEL).not.toContain("limits.crewUsers.toLocaleString('en-US')");
    expect(PANEL).not.toContain("limits.officeUsers.toLocaleString('en-US')");
  });

  it('loads the ledger with the service-role client, like storage does', () => {
    // workspace_purchased_capacity_units is revoked from `authenticated` and
    // granted only to service_role: the owner is shown the effect, never the
    // rows. An owner-session read here would simply return nothing.
    expect(PAGE).toContain('loadPurchasedSeats(createAdminClient(), accountId)');
    expect(PAGE).toContain('purchasedSeats={purchasedSeats}');
  });

  it('keeps the loader behind server-only', () => {
    const LOADER = readFileSync(
      join(process.cwd(), 'src/lib/billing/purchased-seats.ts'), 'utf8');
    expect(LOADER).toContain("import 'server-only'");
    // ...and the formatter deliberately NOT, or the first client component that
    // needs it gets an import error instead of a function.
    const PURE = readFileSync(
      join(process.cwd(), 'src/lib/billing/seat-limits.ts'), 'utf8');
    expect(PURE).not.toContain("import 'server-only'");
  });
});
