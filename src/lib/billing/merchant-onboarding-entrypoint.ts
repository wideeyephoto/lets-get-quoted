import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { APP_ORIGIN } from '@/lib/app-origin';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import { checkRateLimitStrict } from '@/lib/rate-limit';
import {
  createMerchantOnboardingLink,
  MerchantProvisioningIndeterminateError,
  MerchantProvisioningPersistenceError,
  MerchantProvisioningUnavailableError,
  MerchantReadinessStaleWriteError,
  provisionMerchantAccount,
  verifyAndPersistMerchantReadiness,
  type MerchantOnboardingState,
  type MerchantReadinessEvidence,
} from '@/lib/billing/stripe-merchant';

/**
 * Deliberately separate from every legacy Connect switch. Enabling this exact
 * value exposes only Merchant onboarding; it does not activate direct charges
 * or change an existing Recipient/destination-charge caller.
 */
export const STRIPE_MERCHANT_ONBOARDING_V2_FLAG =
  'LGQ_STRIPE_MERCHANT_ONBOARDING_V2_ENABLED' as const;

export const STRIPE_MERCHANT_ONBOARDING_RATE_LIMIT = Object.freeze({
  attempts: 12,
  windowSeconds: 10 * 60,
});

export const STRIPE_MERCHANT_READINESS_RATE_LIMIT = Object.freeze({
  attempts: 20,
  windowSeconds: 10 * 60,
});

type ServerEnvironment = Readonly<Record<string, string | undefined>>;
type OwnerContext = Awaited<ReturnType<typeof requireOwnerContext>>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STRIPE_ACCOUNT_ID_PATTERN = /^acct_[A-Za-z0-9]{8,}$/;

const SURFACE_COLUMNS = [
  'id',
  'stripe_merchant_account_id',
  'merchant_onboarding_state',
  'merchant_requirements_checked_at',
  'merchant_configuration_verified_at',
  'merchant_dashboard_type',
  'merchant_card_payments_active',
  'merchant_payouts_active',
  'merchant_fees_collector',
  'merchant_losses_collector',
].join(', ');

export type MerchantOnboardingSurfaceStatus =
  | 'not_started'
  | MerchantOnboardingState
  | 'unavailable';

export type MerchantOnboardingSurface = Readonly<{
  status: MerchantOnboardingSurfaceStatus;
  checkedAt: string | null;
  contractorLiabilityVerified: boolean;
}>;

export type MerchantOnboardingFeedbackCode =
  | 'rollout_disabled'
  | 'rate_limited'
  | 'profile_incomplete'
  | 'setup_in_progress'
  | 'setup_review_required'
  | 'configuration_unavailable'
  | 'temporarily_unavailable'
  | 'verification_unavailable'
  | 'merchant_pending'
  | 'merchant_restricted'
  | 'merchant_ready'
  | 'merchant_disabled';

export type MerchantOnboardingStartState =
  | Readonly<{
      ok: true;
      code: 'onboarding_ready';
      message: string;
      onboardingUrl: string;
    }>
  | Readonly<{
      ok: false;
      code: Exclude<
        MerchantOnboardingFeedbackCode,
        'verification_unavailable' | `merchant_${MerchantOnboardingState}`
      >;
      message: string;
    }>;

export type MerchantReadinessReturnState = Readonly<{
  ok: boolean;
  code:
    | 'rollout_disabled'
    | 'rate_limited'
    | 'verification_unavailable'
    | `merchant_${MerchantOnboardingState}`;
  message: string;
}>;

type MerchantAccountProfile = Readonly<{
  workspaceId: string;
  businessName: string;
  merchantAccountId: string | null;
}>;

export type MerchantOnboardingEntrypointDependencies = Readonly<{
  requireOwner(): Promise<OwnerContext>;
  allowAttempt(
    owner: Pick<OwnerContext, 'accountId' | 'userId'>,
    purpose: 'onboarding' | 'readiness',
  ): Promise<boolean>;
  loadProfile(owner: Pick<OwnerContext, 'accountId'>): Promise<MerchantAccountProfile>;
  loadSurface(owner: Pick<OwnerContext, 'accountId'>): Promise<MerchantOnboardingSurface>;
  provision(input: {
    workspaceId: string;
    businessName: string;
    contactEmail: string;
  }): Promise<{ accountId: string }>;
  createOnboardingLink(input: {
    merchantAccountId: string;
    returnUrl: string;
    refreshUrl: string;
  }): Promise<string>;
  verifyReadiness(workspaceId: string): Promise<MerchantReadinessEvidence>;
}>;

function validateWorkspaceId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new Error('Workspace ID is invalid.');
  return normalized;
}

function isMerchantAccountId(value: unknown): value is string {
  return typeof value === 'string' && STRIPE_ACCOUNT_ID_PATTERN.test(value.trim());
}

function validIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function normalizeSurface(
  row: Record<string, unknown> | null,
  expectedWorkspaceId: string,
): MerchantOnboardingSurface {
  if (!row || row.id !== expectedWorkspaceId) {
    return Object.freeze({ status: 'unavailable', checkedAt: null, contractorLiabilityVerified: false });
  }

  if (!row.stripe_merchant_account_id) {
    return Object.freeze({ status: 'not_started', checkedAt: null, contractorLiabilityVerified: false });
  }
  if (!isMerchantAccountId(row.stripe_merchant_account_id)) {
    return Object.freeze({ status: 'unavailable', checkedAt: null, contractorLiabilityVerified: false });
  }

  const state = row.merchant_onboarding_state;
  if (state !== 'pending' && state !== 'restricted' && state !== 'ready' && state !== 'disabled') {
    return Object.freeze({ status: 'unavailable', checkedAt: null, contractorLiabilityVerified: false });
  }

  const checkedAt = validIsoOrNull(
    row.merchant_configuration_verified_at ?? row.merchant_requirements_checked_at,
  );
  const contractorLiabilityVerified = state === 'ready'
    && checkedAt !== null
    && row.merchant_dashboard_type === 'full'
    && row.merchant_card_payments_active === true
    && row.merchant_payouts_active === true
    && row.merchant_fees_collector === 'stripe'
    && row.merchant_losses_collector === 'stripe';

  // Never show a ready badge from the state label alone. The UI must agree
  // with the same persisted liability facts that gate direct payments.
  if (state === 'ready' && !contractorLiabilityVerified) {
    return Object.freeze({ status: 'unavailable', checkedAt, contractorLiabilityVerified: false });
  }

  return Object.freeze({ status: state, checkedAt, contractorLiabilityVerified });
}

/**
 * Backend-only status read. The caller supplies the account ID obtained from
 * requireOwnerContext; no browser-controlled workspace value is accepted.
 */
export async function loadMerchantOnboardingSurfaceForOwner(
  owner: Pick<OwnerContext, 'accountId'>,
  admin: SupabaseClient = createAdminClient(),
): Promise<MerchantOnboardingSurface> {
  const workspaceId = validateWorkspaceId(owner.accountId);
  const { data, error } = await admin
    .from('accounts')
    .select(SURFACE_COLUMNS)
    .eq('id', workspaceId)
    .maybeSingle();
  if (error) {
    return Object.freeze({ status: 'unavailable', checkedAt: null, contractorLiabilityVerified: false });
  }
  return normalizeSurface(data as Record<string, unknown> | null, workspaceId);
}

async function loadDefaultProfile(
  owner: Pick<OwnerContext, 'accountId'>,
): Promise<MerchantAccountProfile> {
  const workspaceId = validateWorkspaceId(owner.accountId);
  const { data, error } = await createAdminClient()
    .from('accounts')
    .select('id, business_name, stripe_merchant_account_id')
    .eq('id', workspaceId)
    .maybeSingle();
  if (error || !data || data.id !== workspaceId) throw new Error('Merchant workspace profile is unavailable.');

  const businessName = typeof data.business_name === 'string' ? data.business_name.trim() : '';
  if (!businessName) throw new Error('Merchant business name is unavailable.');
  if (data.stripe_merchant_account_id != null && !isMerchantAccountId(data.stripe_merchant_account_id)) {
    throw new Error('Merchant account mapping is invalid.');
  }

  return Object.freeze({
    workspaceId,
    businessName,
    merchantAccountId: data.stripe_merchant_account_id?.trim() ?? null,
  });
}

const DEFAULT_DEPENDENCIES: MerchantOnboardingEntrypointDependencies = Object.freeze({
  requireOwner: () => requireOwnerContext(),
  allowAttempt: async (owner, purpose) => {
    const config = purpose === 'onboarding'
      ? STRIPE_MERCHANT_ONBOARDING_RATE_LIMIT
      : STRIPE_MERCHANT_READINESS_RATE_LIMIT;
    try {
      return await checkRateLimitStrict(
        createAdminClient(),
        `stripe-merchant-v2:${purpose}:${owner.accountId}:${owner.userId}`,
        config.attempts,
        config.windowSeconds,
      );
    } catch {
      return false;
    }
  },
  loadProfile: loadDefaultProfile,
  loadSurface: (owner) => loadMerchantOnboardingSurfaceForOwner(owner),
  provision: async (input) => provisionMerchantAccount(createAdminClient(), input),
  createOnboardingLink: createMerchantOnboardingLink,
  verifyReadiness: (workspaceId) => verifyAndPersistMerchantReadiness(createAdminClient(), workspaceId),
});

function configuredHttpsOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Application origin is invalid.');
  }
  if (
    parsed.protocol !== 'https:'
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

export function stripeMerchantOnboardingV2Enabled(
  env: ServerEnvironment = process.env,
): boolean {
  return env[STRIPE_MERCHANT_ONBOARDING_V2_FLAG] === '1';
}

export function buildMerchantOnboardingRedirectUrls(
  appOrigin: string = APP_ORIGIN,
): Readonly<{ returnUrl: string; refreshUrl: string }> {
  const origin = configuredHttpsOrigin(appOrigin);
  return Object.freeze({
    returnUrl: new URL('/dashboard/stripe-merchant/return', origin).toString(),
    refreshUrl: new URL('/dashboard/stripe-merchant/refresh', origin).toString(),
  });
}

export function requireStripeHostedOnboardingUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 4_096 || /\p{Cc}/u.test(value)) {
    throw new Error('Stripe onboarding did not return a usable hosted URL.');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Stripe onboarding did not return a usable hosted URL.');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.origin !== 'https://connect.stripe.com'
    || parsed.username
    || parsed.password
    || parsed.pathname === '/'
  ) {
    throw new Error('Stripe onboarding did not return a usable hosted URL.');
  }
  return parsed.toString();
}

function startFailure(
  code: Exclude<
    MerchantOnboardingFeedbackCode,
    'verification_unavailable' | `merchant_${MerchantOnboardingState}`
  >,
  message: string,
): MerchantOnboardingStartState {
  return Object.freeze({ ok: false, code, message });
}

function mapProvisioningFailure(error: unknown): MerchantOnboardingStartState {
  if (error instanceof MerchantProvisioningUnavailableError) {
    return error.operationState === 'claimed'
      ? startFailure('setup_in_progress', 'Stripe setup is already starting. Wait a moment, then refresh this page.')
      : startFailure(
          'setup_review_required',
          'LGQ will not create a second Stripe account until the first setup attempt is safely reconciled.',
        );
  }
  if (
    error instanceof MerchantProvisioningIndeterminateError
    || error instanceof MerchantProvisioningPersistenceError
  ) {
    return startFailure(
      'setup_review_required',
      'Stripe may have received the setup request. LGQ will not submit it twice; support must reconcile it safely.',
    );
  }
  if (error instanceof Error && /STRIPE_SECRET_KEY|test\/live mode|Application origin/i.test(error.message)) {
    return startFailure(
      'configuration_unavailable',
      'Stripe Merchant setup is not configured for this environment.',
    );
  }
  return startFailure('temporarily_unavailable', 'Stripe setup could not be started. Nothing changed; try again shortly.');
}

/**
 * Create or resume hosted Merchant onboarding. The exact rollout switch is
 * evaluated before auth, database, rate-limit, or Stripe work. There is no
 * Recipient fallback and no request field from which to derive a workspace.
 */
export async function executeMerchantOnboardingStart(
  dependencies: MerchantOnboardingEntrypointDependencies = DEFAULT_DEPENDENCIES,
  env: ServerEnvironment = process.env,
  appOrigin: string = APP_ORIGIN,
): Promise<MerchantOnboardingStartState> {
  if (!stripeMerchantOnboardingV2Enabled(env)) {
    return startFailure('rollout_disabled', 'Stripe Merchant setup is not available yet.');
  }

  // Auth redirects deliberately remain outside every catch boundary.
  const owner = await dependencies.requireOwner();
  let allowed = false;
  try {
    allowed = await dependencies.allowAttempt(owner, 'onboarding');
  } catch {
    allowed = false;
  }
  if (!allowed) {
    return startFailure('rate_limited', 'Stripe setup attempts are temporarily limited. Wait ten minutes and try again.');
  }

  let profile: MerchantAccountProfile;
  let redirects: Readonly<{ returnUrl: string; refreshUrl: string }>;
  try {
    profile = await dependencies.loadProfile(owner);
    if (profile.workspaceId !== validateWorkspaceId(owner.accountId)) {
      throw new Error('Merchant profile does not match the authenticated workspace.');
    }
    redirects = buildMerchantOnboardingRedirectUrls(appOrigin);
  } catch (error) {
    console.error(
      '[stripe-merchant-onboarding] profile/configuration unavailable',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return startFailure('configuration_unavailable', 'Stripe Merchant setup is not configured for this workspace.');
  }

  let merchantAccountId = profile.merchantAccountId;
  if (!merchantAccountId) {
    // Stripe requires contact_email when LGQ creates the account. Resuming an
    // already-mapped Merchant does not: blocking a phone-authenticated owner
    // here would make an expired Account Link impossible to refresh.
    if (!owner.userEmail?.trim()) {
      return startFailure('profile_incomplete', 'Add a verified email address before starting Stripe setup.');
    }
    try {
      const provisioned = await dependencies.provision({
        workspaceId: owner.accountId,
        businessName: profile.businessName,
        contactEmail: owner.userEmail,
      });
      merchantAccountId = provisioned.accountId;
    } catch (error) {
      const mapped = mapProvisioningFailure(error);
      console.error(
        `[stripe-merchant-onboarding] ${mapped.code}`,
        error instanceof Error ? error.name : 'UnknownError',
      );
      return mapped;
    }
  }

  if (!isMerchantAccountId(merchantAccountId)) {
    return startFailure('configuration_unavailable', 'Stripe Merchant setup is not configured for this workspace.');
  }

  try {
    const onboardingUrl = requireStripeHostedOnboardingUrl(
      await dependencies.createOnboardingLink({
        merchantAccountId,
        returnUrl: redirects.returnUrl,
        refreshUrl: redirects.refreshUrl,
      }),
    );
    return Object.freeze({
      ok: true,
      code: 'onboarding_ready',
      message: 'Your secure Stripe onboarding link is ready.',
      onboardingUrl,
    });
  } catch (error) {
    console.error(
      '[stripe-merchant-onboarding] hosted link unavailable',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return startFailure('temporarily_unavailable', 'Stripe setup could not be opened. Nothing changed; try again shortly.');
  }
}

function readinessResult(state: MerchantOnboardingState): MerchantReadinessReturnState {
  return Object.freeze({
    ok: true,
    code: `merchant_${state}`,
    message: state === 'ready'
      ? 'Stripe confirmed that the Merchant account is ready.'
      : 'Stripe setup was saved. The current verification status is shown below.',
  });
}

/**
 * Stripe's return URL carries no state. Resolve the owner again, retrieve the
 * exact account already mapped to that workspace, and persist fresh evidence.
 */
export async function executeMerchantOnboardingReturn(
  dependencies: MerchantOnboardingEntrypointDependencies = DEFAULT_DEPENDENCIES,
  env: ServerEnvironment = process.env,
): Promise<MerchantReadinessReturnState> {
  if (!stripeMerchantOnboardingV2Enabled(env)) {
    return Object.freeze({ ok: false, code: 'rollout_disabled', message: 'Stripe Merchant setup is not available yet.' });
  }

  const owner = await dependencies.requireOwner();
  let allowed = false;
  try {
    allowed = await dependencies.allowAttempt(owner, 'readiness');
  } catch {
    allowed = false;
  }
  if (!allowed) {
    return Object.freeze({
      ok: false,
      code: 'rate_limited',
      message: 'Stripe verification checks are temporarily limited. Wait ten minutes and try again.',
    });
  }

  try {
    const evidence = await dependencies.verifyReadiness(owner.accountId);
    return readinessResult(evidence.onboardingState);
  } catch (error) {
    // Two simultaneous return requests can both retrieve valid evidence. The
    // monotonic RPC accepts the newer one and rejects the older. Report the
    // already-persisted state instead of turning that safe race into an error.
    if (error instanceof MerchantReadinessStaleWriteError) {
      try {
        const surface = await dependencies.loadSurface(owner);
        if (
          surface.status === 'pending'
          || surface.status === 'restricted'
          || surface.status === 'ready'
          || surface.status === 'disabled'
        ) {
          return readinessResult(surface.status);
        }
      } catch {
        // Fall through to the fixed unavailable response below.
      }
    }
    console.error(
      '[stripe-merchant-onboarding] readiness verification unavailable',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return Object.freeze({
      ok: false,
      code: 'verification_unavailable',
      message: 'Stripe returned you to LGQ, but the latest readiness check could not be confirmed yet.',
    });
  }
}

export function buildMerchantOnboardingFeedbackPath(code: MerchantOnboardingFeedbackCode): string {
  return `/dashboard/settings?merchant_onboarding=${encodeURIComponent(code)}#merchant-payments`;
}
