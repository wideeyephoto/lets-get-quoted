import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TOP_UPS } from '@/lib/billing/catalog';
import {
  OVERAGE_RATE_MILLICENTS,
  USAGE_OVERAGE_FLAG,
  formatOverage,
  releaseUsageOverage,
  tryUsageOverage,
  usageOverageEnabled,
} from '@/lib/billing/usage-overage';

/**
 * Overage decides whether a contractor is charged money they did not plan to
 * spend. These are promise assertions, not implementation ones.
 */

const rpc = vi.fn();
const from = vi.fn();
const admin = { rpc, from } as never;

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const withPeriod = (start: string | null, end: string | null) => {
  from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { period_start: start, period_end: end }, error: null }) }) }),
  });
};

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  withPeriod('2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('what an overrun costs', () => {
  it('never undercuts the top-up that covers the same thing', () => {
    // The argument for these numbers: planning ahead must not cost more than
    // not planning ahead. If a top-up is ever dearer per unit than overage,
    // buying one becomes irrational and this test says so.
    for (const [resource, rate] of Object.entries(OVERAGE_RATE_MILLICENTS)) {
      const packs = Object.values(TOP_UPS).filter((t) => t.resourceCode === resource && !t.recurring);
      expect(packs.length).toBeGreaterThan(0);
      const cheapestPack = Math.min(...packs.map((t) => (t.priceCents * 1000) / t.units));
      expect(rate).toBeGreaterThanOrEqual(cheapestPack);
    }
  });

  it('is exactly the smaller pack rate, in millicents', () => {
    // Pinned against the catalog so a price change that forgets this fails here
    // rather than silently making overage the cheaper option.
    for (const [resource, rate] of Object.entries(OVERAGE_RATE_MILLICENTS)) {
      const packs = Object.values(TOP_UPS).filter((t) => t.resourceCode === resource && !t.recurring);
      const dearestPack = Math.max(...packs.map((t) => (t.priceCents * 1000) / t.units));
      expect(rate).toBe(dearestPack);
    }
  });

  it('keeps sub-cent rates as fractions', () => {
    // 0.34c a marketing email. Rounded to whole cents this is 0 or 1, and
    // across a 5,000-recipient campaign that is $0 or $50 instead of $17.
    expect(OVERAGE_RATE_MILLICENTS.marketing_email_sends).toBe(340);
    expect(5000 * OVERAGE_RATE_MILLICENTS.marketing_email_sends).toBe(1_700_000);
    expect(formatOverage(1_700_000)).toBe('$17.00');
  });

  it('prints an AI voice minute at the rate the price book publishes', () => {
    // $0.35 an AI-connected minute. The conversion is the thing under test: at
    // 1,000 millicents to the cent this is 35,000, and reading it as 35_000
    // CENTS would print $350.00 -- a thousandfold error in the direction that
    // bills a contractor.
    expect(formatOverage(35_000)).toBe('$0.35');
    expect(formatOverage(100 * 35_000)).toBe('$35.00'); // the 100-minute top-up
  });

  it('does not carry its own conversion math', () => {
    // formatUsdExact groups thousands; a local `.toFixed(2)` does not. This
    // asserts the shared helper is genuinely doing the work, so the two can
    // never drift into showing one accrual two ways.
    expect(formatOverage(1_234_560_000)).toBe('$12,345.60');
  });

  it('rounds a fraction of a cent to nothing, and says so honestly', () => {
    // One marketing email costs less than a cent. $0.00 is the true answer for
    // a single send; the charge is the accrued total, which is what this is
    // called on.
    expect(formatOverage(340)).toBe('$0.00');
    expect(formatOverage(0)).toBe('$0.00');
  });
});

describe('nothing is charged without approval', () => {
  it('is off until the flag is exactly 1', () => {
    for (const value of [undefined, '', '0', 'true', ' 1']) {
      expect(usageOverageEnabled({ [USAGE_OVERAGE_FLAG]: value })).toBe(false);
    }
    expect(usageOverageEnabled({ [USAGE_OVERAGE_FLAG]: '1' })).toBe(true);
  });

  it('touches no ledger while dark', async () => {
    const d = await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'text_segments', units: 5 }, { enabled: false });
    expect(d).toEqual({ outcome: 'not_authorized' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a resource it has no rate for, rather than guessing one', async () => {
    const d = await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'storage_gb', units: 1 }, { enabled: true });
    expect(d).toEqual({ outcome: 'unavailable' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('treats an unreadable period as no authorization', async () => {
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'down' } }) }) }),
    });
    const d = await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'text_segments', units: 1 }, { enabled: true });
    expect(d).toEqual({ outcome: 'unavailable' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('treats a database error as no authorization, never as approval', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const d = await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'text_segments', units: 1 }, { enabled: true });
    expect(d).toEqual({ outcome: 'unavailable' });
  });

  it('treats a throw the same way', async () => {
    rpc.mockRejectedValue(new Error('connection reset'));
    const d = await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'text_segments', units: 1 }, { enabled: true });
    expect(d).toEqual({ outcome: 'unavailable' });
  });
});

describe('what it reports back', () => {
  it('passes the rate and period the database needs to decide', async () => {
    rpc.mockResolvedValue({ data: [{ decision: 'accrued', accrued_millicents: 48_000, cap_millicents: 5_000_000, charged_millicents: 48_000 }], error: null });
    await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'text_segments', units: 10 }, { enabled: true });
    expect(rpc).toHaveBeenCalledWith('authorize_usage_overage', expect.objectContaining({
      p_account_id: ACCOUNT,
      p_resource_code: 'text_segments',
      p_units: 10,
      p_rate_millicents: 4_800,
      p_period_start: '2026-08-01T00:00:00Z',
    }));
  });

  it('reports an accrual with what is left of the cap', async () => {
    rpc.mockResolvedValue({ data: [{ decision: 'accrued', accrued_millicents: 48_000, cap_millicents: 5_000_000, charged_millicents: 48_000 }], error: null });
    const d = await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'text_segments', units: 10 }, { enabled: true });
    expect(d).toMatchObject({ outcome: 'accrued', chargedMillicents: 48_000, capMillicents: 5_000_000 });
  });

  it('carries back the period it accrued under, so the release can find it', async () => {
    // Without this the release derived its own period, and any drift between
    // the two -- midnight on a Flex workspace, an entitlement period arriving
    // mid-month -- meant it released nothing and said it worked.
    rpc.mockResolvedValue({ data: [{ decision: 'accrued', accrued_millicents: 48_000, cap_millicents: 5_000_000, charged_millicents: 48_000 }], error: null });
    const d = await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'text_segments', units: 10 }, { enabled: true });
    expect(d).toMatchObject({ periodStart: '2026-08-01T00:00:00Z' });
  });

  it('reports the cap being reached as its own answer, not as an error', async () => {
    // A contractor who hit their own ceiling deserves a different sentence from
    // one whose database call failed.
    rpc.mockResolvedValue({ data: [{ decision: 'cap_reached', accrued_millicents: 5_000_000, cap_millicents: 5_000_000, charged_millicents: 0 }], error: null });
    const d = await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'text_segments', units: 10 }, { enabled: true });
    expect(d).toMatchObject({ outcome: 'cap_reached', capMillicents: 5_000_000 });
  });

  it('falls back to the calendar month when a workspace has no period', async () => {
    // Flex has no subscription period to overrun against.
    withPeriod(null, null);
    rpc.mockResolvedValue({ data: [{ decision: 'not_authorized' }], error: null });
    await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'text_segments', units: 1 }, { enabled: true });
    const args = rpc.mock.calls[0][1];
    expect(args.p_period_start).toMatch(/^\d{4}-\d{2}-01T00:00:00\.000Z$/);
    expect(new Date(args.p_period_end).getTime()).toBeGreaterThan(new Date(args.p_period_start).getTime());
  });
});

describe('giving a charge back, which used to only look like it worked', () => {
  // Two bugs lived here together. releaseUsageOverage re-derived the period
  // instead of carrying back the one the accrual was written under, and it
  // returned `!error` while the RPC returns the millicents actually released --
  // so a release that matched no row reported success and the charge stayed on
  // the books for work that had failed.

  it('releases against the period it was told, never one it derives', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const admin = {
      rpc: (name: string, args: Record<string, unknown>) => {
        calls.push({ name, ...args });
        return Promise.resolve({ data: 4_800, error: null });
      },
      from: () => {
        throw new Error('releaseUsageOverage must not read the entitlement period');
      },
    } as never;

    const ok = await releaseUsageOverage(admin, {
      accountId: '11111111-1111-4111-8111-111111111111',
      resourceCode: 'text_segments',
      units: 1,
      millicents: 4_800,
      periodStart: '2026-08-01T00:00:00Z',
    });

    expect(ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: 'release_usage_overage',
      p_period_start: '2026-08-01T00:00:00Z',
    });
  });

  it('reports failure when nothing was actually released', async () => {
    // The RPC returns 0 when it finds no accrual row -- a wrong period, a period
    // already closed, a resource that never accrued. `!error` called that
    // success, which is how a failed send kept its charge.
    const admin = {
      rpc: () => Promise.resolve({ data: 0, error: null }),
      from: () => { throw new Error('should not read'); },
    } as never;

    expect(await releaseUsageOverage(admin, {
      accountId: '11111111-1111-4111-8111-111111111111',
      resourceCode: 'text_segments',
      units: 1,
      millicents: 4_800,
      periodStart: '2026-08-01T00:00:00Z',
    })).toBe(false);
  });

  it('treats releasing nothing as fine when nothing was owed', async () => {
    const admin = {
      rpc: () => Promise.resolve({ data: 0, error: null }),
      from: () => { throw new Error('should not read'); },
    } as never;

    expect(await releaseUsageOverage(admin, {
      accountId: '11111111-1111-4111-8111-111111111111',
      resourceCode: 'text_segments',
      units: 0,
      millicents: 0,
      periodStart: '2026-08-01T00:00:00Z',
    })).toBe(true);
  });

  it('refuses without a period rather than guessing one', async () => {
    const admin = {
      rpc: () => { throw new Error('must not be called'); },
      from: () => { throw new Error('must not be called'); },
    } as never;

    expect(await releaseUsageOverage(admin, {
      accountId: '11111111-1111-4111-8111-111111111111',
      resourceCode: 'text_segments',
      units: 1,
      millicents: 4_800,
      periodStart: '',
    })).toBe(false);
  });
});
