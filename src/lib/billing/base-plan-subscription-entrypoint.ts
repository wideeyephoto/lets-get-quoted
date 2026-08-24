import 'server-only';

import { APP_ORIGIN } from '@/lib/app-origin';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import {
  type BillingCycle,
} from '@/lib/billing/catalog';
import {
  retrievePlatformSubscriptionCheckoutSession,
} from '@/lib/billing/stripe-billing-subscription-checkout';
import {
  StripePlanPriceBindingError,
} from '@/lib/billing/stripe-plan-prices';
import {
  type PaidBasePlanId,
  recordBasePlanSubscriptionConsentForOwner,
} from '@/lib/billing/subscription-consent-acceptance';
import {
  BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
  BASE_PLAN_RECURRING_CONSENT_VERSION,
} from '@/lib/billing/subscription-consent';
import {
  orchestrateBasePlanSubscriptionCheckout,
  SubscriptionCheckoutIndeterminateError,
  SubscriptionCheckoutPersistenceError,
  SubscriptionCheckoutUnavailableError,
} from '@/lib/billing/subscription-checkout-operation';
import { checkRateLimitStrict } from '@/lib/rate-limit';
import { TERMS_VERSION } from '@/lib/terms';

export const BASE_PLAN_SUBSCRIPTION_CHECKOUT_FLAG =
  'LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED' as const;
export const BASE_PLAN_SUBSCRIPTION_CHECKOUT_RATE_LIMIT = Object.freeze({
  attempts: 6,
  windowSeconds: 10 * 60,
});

type ServerEnvironment = Readonly<Record<string, string | undefined>>;
type OwnerContext = Awaited<ReturnType<typeof requireOwnerContext>>;

export type BasePlanSubscriptionCheckoutErrorCode =
  | 'disabled'
  | 'invalid_request'
  | 'consent_required'
  | 'rate_limited'
  | 'not_eligible'
  | 'terms_required'
  | 'checkout_in_progress'
  | 'checkout_review_required'
  | 'request_expired'
  | 'configuration_unavailable'
  | 'temporarily_unavailable';

export type BasePlanSubscriptionCheckoutActionState =
  | Readonly<{
      ok: false;
      code: BasePlanSubscriptionCheckoutErrorCode;
      message: string;
      resumeCheckoutUrl?: string | null;
    }>
  | Readonly<{
      ok: true;
      code: 'checkout_ready';
      message: string;
      checkoutUrl: string;
    }>;

export type FirstSubscriptionEligibility = 'eligible' | 'not_eligible' | 'unavailable';

export type ExistingSubscriptionCheckoutBinding =
  | Readonly<{ status: 'none' }>
  | Readonly<{ status: 'exact'; acceptanceId: string }>
  | Readonly<{ status: 'conflict' | 'unavailable' }>;

export type BasePlanSubscriptionEntrypointDependencies = Readonly<{
  requireOwner(): Promise<OwnerContext>;
  allowAttempt(owner: Pick<OwnerContext, 'accountId' | 'userId'>): Promise<boolean>;
  loadEligibility(owner: Pick<OwnerContext, 'supabase' | 'accountId'>): Promise<FirstSubscriptionEligibility>;
  loadExistingBinding(
    owner: Pick<OwnerContext, 'accountId'>,
    input: {
      operationId: string;
      planCode: PaidBasePlanId;
      billingInterval: BillingCycle;
      livemode: boolean;
    },
  ): Promise<ExistingSubscriptionCheckoutBinding>;
  recordConsent(
    owner: Pick<OwnerContext, 'supabase' | 'accountId' | 'userId'>,
    input: {
      operationId: string;
      planCode: PaidBasePlanId;
      billingInterval: BillingCycle;
      accepted: true;
    },
  ): Promise<{ acceptanceId: string }>;
  orchestrate(input: {
    workspaceId: string;
    operationId: string;
    planCode: PaidBasePlanId;
    billingInterval: BillingCycle;
    livemode: boolean;
    successUrl: string;
    cancelUrl: string;
    recurringConsentAcceptanceId: string;
  }): Promise<{ session: { url: string | null } }>;
  retrieveSession?(sessionId: string): Promise<{ url: string | null; status: string | null }>;
}>;

const OPERATION_ID_PATTERN = /^base-plan-subscription:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function failure(
  code: BasePlanSubscriptionCheckoutErrorCode,
  message: string,
  resumeCheckoutUrl?: string | null,
): BasePlanSubscriptionCheckoutActionState {
  return Object.freeze({
    ok: false,
    code,
    message,
    ...(resumeCheckoutUrl ? { resumeCheckoutUrl } : {}),
  });
}

export function basePlanSubscriptionCheckoutEnabled(
  env: ServerEnvironment = process.env,
): boolean {
  return env[BASE_PLAN_SUBSCRIPTION_CHECKOUT_FLAG] === '1';
}

function configuredBillingLivemode(env: ServerEnvironment): boolean {
  if (env.LGQ_STRIPE_BILLING_LIVEMODE === '0') return false;
  if (env.LGQ_STRIPE_BILLING_LIVEMODE === '1') return true;
  throw new Error('Stripe Billing mode is not configured.');
}

function configuredAppOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Application origin is invalid.');
  }
  const localHttp = parsed.protocol === 'http:' && LOCAL_HTTP_HOSTS.has(parsed.hostname);
  if (
    (parsed.protocol !== 'https:' && !localHttp)
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || (parsed.pathname !== '/' && parsed.pathname !== '')
  ) {
    throw new Error('Application origin is invalid.');
  }
  return parsed.origin;
}

export function buildBasePlanSubscriptionRedirectUrls(
  appOrigin: string = APP_ORIGIN,
): Readonly<{ successUrl: string; cancelUrl: string }> {
  const origin = configuredAppOrigin(appOrigin);

  // A DEPLOYED environment must never send a paying customer to localhost.
  // APP_ORIGIN falls back to http://localhost:3010 whenever NEXT_PUBLIC_APP_URL
  // is unset, and Preview deliberately leaves it unset — so the 2026-08-18
  // rehearsal completed a real test-mode subscription and then redirected the
  // customer to http://localhost:3010/dashboard/settings. Stripe had already
  // taken the money; only the return trip was wrong, which is the worst place
  // for this to break because nothing fails loudly.
  //
  // One-off payments are immune: they take the origin from the live request
  // (app/pay/[id]/actions.ts), so nobody noticed the constant was load-bearing
  // for subscriptions alone.
  //
  // Refusing is better than guessing a host. A thrown configuration error
  // stops checkout BEFORE Stripe charges anyone; a wrong success_url is only
  // discovered after.
  if (process.env.VERCEL_ENV && new URL(origin).protocol !== 'https:') {
    throw new Error('Application origin is not configured for a deployed environment.');
  }
  const success = new URL('/dashboard/settings', origin);
  success.searchParams.set('subscription_checkout', 'success');
  success.hash = 'plan';
  const cancel = new URL('/dashboard/settings', origin);
  cancel.searchParams.set('subscription_checkout', 'canceled');
  cancel.hash = 'plan';
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

export function isStripeHostedCheckoutUrl(value: unknown): boolean {
  try {
    requireStripeHostedCheckoutUrl(value);
    return true;
  } catch {
    return false;
  }
}

function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function parsePaidPlan(value: string): PaidBasePlanId | null {
  return value === 'solo' || value === 'growth' || value === 'scale' ? value : null;
}

function parseBillingInterval(value: string): BillingCycle | null {
  return value === 'monthly' || value === 'annual' ? value : null;
}

async function loadDefaultEligibility(
  owner: Pick<OwnerContext, 'supabase' | 'accountId'>,
): Promise<FirstSubscriptionEligibility> {
  const { data, error } = await owner.supabase
    .from('workspace_entitlements')
    .select('plan_code, billing_status, entitlement_state')
    .eq('account_id', owner.accountId)
    .maybeSingle();

  if (error || !data) return 'unavailable';
  return data.plan_code === 'flex'
    && data.billing_status === 'active'
    && data.entitlement_state === 'active'
    ? 'eligible'
    : 'not_eligible';
}

async function loadDefaultExistingBinding(
  owner: Pick<OwnerContext, 'accountId'>,
  input: {
    operationId: string;
    planCode: PaidBasePlanId;
    billingInterval: BillingCycle;
    livemode: boolean;
  },
): Promise<ExistingSubscriptionCheckoutBinding> {
  const { data, error } = await createAdminClient()
    .from('billing_subscription_checkout_operations')
    .select('plan_code, billing_interval, livemode, terms_version, recurring_consent_version, recurring_consent_text_sha256, recurring_consent_acceptance_id')
    .eq('account_id', owner.accountId)
    .eq('operation_id', input.operationId)
    .maybeSingle();

  if (error) return Object.freeze({ status: 'unavailable' });
  if (!data) return Object.freeze({ status: 'none' });

  const row = data as {
    plan_code: string;
    billing_interval: string;
    livemode: boolean;
    terms_version: string;
    recurring_consent_version: string;
    recurring_consent_text_sha256: string;
    recurring_consent_acceptance_id: string | null;
  };
  if (
    row.plan_code !== input.planCode
    || row.billing_interval !== input.billingInterval
    || row.livemode !== input.livemode
    || row.terms_version !== TERMS_VERSION
    || row.recurring_consent_version !== BASE_PLAN_RECURRING_CONSENT_VERSION
    || row.recurring_consent_text_sha256 !== BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256
  ) {
    return Object.freeze({ status: 'conflict' });
  }

  const acceptanceId = row.recurring_consent_acceptance_id;
  if (typeof acceptanceId !== 'string' || !UUID_PATTERN.test(acceptanceId)) {
    return Object.freeze({ status: 'unavailable' });
  }
  return Object.freeze({ status: 'exact', acceptanceId: acceptanceId.toLowerCase() });
}

const DEFAULT_DEPENDENCIES: BasePlanSubscriptionEntrypointDependencies = Object.freeze({
  requireOwner: () => requireOwnerContext(),
  allowAttempt: async (owner) => {
    try {
      return await checkRateLimitStrict(
        createAdminClient(),
        `base-plan-subscription-checkout:${owner.accountId}:${owner.userId}`,
        BASE_PLAN_SUBSCRIPTION_CHECKOUT_RATE_LIMIT.attempts,
        BASE_PLAN_SUBSCRIPTION_CHECKOUT_RATE_LIMIT.windowSeconds,
      );
    } catch {
      return false;
    }
  },
  loadEligibility: loadDefaultEligibility,
  loadExistingBinding: loadDefaultExistingBinding,
  recordConsent: recordBasePlanSubscriptionConsentForOwner,
  orchestrate: orchestrateBasePlanSubscriptionCheckout,
  retrieveSession: async (sessionId: string) => {
    const session = await retrievePlatformSubscriptionCheckoutSession(sessionId);
    return { url: session.url, status: session.status };
  },
});

function consentFailure(error: unknown): BasePlanSubscriptionCheckoutActionState {
  const message = error instanceof Error ? error.message : '';
  if (/current Terms|Terms before/i.test(message)) {
    return failure('terms_required', 'Accept the current LGQ Terms before starting a paid plan.');
  }
  if (/active Flex|first-subscription/i.test(message)) {
    return failure(
      'not_eligible',
      'This checkout starts a first paid subscription from active Flex only. Existing paid plans need the plan-change flow.',
    );
  }
  return failure(
    'temporarily_unavailable',
    'We could not record your recurring-billing approval. Nothing was charged. Please try again.',
  );
}

async function checkoutFailure(
  error: unknown,
  dependencies: BasePlanSubscriptionEntrypointDependencies,
): Promise<BasePlanSubscriptionCheckoutActionState> {
  if (error instanceof SubscriptionCheckoutUnavailableError) {
    if (error.claimStatus === 'activated') {
      return failure('not_eligible', 'This workspace already has an activated paid subscription.');
    }
    if (error.claimStatus === 'expired' || error.claimStatus === 'canceled') {
      return failure(
        'request_expired',
        'That checkout request is no longer usable. Reload this page and approve a new checkout request.',
      );
    }
    if (error.claimStatus === 'indeterminate') {
      return failure(
        'checkout_review_required',
        'Stripe may have received this request, so LGQ will not submit it twice. Contact support to reconcile it safely.',
      );
    }
    let resumeCheckoutUrl: string | null = null;
    if (error.providerObjectId && dependencies.retrieveSession) {
      try {
        const session = await dependencies.retrieveSession(error.providerObjectId);
        if (session.status === 'open' && isStripeHostedCheckoutUrl(session.url)) {
          resumeCheckoutUrl = session.url;
        }
      } catch {
        // Fall back gracefully to standard message without resume link
      }
    }
    return failure(
      'checkout_in_progress',
      'A checkout request for this workspace is already in progress. LGQ did not send another charge request.',
      resumeCheckoutUrl,
    );
  }
  if (
    error instanceof SubscriptionCheckoutIndeterminateError
    || error instanceof SubscriptionCheckoutPersistenceError
  ) {
    return failure(
      'checkout_review_required',
      'Stripe may have received this request, so LGQ will not submit it twice. Contact support to reconcile it safely.',
    );
  }
  if (
    error instanceof StripePlanPriceBindingError
    || (error instanceof Error && /(?:Stripe Billing mode|STRIPE_SECRET_KEY|configured-origin|Price binding)/i.test(error.message))
  ) {
    return failure(
      'configuration_unavailable',
      'Plan checkout is not configured for this environment. Nothing was charged.',
    );
  }
  return failure(
    'temporarily_unavailable',
    'Checkout could not be started. Nothing was charged. Please try again or contact support.',
  );
}

/**
 * Disabled-by-default server boundary for a first Flex -> paid subscription.
 * The exact rollout switch is checked before form parsing, auth, rate limiting,
 * recurring-consent evidence, verified Price reads, database claims, or Stripe.
 */
export async function executeBasePlanSubscriptionCheckout(
  formData: FormData,
  dependencies: BasePlanSubscriptionEntrypointDependencies = DEFAULT_DEPENDENCIES,
  env: ServerEnvironment = process.env,
): Promise<BasePlanSubscriptionCheckoutActionState> {
  if (!basePlanSubscriptionCheckoutEnabled(env)) {
    return failure('disabled', 'Plan checkout is not available yet. Nothing was charged.');
  }

  const operationId = textField(formData, 'operationId');
  const planCode = parsePaidPlan(textField(formData, 'planCode'));
  const billingInterval = parseBillingInterval(textField(formData, 'billingInterval'));
  if (!OPERATION_ID_PATTERN.test(operationId) || !planCode || !billingInterval) {
    return failure('invalid_request', 'Choose a current LGQ paid plan and billing schedule.');
  }

  const accepted = textField(formData, 'recurringConsentAccepted') === 'yes';
  const renderedVersion = textField(formData, 'recurringConsentVersion');
  const renderedHash = textField(formData, 'recurringConsentTextSha256');
  if (
    !accepted
    || renderedVersion !== BASE_PLAN_RECURRING_CONSENT_VERSION
    || renderedHash !== BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256
  ) {
    return failure(
      'consent_required',
      'Read and affirmatively accept the current recurring-billing disclosure before continuing.',
    );
  }

  // This is the only workspace authority. No workspace/account ID is accepted
  // from the form, and auth redirects remain outside every catch boundary.
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

  let eligibility: FirstSubscriptionEligibility;
  try {
    eligibility = await dependencies.loadEligibility(owner);
  } catch {
    eligibility = 'unavailable';
  }
  if (eligibility === 'not_eligible') {
    return failure(
      'not_eligible',
      'This checkout starts a first paid subscription from active Flex only. Existing paid plans need the plan-change flow.',
    );
  }
  if (eligibility === 'unavailable') {
    return failure(
      'temporarily_unavailable',
      'We could not verify the current Flex plan. Nothing was charged. Please try again.',
    );
  }

  let livemode: boolean;
  let redirects: Readonly<{ successUrl: string; cancelUrl: string }>;
  try {
    livemode = configuredBillingLivemode(env);
    redirects = buildBasePlanSubscriptionRedirectUrls();
  } catch {
    return failure(
      'configuration_unavailable',
      'Plan checkout is not configured for this environment. Nothing was charged.',
    );
  }

  // Consent evidence is single-use and immutable. If React or the browser
  // retries the same stable operation after its durable claim, recording a new
  // acceptance would make that otherwise-idempotent replay conflict with the
  // original operation. Reuse only the server-read, account-bound exact
  // binding; changed input and unreadable ledgers fail closed before Stripe.
  let acceptanceId: string | null = null;
  try {
    const existing = await dependencies.loadExistingBinding(owner, {
      operationId,
      planCode,
      billingInterval,
      livemode,
    });
    if (existing.status === 'unavailable') {
      return failure(
        'temporarily_unavailable',
        'We could not verify this checkout request. Nothing was charged. Please try again.',
      );
    }
    if (existing.status === 'conflict') {
      return failure(
        'request_expired',
        'That checkout request belongs to a different plan selection. Reload this page and approve a new request.',
      );
    }
    if (existing.status === 'exact') acceptanceId = existing.acceptanceId;
  } catch {
    return failure(
      'temporarily_unavailable',
      'We could not verify this checkout request. Nothing was charged. Please try again.',
    );
  }

  if (!acceptanceId) {
    try {
      const acceptance = await dependencies.recordConsent(owner, {
        operationId,
        planCode,
        billingInterval,
        accepted: true,
      });
      acceptanceId = acceptance.acceptanceId;
    } catch (error) {
      return consentFailure(error);
    }
  }

  try {
    const result = await dependencies.orchestrate({
      workspaceId: owner.accountId,
      operationId,
      planCode,
      billingInterval,
      livemode,
      successUrl: redirects.successUrl,
      cancelUrl: redirects.cancelUrl,
      recurringConsentAcceptanceId: acceptanceId,
    });
    const checkoutUrl = requireStripeHostedCheckoutUrl(result.session.url);
    return Object.freeze({
      ok: true,
      code: 'checkout_ready',
      message: 'Your secure Stripe checkout is ready.',
      checkoutUrl,
    });
  } catch (error) {
    const mapped = await checkoutFailure(error, dependencies);
    console.error(
      `[base-plan-subscription-checkout] ${mapped.code} operation=${operationId}`,
      error instanceof Error ? error.name : 'UnknownError',
    );
    return mapped;
  }
}
