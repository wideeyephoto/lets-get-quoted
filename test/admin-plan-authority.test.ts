import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  formatPlatformFeeBps,
  normalizeAdminEntitlementSnapshot,
  normalizeAdminSubscriptionSnapshot,
} from '@/lib/admin-plan-authority';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-08-16T12:00:00.000Z';

const entitlement = {
  account_id: ACCOUNT_ID,
  plan_code: 'growth',
  billing_interval: 'annual',
  billing_status: 'active',
  entitlement_state: 'active',
  catalog_version: '2026-08-15-preview',
  platform_fee_bps: 25,
  period_start: '2026-08-01T00:00:00.000Z',
  period_end: '2026-09-01T00:00:00.000Z',
  version: 7,
  effective_at: NOW,
  updated_at: NOW,
};

const subscription = {
  account_id: ACCOUNT_ID,
  plan_code: 'scale',
  billing_interval: 'monthly',
  status: 'past_due',
  catalog_version: '2026-08-15-preview',
  platform_fee_bps: 10,
  current_period_start: '2026-08-01T00:00:00.000Z',
  current_period_end: '2026-09-01T00:00:00.000Z',
  cancel_at_period_end: true,
  cancel_at: null,
  canceled_at: null,
  ended_at: null,
  updated_at: NOW,
};

describe('admin canonical plan authority', () => {
  it.each([
    ['flex', 'Flex'],
    ['solo', 'Solo'],
    ['growth', 'Growth'],
    ['scale', 'Scale'],
    ['enterprise', 'Enterprise'],
  ] as const)('renders canonical %s as %s', (planCode, planName) => {
    const result = normalizeAdminEntitlementSnapshot({
      ...entitlement,
      plan_code: planCode,
      billing_interval: planCode === 'flex' ? 'none' : 'monthly',
      billing_status: planCode === 'flex' ? 'free' : 'active',
      period_start: planCode === 'flex' ? null : entitlement.period_start,
      period_end: planCode === 'flex' ? null : entitlement.period_end,
    }, ACCOUNT_ID);
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') expect(result.snapshot.planName).toBe(planName);
  });

  it('uses the exact entitlement snapshot without recomputing catalog or fee values', () => {
    expect(normalizeAdminEntitlementSnapshot(entitlement, ACCOUNT_ID)).toEqual({
      kind: 'ready',
      snapshot: {
        planCode: 'growth',
        planName: 'Growth',
        billingInterval: 'annual',
        billingStatus: 'active',
        entitlementState: 'active',
        catalogVersion: '2026-08-15-preview',
        platformFeeBps: 25,
        periodStart: '2026-08-01T00:00:00.000Z',
        periodEnd: '2026-09-01T00:00:00.000Z',
        version: 7,
        effectiveAt: NOW,
        updatedAt: NOW,
      },
    });
    expect(formatPlatformFeeBps(25)).toBe('25 bps (0.25%)');
  });

  it('distinguishes a missing snapshot and fails closed on malformed or cross-account rows', () => {
    expect(normalizeAdminEntitlementSnapshot(null, ACCOUNT_ID)).toEqual({ kind: 'missing' });
    expect(normalizeAdminEntitlementSnapshot({ ...entitlement, account_id: 'another-account' }, ACCOUNT_ID))
      .toEqual({ kind: 'unavailable' });
    expect(normalizeAdminEntitlementSnapshot({ ...entitlement, plan_code: 'pro' }, ACCOUNT_ID))
      .toEqual({ kind: 'unavailable' });
    expect(normalizeAdminEntitlementSnapshot({ ...entitlement, platform_fee_bps: 10_001 }, ACCOUNT_ID))
      .toEqual({ kind: 'unavailable' });
    expect(normalizeAdminEntitlementSnapshot({
      ...entitlement,
      plan_code: 'flex',
      billing_interval: 'monthly',
      billing_status: 'active',
    }, ACCOUNT_ID)).toEqual({ kind: 'unavailable' });
  });

  it('reads the latest paid subscription snapshot without provider/customer identifiers', () => {
    expect(normalizeAdminSubscriptionSnapshot(subscription, ACCOUNT_ID)).toEqual({
      kind: 'ready',
      snapshot: {
        planCode: 'scale',
        planName: 'Scale',
        billingInterval: 'monthly',
        status: 'past_due',
        catalogVersion: '2026-08-15-preview',
        platformFeeBps: 10,
        currentPeriodStart: '2026-08-01T00:00:00.000Z',
        currentPeriodEnd: '2026-09-01T00:00:00.000Z',
        cancelAtPeriodEnd: true,
        cancelAt: null,
        canceledAt: null,
        endedAt: null,
        updatedAt: NOW,
      },
    });
    expect(normalizeAdminSubscriptionSnapshot({ ...subscription, plan_code: 'flex' }, ACCOUNT_ID))
      .toEqual({ kind: 'unavailable' });
    expect(normalizeAdminSubscriptionSnapshot(null, ACCOUNT_ID)).toEqual({ kind: 'missing' });
  });
});

describe('admin plan surface guardrails', () => {
  const actions = readFileSync('src/app/admin/accounts/[id]/actions.ts', 'utf8');
  const actionUi = readFileSync('src/app/admin/accounts/[id]/AccountActions.tsx', 'utf8');
  const detailPage = readFileSync('src/app/admin/accounts/[id]/page.tsx', 'utf8');
  const listPage = readFileSync('src/app/admin/accounts/page.tsx', 'utf8');
  const dataLayer = readFileSync('src/lib/admin-accounts.ts', 'utf8');

  it('has no legacy plan mutation or success path', () => {
    expect(actions).not.toContain('changePlanAction');
    expect(actions).not.toMatch(/from\('accounts'\)[\s\S]{0,200}\.update\(\{\s*plan\b/);
    expect(actions).not.toContain('account_change_plan');
    expect(actions).not.toContain('done=plan_changed');
    expect(detailPage).not.toContain("plan_changed: 'Plan updated.'");
  });

  it('offers no free/pro/crew_plus write and explains why grants are disabled', () => {
    expect(actionUi).not.toContain('name="plan"');
    expect(actionUi).not.toContain('<option value="free">');
    expect(actionUi).not.toContain('<option value="pro">');
    expect(actionUi).not.toContain('<option value="crew_plus">');
    expect(actionUi).toContain('Manual paid-plan grants are disabled');
  });

  it('loads canonical snapshots, omits provider PII, and labels legacy values diagnostic-only', () => {
    expect(dataLayer).toContain("from('workspace_entitlements')");
    expect(dataLayer).toContain("from('billing_subscriptions')");
    expect(dataLayer).not.toContain('provider_customer_id');
    expect(dataLayer).not.toContain('provider_subscription_id');
    expect(detailPage).toContain('workspace_entitlements ·');
    expect(detailPage).toContain('billing_subscriptions ·');
    expect(detailPage).toContain('Legacy account plan (migration diagnostic only)');
    expect(detailPage).toContain('No legacy plan has been substituted.');
    expect(listPage).toContain('row.entitlement.snapshot');
    expect(listPage).not.toContain('r.plan');

    const listColumns = dataLayer.match(/const ACCOUNT_LIST_COLUMNS\s*=\s*'([^']+)'/)?.[1] ?? '';
    expect(listColumns.split(',').map((column) => column.trim())).not.toContain('plan');
  });
});
