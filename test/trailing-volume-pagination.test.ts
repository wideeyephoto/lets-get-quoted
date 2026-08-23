import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE FEE BRACKET RUNS THE WRONG WAY, which is what makes a truncated read
 * expensive rather than merely wrong.
 *
 * getTrailingVolume sums a contractor's Stripe-settled payments over a year and
 * that total picks their platform-fee tier: MORE volume, LOWER fee. Supabase
 * caps a response at 1,000 rows by default and says nothing when it truncates --
 * no error, just 1,000 rows. So the busiest contractors, the ones earning the
 * cheapest rate, were the only ones who could hit it, and hitting it charged
 * them MORE on every single transaction, permanently, growing as they grew.
 *
 * It ran on the live charge path: payments.ts computes feeRate from this
 * immediately before creating the Checkout Session.
 *
 * Nothing caught it because every existing test double returns one short page.
 */

const rangeCalls: Array<[number, number]> = [];
let pages: Array<Array<Record<string, unknown>>>;
let failPrimary = false;

const builder = () => {
  const q: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'not', 'gte']) q[method] = () => q;
  q.range = (from: number, to: number) => {
    rangeCalls.push([from, to]);
    if (failPrimary && rangeCalls.length === 1) {
      return Promise.resolve({ data: null, error: { message: 'column imported does not exist' } });
    }
    const index = Math.floor(from / 1000);
    return Promise.resolve({ data: pages[index] ?? [], error: null });
  };
  return q;
};

vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ from: () => builder() }) }));

const { getTrailingVolume, TRAILING_VOLUME_PAGE_SIZE } = await import('@/lib/payments');

const rows = (count: number, amount: number, extra: Record<string, unknown> = {}) =>
  Array.from({ length: count }, () => ({ amount, stripe_payment_intent: 'pi_x', ...extra }));

beforeEach(() => {
  rangeCalls.length = 0;
  failPrimary = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('summing a year of settled volume', () => {
  it('pages at the ceiling PostgREST actually imposes', () => {
    expect(TRAILING_VOLUME_PAGE_SIZE).toBe(1_000);
  });

  it('counts every payment past the first thousand', async () => {
    // 2,500 payments of $100. The old read returned the first 1,000 and summed
    // $100,000 -- which lands in a dearer bracket than the true $250,000.
    pages = [rows(1_000, 100), rows(1_000, 100), rows(500, 100)];
    expect(await getTrailingVolume('acct')).toBe(250_000);
    expect(rangeCalls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('stops on a short page rather than asking for ever', async () => {
    pages = [rows(400, 25)];
    expect(await getTrailingVolume('acct')).toBe(10_000);
    expect(rangeCalls).toHaveLength(1);
  });

  it('asks again after an exactly-full page, because full may not be the end', async () => {
    // The whole bug in one case: 1,000 rows is indistinguishable from "there is
    // more", so it has to ask.
    pages = [rows(1_000, 10), []];
    expect(await getTrailingVolume('acct')).toBe(10_000);
    expect(rangeCalls).toHaveLength(2);
  });

  it('still excludes imported payments on every page, not just the first', async () => {
    // Imported history and manual cash settlements must not inflate volume --
    // inflating it would let a contractor drop their own fee. Paging must not
    // quietly drop that filter after page one.
    pages = [
      rows(999, 100).concat(rows(1, 500, { imported: true })),
      rows(10, 100, { imported: true }).concat(rows(5, 100)),
    ];
    expect(await getTrailingVolume('acct')).toBe(999 * 100 + 5 * 100);
  });

  it('falls back to the older shape and pages that too', async () => {
    // The primary select names `imported`, which may not be migrated. The
    // fallback drops it -- and used to lose pagination with it.
    failPrimary = true;
    pages = [rows(1_000, 100), rows(200, 100)];
    const total = await getTrailingVolume('acct');
    expect(total).toBe(120_000);
    expect(rangeCalls.length).toBeGreaterThan(2);
  });

  it('says something when it hits its own ceiling', async () => {
    // 500 full pages is far past any real contractor, so reaching it means the
    // returned number is too low -- and too low is the direction that
    // overcharges. It must never pass silently.
    const logged: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => { logged.push(a); });
    pages = Array.from({ length: 600 }, () => rows(1_000, 1));
    await getTrailingVolume('acct');
    expect(rangeCalls).toHaveLength(500);
    expect(logged.some((l) => /page ceiling/.test(String(l[0])))).toBe(true);
  });
});
