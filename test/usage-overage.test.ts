import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TOP_UPS } from '@/lib/billing/catalog';
import {
  OVERAGE_RATE_MILLICENTS,
  USAGE_OVERAGE_FLAG,
  formatOverage,
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
