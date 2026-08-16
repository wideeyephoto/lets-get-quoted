import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireOwnerContext: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireOwnerContext: mocks.requireOwnerContext,
}));

import { PRICING_CATALOG_VERSION } from '@/lib/billing/catalog';
import {
  recordAuthenticatedBasePlanSubscriptionConsent,
  recordBasePlanSubscriptionConsentForOwner,
} from '@/lib/billing/subscription-consent-acceptance';
import {
  BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
  BASE_PLAN_RECURRING_CONSENT_VERSION,
} from '@/lib/billing/subscription-consent';
import { TERMS_VERSION } from '@/lib/terms';

const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '20000000-0000-4000-8000-000000000002';
const ACCEPTANCE_ID = '30000000-0000-4000-8000-000000000003';
const OPERATION_ID = `workspace:${WORKSPACE_ID}:solo:annual:first`;
const ACCEPTED_AT = '2026-08-16T05:45:00.000Z';
const EXPIRES_AT = '2026-08-16T06:15:00.000Z';

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    acceptance_id: ACCEPTANCE_ID,
    account_id: WORKSPACE_ID,
    operation_id: OPERATION_ID,
    accepted_by: USER_ID,
    accepted_at: ACCEPTED_AT,
    expires_at: EXPIRES_AT,
    plan_code: 'solo',
    billing_interval: 'annual',
    catalog_version: PRICING_CATALOG_VERSION,
    unit_amount_cents: 42_000,
    currency: 'usd',
    terms_version: TERMS_VERSION,
    recurring_consent_version: BASE_PLAN_RECURRING_CONSENT_VERSION,
    recurring_consent_text_sha256: BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOwnerContext.mockResolvedValue({
    supabase: { rpc: mocks.rpc },
    accountId: WORKSPACE_ID,
    userId: USER_ID,
  });
  mocks.rpc.mockResolvedValue({ data: [evidence()], error: null });
});

describe('authenticated base-plan recurring consent capture', () => {
  it('takes actor/workspace from auth and sends only canonical immutable bindings', async () => {
    const result = await recordAuthenticatedBasePlanSubscriptionConsent({
      operationId: OPERATION_ID,
      planCode: 'solo',
      billingInterval: 'annual',
      accepted: true,
    });

    expect(mocks.requireOwnerContext).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('record_base_plan_recurring_consent', {
      p_account_id: WORKSPACE_ID,
      p_operation_id: OPERATION_ID,
      p_plan_code: 'solo',
      p_billing_interval: 'annual',
      p_catalog_version: PRICING_CATALOG_VERSION,
      p_unit_amount_cents: 42_000,
      p_currency: 'usd',
      p_terms_version: TERMS_VERSION,
      p_recurring_consent_version: BASE_PLAN_RECURRING_CONSENT_VERSION,
      p_recurring_consent_text_sha256: BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
    });
    expect(result).toEqual({
      acceptanceId: ACCEPTANCE_ID,
      workspaceId: WORKSPACE_ID,
      operationId: OPERATION_ID,
      acceptedBy: USER_ID,
      acceptedAt: ACCEPTED_AT,
      expiresAt: EXPIRES_AT,
      planCode: 'solo',
      billingInterval: 'annual',
      catalogVersion: PRICING_CATALOG_VERSION,
      unitAmountCents: 42_000,
      currency: 'usd',
      termsVersion: TERMS_VERSION,
      recurringConsentVersion: BASE_PLAN_RECURRING_CONSENT_VERSION,
      recurringConsentTextSha256: BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('requires affirmative assent before resolving an authenticated owner', async () => {
    await expect(recordAuthenticatedBasePlanSubscriptionConsent({
      operationId: OPERATION_ID,
      planCode: 'solo',
      billingInterval: 'annual',
      accepted: false,
    })).rejects.toThrow(/affirmatively accepted/i);
    expect(mocks.requireOwnerContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('reuses a surrounding server action owner context without resolving auth twice', async () => {
    const result = await recordBasePlanSubscriptionConsentForOwner({
      supabase: { rpc: mocks.rpc } as never,
      accountId: WORKSPACE_ID,
      userId: USER_ID,
    }, {
      operationId: OPERATION_ID,
      planCode: 'solo',
      billingInterval: 'annual',
      accepted: true,
    });

    expect(result.acceptanceId).toBe(ACCEPTANCE_ID);
    expect(mocks.requireOwnerContext).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['authenticated actor', { accepted_by: '40000000-0000-4000-8000-000000000004' }],
    ['workspace', { account_id: '40000000-0000-4000-8000-000000000004' }],
    ['operation ID', { operation_id: `${OPERATION_ID}:changed` }],
    ['plan', { plan_code: 'growth' }],
    ['billing interval', { billing_interval: 'monthly' }],
    ['amount', { unit_amount_cents: 1 }],
    ['artifact hash', { recurring_consent_text_sha256: '0'.repeat(64) }],
    ['acceptance ID', { acceptance_id: 'not-a-uuid' }],
  ])('rejects a database response with drifted %s', async (_label, override) => {
    mocks.rpc.mockResolvedValue({ data: [evidence(override)], error: null });
    await expect(recordAuthenticatedBasePlanSubscriptionConsent({
      operationId: OPERATION_ID,
      planCode: 'solo',
      billingInterval: 'annual',
      accepted: true,
    })).rejects.toThrow(/recurring subscription consent/i);
  });
});
