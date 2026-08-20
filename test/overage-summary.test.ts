import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  describeOverageResource,
  formatOverageTotal,
  loadOverageSummary,
  remainingCapMillicents,
} from '@/lib/billing/overage-summary';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

let replies: Record<string, { data?: unknown; error?: unknown }>;

const supabase = {
  from(table: string) {
    const reply = replies[table] ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'gt', 'lt', 'order']) chain[method] = () => chain;
    chain.maybeSingle = () => Promise.resolve(reply);
    (chain as { then: unknown }).then = (r: (v: unknown) => unknown) => r(reply);
    return chain;
  },
} as never;

const PERIOD = { period_start: '2026-08-01T00:00:00Z', period_end: '2026-09-01T00:00:00Z' };

const setup = (over: Partial<Record<string, { data?: unknown; error?: unknown }>> = {}) => {
  replies = {
    workspace_overage_settings: { data: { enabled: true, cap_cents: 5_000 }, error: null },
    workspace_entitlements: { data: PERIOD, error: null },
    workspace_overage_accruals: { data: [], error: null },
    ...over,
  };
};

beforeEach(() => {
  setup();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('what a contractor has run up', () => {
  it('totals the lines and prices each one', async () => {
    replies.workspace_overage_accruals = {
      data: [
        { resource_code: 'text_segments', units: 30, millicents: 144_000 },
        { resource_code: 'voice_minutes', units: 4, millicents: 140_000 },
      ],
      error: null,
    };
    const summary = await loadOverageSummary(supabase, ACCOUNT);
    expect(summary.totalMillicents).toBe(284_000);
    // The per-unit rate travels with the line so the arithmetic is checkable by
    // the person being charged, not only by us.
    expect(summary.lines[0].rateMillicents).toBe(4_800);
    expect(summary.lines[1].rateMillicents).toBe(35_000);
  });

  it('merges the same resource across two overlapping periods', async () => {
    // period_start is not stable -- the subscription projector rewrites it from
    // Stripe mid-month -- so one month can hold two buckets and both count
    // against one cap (see 20260819310000). Showing "Text credits" twice would
    // read as a duplicate rather than as two halves of the same month.
    replies.workspace_overage_accruals = {
      data: [
        { resource_code: 'text_segments', units: 30, millicents: 144_000 },
        { resource_code: 'text_segments', units: 5, millicents: 24_000 },
        { resource_code: 'voice_minutes', units: 4, millicents: 140_000 },
      ],
      error: null,
    };
    const summary = await loadOverageSummary(supabase, ACCOUNT);
    expect(summary.lines).toHaveLength(2);
    expect(summary.totalMillicents).toBe(308_000);
    // Largest first, still, even though merging changed which one that is.
    expect(summary.lines[0]).toMatchObject({
      resourceCode: 'text_segments', units: 35, millicents: 168_000,
    });
    expect(summary.lines[1]).toMatchObject({ resourceCode: 'voice_minutes', millicents: 140_000 });
  });

  it('shows nothing rather than a wrong period when the period is half-known', async () => {
    // A period with a start and no end cannot be overlapped against. Reporting
    // zero spent would be worse than reporting nothing, so it reports nothing.
    setup({ workspace_entitlements: { data: { period_start: PERIOD.period_start, period_end: null }, error: null } });
    const summary = await loadOverageSummary(supabase, ACCOUNT);
    expect(summary).toMatchObject({ enabled: true, capCents: 5_000, totalMillicents: 0 });
    expect(summary.periodStart).toBeNull();
  });

  it('reads a resource it has never heard of without inventing a price', async () => {
    replies.workspace_overage_accruals = {
      data: [{ resource_code: 'something_new', units: 1, millicents: 500 }], error: null,
    };
    const summary = await loadOverageSummary(supabase, ACCOUNT);
    expect(summary.lines[0].rateMillicents).toBeNull();
    expect(summary.totalMillicents).toBe(500);
  });

  it('is empty and disabled by default, which is the shipped state', async () => {
    setup({ workspace_overage_settings: { data: null, error: null } });
    const summary = await loadOverageSummary(supabase, ACCOUNT);
    expect(summary).toMatchObject({ enabled: false, capCents: null, totalMillicents: 0 });
  });
});

describe('the cap, and the unit mismatch it invites', () => {
  it('compares cents against millicents exactly once', async () => {
    // cap_cents is CENTS and the accrual is MILLICENTS. Getting this wrong in
    // either direction is a thousandfold error -- refusing at a tenth of a cent,
    // or letting a workspace run to a thousand times its cap.
    replies.workspace_overage_accruals = {
      data: [{ resource_code: 'text_segments', units: 1, millicents: 4_999_999 }], error: null,
    };
    // $50.00 cap = 5,000 cents = 5,000,000 millicents. One millicent short.
    expect((await loadOverageSummary(supabase, ACCOUNT)).atCap).toBe(false);

    replies.workspace_overage_accruals = {
      data: [{ resource_code: 'text_segments', units: 1, millicents: 5_000_000 }], error: null,
    };
    expect((await loadOverageSummary(supabase, ACCOUNT)).atCap).toBe(true);
  });

  it('reports what is left before the meters start refusing', async () => {
    replies.workspace_overage_accruals = {
      data: [{ resource_code: 'text_segments', units: 1, millicents: 1_000_000 }], error: null,
    };
    const summary = await loadOverageSummary(supabase, ACCOUNT);
    expect(remainingCapMillicents(summary)).toBe(4_000_000);
  });

  it('never reports a negative remainder', async () => {
    replies.workspace_overage_accruals = {
      data: [{ resource_code: 'text_segments', units: 1, millicents: 9_000_000 }], error: null,
    };
    expect(remainingCapMillicents(await loadOverageSummary(supabase, ACCOUNT))).toBe(0);
  });

  it('distinguishes "no cap" from "unlimited"', async () => {
    // With overage disabled nothing accrues at all, so a null remainder is not
    // headroom -- it is the absence of the feature, and the caller says so.
    setup({ workspace_overage_settings: { data: { enabled: false, cap_cents: null }, error: null } });
    const summary = await loadOverageSummary(supabase, ACCOUNT);
    expect(summary.enabled).toBe(false);
    expect(remainingCapMillicents(summary)).toBeNull();
  });
});

describe('reading the wrong period would be worse than reading none', () => {
  it('keys accruals to the entitlement period, not the calendar month', async () => {
    // tryUsageOverage resolves the period from the entitlement too. Two places
    // deciding "which period is now" differently is how a screen shows a total
    // that no invoice matches.
    replies.workspace_overage_accruals = {
      data: [{ resource_code: 'text_segments', units: 1, millicents: 100 }], error: null,
    };
    const summary = await loadOverageSummary(supabase, ACCOUNT);
    expect(summary.periodStart).toBe(PERIOD.period_start);
    expect(summary.periodEnd).toBe(PERIOD.period_end);
  });

  it('shows nothing rather than guessing when there is no period', async () => {
    // A Flex workspace has no subscription period. Reproducing the meter's
    // calendar-month fallback here is how the two start disagreeing.
    setup({ workspace_entitlements: { data: null, error: null } });
    const summary = await loadOverageSummary(supabase, ACCOUNT);
    expect(summary.lines).toEqual([]);
    expect(summary.periodStart).toBeNull();
    // The authorization is still reported, because it is still true.
    expect(summary.enabled).toBe(true);
  });

  it('renders empty rather than throwing when a read fails', async () => {
    setup({ workspace_overage_accruals: { data: null, error: { message: 'down' } } });
    const summary = await loadOverageSummary(supabase, ACCOUNT);
    expect(summary.lines).toEqual([]);
    expect(summary.totalMillicents).toBe(0);
  });
});

describe('how it reads on a page', () => {
  it('names resources in the customer\'s vocabulary, not the database\'s', () => {
    expect(describeOverageResource('voice_minutes')).toBe('AI-connected minutes');
    expect(describeOverageResource('marketing_email_sends')).toBe('Marketing emails');
    // An unknown code falls through to itself rather than to a blank cell.
    expect(describeOverageResource('brand_new_thing')).toBe('brand_new_thing');
  });

  it('formats through the one money helper', () => {
    expect(formatOverageTotal(284_000)).toBe('$2.84');
    expect(formatOverageTotal(0)).toBe('$0.00');
  });
});
