import { describe, expect, it } from 'vitest';

import {
  MIN_ELAPSED_FRACTION,
  forecastPeriodCost,
  formatForecast,
} from '@/lib/billing/period-forecast';
import type { OverageSummary } from '@/lib/billing/overage-summary';
import type { WorkspacePlanRead } from '@/lib/billing/plan-usage';

/**
 * The first money figure this page has ever put in front of a contractor about
 * their own bill. Everything here is about the direction it fails in: a
 * projection that quietly drops a component is a small confident number, and a
 * small confident number is what somebody budgets against.
 */

const PERIOD_START = '2026-08-01T00:00:00.000Z';
const PERIOD_END = '2026-09-01T00:00:00.000Z';
const SPAN_MS = Date.parse(PERIOD_END) - Date.parse(PERIOD_START);
const at = (fraction: number) => Date.parse(PERIOD_START) + SPAN_MS * fraction;

const HALFWAY = at(0.5);

const plan = (over: Partial<Extract<WorkspacePlanRead, { kind: 'ready' }>> = {}): WorkspacePlanRead => ({
  kind: 'ready',
  planCode: 'solo',
  planName: 'Solo',
  billingInterval: 'monthly',
  billingStatus: 'active',
  entitlementState: 'active',
  catalogVersion: '2026-08-18-preview',
  usesCurrentCatalog: true,
  platformFeeBps: 50,
  periodEnd: PERIOD_END,
  nextAllowanceResetAt: PERIOD_END,
  basePriceCents: 3_900,
  limits: {
    officeUsers: 2, crewUsers: 2, customDomainConnections: 1, dedicatedBusinessNumbers: 0,
    storageGb: 10, quickBooksConnections: 1, voiceConcurrentCalls: 1, voiceHistoryDays: 30,
  },
  ...over,
});

const BASE_MILLICENTS = 3_900 * 1_000;

const overage = (over: Partial<OverageSummary> = {}): OverageSummary => ({
  enabled: true,
  capCents: null,
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  lines: [],
  totalMillicents: 0,
  atCap: false,
  readable: true,
  ...over,
});

describe('a figure is refused outright rather than guessed', () => {
  it('says nothing at all when the plan could not be read', () => {
    const result = forecastPeriodCost({ kind: 'unavailable' }, overage(), HALFWAY);
    expect(result.millicents).toBeNull();
    expect(result.basis).toBe('unreadable');
  });

  it('refuses a price it cannot see rather than rendering zero', () => {
    // Enterprise, and any workspace pinned to a superseded catalog. Zero here
    // would tell a paying customer their plan is free.
    const result = forecastPeriodCost(plan({ basePriceCents: null }), overage(), HALFWAY);
    expect(result.millicents).toBeNull();
    expect(result.basis).toBe('price_unknown');
  });

  it('never returns zero millicents together with a null-shaped basis', () => {
    for (const p of [{ kind: 'unavailable' } as const, plan({ basePriceCents: null })]) {
      expect(forecastPeriodCost(p, overage(), HALFWAY).millicents).not.toBe(0);
    }
  });
});

describe('the plan price alone, when nothing variable applies', () => {
  it('is the whole answer with no overage read at all', () => {
    const result = forecastPeriodCost(plan(), null, HALFWAY);
    expect(result).toEqual({ millicents: BASE_MILLICENTS, basis: 'plan_only' });
  });

  it('is the whole answer with overage switched off and nothing accrued', () => {
    const result = forecastPeriodCost(plan(), overage({ enabled: false }), HALFWAY);
    expect(result.basis).toBe('plan_only');
    expect(result.millicents).toBe(BASE_MILLICENTS);
  });

  it('is the whole answer with overage on but nothing yet on the meter', () => {
    expect(forecastPeriodCost(plan(), overage({ totalMillicents: 0 }), HALFWAY).basis)
      .toBe('plan_only');
  });

  it('counts a Flex workspace as zero, not as unreadable', () => {
    // Flex has a real price and it is nothing. That is a knowable state and
    // reads differently from "we could not tell".
    const flex = plan({
      planCode: 'flex', planName: 'Flex', billingInterval: 'none',
      basePriceCents: 0, platformFeeBps: 125, periodEnd: null,
    });
    expect(forecastPeriodCost(flex, null, HALFWAY)).toEqual({ millicents: 0, basis: 'plan_only' });
  });
});

describe('extra usage is never silently dropped from the total', () => {
  it('flags an unreadable overage read instead of quoting the plan price as final', () => {
    // The dangerous version of this branch returns the base price with basis
    // 'plan_only' -- a confident small number built on a failed read.
    const result = forecastPeriodCost(plan(), overage({ readable: false }), HALFWAY);
    expect(result.basis).toBe('plan_plus_unknown');
    expect(result.millicents).toBe(BASE_MILLICENTS);
  });

  it('still counts accruals from before overage was switched off', () => {
    const result = forecastPeriodCost(
      plan(), overage({ enabled: false, totalMillicents: 2_000_000 }), HALFWAY,
    );
    expect(result).toEqual({ millicents: BASE_MILLICENTS + 2_000_000, basis: 'plan_plus_accrued' });
  });
});

describe('the projection itself', () => {
  it('doubles a half-spent period', () => {
    const result = forecastPeriodCost(plan(), overage({ totalMillicents: 2_000_000 }), HALFWAY);
    expect(result).toEqual({ millicents: BASE_MILLICENTS + 4_000_000, basis: 'plan_plus_projected' });
  });

  it('refuses to extrapolate from the first days of a period', () => {
    // Two days into a 31-day month, multiplying by 15 turns one $20 accrual
    // into a $310 forecast. Report the $20.
    const early = at(2 / 31);
    const result = forecastPeriodCost(plan(), overage({ totalMillicents: 2_000_000 }), early);
    expect(result).toEqual({ millicents: BASE_MILLICENTS + 2_000_000, basis: 'plan_plus_accrued' });
  });

  it('starts extrapolating exactly at the documented threshold', () => {
    const accrued = 2_000_000;
    const justUnder = forecastPeriodCost(
      plan(), overage({ totalMillicents: accrued }), at(MIN_ELAPSED_FRACTION - 0.001),
    );
    const justOver = forecastPeriodCost(
      plan(), overage({ totalMillicents: accrued }), at(MIN_ELAPSED_FRACTION + 0.001),
    );
    expect(justUnder.basis).toBe('plan_plus_accrued');
    expect(justOver.basis).toBe('plan_plus_projected');
    // And the multiplier at the threshold is the promised six, not more.
    expect((justOver.millicents! - BASE_MILLICENTS) / accrued).toBeLessThan(6);
  });

  it('never projects below what has already been spent', () => {
    const accrued = 2_000_000;
    for (const fraction of [0.2, 0.35, 0.5, 0.75, 0.9, 0.99]) {
      const result = forecastPeriodCost(plan(), overage({ totalMillicents: accrued }), at(fraction));
      expect(result.millicents! - BASE_MILLICENTS, `at ${fraction}`).toBeGreaterThanOrEqual(accrued);
    }
  });

  it('stops projecting once the period has ended', () => {
    // Past period_end the accrued figure is final, not a sixth of something.
    const result = forecastPeriodCost(
      plan(), overage({ totalMillicents: 2_000_000 }), Date.parse(PERIOD_END) + 1,
    );
    expect(result.basis).toBe('plan_plus_accrued');
  });

  it('reports the accrued figure when the period dates cannot answer', () => {
    const cases: Partial<OverageSummary>[] = [
      { periodStart: null, periodEnd: null },
      { periodStart: 'not-a-date' },
      { periodEnd: 'not-a-date' },
      // End before start, and a zero-length period.
      { periodStart: PERIOD_END, periodEnd: PERIOD_START },
      { periodStart: PERIOD_START, periodEnd: PERIOD_START },
    ];
    for (const patch of cases) {
      const result = forecastPeriodCost(
        plan(), overage({ totalMillicents: 2_000_000, ...patch }), HALFWAY,
      );
      expect(result.basis, JSON.stringify(patch)).toBe('plan_plus_accrued');
      expect(result.millicents).toBe(BASE_MILLICENTS + 2_000_000);
    }
  });
});

describe('the authorized cap is a ceiling on the forecast', () => {
  it('does not forecast a charge the meters would refuse', () => {
    // $20 spent at halfway projects to $40, but the workspace authorized $30.
    // The meters stop at $30, so $40 is a charge that cannot happen.
    const result = forecastPeriodCost(
      plan(), overage({ totalMillicents: 2_000_000, capCents: 3_000 }), HALFWAY,
    );
    expect(result).toEqual({ millicents: BASE_MILLICENTS + 3_000_000, basis: 'plan_plus_capped' });
  });

  it('leaves a projection that lands under the cap alone', () => {
    const result = forecastPeriodCost(
      plan(), overage({ totalMillicents: 2_000_000, capCents: 9_000 }), HALFWAY,
    );
    expect(result.basis).toBe('plan_plus_projected');
    expect(result.millicents).toBe(BASE_MILLICENTS + 4_000_000);
  });

  it('does not round a real over-cap accrual down to look compliant', () => {
    // If something has already run past the ceiling, that is a number the
    // contractor needs, not one to hide behind the cap.
    const result = forecastPeriodCost(
      plan(), overage({ totalMillicents: 5_000_000, capCents: 3_000, atCap: true }), HALFWAY,
    );
    expect(result.millicents).toBe(BASE_MILLICENTS + 5_000_000);
  });
});

describe('the unit frame that kept this figure off the page', () => {
  it('quotes an annual subscriber their annual price, not twelve times it', () => {
    // basePriceCents for an annual plan is a per-YEAR number and the period is
    // a year, so they line up by construction. The dropped "Estimated this
    // month" tile is what made this a bug.
    const annual = plan({
      planCode: 'growth', planName: 'Growth', billingInterval: 'annual',
      basePriceCents: 118_800, platformFeeBps: 25,
    });
    const result = forecastPeriodCost(annual, null, HALFWAY);
    expect(result.millicents).toBe(118_800 * 1_000);
    expect(formatForecast(result.millicents!)).toBe('$1,188.00');
  });

  it('formats to the cent, matching the overage figure beside it', () => {
    expect(formatForecast(3_900_000)).toBe('$39.00');
    expect(formatForecast(0)).toBe('$0.00');
    expect(formatForecast(1_440)).toBe('$0.01');
  });
});
