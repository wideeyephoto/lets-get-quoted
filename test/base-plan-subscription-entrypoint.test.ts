import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  BASE_PLAN_SUBSCRIPTION_CHECKOUT_FLAG,
  basePlanSubscriptionCheckoutEnabled,
  buildBasePlanSubscriptionRedirectUrls,
  executeBasePlanSubscriptionCheckout,
  requireStripeHostedCheckoutUrl,
  type BasePlanSubscriptionEntrypointDependencies,
} from '@/lib/billing/base-plan-subscription-entrypoint';
import {
  BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
  BASE_PLAN_RECURRING_CONSENT_VERSION,
} from '@/lib/billing/subscription-consent';
import {
  SubscriptionCheckoutIndeterminateError,
  SubscriptionCheckoutUnavailableError,
} from '@/lib/billing/subscription-checkout-operation';

const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '20000000-0000-4000-8000-000000000002';
const ACCEPTANCE_ID = '30000000-0000-4000-8000-000000000003';
const OPERATION_ID = 'base-plan-subscription:40000000-0000-4000-8000-000000000004';
const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_subscription123#fidkdWxOYHwnPyd1blpxYHZxWjA0';

function form(overrides: Record<string, string> = {}): FormData {
  const values = {
    operationId: OPERATION_ID,
    planCode: 'growth',
    billingInterval: 'annual',
    recurringConsentAccepted: 'yes',
    recurringConsentVersion: BASE_PLAN_RECURRING_CONSENT_VERSION,
    recurringConsentTextSha256: BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
    ...overrides,
  };
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function mocks(overrides: Partial<BasePlanSubscriptionEntrypointDependencies> = {}) {
  const order: string[] = [];
  const requireOwner = vi.fn(async () => {
    order.push('owner');
    return {
      supabase: {} as never,
      accountId: WORKSPACE_ID,
      userId: USER_ID,
      userEmail: 'owner@example.com',
      accountTimeZone: 'America/New_York',
    };
  });
  const allowAttempt = vi.fn(async () => {
    order.push('rate-limit');
    return true;
  });
  const loadEligibility = vi.fn(async () => {
    order.push('eligibility');
    return 'eligible' as const;
  });
  const loadExistingBinding = vi.fn(async () => {
    order.push('existing-binding');
    return { status: 'none' as const };
  });
  const recordConsent = vi.fn(async () => {
    order.push('consent');
    return { acceptanceId: ACCEPTANCE_ID };
  });
  const orchestrate = vi.fn<BasePlanSubscriptionEntrypointDependencies['orchestrate']>(async () => {
    order.push('stripe');
    return { session: { url: CHECKOUT_URL } };
  });
  const dependencies = {
    requireOwner,
    allowAttempt,
    loadEligibility,
    loadExistingBinding,
    recordConsent,
    orchestrate,
    ...overrides,
  } as BasePlanSubscriptionEntrypointDependencies;
  return {
    order,
    dependencies,
    requireOwner,
    allowAttempt,
    loadEligibility,
    loadExistingBinding,
    recordConsent,
    orchestrate,
  };
}

const ENABLED_TEST_ENV = {
  [BASE_PLAN_SUBSCRIPTION_CHECKOUT_FLAG]: '1',
  LGQ_STRIPE_BILLING_LIVEMODE: '0',
} as const;

describe('disabled first-subscription Checkout entrypoint', () => {
  it('defaults off and returns before auth, rate limiting, consent, database, or Stripe', async () => {
    const mock = mocks();

    await expect(executeBasePlanSubscriptionCheckout(form(), mock.dependencies, {})).resolves.toEqual({
      ok: false,
      code: 'disabled',
      message: 'Plan checkout is not available yet. Nothing was charged.',
    });

    expect(basePlanSubscriptionCheckoutEnabled({})).toBe(false);
    expect(basePlanSubscriptionCheckoutEnabled({ [BASE_PLAN_SUBSCRIPTION_CHECKOUT_FLAG]: 'true' })).toBe(false);
    expect(mock.requireOwner).not.toHaveBeenCalled();
    expect(mock.allowAttempt).not.toHaveBeenCalled();
    expect(mock.loadEligibility).not.toHaveBeenCalled();
    expect(mock.loadExistingBinding).not.toHaveBeenCalled();
    expect(mock.recordConsent).not.toHaveBeenCalled();
    expect(mock.orchestrate).not.toHaveBeenCalled();
  });

  it('rejects a missing or drifted rendered consent artifact before auth', async () => {
    for (const badForm of [
      form({ recurringConsentAccepted: 'no' }),
      form({ recurringConsentVersion: 'old-artifact' }),
      form({ recurringConsentTextSha256: '0'.repeat(64) }),
    ]) {
      const mock = mocks();
      await expect(executeBasePlanSubscriptionCheckout(
        badForm,
        mock.dependencies,
        ENABLED_TEST_ENV,
      )).resolves.toMatchObject({ ok: false, code: 'consent_required' });
      expect(mock.requireOwner).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['flex', 'monthly'],
    ['enterprise', 'monthly'],
    ['growth', 'weekly'],
    ['growth', ''],
  ])('rejects non-canonical plan/interval %s/%s before auth', async (planCode, billingInterval) => {
    const mock = mocks();
    const result = await executeBasePlanSubscriptionCheckout(
      form({ planCode, billingInterval }),
      mock.dependencies,
      ENABLED_TEST_ENV,
    );
    expect(result).toMatchObject({ ok: false, code: 'invalid_request' });
    expect(mock.requireOwner).not.toHaveBeenCalled();
  });
});

describe('enabled first-subscription Checkout entrypoint', () => {
  it('derives workspace from owner auth and passes only canonical selection plus server bindings', async () => {
    const mock = mocks();
    const result = await executeBasePlanSubscriptionCheckout(
      form({ untrustedWorkspaceId: 'attacker-workspace', priceId: 'price_attacker', amount: '1' }),
      mock.dependencies,
      ENABLED_TEST_ENV,
    );

    expect(result).toEqual({
      ok: true,
      code: 'checkout_ready',
      message: 'Your secure Stripe checkout is ready.',
      checkoutUrl: CHECKOUT_URL,
    });
    expect(mock.order).toEqual([
      'owner',
      'rate-limit',
      'eligibility',
      'existing-binding',
      'consent',
      'stripe',
    ]);
    expect(mock.allowAttempt).toHaveBeenCalledWith(expect.objectContaining({
      accountId: WORKSPACE_ID,
      userId: USER_ID,
    }));
    expect(mock.recordConsent).toHaveBeenCalledWith(expect.objectContaining({
      accountId: WORKSPACE_ID,
      userId: USER_ID,
    }), {
      operationId: OPERATION_ID,
      planCode: 'growth',
      billingInterval: 'annual',
      accepted: true,
    });
    const orchestrationInput = mock.orchestrate.mock.calls[0]?.[0];
    expect(orchestrationInput).toMatchObject({
      workspaceId: WORKSPACE_ID,
      operationId: OPERATION_ID,
      planCode: 'growth',
      billingInterval: 'annual',
      livemode: false,
      recurringConsentAcceptanceId: ACCEPTANCE_ID,
    });
    expect(orchestrationInput?.successUrl).toBe(
      'http://localhost:3010/dashboard/settings?subscription_checkout=success#plan',
    );
    expect(orchestrationInput?.cancelUrl).toBe(
      'http://localhost:3010/dashboard/settings?subscription_checkout=canceled#plan',
    );
    expect(orchestrationInput).not.toHaveProperty('priceId');
    expect(orchestrationInput).not.toHaveProperty('amount');
  });

  it('fails closed at the rate limiter before eligibility, consent, or Stripe', async () => {
    const mock = mocks({ allowAttempt: vi.fn().mockResolvedValue(false) });
    const result = await executeBasePlanSubscriptionCheckout(form(), mock.dependencies, ENABLED_TEST_ENV);
    expect(result).toMatchObject({ ok: false, code: 'rate_limited' });
    expect(mock.loadEligibility).not.toHaveBeenCalled();
    expect(mock.recordConsent).not.toHaveBeenCalled();
    expect(mock.orchestrate).not.toHaveBeenCalled();
  });

  it('reuses the original single-use consent binding when the stable operation is replayed', async () => {
    const mock = mocks({
      loadExistingBinding: vi.fn(async () => {
        mock.order.push('existing-binding');
        return { status: 'exact', acceptanceId: ACCEPTANCE_ID } as const;
      }),
    });
    const result = await executeBasePlanSubscriptionCheckout(form(), mock.dependencies, ENABLED_TEST_ENV);

    expect(result).toMatchObject({ ok: true, code: 'checkout_ready', checkoutUrl: CHECKOUT_URL });
    expect(mock.recordConsent).not.toHaveBeenCalled();
    expect(mock.orchestrate).toHaveBeenCalledWith(expect.objectContaining({
      operationId: OPERATION_ID,
      recurringConsentAcceptanceId: ACCEPTANCE_ID,
    }));
  });

  it('fails closed when the operation ID is already bound to different immutable input', async () => {
    const mock = mocks({
      loadExistingBinding: vi.fn().mockResolvedValue({ status: 'conflict' }),
    });
    const result = await executeBasePlanSubscriptionCheckout(form(), mock.dependencies, ENABLED_TEST_ENV);

    expect(result).toMatchObject({ ok: false, code: 'request_expired' });
    expect(mock.recordConsent).not.toHaveBeenCalled();
    expect(mock.orchestrate).not.toHaveBeenCalled();
  });

  it('allows only an exact active free Flex entitlement before consent', async () => {
    const mock = mocks({ loadEligibility: vi.fn().mockResolvedValue('not_eligible') });
    const result = await executeBasePlanSubscriptionCheckout(form(), mock.dependencies, ENABLED_TEST_ENV);
    expect(result).toMatchObject({ ok: false, code: 'not_eligible' });
    expect(mock.recordConsent).not.toHaveBeenCalled();
    expect(mock.orchestrate).not.toHaveBeenCalled();
  });

  it('validates the server billing mode before recording consent', async () => {
    const mock = mocks();
    const result = await executeBasePlanSubscriptionCheckout(
      form(),
      mock.dependencies,
      { [BASE_PLAN_SUBSCRIPTION_CHECKOUT_FLAG]: '1' },
    );
    expect(result).toMatchObject({ ok: false, code: 'configuration_unavailable' });
    expect(mock.recordConsent).not.toHaveBeenCalled();
    expect(mock.orchestrate).not.toHaveBeenCalled();
  });

  it('reports ambiguous and existing operation states without a second provider attempt', async () => {
    const indeterminate = mocks({
      orchestrate: vi.fn().mockRejectedValue(new SubscriptionCheckoutIndeterminateError(new Error('timeout'))),
    });
    await expect(executeBasePlanSubscriptionCheckout(
      form(),
      indeterminate.dependencies,
      ENABLED_TEST_ENV,
    )).resolves.toMatchObject({ ok: false, code: 'checkout_review_required' });

    const submitted = mocks({
      orchestrate: vi.fn().mockRejectedValue(new SubscriptionCheckoutUnavailableError('submitted', 'submitted')),
    });
    await expect(executeBasePlanSubscriptionCheckout(
      form(),
      submitted.dependencies,
      ENABLED_TEST_ENV,
    )).resolves.toMatchObject({ ok: false, code: 'checkout_in_progress' });
  });

  it('does not expose a non-Stripe or malformed hosted URL', async () => {
    for (const url of ['https://evil.example/c/pay/test', 'http://checkout.stripe.com/c/pay/test', null]) {
      const mock = mocks({ orchestrate: vi.fn().mockResolvedValue({ session: { url } }) });
      const result = await executeBasePlanSubscriptionCheckout(form(), mock.dependencies, ENABLED_TEST_ENV);
      expect(result).toMatchObject({ ok: false, code: 'temporarily_unavailable' });
      expect(result).not.toHaveProperty('checkoutUrl');
    }
  });
});

describe('Checkout URL and operation contracts', () => {
  it('builds only fixed same-origin return paths and rejects unsafe configured origins', () => {
    expect(buildBasePlanSubscriptionRedirectUrls('https://letsgetquoted.com')).toEqual({
      successUrl: 'https://letsgetquoted.com/dashboard/settings?subscription_checkout=success#plan',
      cancelUrl: 'https://letsgetquoted.com/dashboard/settings?subscription_checkout=canceled#plan',
    });
    expect(() => buildBasePlanSubscriptionRedirectUrls('http://letsgetquoted.com')).toThrow(/origin is invalid/i);
    expect(() => buildBasePlanSubscriptionRedirectUrls('https://user:pass@letsgetquoted.com')).toThrow(/origin is invalid/i);
    expect(() => buildBasePlanSubscriptionRedirectUrls('https://letsgetquoted.com/a-path')).toThrow(/origin is invalid/i);
  });

  it('accepts only an HTTPS checkout.stripe.com hosted URL', () => {
    expect(requireStripeHostedCheckoutUrl(CHECKOUT_URL)).toBe(CHECKOUT_URL);
    expect(() => requireStripeHostedCheckoutUrl('https://evil.example/c/pay/test')).toThrow(/hosted URL/i);
    expect(() => requireStripeHostedCheckoutUrl('https://user:pass@checkout.stripe.com/c/pay/test')).toThrow(/hosted URL/i);
  });
});

describe('dark Account -> Plan UI wiring', () => {
  it('renders only behind the server flag for an exact eligible Flex snapshot', () => {
    const page = readFileSync(
      new URL('../src/app/dashboard/settings/page.tsx', import.meta.url),
      'utf8',
    );
    const planUsage = readFileSync(
      new URL('../src/app/dashboard/settings/PlanUsageSection.tsx', import.meta.url),
      'utf8',
    );
    expect(page).toContain('const subscriptionCheckoutEnabled = basePlanSubscriptionCheckoutEnabled();');
    expect(page).toMatch(/subscriptionCheckoutEnabled[\s\S]{0,500}planCode === 'flex'[\s\S]{0,300}billingStatus === 'free'/);
    expect(planUsage).toMatch(/canStartFirstSubscription && showSubscriptionCheckout/);
  });

  it('renders the canonical artifact and accepts no workspace, amount, or Price ID field', () => {
    const component = readFileSync(
      new URL('../src/app/dashboard/settings/BasePlanSubscriptionCheckout.tsx', import.meta.url),
      'utf8',
    );
    expect(component).toContain('BASE_PLAN_RECURRING_CONSENT_TEXT.split');
    expect(component).toContain('name="recurringConsentAccepted"');
    expect(component).toContain('name="recurringConsentVersion"');
    expect(component).toContain('name="recurringConsentTextSha256"');
    expect(component).toContain('globalThis.crypto.randomUUID()');
    expect(component).toContain('setConsentAccepted(false)');
    expect(component).not.toMatch(/name="(?:workspaceId|accountId|priceId|amount|amountCents)"/);
  });
});
