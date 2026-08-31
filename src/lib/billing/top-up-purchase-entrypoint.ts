import 'server-only';

import { headers } from 'next/headers';

import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import { type BillingPlanId, type TopUpDefinition } from '@/lib/billing/catalog';
import {
  TOP_UP_PURCHASE_FLAG,
  TopUpPurchaseError,
  requireSellableTopUp,
  topUpPurchaseEnabled,
} from '@/lib/billing/top-up-purchase';
import {
  TopUpPurchaseCheckoutIndeterminateError,
  TopUpPurchaseCheckoutPersistenceError,
  TopUpPurchaseCheckoutUnavailableError,
  orchestrateTopUpPurchaseCheckout,
} from '@/lib/billing/top-up-purchase-checkout';
import { checkRateLimitStrict } from '@/lib/rate-limit';

/**
 * Disabled-by-default server boundary for buying one top-up.
 *
 * The rollout switch is checked before form parsing, auth, rate limiting,
 * eligibility, Price reads, database claims, or Stripe -- the same order the
 * first-subscription entrypoint uses, for the same reason: every one of those
 * steps is a side effect or a credential read that a dark feature has no
 * business performing.
 *
 * There is deliberately NO consent step. Recurring-billing disclosure and its
 * single-use acceptance artifact exist because a subscription charges again
 * without asking. Every sellable top-up is `mode: 'payment'` -- one charge, one
 * time -- so a recurring-billing authorization would be a disclosure of
 * something that does not happen.
 */

export { TOP_UP_PURCHASE_FLAG, topUpPurchaseEnabled };

export const TOP_UP_PURCHASE_RATE_LIMIT = Object.freeze({
  attempts: 8,
  windowSeconds: 10 * 60,
});

type ServerEnvironment = Readonly<Record<string, string | undefined>>;
type OwnerContext = Awaited<ReturnType<typeof requireOwnerContext>>;

export type TopUpPurchaseCheckoutErrorCode =
  | 'disabled'
  | 'invalid_request'
  | 'rate_limited'
  | 'not_eligible'
  | 'checkout_in_progress'
  | 'checkout_review_required'
  | 'request_expired'
  | 'configuration_unavailable'
  | 'temporarily_unavailable';

export type TopUpPurchaseCheckoutActionState =
  | Readonly<{
      ok: false;
      code: TopUpPurchaseCheckoutErrorCode;
      message: string;
    }>
  | Readonly<{
      ok: true;
      code: 'checkout_ready';
      message: string;
      checkoutUrl: string;
    }>;

export type WorkspaceTopUpPlanRead =
  | Readonly<{ status: 'ready'; planCode: BillingPlanId }>
  | Readonly<{ status: 'not_active' }>
  | Readonly<{ status: 'unavailable' }>;

export type TopUpPurchaseEntrypointDependencies = Readonly<{
  requireOwner(): Promise<OwnerContext>;
  allowAttempt(owner: Pick<OwnerContext, 'accountId' | 'userId'>): Promise<boolean>;
  loadPlan(owner: Pick<OwnerContext, 'supabase' | 'accountId'>): Promise<WorkspaceTopUpPlanRead>;
  resolveRedirectUrls():
    | Promise<Readonly<{ successUrl: string; cancelUrl: string }>>
    | Readonly<{ successUrl: string; cancelUrl: string }>;
  orchestrate(input: {
    workspaceId: string;
    operationId: string;
    sku: TopUpDefinition;
    livemode: boolean;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ session: { url: string | null } }>;
}>;

const OPERATION_ID_PATTERN = /^top-up-purchase:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOP_UP_ID_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;
const HOST_PATTERN = /^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/;
const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function failure(
  code: TopUpPurchaseCheckoutErrorCode,
  message: string,
): TopUpPurchaseCheckoutActionState {
  return Object.freeze({ ok: false, code, message });
}

function configuredBillingLivemode(env: ServerEnvironment): boolean {
  if (env.LGQ_STRIPE_BILLING_LIVEMODE === '0') return false;
  if (env.LGQ_STRIPE_BILLING_LIVEMODE === '1') return true;
  throw new Error('Stripe Billing mode is not configured.');
}

/**
 * The origin to send the customer back to, taken from the LIVE REQUEST.
 *
 * Not APP_ORIGIN. That constant falls back to http://localhost:3010 whenever
 * NEXT_PUBLIC_APP_URL is unset, and Preview deliberately leaves it unset, so on
 * 2026-08-18 a completed test-mode subscription returned a paying customer to
 * localhost after Stripe had already taken the money. See the comment on
 * buildBasePlanSubscriptionRedirectUrls. One-off payments never had that bug
 * precisely because src/app/pay/[id]/actions.ts reads proto + host off the
 * request; a top-up is a one-off payment, so it follows that pattern.
 *
 * The Host header is request-controlled in principle. It is safe to trust here
 * because the platform routes a request to this deployment BY that host, so a
 * forged value does not arrive; and the parse below still refuses anything that
 * is not a bare https host (plus localhost for `next dev`).
 */
export function requestOriginFromHeaders(requestHeaders: Pick<Headers, 'get'>): string {
  const forwardedProto = requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const proto = forwardedProto || 'http';
  const host = requestHeaders.get('host')?.trim() ?? '';
  if (!host || host.length > 255 || !HOST_PATTERN.test(host)) {
    throw new Error('Request origin is invalid.');
  }

  let parsed: URL;
  try {
    parsed = new URL(`${proto}://${host}`);
  } catch {
    throw new Error('Request origin is invalid.');
  }
  const localHttp = parsed.protocol === 'http:' && LOCAL_HTTP_HOSTS.has(parsed.hostname);
  if (
    (parsed.protocol !== 'https:' && !localHttp)
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
  ) {
    throw new Error('Request origin is invalid.');
  }
  // A deployed environment must never send a paying customer to localhost.
  // Refusing stops checkout BEFORE Stripe charges anyone; a wrong success_url is
  // only ever discovered after.
  if (process.env.VERCEL_ENV && parsed.protocol !== 'https:') {
    throw new Error('Request origin is not usable in a deployed environment.');
  }
  return parsed.origin;
}

export function buildTopUpPurchaseRedirectUrls(
  origin: string,
): Readonly<{ successUrl: string; cancelUrl: string }> {
  const success = new URL('/dashboard/settings', origin);
  success.searchParams.set('top_up_checkout', 'success');
  success.hash = 'buy-credits';
  const cancel = new URL('/dashboard/settings', origin);
  cancel.searchParams.set('top_up_checkout', 'canceled');
  cancel.hash = 'buy-credits';
  return Object.freeze({ successUrl: success.toString(), cancelUrl: cancel.toString() });
}

export function requireStripeHostedCheckoutUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 4_096 || /\p{Cc}/u.test(value)) {
    throw new Error('Stripe Checkout did not return a usable hosted URL.');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Stripe Checkout did not return a usable hosted URL.');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.origin !== 'https://checkout.stripe.com'
    || parsed.username
    || parsed.password
    || parsed.pathname === '/'
  ) {
    throw new Error('Stripe Checkout did not return a usable hosted URL.');
  }
  return parsed.toString();
}

function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

async function loadDefaultPlan(
  owner: Pick<OwnerContext, 'supabase' | 'accountId'>,
): Promise<WorkspaceTopUpPlanRead> {
  const { data, error } = await owner.supabase
    .from('workspace_entitlements')
    .select('account_id, plan_code, entitlement_state')
    .eq('account_id', owner.accountId)
    .maybeSingle();
  if (error || !data || data.account_id !== owner.accountId) {
    return Object.freeze({ status: 'unavailable' });
  }
  // A suspended or canceled workspace may not buy more credit. Eligibility per
  // SKU is still requireSellableTopUp's call; this is only "is this workspace
  // entitled to transact at all".
  if (data.entitlement_state !== 'active') return Object.freeze({ status: 'not_active' });
  const planCode = data.plan_code;
  if (typeof planCode !== 'string') return Object.freeze({ status: 'unavailable' });
  return Object.freeze({ status: 'ready', planCode: planCode as BillingPlanId });
}

const DEFAULT_DEPENDENCIES: TopUpPurchaseEntrypointDependencies = Object.freeze({
  requireOwner: () => requireOwnerContext(),
  allowAttempt: async (owner) => {
    try {
      return await checkRateLimitStrict(
        createAdminClient(),
        `top-up-purchase-checkout:${owner.accountId}:${owner.userId}`,
        TOP_UP_PURCHASE_RATE_LIMIT.attempts,
        TOP_UP_PURCHASE_RATE_LIMIT.windowSeconds,
      );
    } catch {
      return false;
    }
  },
  loadPlan: loadDefaultPlan,
  resolveRedirectUrls: async () => buildTopUpPurchaseRedirectUrls(requestOriginFromHeaders(await headers())),
  orchestrate: orchestrateTopUpPurchaseCheckout,
});

/**
 * Why a withheld or ineligible SKU is `not_eligible` and never `invalid_request`:
 * the caller sent a real, published SKU id. Telling them it was malformed would
 * be false. Telling them it cannot be bought is the truth, and it is the same
 * answer whether the UI is stale or the request was hand-made.
 */
function skuFailure(error: TopUpPurchaseError): TopUpPurchaseCheckoutActionState {
  switch (error.code) {
    case 'unknown_sku':
      return failure('invalid_request', 'That add-on is not in the current LGQ catalog.');
    case 'sku_withheld':
      return failure('not_eligible', 'That add-on is not on sale yet. Nothing was charged.');
    case 'plan_ineligible':
      return failure('not_eligible', 'That add-on is not available on your current plan.');
    default:
      // Every price_* code: the SKU is fine, its Stripe Price is not.
      return failure(
        'configuration_unavailable',
        'Add-on checkout is not configured for this environment. Nothing was charged.',
      );
  }
}

function checkoutFailure(error: unknown): TopUpPurchaseCheckoutActionState {
  if (error instanceof TopUpPurchaseError) return skuFailure(error);

  if (error instanceof TopUpPurchaseCheckoutUnavailableError) {
    // Branching on the LEDGER STATE, not on the claim status: this ledger
    // answers only 'claimed' or 'replayed', so the state is the only field that
    // says what the earlier attempt became.
    if (error.operationState === 'indeterminate' || error.operationState === 'checkout_created') {
      return failure(
        'checkout_review_required',
        'Stripe may have received this request, so LGQ will not submit it twice. Contact support to reconcile it safely.',
      );
    }
    if (error.operationState === 'failed') {
      return failure(
        'request_expired',
        'That checkout request is no longer usable. Reload this page and start a new one.',
      );
    }
    return failure(
      'checkout_in_progress',
      'A checkout request for this add-on is already in progress. LGQ did not send another charge request.',
    );
  }

  if (
    error instanceof TopUpPurchaseCheckoutIndeterminateError
    || error instanceof TopUpPurchaseCheckoutPersistenceError
  ) {
    return failure(
      'checkout_review_required',
      'Stripe may have received this request, so LGQ will not submit it twice. Contact support to reconcile it safely.',
    );
  }

  if (
    error instanceof Error
    && /(?:Stripe Billing mode|STRIPE_SECRET_KEY|LGQ_STRIPE_BILLING_LIVEMODE|Request origin)/i.test(error.message)
  ) {
    return failure(
      'configuration_unavailable',
      'Add-on checkout is not configured for this environment. Nothing was charged.',
    );
  }

  return failure(
    'temporarily_unavailable',
    'Checkout could not be started. Nothing was charged. Reload this page and try again.',
  );
}

export async function executeTopUpPurchaseCheckout(
  formData: FormData,
  dependencies: TopUpPurchaseEntrypointDependencies = DEFAULT_DEPENDENCIES,
  env: ServerEnvironment = process.env,
): Promise<TopUpPurchaseCheckoutActionState> {
  if (!topUpPurchaseEnabled(env)) {
    return failure('disabled', 'Add-on checkout is not available yet. Nothing was charged.');
  }

  const operationId = textField(formData, 'operationId');
  const topUpId = textField(formData, 'topUpId');
  if (!OPERATION_ID_PATTERN.test(operationId) || !TOP_UP_ID_PATTERN.test(topUpId)) {
    return failure('invalid_request', 'Choose an add-on from the current LGQ catalog.');
  }

  // This is the only workspace authority. No workspace/account ID, Price ID, or
  // amount is accepted from the form, and auth redirects stay outside every
  // catch boundary.
  const owner = await dependencies.requireOwner();

  let allowed = false;
  try {
    allowed = await dependencies.allowAttempt(owner);
  } catch {
    allowed = false;
  }
  if (!allowed) {
    return failure(
      'rate_limited',
      'Checkout attempts are temporarily limited. Wait ten minutes and try again.',
    );
  }

  let plan: WorkspaceTopUpPlanRead;
  try {
    plan = await dependencies.loadPlan(owner);
  } catch {
    plan = Object.freeze({ status: 'unavailable' });
  }
  if (plan.status === 'not_active') {
    return failure(
      'not_eligible',
      'This workspace cannot buy add-ons right now. Contact support if that does not look right.',
    );
  }
  if (plan.status === 'unavailable') {
    return failure(
      'temporarily_unavailable',
      'We could not verify your current plan. Nothing was charged. Please try again.',
    );
  }

  // The boundary, not the UI, decides what may be sold. Withheld SKUs and the
  // Flex-only pack are refused here even if a stale page still offers them.
  let sku: TopUpDefinition;
  try {
    sku = requireSellableTopUp(topUpId, plan.planCode);
  } catch (error) {
    if (error instanceof TopUpPurchaseError) return skuFailure(error);
    return failure(
      'temporarily_unavailable',
      'Checkout could not be started. Nothing was charged. Reload this page and try again.',
    );
  }

  let livemode: boolean;
  let redirects: Readonly<{ successUrl: string; cancelUrl: string }>;
  try {
    livemode = configuredBillingLivemode(env);
    redirects = await dependencies.resolveRedirectUrls();
  } catch {
    return failure(
      'configuration_unavailable',
      'Add-on checkout is not configured for this environment. Nothing was charged.',
    );
  }

  try {
    const result = await dependencies.orchestrate({
      workspaceId: owner.accountId,
      operationId,
      sku,
      livemode,
      successUrl: redirects.successUrl,
      cancelUrl: redirects.cancelUrl,
    });
    const checkoutUrl = requireStripeHostedCheckoutUrl(result.session.url);
    return Object.freeze({
      ok: true,
      code: 'checkout_ready',
      message: 'Your secure Stripe checkout is ready.',
      checkoutUrl,
    });
  } catch (error) {
    const mapped = checkoutFailure(error);
    console.error(
      `[top-up-purchase-checkout] ${mapped.code} operation=${operationId} sku=${topUpId}`,
      error instanceof Error ? error.name : 'UnknownError',
    );
    return mapped;
  }
}
