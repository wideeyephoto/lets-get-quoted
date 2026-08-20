import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TOP_UPS } from '@/lib/billing/catalog';
import {
  OVERAGE_RATE_MILLICENTS,
  USAGE_OVERAGE_FLAG,
  formatOverage,
  OVERAGE_KEY_PATTERN,
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
    const d = await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'text_segments', units: 5, idempotencyKey: 'test:v1:text_segments-5' }, { enabled: false });
    expect(d).toEqual({ outcome: 'not_authorized' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a resource it has no rate for, rather than guessing one', async () => {
    const d = await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'storage_gb', units: 1, idempotencyKey: 'test:v1:storage_gb-1' }, { enabled: true });
    expect(d).toEqual({ outcome: 'unavailable' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('treats an unreadable period as no authorization', async () => {
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'down' } }) }) }),
    });
    const d = await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'text_segments', units: 1, idempotencyKey: 'test:v1:text_segments-1' }, { enabled: true });
    expect(d).toEqual({ outcome: 'unavailable' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('treats a database error as no authorization, never as approval', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const d = await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'text_segments', units: 1, idempotencyKey: 'test:v1:text_segments-1' }, { enabled: true });
    expect(d).toEqual({ outcome: 'unavailable' });
  });

  it('treats a throw the same way', async () => {
    rpc.mockRejectedValue(new Error('connection reset'));
    const d = await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'text_segments', units: 1, idempotencyKey: 'test:v1:text_segments-1' }, { enabled: true });
    expect(d).toEqual({ outcome: 'unavailable' });
  });
});

describe('what it reports back', () => {
  it('passes the rate and period the database needs to decide', async () => {
    rpc.mockResolvedValue({ data: [{ decision: 'accrued', accrued_millicents: 48_000, cap_millicents: 5_000_000, charged_millicents: 48_000 }], error: null });
    await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'text_segments', units: 10, idempotencyKey: 'test:v1:text_segments-10' }, { enabled: true });
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
    const d = await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'text_segments', units: 10, idempotencyKey: 'test:v1:text_segments-10' }, { enabled: true });
    expect(d).toMatchObject({ outcome: 'accrued', chargedMillicents: 48_000, capMillicents: 5_000_000 });
  });

  it('carries back the period it accrued under, so the release can find it', async () => {
    // Without this the release derived its own period, and any drift between
    // the two -- midnight on a Flex workspace, an entitlement period arriving
    // mid-month -- meant it released nothing and said it worked.
    rpc.mockResolvedValue({ data: [{ decision: 'accrued', accrued_millicents: 48_000, cap_millicents: 5_000_000, charged_millicents: 48_000 }], error: null });
    const d = await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'text_segments', units: 10, idempotencyKey: 'test:v1:text_segments-10' }, { enabled: true });
    expect(d).toMatchObject({ periodStart: '2026-08-01T00:00:00Z' });
  });

  it('reports the cap being reached as its own answer, not as an error', async () => {
    // A contractor who hit their own ceiling deserves a different sentence from
    // one whose database call failed.
    rpc.mockResolvedValue({ data: [{ decision: 'cap_reached', accrued_millicents: 5_000_000, cap_millicents: 5_000_000, charged_millicents: 0 }], error: null });
    const d = await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'text_segments', units: 10, idempotencyKey: 'test:v1:text_segments-10' }, { enabled: true });
    expect(d).toMatchObject({ outcome: 'cap_reached', capMillicents: 5_000_000 });
  });

  it('falls back to the calendar month when a workspace has no period', async () => {
    // Flex has no subscription period to overrun against.
    withPeriod(null, null);
    rpc.mockResolvedValue({ data: [{ decision: 'not_authorized' }], error: null });
    await tryUsageOverage(admin, { accountId: ACCOUNT, resourceCode: 'text_segments', units: 1, idempotencyKey: 'test:v1:text_segments-1' }, { enabled: true });
    const args = rpc.mock.calls[0][1];
    expect(args.p_period_start).toMatch(/^\d{4}-\d{2}-01T00:00:00\.000Z$/);
    expect(new Date(args.p_period_end).getTime()).toBeGreaterThan(new Date(args.p_period_start).getTime());
  });
});

describe('giving a charge back, which used to only look like it worked', () => {
  // Three bugs lived here in turn. It re-derived the period instead of carrying
  // back the one the accrual was written under; it returned `!error` while the
  // RPC returns the millicents actually released, so a release that matched no
  // row reported success and the charge stayed on the books for work that had
  // failed; and it described the charge in its own words -- resource, period,
  // units, amount -- which the database subtracted on trust.
  //
  // It now NAMES the charge. The amount comes from the recorded event, and an
  // event releases exactly once.

  const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
  const KEY = 'text-credit:v1:msg_abc123:overage';

  it('names the charge and lets the database supply the amount', async () => {
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

    expect(await releaseUsageOverage(admin, {
      accountId: ACCOUNT_ID, idempotencyKey: KEY, resourceCode: 'text_segments',
    })).toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      name: 'release_usage_overage',
      p_account_id: ACCOUNT_ID,
      p_idempotency_key: KEY,
    });
    // Nothing about units, amount, period or resource is sent. Sending them
    // would be sending the caller's opinion of a charge the database recorded.
    for (const field of ['p_units', 'p_millicents', 'p_period_start', 'p_resource_code']) {
      expect(calls[0], field).not.toHaveProperty(field);
    }
  });

  it('reports failure when nothing was actually released', async () => {
    // 0 means the key matched no OPEN event: never accrued, or already released.
    // Both leave a failed send holding its charge, so neither is success. There
    // is no longer a benign zero -- every recorded event has a positive amount,
    // because the column will not store anything else.
    const admin = {
      rpc: () => Promise.resolve({ data: 0, error: null }),
      from: () => { throw new Error('should not read'); },
    } as never;

    expect(await releaseUsageOverage(admin, {
      accountId: ACCOUNT_ID, idempotencyKey: KEY,
    })).toBe(false);
  });

  it('reports failure when the release errors', async () => {
    const admin = {
      rpc: () => Promise.resolve({ data: null, error: { message: 'down' } }),
      from: () => { throw new Error('should not read'); },
    } as never;

    expect(await releaseUsageOverage(admin, {
      accountId: ACCOUNT_ID, idempotencyKey: KEY,
    })).toBe(false);
  });

  it('never throws, because it runs in a caller\'s error path', async () => {
    const admin = {
      rpc: () => { throw new Error('connection reset'); },
      from: () => { throw new Error('should not read'); },
    } as never;

    await expect(releaseUsageOverage(admin, {
      accountId: ACCOUNT_ID, idempotencyKey: KEY,
    })).resolves.toBe(false);
  });

  it('says out loud when the money is owed back but the period has settled', async () => {
    // The database refuses rather than rewriting the inputs to a charge already
    // decided. Nothing in the codebase can issue that credit, so the one thing
    // this can do is make sure a person can find it.
    const logged: unknown[][] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => { logged.push(a); });
    const admin = {
      rpc: () => Promise.resolve({
        data: null,
        error: { message: 'overage period has already been settled; release refused' },
      }),
      from: () => { throw new Error('should not read'); },
    } as never;

    expect(await releaseUsageOverage(admin, {
      accountId: ACCOUNT_ID, idempotencyKey: KEY,
    })).toBe(false);

    expect(logged).toHaveLength(1);
    expect(String(logged[0][0])).toMatch(/OWED BACK/);
    expect(logged[0]).toContain(KEY);
    spy.mockRestore();
  });

  it('refuses without a key rather than guessing at a charge', async () => {
    const admin = {
      rpc: () => { throw new Error('must not be called'); },
      from: () => { throw new Error('must not be called'); },
    } as never;

    expect(await releaseUsageOverage(admin, {
      accountId: ACCOUNT_ID, idempotencyKey: '',
    })).toBe(false);
  });
});

describe('the key that stops the same overrun being charged twice', () => {
  // The retry is not hypothetical. The RPC commits, the connection drops before
  // the row comes back, this function answers `unavailable`, the caller refuses
  // to send -- and the workspace has paid for work nobody did. Then it retries.

  it('sends the key to the database', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const admin = {
      rpc: (name: string, args: Record<string, unknown>) => {
        calls.push({ name, ...args });
        return Promise.resolve({
          data: [{ decision: 'accrued', accrued_millicents: 4_800, cap_millicents: 50_000, charged_millicents: 4_800 }],
          error: null,
        });
      },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
        data: { period_start: '2026-08-01T00:00:00Z', period_end: '2026-09-01T00:00:00Z' }, error: null,
      }) }) }) }),
    } as never;

    const decision = await tryUsageOverage(admin, {
      accountId: ACCOUNT, resourceCode: 'text_segments', units: 1,
      idempotencyKey: 'text-credit:v1:msg_zzz999:overage',
    }, { enabled: true });

    expect(decision.outcome).toBe('accrued');
    expect(calls.at(-1)).toMatchObject({
      name: 'authorize_usage_overage',
      p_idempotency_key: 'text-credit:v1:msg_zzz999:overage',
    });
  });

  it('hands the key back so the release can name the same charge', async () => {
    const admin = {
      rpc: () => Promise.resolve({
        data: [{ decision: 'accrued', accrued_millicents: 4_800, cap_millicents: 50_000, charged_millicents: 4_800 }],
        error: null,
      }),
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
        data: { period_start: '2026-08-01T00:00:00Z', period_end: '2026-09-01T00:00:00Z' }, error: null,
      }) }) }) }),
    } as never;

    const decision = await tryUsageOverage(admin, {
      accountId: ACCOUNT, resourceCode: 'text_segments', units: 1,
      idempotencyKey: 'text-credit:v1:msg_yyy888:overage',
    }, { enabled: true });

    expect(decision).toMatchObject({
      outcome: 'accrued', idempotencyKey: 'text-credit:v1:msg_yyy888:overage',
    });
  });

  it('charges nothing at all when the key is unusable', async () => {
    // The database refuses a malformed key outright; refusing here too keeps a
    // caller mistake from reading as a provider failure, and -- more to the
    // point -- means no charge is attempted without one.
    for (const key of ['', 'short', '-leading-punctuation']) {
      const admin = {
        rpc: () => { throw new Error('must not authorize without a usable key'); },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
          data: { period_start: '2026-08-01T00:00:00Z', period_end: '2026-09-01T00:00:00Z' }, error: null,
        }) }) }) }),
      } as never;

      const decision = await tryUsageOverage(admin, {
        accountId: ACCOUNT, resourceCode: 'text_segments', units: 1, idempotencyKey: key,
      }, { enabled: true });
      expect(decision.outcome, JSON.stringify(key)).toBe('unavailable');
    }
  });

  it('accepts the shape every meter actually produces', () => {
    // Each meter suffixes its reservation key. If the pattern here and the CHECK
    // constraint disagreed, the meters would fail at the database instead.
    for (const key of [
      'text-credit:v1:msg_abc123:overage',
      'marketing-email:v1:send_abc123:overage',
      'ai-writing:v1:gen_abc123:overage',
      'ai-voice:v1:call_abc123:overage',
    ]) {
      expect(OVERAGE_KEY_PATTERN.test(key), key).toBe(true);
    }
  });
});
