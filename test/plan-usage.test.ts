import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadWorkspacePlanUsage,
  normalizeWorkspaceBalances,
  normalizeWorkspacePlan,
  planUsageDashboardEnabled,
} from '@/lib/billing/plan-usage';

type Reply = { data: unknown; error: { message: string } | null };

function fakeSupabase(replies: Record<string, Reply>) {
  const filters: Array<{ table: string; column: string; value: unknown }> = [];
  const client = {
    from(table: string) {
      const chain = {
        select() { return chain; },
        eq(column: string, value: unknown) {
          filters.push({ table, column, value });
          return chain;
        },
        maybeSingle: async () => replies[table] ?? { data: null, error: null },
        then<TResult1 = Reply, TResult2 = never>(
          onfulfilled?: ((value: Reply) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return Promise.resolve(replies[table] ?? { data: [], error: null }).then(onfulfilled, onrejected);
        },
      };
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, filters };
}

const flexEntitlement = {
  account_id: 'acc-1',
  plan_code: 'flex',
  billing_interval: 'none',
  billing_status: 'free',
  entitlement_state: 'active',
  catalog_version: '2026-08-15-preview',
  platform_fee_bps: 125,
  period_end: null,
  next_allowance_reset_at: null,
  feature_limits: {
    office_users: 1,
    crew_users: 2,
    custom_domain_connections: 1,
    dedicated_business_numbers: 0,
    storage_gb: 5,
    quickbooks_connections: 1,
    voice_concurrent_calls: 1,
    voice_history_days: 30,
  },
};

describe('Plan & usage rollout gate', () => {
  it('defaults off and accepts only the exact server-side opt-in value', () => {
    expect(planUsageDashboardEnabled({})).toBe(false);
    expect(planUsageDashboardEnabled({ LGQ_PRICING_DASHBOARD_ENABLED: '0' })).toBe(false);
    expect(planUsageDashboardEnabled({ LGQ_PRICING_DASHBOARD_ENABLED: 'true' })).toBe(false);
    expect(planUsageDashboardEnabled({ LGQ_PRICING_DASHBOARD_ENABLED: '1 ' })).toBe(false);
    expect(planUsageDashboardEnabled({ LGQ_PRICING_DASHBOARD_ENABLED: '1' })).toBe(true);
  });
});

describe('workspace plan normalization', () => {
  it('uses the saved entitlement and exact basis-point fee as billing truth', () => {
    expect(normalizeWorkspacePlan(flexEntitlement, 'acc-1')).toMatchObject({
      kind: 'ready',
      planCode: 'flex',
      planName: 'Flex',
      platformFeeBps: 125,
      basePriceCents: 0,
      usesCurrentCatalog: true,
      limits: { officeUsers: 1, crewUsers: 2, dedicatedBusinessNumbers: 0 },
    });
  });

  it('handles Enterprise explicitly instead of falling through to Flex', () => {
    const result = normalizeWorkspacePlan({
      ...flexEntitlement,
      plan_code: 'enterprise',
      billing_interval: 'monthly',
      billing_status: 'active',
      platform_fee_bps: 0,
    }, 'acc-1');
    expect(result).toMatchObject({
      kind: 'ready',
      planCode: 'enterprise',
      planName: 'Enterprise',
      platformFeeBps: 0,
      basePriceCents: null,
    });
  });

  it('does not substitute current catalog prices into an older entitlement', () => {
    const result = normalizeWorkspacePlan({ ...flexEntitlement, catalog_version: '2026-07-legacy' }, 'acc-1');
    expect(result).toMatchObject({ kind: 'ready', usesCurrentCatalog: false, basePriceCents: null });
  });

  it('never guesses Flex for a missing, foreign, unknown, or malformed entitlement', () => {
    expect(normalizeWorkspacePlan(null, 'acc-1')).toEqual({ kind: 'unavailable' });
    expect(normalizeWorkspacePlan({ ...flexEntitlement, account_id: 'acc-2' }, 'acc-1')).toEqual({ kind: 'unavailable' });
    expect(normalizeWorkspacePlan({ ...flexEntitlement, plan_code: 'mystery' }, 'acc-1')).toEqual({ kind: 'unavailable' });
    expect(normalizeWorkspacePlan({ ...flexEntitlement, platform_fee_bps: 'lots' }, 'acc-1')).toEqual({ kind: 'unavailable' });
    expect(normalizeWorkspacePlan({
      ...flexEntitlement,
      feature_limits: { ...flexEntitlement.feature_limits, storage_gb: 'unlimited' },
    }, 'acc-1')).toEqual({ kind: 'unavailable' });
  });
});

describe('available credit balances', () => {
  it('shows available balances only and keeps a missing lot distinct from zero', () => {
    const result = normalizeWorkspaceBalances([
      { account_id: 'acc-1', resource_code: 'text_segments', available_units: 0, next_expiration_at: null },
      { account_id: 'acc-1', resource_code: 'ai_intake_threads', available_units: '30', next_expiration_at: null },
    ], 'acc-1');

    expect(result).toEqual({
      kind: 'ready',
      balances: [
        { resourceCode: 'text_segments', label: 'Text credits', availableUnits: 0, nextExpirationAt: null },
        { resourceCode: 'marketing_email_sends', label: 'Marketing emails', availableUnits: null, nextExpirationAt: null },
        { resourceCode: 'ai_intake_threads', label: 'AI Intake credits', availableUnits: 30, nextExpirationAt: null },
        { resourceCode: 'ai_writing_drafts', label: 'AI writing drafts', availableUnits: null, nextExpirationAt: null },
      ],
    });
  });

  it('fails closed on cross-account, duplicate, or invalid balance rows', () => {
    expect(normalizeWorkspaceBalances([
      { account_id: 'acc-2', resource_code: 'text_segments', available_units: 50, next_expiration_at: null },
    ], 'acc-1')).toEqual({ kind: 'unavailable' });
    expect(normalizeWorkspaceBalances([
      { account_id: 'acc-1', resource_code: 'text_segments', available_units: 50, next_expiration_at: null },
      { account_id: 'acc-1', resource_code: 'text_segments', available_units: 50, next_expiration_at: null },
    ], 'acc-1')).toEqual({ kind: 'unavailable' });
    expect(normalizeWorkspaceBalances([
      { account_id: 'acc-1', resource_code: 'text_segments', available_units: -1, next_expiration_at: null },
    ], 'acc-1')).toEqual({ kind: 'unavailable' });
  });
});

describe('session-scoped Plan & usage reads', () => {
  it('filters both RLS reads to the resolved owner account', async () => {
    const { client, filters } = fakeSupabase({
      workspace_entitlements: { data: flexEntitlement, error: null },
      workspace_usage_credit_balances: {
        data: [{ account_id: 'acc-1', resource_code: 'text_segments', available_units: 50, next_expiration_at: null }],
        error: null,
      },
    });

    const result = await loadWorkspacePlanUsage(client, 'acc-1');
    expect(result.plan.kind).toBe('ready');
    expect(result.balances.kind).toBe('ready');
    expect(filters).toEqual([
      { table: 'workspace_entitlements', column: 'account_id', value: 'acc-1' },
      { table: 'workspace_usage_credit_balances', column: 'account_id', value: 'acc-1' },
    ]);
  });

  it('reports independent unavailable states instead of inventing data', async () => {
    const { client } = fakeSupabase({
      workspace_entitlements: { data: null, error: { message: 'relation missing' } },
      workspace_usage_credit_balances: { data: [], error: null },
    });
    const result = await loadWorkspacePlanUsage(client, 'acc-1');
    expect(result.plan).toEqual({ kind: 'unavailable' });
    expect(result.balances).toMatchObject({ kind: 'ready' });
  });
});
