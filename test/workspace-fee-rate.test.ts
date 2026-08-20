import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The platform fee follows the PLAN, which is what /pricing sells and what
 * /features/payments states outright: "Your rate follows your plan, not a
 * trailing-volume bracket". Until this landed, the charge path did the opposite
 * -- every payment was rated off a four-bracket trailing-volume table that no
 * customer-facing page mentions, so a Scale subscriber paying $329/month for a
 * 0.10% rate was billed 1.25%.
 *
 * READ THIS BEFORE TRUSTING A GREEN NUMBER HERE. Flex is 125 bps and the old
 * volume table's tier 1 was 1.25%. Every fixture literal 125 or 0.0125 is
 * therefore ambiguous about which engine produced it, and the existing rail
 * tests stayed green through the switch for exactly that reason. The assertions
 * that actually distinguish the two engines are the paid plans, where the two
 * answers differ by up to 12.5x.
 */

const state = {
  row: null as { plan_code: string; platform_fee_bps: number | null } | null,
  error: null as { message: string } | null,
};

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'workspace_entitlements') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: state.row, error: state.error }),
          }),
        }),
      };
    },
  }),
}));

const { getWorkspaceFeeRate } = await import('@/lib/billing/workspace-fee-rate');

beforeEach(() => {
  state.row = null;
  state.error = null;
});

describe('the rate a workspace is actually charged', () => {
  it('is the plan rate, not a volume bracket', async () => {
    // The four that matter. Solo, Growth and Scale are the ones a volume bracket
    // could never produce -- the old table bottomed out at 0.65%.
    for (const [plan, bps, rate] of [
      ['flex', 125, 0.0125],
      ['solo', 50, 0.005],
      ['growth', 25, 0.0025],
      ['scale', 10, 0.001],
    ] as const) {
      state.row = { plan_code: plan, platform_fee_bps: bps };
      const result = await getWorkspaceFeeRate('acct_1');
      expect(result.planCode).toBe(plan);
      expect(result.feeRateBps).toBe(bps);
      expect(result.feeRate).toBe(rate);
      expect(result.source).toBe('entitlement');
    }
  });

  it('gives a Scale workspace 0.10% no matter how much it has collected', async () => {
    // The single assertion that proves REPLACE rather than floor or stack: the
    // old engine's best rate for any volume was 0.65%, so 0.001 cannot be
    // produced by a bracket, and no volume input is read at all.
    state.row = { plan_code: 'scale', platform_fee_bps: 10 };
    const { feeRate } = await getWorkspaceFeeRate('acct_1');
    expect(feeRate).toBe(0.001);
    expect(feeRate).toBeLessThan(0.0065);
  });

  it('falls back to Flex when a workspace has no entitlement row', async () => {
    // Not an error: nothing guarantees every account has one. Flex is both the
    // correct default and numerically identical to what the old table charged at
    // tier 1, so this fallback moves nobody's fee.
    state.row = null;
    const result = await getWorkspaceFeeRate('acct_1');
    expect(result.planCode).toBe('flex');
    expect(result.feeRateBps).toBe(125);
    expect(result.source).toBe('default');
  });

  it('resolves the legacy plan aliases', async () => {
    state.row = { plan_code: 'pro', platform_fee_bps: 25 };
    expect((await getWorkspaceFeeRate('acct_1')).planCode).toBe('growth');
  });
});

describe('what it refuses to guess', () => {
  it('refuses a plan the catalog cannot price', async () => {
    // plan_code's CHECK permits 'enterprise' and BILLING_PLAN_IDS does not
    // include it, so resolveBillingPlanId would quietly answer 'flex' -- turning
    // an unsupported plan into the HIGHEST rate on the board. Enterprise terms
    // are negotiated; guessing is wrong in both directions, and wrong quietly.
    state.row = { plan_code: 'enterprise', platform_fee_bps: 5 };
    await expect(getWorkspaceFeeRate('acct_1')).rejects.toThrow(/no catalog platform fee rate/i);
  });

  it('refuses when the stored bps disagrees with the plan', async () => {
    // Nothing constrains platform_fee_bps against plan_code -- the only CHECK is
    // 0..10000. Both payment RPCs already re-derive an expected bps and refuse on
    // mismatch; this is the same guard, so a TypeScript reader is not the first
    // one without it.
    state.row = { plan_code: 'scale', platform_fee_bps: 125 };
    await expect(getWorkspaceFeeRate('acct_1')).rejects.toThrow(/disagrees with the scale catalog rate/i);
  });

  it('refuses on a read error rather than picking a number', async () => {
    state.error = { message: 'connection reset' };
    await expect(getWorkspaceFeeRate('acct_1')).rejects.toThrow(/Unable to read the platform fee rate/i);
  });
});

describe('the charge path cannot fall back to volume', () => {
  const read = (...parts: string[]): string =>
    readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

  it('no longer rates anything off trailing volume', () => {
    const payments = read('src', 'lib', 'payments.ts');
    expect(payments).toContain('getWorkspaceFeeRate');
    // The import is gone, so a reintroduced call would not even compile.
    expect(payments).not.toContain('computeFeeRate');
  });

  it('refuses at the charge site and degrades at the display site', () => {
    // The asymmetry is the whole point. getWorkspaceFeeRate throws rather than
    // guessing an unknowable rate, which is correct when money is about to move
    // and wrong on a homeowner's payment page -- there, a refused quote must
    // cost an estimate, not the pay button. This had no test at all, and making
    // the resolver strict is exactly what turned it into a 500 risk.
    const payments = read('src', 'lib', 'payments.ts');
    const chargeSite = payments.slice(payments.indexOf('const { feeRate } = await getWorkspaceFeeRate('));
    expect(chargeSite.slice(0, 200)).not.toContain('.catch(');

    const payPage = read('src', 'app', 'pay', '[id]', 'page.tsx');
    const quoteAt = payPage.indexOf('getQuotedFee(');
    expect(quoteAt, 'the pay page no longer quotes a fee').toBeGreaterThan(-1);
    expect(payPage.slice(quoteAt, quoteAt + 300)).toContain('.catch(');
  });

  it('keeps the volume table for the admin diagnostic it is labelled as', () => {
    // Deleting it would take the trailing-volume paging guard with it, and that
    // guard documents a real production bug class: a silent 1,000-row truncation
    // undercounts volume, and undercounting is the direction that overcharges.
    expect(read('src', 'lib', 'stripe.ts')).toContain('FEE_TIERS');
    const admin = read('src', 'app', 'admin', 'accounts', '[id]', 'page.tsx');
    expect(admin).toContain('Legacy volume tier (not plan authority)');
  });
});
