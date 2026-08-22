import { describe, expect, it } from 'vitest';

import { nextEvent, type CancellableProps, type PlanChangeProps } from
  '@/app/dashboard/settings/PlanUsageSection';
import type { WorkspaceBalancesRead, WorkspacePlanRead } from '@/lib/billing/plan-usage';

/**
 * "Next event" reads six date fields that are only FOUR instants, and two pairs
 * of them are literally the same database column. The glance tile shows one.
 * What it must never do is present one date under two names, or tell somebody a
 * cancelled subscription renews.
 */

const NOW = Date.parse('2026-08-21T00:00:00.000Z');
const at = (iso: string) => Date.parse(iso);

const readyPlan = (over: Partial<Extract<WorkspacePlanRead, { kind: 'ready' }>> = {}): WorkspacePlanRead => ({
  kind: 'ready',
  planCode: 'solo',
  planName: 'Solo',
  billingInterval: 'monthly',
  billingStatus: 'active',
  entitlementState: 'active',
  catalogVersion: '2026-08-18-preview',
  usesCurrentCatalog: true,
  platformFeeBps: 50,
  periodEnd: '2026-09-01T00:00:00.000Z',
  nextAllowanceResetAt: '2026-09-01T00:00:00.000Z',
  basePriceCents: 3_900,
  limits: {
    officeUsers: 2, crewUsers: 2, customDomainConnections: 1, dedicatedBusinessNumbers: 0,
    storageGb: 10, quickBooksConnections: 1, voiceConcurrentCalls: 1, voiceHistoryDays: 30,
  },
  ...over,
});

const noBalances: WorkspaceBalancesRead = { kind: 'ready', balances: [] };

const planChange = (over: Partial<PlanChangeProps> = {}): PlanChangeProps => ({
  currentPlanCode: 'solo',
  currentBillingInterval: 'monthly',
  currentPeriodEnd: '2026-09-01T00:00:00.000Z',
  pendingPlanCode: null,
  pendingEffectiveAt: null,
  options: [],
  ...over,
});

const cancellable = (over: Partial<CancellableProps> = {}): CancellableProps => ({
  planName: 'Solo',
  currentPeriodEnd: '2026-09-01T00:00:00.000Z',
  alreadyScheduled: false,
  ...over,
});

describe('next event picks one instant and names what it means', () => {
  it('is null for a Flex workspace, which has no dated events at all', () => {
    // billing_subscriptions excludes 'flex' by CHECK and the Flex seed writes
    // neither period_end nor next_allowance_reset_at. Nothing is scheduled --
    // which is true, and is not a failed lookup.
    const flex = readyPlan({
      planCode: 'flex', planName: 'Flex', billingInterval: 'none', billingStatus: 'free',
      periodEnd: null, nextAllowanceResetAt: null, basePriceCents: 0, platformFeeBps: 125,
    });
    expect(nextEvent(flex, noBalances, null, null, NOW)).toBeNull();
  });

  it('is null when the plan itself could not be read', () => {
    expect(nextEvent({ kind: 'unavailable' }, { kind: 'unavailable' }, null, null, NOW)).toBeNull();
  });

  it('says Renews for a live subscription', () => {
    expect(nextEvent(readyPlan(), noBalances, planChange(), null, NOW))
      .toEqual({ label: 'Renews', at: '2026-09-01T00:00:00.000Z' });
  });

  it('says Plan ends, never Renews, once a cancellation is scheduled', () => {
    // The single most disputable sentence this page could print is "Renews
    // Sep 1" on a subscription set to stop on Sep 1.
    const event = nextEvent(readyPlan(), noBalances, planChange(), cancellable({ alreadyScheduled: true }), NOW);
    expect(event?.label).toBe('Plan ends');
  });

  it('prefers the nearer scheduled plan change over the renewal behind it', () => {
    const event = nextEvent(
      readyPlan(),
      noBalances,
      planChange({ pendingPlanCode: 'growth', pendingEffectiveAt: '2026-08-25T00:00:00.000Z' }),
      null,
      NOW,
    );
    expect(event).toEqual({ label: 'Plan changes', at: '2026-08-25T00:00:00.000Z' });
  });

  it('surfaces a credit expiry when it lands before anything else', () => {
    const balances: WorkspaceBalancesRead = {
      kind: 'ready',
      balances: [
        { resourceCode: 'text_segments', label: 'Text credits', availableUnits: 10, nextExpirationAt: '2026-08-30T00:00:00.000Z' },
        { resourceCode: 'ai_intake_threads', label: 'AI Intake credits', availableUnits: 5, nextExpirationAt: '2026-08-23T00:00:00.000Z' },
      ],
    };
    // The EARLIEST expiry, not the first one in the array.
    expect(nextEvent(readyPlan(), balances, planChange(), null, NOW))
      .toEqual({ label: 'Credits expire', at: '2026-08-23T00:00:00.000Z' });
  });

  it('ignores dates that have already passed', () => {
    const stale = readyPlan({ nextAllowanceResetAt: '2026-01-01T00:00:00.000Z', periodEnd: null });
    expect(nextEvent(stale, noBalances, null, null, NOW)).toBeNull();
  });

  it('does not print the same instant twice under two names', () => {
    // plan.periodEnd and overage.periodEnd are one column; planChange and
    // cancellable's currentPeriodEnd are another. Whatever wins, exactly one
    // label comes back.
    const event = nextEvent(readyPlan(), noBalances, planChange(), cancellable(), NOW);
    expect(event).not.toBeNull();
    expect(Object.keys(event ?? {}).sort()).toEqual(['at', 'label']);
    expect(at(event!.at)).toBeGreaterThanOrEqual(NOW);
  });

  it('falls back to the cancellation row when no plan-change row was read', () => {
    // planChange is unflagged and cancellable sits behind a second flag, so the
    // pair is genuinely optional in both directions.
    const event = nextEvent(readyPlan(), noBalances, null, cancellable(), NOW);
    expect(event?.label).toBe('Renews');
  });

  it('survives an unparseable date rather than rendering Invalid Date', () => {
    const broken = readyPlan({ nextAllowanceResetAt: 'not-a-date', periodEnd: null });
    expect(nextEvent(broken, noBalances, null, null, NOW)).toBeNull();
  });
});
