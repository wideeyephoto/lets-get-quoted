import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  STRIPE_MERCHANT_ONBOARDING_V2_FLAG,
  buildMerchantOnboardingFeedbackPath,
  buildMerchantOnboardingRedirectUrls,
  executeMerchantOnboardingReturn,
  executeMerchantOnboardingStart,
  requireStripeHostedOnboardingUrl,
  stripeMerchantOnboardingV2Enabled,
  type MerchantOnboardingEntrypointDependencies,
  type MerchantOnboardingSurface,
} from '@/lib/billing/merchant-onboarding-entrypoint';
import {
  MerchantProvisioningIndeterminateError,
  MerchantProvisioningPersistenceError,
  MerchantProvisioningUnavailableError,
  MerchantReadinessStaleWriteError,
  type MerchantReadinessEvidence,
} from '@/lib/billing/stripe-merchant';

const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '20000000-0000-4000-8000-000000000002';
const MERCHANT_ACCOUNT_ID = 'acct_merchant123456';
const ONBOARDING_URL = 'https://connect.stripe.com/setup/c/acct_merchant123456/session_123';
const APP_ORIGIN = 'https://letsgetquoted.com';
const ENABLED_ENV = { [STRIPE_MERCHANT_ONBOARDING_V2_FLAG]: '1' } as const;

function evidence(state: 'pending' | 'restricted' | 'ready' | 'disabled'): MerchantReadinessEvidence {
  return { onboardingState: state } as MerchantReadinessEvidence;
}

function surface(status: MerchantOnboardingSurface['status']): MerchantOnboardingSurface {
  return Object.freeze({
    status,
    checkedAt: status === 'not_started' || status === 'unavailable' ? null : '2026-08-16T07:00:00.000Z',
    contractorLiabilityVerified: status === 'ready',
  });
}

function mocks(overrides: Partial<MerchantOnboardingEntrypointDependencies> = {}) {
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
  const allowAttempt = vi.fn(async (_owner, purpose: 'onboarding' | 'readiness') => {
    order.push(`rate:${purpose}`);
    return true;
  });
  const loadProfile = vi.fn(async () => {
    order.push('profile');
    return {
      workspaceId: WORKSPACE_ID,
      businessName: 'Brett Builds',
      merchantAccountId: null,
    };
  });
  const loadSurface = vi.fn(async () => {
    order.push('surface');
    return surface('pending');
  });
  const provision = vi.fn(async () => {
    order.push('provision');
    return { accountId: MERCHANT_ACCOUNT_ID };
  });
  const createOnboardingLink = vi.fn(async () => {
    order.push('link');
    return ONBOARDING_URL;
  });
  const verifyReadiness = vi.fn(async () => {
    order.push('verify');
    return evidence('ready');
  });

  const dependencies = {
    requireOwner,
    allowAttempt,
    loadProfile,
    loadSurface,
    provision,
    createOnboardingLink,
    verifyReadiness,
    ...overrides,
  } as MerchantOnboardingEntrypointDependencies;

  return {
    order,
    dependencies,
    requireOwner,
    allowAttempt,
    loadProfile,
    loadSurface,
    provision,
    createOnboardingLink,
    verifyReadiness,
  };
}

describe('dark Stripe Merchant onboarding entrypoint', () => {
  it('defaults off and stops before auth, database, rate limiting, or Stripe', async () => {
    const mock = mocks();

    await expect(executeMerchantOnboardingStart(mock.dependencies, {}, APP_ORIGIN)).resolves.toEqual({
      ok: false,
      code: 'rollout_disabled',
      message: 'Stripe Merchant setup is not available yet.',
    });

    expect(stripeMerchantOnboardingV2Enabled({})).toBe(false);
    expect(stripeMerchantOnboardingV2Enabled({ [STRIPE_MERCHANT_ONBOARDING_V2_FLAG]: 'true' })).toBe(false);
    expect(stripeMerchantOnboardingV2Enabled(ENABLED_ENV)).toBe(true);
    expect(mock.requireOwner).not.toHaveBeenCalled();
    expect(mock.allowAttempt).not.toHaveBeenCalled();
    expect(mock.loadProfile).not.toHaveBeenCalled();
    expect(mock.provision).not.toHaveBeenCalled();
    expect(mock.createOnboardingLink).not.toHaveBeenCalled();
  });

  it('derives the workspace and contact email only from owner auth, then uses fixed return URLs', async () => {
    const mock = mocks();
    const result = await executeMerchantOnboardingStart(mock.dependencies, ENABLED_ENV, APP_ORIGIN);

    expect(result).toEqual({
      ok: true,
      code: 'onboarding_ready',
      message: 'Your secure Stripe onboarding link is ready.',
      onboardingUrl: ONBOARDING_URL,
    });
    expect(mock.order).toEqual(['owner', 'rate:onboarding', 'profile', 'provision', 'link']);
    expect(mock.loadProfile).toHaveBeenCalledWith(expect.objectContaining({ accountId: WORKSPACE_ID }));
    expect(mock.provision).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      businessName: 'Brett Builds',
      contactEmail: 'owner@example.com',
    });
    expect(mock.createOnboardingLink).toHaveBeenCalledWith({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      returnUrl: 'https://letsgetquoted.com/dashboard/stripe-merchant/return',
      refreshUrl: 'https://letsgetquoted.com/dashboard/stripe-merchant/refresh',
    });
  });

  it('resumes the exact existing Merchant account without provisioning another account', async () => {
    const mock = mocks({
      loadProfile: vi.fn().mockResolvedValue({
        workspaceId: WORKSPACE_ID,
        businessName: 'Brett Builds',
        merchantAccountId: MERCHANT_ACCOUNT_ID,
      }),
    });
    const result = await executeMerchantOnboardingStart(mock.dependencies, ENABLED_ENV, APP_ORIGIN);

    expect(result).toMatchObject({ ok: true, onboardingUrl: ONBOARDING_URL });
    expect(mock.provision).not.toHaveBeenCalled();
    expect(mock.createOnboardingLink).toHaveBeenCalledWith(expect.objectContaining({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
    }));
  });

  it('fails closed at the limiter and requires email only when creating a new Merchant', async () => {
    const limited = mocks({ allowAttempt: vi.fn().mockResolvedValue(false) });
    await expect(executeMerchantOnboardingStart(
      limited.dependencies,
      ENABLED_ENV,
      APP_ORIGIN,
    )).resolves.toMatchObject({ ok: false, code: 'rate_limited' });
    expect(limited.loadProfile).not.toHaveBeenCalled();

    const noEmail = mocks({
      requireOwner: vi.fn().mockResolvedValue({
        supabase: {},
        accountId: WORKSPACE_ID,
        userId: USER_ID,
        userEmail: null,
        accountTimeZone: 'America/New_York',
      }),
    });
    await expect(executeMerchantOnboardingStart(
      noEmail.dependencies,
      ENABLED_ENV,
      APP_ORIGIN,
    )).resolves.toMatchObject({ ok: false, code: 'profile_incomplete' });
    expect(noEmail.loadProfile).toHaveBeenCalled();
    expect(noEmail.provision).not.toHaveBeenCalled();

    const resumeWithoutEmail = mocks({
      requireOwner: noEmail.dependencies.requireOwner,
      loadProfile: vi.fn().mockResolvedValue({
        workspaceId: WORKSPACE_ID,
        businessName: 'Brett Builds',
        merchantAccountId: MERCHANT_ACCOUNT_ID,
      }),
    });
    await expect(executeMerchantOnboardingStart(
      resumeWithoutEmail.dependencies,
      ENABLED_ENV,
      APP_ORIGIN,
    )).resolves.toMatchObject({ ok: true, onboardingUrl: ONBOARDING_URL });
    expect(resumeWithoutEmail.provision).not.toHaveBeenCalled();
  });

  it('never retries ambiguous provisioning outcomes or creates an onboarding link for them', async () => {
    const cases: Array<[unknown, string]> = [
      [new MerchantProvisioningUnavailableError('submitted'), 'setup_review_required'],
      [new MerchantProvisioningUnavailableError('claimed'), 'setup_in_progress'],
      [new MerchantProvisioningIndeterminateError('ambiguous', new Error('timeout')), 'setup_review_required'],
      [new MerchantProvisioningPersistenceError(new Error('lost commit response')), 'setup_review_required'],
    ];

    for (const [error, code] of cases) {
      const mock = mocks({ provision: vi.fn().mockRejectedValue(error) });
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await expect(executeMerchantOnboardingStart(
        mock.dependencies,
        ENABLED_ENV,
        APP_ORIGIN,
      )).resolves.toMatchObject({ ok: false, code });
      expect(mock.createOnboardingLink).not.toHaveBeenCalled();
      consoleError.mockRestore();
    }
  });

  it('does not expose a malformed or non-Stripe onboarding URL', async () => {
    for (const url of [
      'https://evil.example/setup/account',
      'http://connect.stripe.com/setup/account',
      'https://user:pass@connect.stripe.com/setup/account',
      null,
    ]) {
      const mock = mocks({ createOnboardingLink: vi.fn().mockResolvedValue(url) });
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const result = await executeMerchantOnboardingStart(mock.dependencies, ENABLED_ENV, APP_ORIGIN);
      expect(result).toMatchObject({ ok: false, code: 'temporarily_unavailable' });
      expect(result).not.toHaveProperty('onboardingUrl');
      consoleError.mockRestore();
    }
  });
});

describe('Stripe Merchant return and refresh contracts', () => {
  it('checks the exact gate before auth or readiness work on return', async () => {
    const mock = mocks();
    await expect(executeMerchantOnboardingReturn(mock.dependencies, {})).resolves.toMatchObject({
      ok: false,
      code: 'rollout_disabled',
    });
    expect(mock.requireOwner).not.toHaveBeenCalled();
    expect(mock.verifyReadiness).not.toHaveBeenCalled();
  });

  it('verifies and persists readiness for the authenticated workspace only', async () => {
    const verifyReadiness = vi.fn().mockResolvedValue(evidence('restricted'));
    const mock = mocks({ verifyReadiness });
    const result = await executeMerchantOnboardingReturn(mock.dependencies, ENABLED_ENV);

    expect(result).toEqual({
      ok: true,
      code: 'merchant_restricted',
      message: 'Stripe setup was saved. The current verification status is shown below.',
    });
    expect(mock.allowAttempt).toHaveBeenCalledWith(expect.objectContaining({
      accountId: WORKSPACE_ID,
      userId: USER_ID,
    }), 'readiness');
    expect(verifyReadiness).toHaveBeenCalledWith(WORKSPACE_ID);
  });

  it('uses newer persisted evidence when two return requests race', async () => {
    const loadSurface = vi.fn().mockResolvedValue(surface('ready'));
    const mock = mocks({
      verifyReadiness: vi.fn().mockRejectedValue(
        new MerchantReadinessStaleWriteError('2026-08-16T07:00:00.000Z'),
      ),
      loadSurface,
    });
    await expect(executeMerchantOnboardingReturn(mock.dependencies, ENABLED_ENV)).resolves.toMatchObject({
      ok: true,
      code: 'merchant_ready',
    });
    expect(loadSurface).toHaveBeenCalledWith(expect.objectContaining({ accountId: WORKSPACE_ID }));
  });

  it('builds only fixed HTTPS return paths and safe settings feedback paths', () => {
    expect(buildMerchantOnboardingRedirectUrls(APP_ORIGIN)).toEqual({
      returnUrl: 'https://letsgetquoted.com/dashboard/stripe-merchant/return',
      refreshUrl: 'https://letsgetquoted.com/dashboard/stripe-merchant/refresh',
    });
    expect(() => buildMerchantOnboardingRedirectUrls('http://letsgetquoted.com')).toThrow(/origin is invalid/i);
    expect(() => buildMerchantOnboardingRedirectUrls('https://user:pass@letsgetquoted.com')).toThrow(/origin is invalid/i);
    expect(() => buildMerchantOnboardingRedirectUrls('https://letsgetquoted.com/path')).toThrow(/origin is invalid/i);
    expect(buildMerchantOnboardingFeedbackPath('merchant_ready')).toBe(
      '/dashboard/settings?merchant_onboarding=merchant_ready#merchant-payments',
    );
  });

  it('accepts only HTTPS connect.stripe.com hosted links', () => {
    expect(requireStripeHostedOnboardingUrl(ONBOARDING_URL)).toBe(ONBOARDING_URL);
    expect(() => requireStripeHostedOnboardingUrl('https://connect.stripe.com/')).toThrow(/hosted URL/i);
    expect(() => requireStripeHostedOnboardingUrl('https://connect.stripe.com.evil.example/setup/x')).toThrow(/hosted URL/i);
  });
});

describe('dark dashboard wiring', () => {
  it('loads and renders the Merchant surface only behind its independent exact gate', () => {
    const page = readFileSync(new URL('../src/app/dashboard/settings/page.tsx', import.meta.url), 'utf8');
    expect(page).toContain('const merchantOnboardingEnabled = stripeMerchantOnboardingV2Enabled();');
    expect(page).toContain('merchantOnboardingEnabled\n        ? loadMerchantOnboardingSurfaceForOwner({ accountId })');
    expect(page).toMatch(/merchantOnboardingEnabled && merchantOnboarding[\s\S]{0,200}<MerchantOnboardingSection/);
    expect(page).toContain('<PayoutAccount');
  });

  it('accepts no workspace, account, Price, or amount field and imports no legacy Recipient helper', () => {
    const files = [
      'src/lib/billing/merchant-onboarding-entrypoint.ts',
      'src/app/dashboard/settings/merchant-actions.ts',
      'src/app/dashboard/settings/MerchantOnboardingSection.tsx',
      'src/app/dashboard/stripe-merchant/return/page.tsx',
      'src/app/dashboard/stripe-merchant/refresh/page.tsx',
    ].map((path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')).join('\n');

    expect(files).not.toMatch(/name="(?:workspaceId|accountId|priceId|amount|amountCents)"/);
    expect(files).not.toContain("@/lib/stripe-connect");
    expect(files).not.toContain('createOrGetRecipientAccount');
    expect(files).not.toContain('stripe_connect_id');
    expect(files).toContain('executeMerchantOnboardingReturn');
    expect(files).toContain('executeMerchantOnboardingStart');
  });
});
