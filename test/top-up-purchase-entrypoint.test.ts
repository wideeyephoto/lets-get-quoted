import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SELLABLE_TOP_UP_IDS, TOP_UPS, TOP_UPS_WITHHELD } from '@/lib/billing/catalog';
import { TopUpPurchaseError } from '@/lib/billing/top-up-purchase';
import {
  TopUpPurchaseCheckoutIndeterminateError,
  TopUpPurchaseCheckoutPersistenceError,
  TopUpPurchaseCheckoutUnavailableError,
} from '@/lib/billing/top-up-purchase-checkout';
import {
  TOP_UP_PURCHASE_FLAG,
  buildTopUpPurchaseRedirectUrls,
  executeTopUpPurchaseCheckout,
  requestOriginFromHeaders,
  requireStripeHostedCheckoutUrl,
  topUpPurchaseEnabled,
  type TopUpPurchaseEntrypointDependencies,
} from '@/lib/billing/top-up-purchase-entrypoint';

const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '20000000-0000-4000-8000-000000000002';
const OPERATION_ID = 'top-up-purchase:40000000-0000-4000-8000-000000000004';
const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_topUp123#fidkdWxOYHwnPyd1blpxYHZxWjA0';
const SUCCESS_URL = 'https://app.letsgetquoted.com/dashboard/settings?top_up_checkout=success#buy-credits';
const CANCEL_URL = 'https://app.letsgetquoted.com/dashboard/settings?top_up_checkout=canceled#buy-credits';

const ENABLED_TEST_ENV = {
  [TOP_UP_PURCHASE_FLAG]: '1',
  LGQ_STRIPE_BILLING_LIVEMODE: '0',
} as const;

function form(overrides: Record<string, string> = {}): FormData {
  const values = { operationId: OPERATION_ID, topUpId: 'text_1000', ...overrides };
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function headerBag(values: Record<string, string>): Pick<Headers, 'get'> {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}

function mocks(overrides: Partial<TopUpPurchaseEntrypointDependencies> = {}) {
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
  const allowAttempt = vi.fn(async () => { order.push('rate-limit'); return true; });
  const loadPlan = vi.fn(async () => {
    order.push('plan');
    return { status: 'ready' as const, planCode: 'growth' as const };
  });
  const resolveRedirectUrls = vi.fn(() => {
    order.push('redirects');
    return { successUrl: SUCCESS_URL, cancelUrl: CANCEL_URL };
  });
  const orchestrate = vi.fn<TopUpPurchaseEntrypointDependencies['orchestrate']>(async () => {
    order.push('stripe');
    return { session: { url: CHECKOUT_URL } };
  });
  const dependencies = {
    requireOwner,
    allowAttempt,
    loadPlan,
    resolveRedirectUrls,
    orchestrate,
    ...overrides,
  } as TopUpPurchaseEntrypointDependencies;
  return { order, dependencies, requireOwner, allowAttempt, loadPlan, resolveRedirectUrls, orchestrate };
}

afterEach(() => vi.unstubAllEnvs());

describe('the dark switch', () => {
  it('defaults off and returns before auth, rate limiting, plan reads, or Stripe', async () => {
    const mock = mocks();

    await expect(executeTopUpPurchaseCheckout(form(), mock.dependencies, {})).resolves.toEqual({
      ok: false,
      code: 'disabled',
      message: 'Add-on checkout is not available yet. Nothing was charged.',
    });

    expect(topUpPurchaseEnabled({})).toBe(false);
    expect(topUpPurchaseEnabled({ [TOP_UP_PURCHASE_FLAG]: 'true' })).toBe(false);
    expect(topUpPurchaseEnabled({ [TOP_UP_PURCHASE_FLAG]: '01' })).toBe(false);
    expect(topUpPurchaseEnabled({ [TOP_UP_PURCHASE_FLAG]: '1' })).toBe(true);
    expect(mock.requireOwner).not.toHaveBeenCalled();
    expect(mock.allowAttempt).not.toHaveBeenCalled();
    expect(mock.loadPlan).not.toHaveBeenCalled();
    expect(mock.orchestrate).not.toHaveBeenCalled();
  });

  it('is off in this environment, and the example env ships it off', () => {
    // The whole feature is dark on purpose. A flag flipped in a committed file
    // is how a dark feature stops being dark without anyone deciding to.
    expect(topUpPurchaseEnabled(process.env)).toBe(false);
    const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
    expect(example).toContain(`${TOP_UP_PURCHASE_FLAG}=0`);
    expect(example).not.toContain(`${TOP_UP_PURCHASE_FLAG}=1`);
  });
});

describe('what the boundary accepts', () => {
  it.each([
    ['a missing operation ID', { operationId: '' }],
    ['a subscription operation ID', { operationId: 'base-plan-subscription:40000000-0000-4000-8000-000000000004' }],
    ['a non-UUID operation ID', { operationId: 'top-up-purchase:not-a-uuid' }],
    ['a missing SKU', { topUpId: '' }],
    ['a SKU shaped like an injection', { topUpId: "text_1000' OR '1" }],
  ])('rejects %s before auth', async (_label, override) => {
    const mock = mocks();
    const result = await executeTopUpPurchaseCheckout(form(override), mock.dependencies, ENABLED_TEST_ENV);
    expect(result).toMatchObject({ ok: false, code: 'invalid_request' });
    expect(mock.requireOwner).not.toHaveBeenCalled();
  });

  it('derives the workspace from owner auth and passes no amount or Price ID', async () => {
    const mock = mocks();
    const result = await executeTopUpPurchaseCheckout(
      form({ accountId: 'attacker-workspace', priceId: 'price_attacker', amount: '1' }),
      mock.dependencies,
      ENABLED_TEST_ENV,
    );

    expect(result).toEqual({
      ok: true,
      code: 'checkout_ready',
      message: 'Your secure Stripe checkout is ready.',
      checkoutUrl: CHECKOUT_URL,
    });
    expect(mock.order).toEqual(['owner', 'rate-limit', 'plan', 'redirects', 'stripe']);
    expect(mock.allowAttempt).toHaveBeenCalledWith(expect.objectContaining({
      accountId: WORKSPACE_ID,
      userId: USER_ID,
    }));
    const input = mock.orchestrate.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      workspaceId: WORKSPACE_ID,
      operationId: OPERATION_ID,
      livemode: false,
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
    });
    // The SKU comes from the catalog, not from the request body.
    expect(input?.sku).toBe(TOPUP('text_1000'));
    expect(input).not.toHaveProperty('priceId');
    expect(input).not.toHaveProperty('amount');
    expect(input).not.toHaveProperty('accountId');
  });

  it('fails closed at the rate limiter before the plan read or Stripe', async () => {
    const mock = mocks({ allowAttempt: vi.fn().mockResolvedValue(false) });
    const result = await executeTopUpPurchaseCheckout(form(), mock.dependencies, ENABLED_TEST_ENV);
    expect(result).toMatchObject({ ok: false, code: 'rate_limited' });
    expect(mock.loadPlan).not.toHaveBeenCalled();
    expect(mock.orchestrate).not.toHaveBeenCalled();
  });

  it('fails closed when the rate limiter itself throws', async () => {
    const mock = mocks({ allowAttempt: vi.fn().mockRejectedValue(new Error('down')) });
    await expect(executeTopUpPurchaseCheckout(form(), mock.dependencies, ENABLED_TEST_ENV))
      .resolves.toMatchObject({ ok: false, code: 'rate_limited' });
  });

  it('refuses a workspace whose entitlement is not active, and one it cannot read', async () => {
    const notActive = mocks({ loadPlan: vi.fn().mockResolvedValue({ status: 'not_active' }) });
    await expect(executeTopUpPurchaseCheckout(form(), notActive.dependencies, ENABLED_TEST_ENV))
      .resolves.toMatchObject({ ok: false, code: 'not_eligible' });
    expect(notActive.orchestrate).not.toHaveBeenCalled();

    const unreadable = mocks({ loadPlan: vi.fn().mockRejectedValue(new Error('timeout')) });
    await expect(executeTopUpPurchaseCheckout(form(), unreadable.dependencies, ENABLED_TEST_ENV))
      .resolves.toMatchObject({ ok: false, code: 'temporarily_unavailable' });
    expect(unreadable.orchestrate).not.toHaveBeenCalled();
  });
});

describe('what may actually be sold', () => {
  it.each(Object.keys(TOP_UPS_WITHHELD))('refuses withheld SKU %s even though it has a price', async (topUpId) => {
    // The price book is published; what is withheld is the sale. A stale page
    // offering one of these must not be able to charge for it.
    const mock = mocks();
    const result = await executeTopUpPurchaseCheckout(
      form({ topUpId }),
      mock.dependencies,
      ENABLED_TEST_ENV,
    );
    expect(result).toMatchObject({ ok: false, code: 'not_eligible' });
    expect(mock.orchestrate).not.toHaveBeenCalled();
    expect(TOP_UPS[topUpId as keyof typeof TOP_UPS]).toBeTruthy();
  });

  it('keeps the Flex-only pack away from a paid plan, and sells it to Flex', async () => {
    const paid = mocks();
    await expect(executeTopUpPurchaseCheckout(
      form({ topUpId: 'flex_text_250' }),
      paid.dependencies,
      ENABLED_TEST_ENV,
    )).resolves.toMatchObject({ ok: false, code: 'not_eligible' });
    expect(paid.orchestrate).not.toHaveBeenCalled();

    const flex = mocks({
      loadPlan: vi.fn().mockResolvedValue({ status: 'ready', planCode: 'flex' }),
    });
    await expect(executeTopUpPurchaseCheckout(
      form({ topUpId: 'flex_text_250' }),
      flex.dependencies,
      ENABLED_TEST_ENV,
    )).resolves.toMatchObject({ ok: true, code: 'checkout_ready' });
  });

  it('refuses a SKU that is not in the catalog at all', async () => {
    const mock = mocks();
    await expect(executeTopUpPurchaseCheckout(
      form({ topUpId: 'text_999999' }),
      mock.dependencies,
      ENABLED_TEST_ENV,
    )).resolves.toMatchObject({ ok: false, code: 'invalid_request' });
    expect(mock.orchestrate).not.toHaveBeenCalled();
  });

  it('sells every SKU the catalog says is sellable on this plan', async () => {
    for (const topUpId of SELLABLE_TOP_UP_IDS) {
      const sku = TOP_UPS[topUpId];
      const planCode = sku.eligiblePlans.includes('growth') ? 'growth' : sku.eligiblePlans[0];
      const mock = mocks({ loadPlan: vi.fn().mockResolvedValue({ status: 'ready', planCode }) });
      await expect(executeTopUpPurchaseCheckout(
        form({ topUpId }),
        mock.dependencies,
        ENABLED_TEST_ENV,
      )).resolves.toMatchObject({ ok: true, code: 'checkout_ready' });
    }
  });

  it('reports a Price problem as configuration, not as an ineligible workspace', async () => {
    for (const code of ['price_not_found', 'price_ambiguous', 'price_contract_mismatch'] as const) {
      const mock = mocks({
        orchestrate: vi.fn().mockRejectedValue(new TopUpPurchaseError(code, 'text_1000')),
      });
      await expect(executeTopUpPurchaseCheckout(form(), mock.dependencies, ENABLED_TEST_ENV))
        .resolves.toMatchObject({ ok: false, code: 'configuration_unavailable' });
    }
  });
});

describe('what an in-flight or spent intent is told', () => {
  it.each([
    ['claimed', 'checkout_in_progress'],
    ['submitted', 'checkout_in_progress'],
    ['indeterminate', 'checkout_review_required'],
    ['checkout_created', 'checkout_review_required'],
    ['failed', 'request_expired'],
  ] as const)('maps a %s ledger row to %s', async (operationState, expected) => {
    // This ledger answers only 'claimed' or 'replayed', so the STATE is the only
    // field that says what the earlier attempt became.
    const mock = mocks({
      orchestrate: vi.fn().mockRejectedValue(
        new TopUpPurchaseCheckoutUnavailableError(operationState, 'replayed'),
      ),
    });
    const result = await executeTopUpPurchaseCheckout(form(), mock.dependencies, ENABLED_TEST_ENV);
    expect(result).toMatchObject({ ok: false, code: expected });
    expect(result).not.toHaveProperty('checkoutUrl');
  });

  it('never invites a retry after an ambiguous or unconfirmed submission', async () => {
    for (const error of [
      new TopUpPurchaseCheckoutIndeterminateError(new Error('timeout')),
      new TopUpPurchaseCheckoutPersistenceError(new Error('database unreachable')),
    ]) {
      const mock = mocks({ orchestrate: vi.fn().mockRejectedValue(error) });
      const result = await executeTopUpPurchaseCheckout(form(), mock.dependencies, ENABLED_TEST_ENV);
      expect(result).toMatchObject({ ok: false, code: 'checkout_review_required' });
      expect((result as { message: string }).message).toMatch(/will not submit it twice/i);
    }
  });

  it('reports an unconfigured billing mode without recording anything', async () => {
    const mock = mocks();
    const result = await executeTopUpPurchaseCheckout(
      form(),
      mock.dependencies,
      { [TOP_UP_PURCHASE_FLAG]: '1' },
    );
    expect(result).toMatchObject({ ok: false, code: 'configuration_unavailable' });
    expect(mock.resolveRedirectUrls).not.toHaveBeenCalled();
    expect(mock.orchestrate).not.toHaveBeenCalled();
  });

  it('reports an unusable return origin as configuration, before Stripe', async () => {
    const mock = mocks({
      resolveRedirectUrls: vi.fn(() => { throw new Error('Request origin is invalid.'); }),
    });
    await expect(executeTopUpPurchaseCheckout(form(), mock.dependencies, ENABLED_TEST_ENV))
      .resolves.toMatchObject({ ok: false, code: 'configuration_unavailable' });
    expect(mock.orchestrate).not.toHaveBeenCalled();
  });

  it('does not expose a non-Stripe or malformed hosted URL', async () => {
    for (const url of ['https://evil.example/c/pay/test', 'http://checkout.stripe.com/c/pay/test', null]) {
      const mock = mocks({ orchestrate: vi.fn().mockResolvedValue({ session: { url } }) });
      const result = await executeTopUpPurchaseCheckout(form(), mock.dependencies, ENABLED_TEST_ENV);
      expect(result).toMatchObject({ ok: false, code: 'temporarily_unavailable' });
      expect(result).not.toHaveProperty('checkoutUrl');
    }
    expect(requireStripeHostedCheckoutUrl(CHECKOUT_URL)).toBe(CHECKOUT_URL);
    expect(() => requireStripeHostedCheckoutUrl('https://user:pass@checkout.stripe.com/c/pay/x'))
      .toThrow(/hosted URL/i);
  });
});

describe('the return origin, which is taken from the request', () => {
  // A completed test-mode subscription returned a paying customer to
  // http://localhost:3010 on 2026-08-18, because APP_ORIGIN falls back to
  // localhost whenever NEXT_PUBLIC_APP_URL is unset and Preview leaves it unset.
  // Stripe had already taken the money. One-off payments never had that bug.
  it('uses the forwarded proto and host, not a configured constant', () => {
    expect(requestOriginFromHeaders(headerBag({
      'x-forwarded-proto': 'https',
      host: 'lets-get-quoted-git-golive-followup.vercel.app',
    }))).toBe('https://lets-get-quoted-git-golive-followup.vercel.app');

    // Vercel sends a single value, but a chained proxy may append.
    expect(requestOriginFromHeaders(headerBag({
      'x-forwarded-proto': 'https,http',
      host: 'app.letsgetquoted.com',
    }))).toBe('https://app.letsgetquoted.com');
  });

  it('still allows localhost when nothing is deployed, which is how the app runs locally', () => {
    expect(requestOriginFromHeaders(headerBag({ host: 'localhost:3010' })))
      .toBe('http://localhost:3010');
  });

  it('refuses a localhost origin once the environment is deployed', () => {
    for (const env of ['preview', 'production', 'development']) {
      vi.stubEnv('VERCEL_ENV', env);
      expect(() => requestOriginFromHeaders(headerBag({ host: 'localhost:3010' })))
        .toThrow(/not usable in a deployed environment/i);
      expect(requestOriginFromHeaders(headerBag({
        'x-forwarded-proto': 'https',
        host: 'app.letsgetquoted.com',
      }))).toBe('https://app.letsgetquoted.com');
    }
  });

  it.each([
    ['no host at all', {}],
    ['an empty host', { host: '' }],
    ['a host carrying credentials', { host: 'user:pass@evil.example' }],
    ['a host carrying a path', { host: 'app.letsgetquoted.com/evil' }],
    ['a host carrying a query', { host: 'app.letsgetquoted.com?next=evil' }],
    ['a host with a space', { host: 'app.letsgetquoted.com evil' }],
  ])('refuses %s', (_label, values) => {
    expect(() => requestOriginFromHeaders(headerBag(values as Record<string, string>)))
      .toThrow(/origin is invalid/i);
  });

  it('builds only fixed same-origin return paths', () => {
    expect(buildTopUpPurchaseRedirectUrls('https://app.letsgetquoted.com')).toEqual({
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
    });
  });

  it('takes its origin from headers rather than the constant that caused the bug', () => {
    const source = readFileSync('src/lib/billing/top-up-purchase-entrypoint.ts', 'utf8');
    expect(source).toContain("requestHeaders.get('x-forwarded-proto')");
    expect(source).toContain("requestHeaders.get('host')");
    expect(source).toMatch(/requestOriginFromHeaders\((?:await )?headers\(\)\)/);
    // APP_ORIGIN appears only in the comment explaining why it is not used.
    expect(source).not.toContain('@/lib/app-origin');
    expect(source.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('APP_ORIGIN');
  });
});

describe('the purchase card', () => {
  const component = readFileSync(
    new URL('../src/app/dashboard/settings/TopUpPurchaseCheckout.tsx', import.meta.url),
    'utf8',
  );

  it('derives its list from the catalog, so it cannot offer what the boundary refuses', () => {
    expect(component).toContain('SELLABLE_TOP_UP_IDS');
    expect(component).toContain('eligiblePlans');
    for (const withheld of Object.keys(TOP_UPS_WITHHELD)) {
      expect(component).not.toContain(withheld);
    }
  });

  it('sends no workspace, amount, or Price ID from the browser', () => {
    expect(component).toContain('name="topUpId"');
    expect(component).toContain('name="operationId"');
    expect(component).not.toMatch(/name="(?:workspaceId|accountId|priceId|amount|amountCents)"/);
  });

  it('mints its operation IDs in the browser, after hydration', () => {
    expect(component).toContain('globalThis.crypto.randomUUID()');
    expect(component).toContain('top-up-purchase:');
  });

  it('renders only behind the server flag', () => {
    const page = readFileSync(
      new URL('../src/app/dashboard/settings/page.tsx', import.meta.url),
      'utf8',
    );
    const planUsage = readFileSync(
      new URL('../src/app/dashboard/settings/PlanUsageSection.tsx', import.meta.url),
      'utf8',
    );
    expect(page).toContain('const topUpPurchaseCheckoutEnabled = topUpPurchaseEnabled();');
    expect(page).toMatch(/showTopUpPurchase = topUpPurchaseCheckoutEnabled/);
    expect(planUsage).toMatch(/showTopUpPurchase \?/);
  });
});

/** The catalog SKU object identity the entrypoint is expected to forward. */
function TOPUP(id: keyof typeof TOP_UPS) {
  return TOP_UPS[id];
}
